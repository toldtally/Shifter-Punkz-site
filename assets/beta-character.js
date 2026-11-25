/* Character Sheet on Supabase: load/save the sheet, portrait in storage, session seat, GM's BGM. */
(function () {
  'use strict';
  var sb = SP.sb;
  var JOIN_ERR = {
    BAD_CODE: ['รหัสต้องเป็นรูปแบบ SP-XXXX (ตัวอักษรหรือตัวเลข 4 ตัว)', 'Codes look like SP-XXXX'],
    SESSION_NOT_FOUND: ['ไม่พบ session นี้ ลองขอรหัสใหม่จาก GM', 'No session with that code.'],
    SESSION_ENDED: ['Session นี้จบไปแล้ว รหัสใช้ไม่ได้อีก', 'That session has ended.'],
    SESSION_FULL: ['Session นี้ที่นั่งเต็มแล้ว', 'That session is full.'],
    OWN_SESSION: ['นี่คือ session ของคุณเอง (ในฐานะ GM)', 'That is your own session (as GM).'],
    CHARACTER_SEATED: ['ตัวละครนี้อยู่ใน session อื่นอยู่แล้ว ใช้ตัวละครอื่นเข้าร่วม หรือออกจาก session เดิมก่อน', 'This character already sits in another session. Use another character, or leave that session first.']
  };

  class Page extends Component {
    constructor(props) {
      super(props);
      var id = new URLSearchParams(location.search).get('id');
      Object.assign(this.state, { charId: id || null, row: null, seat: null, loading: !!id,
        tbl: { joined: '', code: '', err: '', leaving: false, pending: '', other: null } });
    }

    async componentDidMount() {
      // the design's BroadcastChannel demo is replaced by Supabase realtime here
      var me = await SP.requireUser('characters.html');
      if (!me) return;
      this.setState({ user: me.user, profile: me.profile, role: me.profile.role });
      window.addEventListener('beforeunload', (e) => { if (this.state.dirty) { e.preventDefault(); e.returnValue = ''; } });
      if (this.state.charId) await this.loadChar();
      await this.loadSeat();
    }
    componentWillUnmount() { this.unsub(); if (this._bgm) this._bgm.close(); }

    th() { return this.state.lang !== 'en'; }
    factorLocked() { var seat = this.state.seat; return !!(seat && this.state.charId && seat.character_id === this.state.charId); }
    /* the picture the GM has up for this sheet's session (sessions.scene, kept fresh by realtime) */
    sceneNow() {
      var seat = this.state.seat;
      return seat && seat.character_id === this.state.charId && this.state.charId && seat.sessions ? seat.sessions.scene || null : null;
    }
    encounterNow() {
      var seat = this.state.seat;
      return seat && seat.character_id === this.state.charId && this.state.charId && seat.sessions ? SP.encounterList(seat.sessions.encounter) : [];
    }
    say(th, en) { this.setState({ msg: this.th() ? th : en }); }

    async loadChar() {
      var r = await sb.from('characters').select('*').eq('id', this.state.charId).single();
      if (r.error) { this.setState({ loading: false, charId: null }); return this.say('ไม่พบตัวละครนี้ เริ่มใบใหม่ให้แทน', 'Character not found; starting a fresh sheet.'); }
      var s = Object.assign(initialSheet(), r.data.sheet || {}, {
        name: r.data.name, factor: r.data.factor,
        portrait: r.data.portrait_path ? SP.imageUrl(r.data.portrait_path) : ''
      });
      this.setState({ row: r.data, s: s, loading: false, dirty: false, savedAt: new Date(r.data.updated_at).getTime() });
    }

    async loadSeat() {
      // a player may sit in one campaign and one one-shot at a time; this sheet cares about its own seat
      var m = await sb.from('session_members').select('session_id, character_id, format, sessions(id, name, invite_code, status, bgm, format, scene, level, encounter), characters(name)').eq('user_id', this.state.profile.id);
      var seats = (m.data || []).filter(function (x) { return x.sessions; });
      var seat = seats.find((x) => x.character_id === this.state.charId) || null;
      this.setState({ seats: seats, seat: seat, conflict: null, tbl: Object.assign({}, this.state.tbl, {
        joined: seat ? seat.sessions.invite_code : '', other: null, pending: '', leaving: false
      }) });
      this.unsub();
      if (seat) this.subscribe(seat.sessions);
    }

    subscribe(sess) {
      if (sess.bgm) this.onBgm(Object.assign({ type: 'state' }, sess.bgm));
      this._ch = sb.channel('sheet-' + sess.id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: 'id=eq.' + sess.id }, (p) => {
          var row = p.new || {};
          this.setState({ seat: Object.assign({}, this.state.seat, { sessions: Object.assign({}, this.state.seat.sessions, row) }) });
          if (row.bgm) this.onBgm(Object.assign({ type: 'state' }, row.bgm));
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'session_members' }, () => this.loadSeat())
        // other people's rolls at this table tumble on this sheet too
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_events', filter: 'session_id=eq.' + sess.id }, (p) => {
          var ev = p.new;
          if (ev && ev.kind === 'roll' && ev.actor_id !== this.state.profile.id && window.SPDice) window.SPDice.show(ev.payload, this.th());
        });
      this._ch.subscribe();
      this._presence = sb.channel('presence-' + sess.id, { config: { presence: { key: this.state.profile.id } } });
      this._presence.subscribe((st) => { if (st === 'SUBSCRIBED') this._presence.track({ character_id: this.state.charId }); });
    }
    unsub() {
      if (this._ch) { sb.removeChannel(this._ch); this._ch = null; }
      if (this._presence) { sb.removeChannel(this._presence); this._presence = null; }
    }

    /* Exhaustion / Surge Energy / Advance pts changed by a roll: write just those into the saved sheet so the GM Monitor updates now */
    rollSaved(patch, wasDirty) {
      // one at a time, so a later write never starts from a sheet missing the earlier one
      this._rollQ = (this._rollQ || Promise.resolve()).then(() => this.rollWrite(patch, wasDirty));
    }
    async rollWrite(patch, wasDirty) {
      var row = this.state.row;
      if (!this.state.charId || !row || !patch) return;
      var sheet = Object.assign({}, row.sheet || {}, patch);
      var r = await sb.from('characters').update({ sheet: sheet }).eq('id', this.state.charId).select().single();
      if (r.error) return this.setState({ msg: SP.err(r.error, this.th()) });
      var st = { row: Object.assign({}, row, r.data) };
      if (!wasDirty) st.dirty = false;
      this.setState(st);
    }

    /* a roll goes to the session this sheet sits in; off the table it stays on this screen */
    dicePost(roll) {
      var seat = this.state.seat;
      if (!roll || !seat || seat.character_id !== this.state.charId || !this.state.charId) return;
      sb.from('session_events').insert({ session_id: seat.session_id, character_id: this.state.charId, actor_id: this.state.profile.id, kind: 'roll', payload: roll })
        .then((r) => { if (r.error) this.setState({ msg: SP.err(r.error, this.th()) }); });
    }

    async save() {
      var th = this.th();
      var s = this.state.s;
      var name = (s.name || '').trim();
      if (!name) return this.say('ใส่ชื่อตัวละครก่อนบันทึก', 'Give your character a name before saving');
      this.say('กำลังบันทึก…', 'Saving…');
      var sheet = Object.assign({}, s); delete sheet.portrait;
      var fields = { name: name.slice(0, 60), factor: s.factor, sheet: sheet };
      var id = this.state.charId, r;
      if (id) r = await sb.from('characters').update(fields).eq('id', id).select().single();
      else r = await sb.from('characters').insert(fields).select().single();
      if (r.error) return this.setState({ msg: SP.err(r.error, th) });
      var row = r.data; id = row.id;
      // portrait: upload a freshly picked one, or drop a removed one
      try {
        if (s.portrait && s.portrait.indexOf('data:') === 0) {
          var path = await SP.uploadImage(SP.dataUrlBlob(s.portrait), id);
          var u = await sb.from('characters').update({ portrait_path: path }).eq('id', id).select().single();
          if (!u.error) row = u.data;
        } else if (!s.portrait && row.portrait_path) {
          await sb.storage.from('portraits').remove([row.portrait_path.split('?')[0]]);
          var u2 = await sb.from('characters').update({ portrait_path: null }).eq('id', id).select().single();
          if (!u2.error) row = u2.data;
        }
      } catch (e) { this.setState({ msg: SP.imageErr(e, th) }); }
      if (!this.state.charId) history.replaceState(null, '', 'character.html?id=' + id);
      this.setState({ charId: id, row: row, dirty: false, savedAt: Date.now(),
        s: Object.assign({}, s, { portrait: row.portrait_path ? SP.imageUrl(row.portrait_path) : '' }),
        msg: th ? 'บันทึก ' + name + ' แล้ว' : name + ' saved' });
    }

    async join(code, move) {
      var th = this.th();
      if (!this.state.charId) return this.setState({ tbl: Object.assign({}, this.state.tbl, { err: th ? 'บันทึกตัวละครก่อน แล้วค่อยเข้าร่วม session' : 'Save the character before joining a session.' }) });
      var r = await sb.rpc('join_session', { p_code: code, p_character: this.state.charId, p_move: !!move });
      if (r.error) {
        var m = String(r.error.message);
        if (m.indexOf('ALREADY_SEATED') !== -1) {
          var sid = (m.split('ALREADY_SEATED:')[1] || '').trim().slice(0, 36);
          var hit = (this.state.seats || []).find((x) => x.session_id === sid) || null;
          return this.setState({ conflict: hit, tbl: Object.assign({}, this.state.tbl, { pending: code, err: '' }) });
        }
        var txt = SP.err(r.error, th);
        for (var k in JOIN_ERR) if (m.indexOf(k) !== -1) txt = JOIN_ERR[k][th ? 0 : 1];
        return this.setState({ tbl: Object.assign({}, this.state.tbl, { err: txt, pending: '' }) });
      }
      this.setState({ tbl: Object.assign({}, this.state.tbl, { code: '', err: '' }) });
      await this.loadSeat();
    }

    renderVals() {
      // the design's renderVals looks seated codes up in its demo table list; hand it a blank seat and fill the real one below
      var realTbl = this.state.tbl, v;
      this.state.tbl = Object.assign({}, realTbl, { joined: '' });
      try { v = super.renderVals(); } finally { this.state.tbl = realTbl; }
      var th = this.th();
      var L = function (a, b) { return th ? a : b; };
      SP.menuVals(this, v);
      var seat = this.state.seat, tbl = this.state.tbl;
      var mine = !!(seat && seat.character_id === this.state.charId && this.state.charId);
      var sess = mine ? seat.sessions : null;
      var live = sess && sess.status === 'live';
      var other = tbl.pending ? this.state.conflict : null;
      v.tb = Object.assign({}, v.tb, {
        out: !mine && !tbl.pending, live: mine, conflict: !!tbl.pending,
        accent: mine ? (live ? '#4ADE80' : '#FFD400') : tbl.pending ? '#FFD400' : '#3A3655',
        hasOther: false,
        otherNote: other ? L('บัญชีนี้อยู่ที่ session ' + other.sessions.name + ' กับ ' + (other.characters ? other.characters.name : '?') + ' แล้ว (1 บัญชีเล่นได้ทีละ 1 session)', 'Your account is already at ' + other.sessions.name + ' with ' + (other.characters ? other.characters.name : '?') + ' (one session per account).') : '',
        join: (e) => { if (e && e.preventDefault) e.preventDefault(); this.join(String(tbl.code || '').trim().toUpperCase(), false); },
        conflictBody: other && tbl.pending ? L((other.characters ? other.characters.name : '?') + ' อยู่ที่ session ' + other.sessions.name + ' ถ้าย้าย จะออกจาก session เดิม แล้วตัวละครนี้เข้า ' + tbl.pending + ' แทน', (other.characters ? other.characters.name : '?') + ' is at ' + other.sessions.name + '. Moving takes them out and seats this character at ' + tbl.pending + '.') : tbl.pending ? L('บัญชีนี้อยู่ใน session ประเภทเดียวกันอยู่แล้ว ถ้าย้าย ตัวละครเดิมจะออกจาก session นั้น แล้วตัวละครนี้เข้า ' + tbl.pending + ' แทน', 'Your account already sits in a session of this kind. Moving takes that character out and seats this one at ' + tbl.pending + '.') : '',
        doMove: () => this.join(tbl.pending, true),
        stColor: live ? '#4ADE80' : '#FFD400',
        stLabel: live ? 'LIVE' : sess && sess.status === 'ended' ? 'ENDED' : L('รอ GM เริ่ม SESSION', 'WAITING FOR GM'),
        joinedCode: sess ? sess.invite_code : '',
        tableName: sess ? L('Session: ', 'SESSION: ') + sess.name : '',
        hasLv: !!(sess && sess.level), lv: sess && sess.level ? sess.level : '',
        liveText: live ? L('ทุกครั้งที่กดบันทึก GM จะเห็นการเปลี่ยนแปลงทันที', 'Every save reaches your GM instantly.') : L('เข้า session แล้ว GM จะเห็นตัวละครนี้เมื่อเริ่ม session', 'You\'re seated. Your GM sees this sheet once the session starts.'),
        doLeave: async () => {
          var r = await sb.rpc('leave_session', { p_session: sess ? sess.id : null });
          if (r.error) return this.setState({ msg: SP.err(r.error, th) });
          if (this._bgm) this._bgm.stopAll();
          this.setState({ bgmOn: false });
          await this.loadSeat();
        }
      });
      v.bgmShow = mine;
      v.saveChar = () => this.save();
      v.savePdf = () => window.print();
      // renamed injuries: files written before the rename still say Poisoned
      var INJ_RENAMED = { Poisoned: 'Fever' };
      var fixInj = (inj) => {
        var out = Object.assign({}, inj || {});
        Object.keys(INJ_RENAMED).forEach(function (old) { if (old in out) { if (!(INJ_RENAMED[old] in out) || out[old]) out[INJ_RENAMED[old]] = out[old]; delete out[old]; } });
        return out;
      };
      v.exportJson = () => {
        var s = Object.assign({}, this.state.s, { inj: fixInj(this.state.s.inj) }); delete s.portrait;
        SP.download(((s.name || 'character').trim() || 'character') + '.json', s);
      };
      v.importJson = () => SP.pickJson().then((data) => {
        if (!data || typeof data !== 'object') throw new Error('bad');
        var s = Object.assign(initialSheet(), data, { portrait: this.state.s.portrait });
        s.inj = fixInj(s.inj);
        if (['shifter', 'outlaw', 'cpd'].indexOf(s.factor) === -1) s.factor = 'shifter';
        if (this.factorLocked()) { s.factor = this.state.s.factor; if (s.factor === 'cpd') s.traitName = this.state.s.traitName; }
        this.setState({ s: s, dirty: true, msg: L('นำเข้าแล้ว กด "บันทึกตัวละคร" เพื่อเก็บลงบัญชี', 'Imported. Press "Save character" to keep it.') });
      }).catch((e) => { if (e && e.message !== 'NONE') this.setState({ msg: L('อ่านไฟล์นี้ไม่ได้ ต้องเป็น .json ที่ Export จากใบตัวละคร', 'Couldn\'t read that file; use a .json exported from a sheet.') }); });
      if (this.state.loading) v.saveStatus = L('กำลังโหลด…', 'Loading…');
      return v;
    }
  }
  Page.pageKind = 'Character';
  DC.mount(Page, document.getElementById('app'));
})();
