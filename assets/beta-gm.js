/* GM Monitor on Supabase: live party from players' sheets, turn order, LIVE FEED, presence and the BGM bot. */
(function () {
  'use strict';
  var sb = SP.sb;
  var KEYS = { hpCur: 'IP', hpMax: 'IP max', spCur: 'WM', spMax: 'WM max', se: 'SE', ex: 'EX', adv: 'ADV', coins: 'Coins', coma: 'Coma', inj: 'Injury' };

  var toCard = function (ch, player, online) {
    var s = ch.sheet || {}, F = SP.FACTOR[ch.factor] || SP.FACTOR.shifter, ba = s.ba || {}, inj = s.inj || {};
    return {
      name: ch.name, player: player || '—', f: F.key, sub: s.job || '—', online: !!online,
      ip: SP.num(s.hpCur), ipMax: SP.num(s.hpMax) || 1, wm: SP.num(s.spCur), wmMax: ch.factor !== 'shifter' ? 0 : SP.num(s.spMax),
      ba: [SP.num(ba.force), SP.num(ba.tactical), SP.num(ba.trick), SP.num(ba.sense)],
      se: SP.num(s.se), ex: SP.num(s.ex), adv: SP.num(s.adv), coins: SP.num(s.coins),
      inj: Object.keys(inj).filter(function (k) { return inj[k]; }),
      at: new Date(ch.updated_at).getTime(), portrait: ch.portrait_path ? SP.imageUrl(ch.portrait_path) : '', sheet: s, factor: ch.factor
    };
  };
  var note = {
    get: function (id) { try { return localStorage.getItem('sp-gmnote-' + id) || ''; } catch (e) { return ''; } },
    set: function (id, v) { try { localStorage.setItem('sp-gmnote-' + id, v); } catch (e) {} }
  };

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { chars: {}, order: [], feed: [], events: [], removed: [], turn: 0, round: 1, sessions: [], sid: null, members: [], ready: false, online: {} });
    }

    async componentDidMount() {
      this._clock = setInterval(() => this.setState({ now: Date.now() }), 1000);
      var me = await SP.requireUser('gm.html');
      if (!me) return;
      this.setState({ user: me.user, profile: me.profile, role: me.profile.role });
      if (!me.profile.gm_allowed) { location.replace('characters.html'); return; }
      if (me.profile.role !== 'gm') return;
      await this.loadSessions();
      var want = new URLSearchParams(location.search).get('s');
      var ss = this.state.sessions;
      var pick = ss.find((s) => s.id === want) || ss.find((s) => s.status === 'live') || ss[0];
      if (pick) await this.open(pick.id);
      else this.setState({ ready: true });
    }
    componentWillUnmount() { clearInterval(this._clock); this.unsub(); if (this._bgm) this._bgm.close(); }
    tickLive() {}
    onRoleChange(role) { if (role === 'gm') location.reload(); }

    /* persist turn order changes made by the design's handlers */
    setState(u) {
      super.setState(u);
      var p = typeof u === 'function' ? null : u;
      if (p && !this._applying && this.state.sid && ('order' in p || 'turn' in p || 'round' in p)) {
        clearTimeout(this._saveT);
        this._saveT = setTimeout(() => {
          sb.from('sessions').update({ turn_order: this.state.order, turn: this.state.turn, round: this.state.round }).eq('id', this.state.sid).then(() => {});
        }, 400);
      }
    }
    apply(patch) { this._applying = true; super.setState(patch); this._applying = false; }

    async loadSessions() {
      var r = await sb.from('sessions').select('*').eq('gm_id', this.state.profile.id).neq('status', 'ended').order('created_at', { ascending: false });
      this.apply({ sessions: r.data || [] });
    }

    async open(sid) {
      this.unsub();
      var sess = this.state.sessions.find((s) => s.id === sid);
      this.apply({ sid: sid, session: sess, turn: sess.turn || 0, round: sess.round || 1, order: sess.turn_order || [], copied: false, confirm: null });
      if (history.replaceState) history.replaceState(null, '', 'gm.html?s=' + sid);
      await this.loadParty();
      var ev = await sb.from('session_events').select('*').eq('session_id', sid).order('created_at', { ascending: false }).limit(30);
      this.apply({ events: ev.data || [], ready: true });
      this.subscribe(sid);
    }

    async loadParty() {
      var sid = this.state.sid;
      var m = await sb.from('session_members').select('character_id, user_id, characters(*), profiles(display_name)').eq('session_id', sid);
      var members = m.data || [];
      var chars = {};
      members.forEach((x) => { if (x.characters) chars[x.character_id] = toCard(x.characters, x.profiles && x.profiles.display_name, this.state.online[x.user_id]); });
      // keep NPCs and seated PCs in the saved order, add newcomers at the end
      var order = (this.state.order || []).filter((o) => o.kind === 'npc' || chars[o.id]);
      Object.keys(chars).forEach((id) => { if (!order.some((o) => o.id === id)) order.push({ id: id, kind: 'pc' }); });
      this.apply({ chars: chars, members: members, order: order, turn: Math.min(this.state.turn, Math.max(0, order.length - 1)) });
    }

    subscribe(sid) {
      this._ch = sb.channel('gm-' + sid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_members', filter: 'session_id=eq.' + sid }, () => this.loadParty())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_events', filter: 'session_id=eq.' + sid }, (p) => {
          this.apply({ events: [p.new].concat(this.state.events).slice(0, 30) });
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'characters' }, (p) => {
          var row = p.new; if (!row || !this.state.chars[row.id]) return;
          var mem = this.state.members.find((x) => x.character_id === row.id) || {};
          var chars = Object.assign({}, this.state.chars);
          chars[row.id] = Object.assign(toCard(row, chars[row.id].player, this.state.online[mem.user_id]), { at: Date.now() });
          this.apply({ chars: chars });
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: 'id=eq.' + sid }, (p) => {
          var ss = this.state.sessions.map((s) => (s.id === sid ? Object.assign({}, s, p.new) : s));
          this.apply({ sessions: ss, session: Object.assign({}, this.state.session, p.new) });
        });
      this._ch.subscribe();
      this._pres = sb.channel('presence-' + sid, { config: { presence: { key: this.state.profile.id } } });
      this._pres.on('presence', { event: 'sync' }, () => {
        var st = this._pres.presenceState(), online = {};
        Object.keys(st).forEach((k) => { online[k] = true; });
        var chars = Object.assign({}, this.state.chars);
        this.state.members.forEach((x) => { if (chars[x.character_id]) chars[x.character_id] = Object.assign({}, chars[x.character_id], { online: !!online[x.user_id] }); });
        this.apply({ online: online, chars: chars });
      });
      this._pres.subscribe();
    }
    unsub() {
      if (this._ch) { sb.removeChannel(this._ch); this._ch = null; }
      if (this._pres) { sb.removeChannel(this._pres); this._pres = null; }
    }

    /* the BGM bot writes what players should hear into sessions.bgm */
    onBgmChange(msg) {
      if (!this.state.sid) return;
      clearTimeout(this._bgmT);
      this._bgmT = setTimeout(() => {
        sb.from('sessions').update({ bgm: { sync: msg.sync, mood: msg.mood, ambients: msg.ambients, at: msg.at } }).eq('id', this.state.sid).then(() => {});
      }, 150);
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      var L = function (a, b) { return th ? a : b; };
      SP.menuVals(this, v);
      var C = { shifter: '#2EE6F0', norms: '#FF2E88', cpd: '#FFD400' };
      var sess = this.state.session, ss = this.state.sessions;
      var stName = function (st) { return st === 'live' ? 'LIVE' : L('พักอยู่', 'PAUSED'); };
      v.curTableName = sess ? sess.name : L('ยังไม่มี session', 'No session yet');
      v.curTableLabel = sess ? L('Session: ', 'SESSION: ') + sess.name + (sess.status !== 'live' ? L(' · พักอยู่ (เลือกใน SESSION ▾ เพื่อเริ่ม)', ' · PAUSED (pick it in SESSION ▾ to start)') : '') : L('สร้าง session ก่อนที่ Session ของฉัน', 'Create one in My Sessions first');
      v.curCode = sess ? sess.invite_code : '—';
      v.tableMenu = ss.map((s) => {
        var isCur = sess && s.id === sess.id;
        return {
          name: s.name, code: s.invite_code, players: '', current: isCur ? 'true' : 'false', bg: isCur ? '#1D1930' : 'transparent',
          stColor: s.status === 'live' ? '#4ADE80' : '#8C88A6', stLabel: stName(s.status),
          pick: () => {
            if (isCur && s.status === 'live') return this.setState({ menu: false });
            if (s.status === 'live') { this.setState({ menu: false }); return this.open(s.id); }
            this.setState({ menu: false, pendingTable: s.id });
          }
        };
      });
      var pend = this.state.pendingTable ? ss.find((s) => s.id === this.state.pendingTable) : null;
      var liveNow = ss.find((s) => s.status === 'live');
      v.hasSwitch = !!pend;
      v.switchTitle = pend ? L('เริ่ม session ' + pend.name + '?', 'Start ' + pend.name + '?') : '';
      v.switchBody = pend ? (liveNow && liveNow.id !== pend.id ? L('1 บัญชีรันได้ทีละ 1 session "' + liveNow.name + '" จะถูกพักอัตโนมัติ ผู้เล่นที่นั่นจะเห็นสถานะ "รอ GM"', 'One live session per account. "' + liveNow.name + '" will be paused.') : L('ผู้เล่นที่นั่งอยู่จะเห็นสถานะ LIVE', 'Seated players go LIVE.')) : '';
      v.doSwitch = async () => {
        var to = this.state.pendingTable;
        var r = await sb.rpc('start_session', { p_session: to });
        this.setState({ pendingTable: null });
        if (r.error) return;
        await this.loadSessions();
        await this.open(to);
      };
      // pause / resume / end the open session for real
      var isLive = !!(sess && sess.status === 'live');
      var refresh = async () => {
        await this.loadSessions();
        var fresh = this.state.sessions.find((s) => sess && s.id === sess.id);
        if (fresh) this.apply({ session: fresh });
      };
      v.pausedPressed = sess && !isLive ? 'true' : 'false';
      v.pauseLabel = sess && !isLive ? L('▶ เริ่ม session ต่อ', '▶ Resume session') : L('❚❚ พัก session', '❚❚ Pause session');
      v.pauseBg = sess && !isLive ? '#FFD400' : 'transparent';
      v.pauseFg = sess && !isLive ? '#0B0A12' : '#FFD400';
      v.feedState = sess && !isLive ? 'PAUSED' : 'STREAMING';
      v.feedStateColor = sess && !isLive ? '#8C88A6' : '#4ADE80';
      v.togglePause = async () => {
        if (!sess || this._busy) return;
        this._busy = true;
        var r = await sb.rpc(isLive ? 'pause_session' : 'start_session', { p_session: sess.id });
        this._busy = false;
        this.setState({ ending: false });
        if (r.error) return this.setState({ toast: SP.err(r.error, th) });
        await refresh();
      };
      v.askEnd = () => { if (sess) this.setState({ ending: !this.state.ending, pendingTable: null }); };
      v.hasEnd = !!(this.state.ending && sess);
      v.endTitle = sess ? L('จบ session ' + sess.name + '?', 'End ' + sess.name + '?') : '';
      v.doEnd = async () => {
        if (!sess) return;
        var r = await sb.rpc('end_session', { p_session: sess.id });
        if (r.error) return this.setState({ ending: false, toast: SP.err(r.error, th) });
        location.href = 'sessions.html';
      };
      v.hasEnded = false;
      v.copyCode = () => { try { if (navigator.clipboard && sess) navigator.clipboard.writeText(sess.invite_code).catch(() => {}); } catch (e) {} this.setState({ copied: true }); };
      var ids = Object.keys(this.state.chars);
      v.party = v.party.map((p, i) => {
        var id = ids[i], c = this.state.chars[id], s = c.sheet || {};
        var none = L('— ยังไม่มี', '— none yet');
        var grp = (k, color, items, emptyText) => ({ k: k, color: color, items: items, empty: items.length === 0, emptyText: emptyText || none });
        var named = (arr) => (arr || []).filter((x) => x && x.name);
        return Object.assign({}, p, {
          slots: String(SP.num(s.slots) || 5),
          loadout: [
            grp('BONDED ITEM', '#FF2E88', named(s.bonded).map((b) => ({ name: b.name, meta: '', fx: b.effect || '' }))),
            grp('WEAPONS', '#FF3D6E', named(s.weapons).map((w) => ({ name: w.name, meta: 'R' + (w.range || '-') + ' · DMG ' + (w.dmg || '-'), fx: w.fx || '' }))),
            grp('GEARS', '#2EE6F0', named(s.gears).map((g) => ({ name: g.name, meta: '', fx: g.fx || '' }))),
            grp(c.f === 'norms' ? 'COSMIC GADGETS' : 'COSMIC ABILITIES', '#C084FC', named(s.cosmic).map((x) => ({ name: x.name, meta: 'CD ' + (x.cd || 0), fx: x.fx || '' })), c.f === 'cpd' ? L('— C.P.D. ไม่มีพลังคอสมิค', '— C.P.D. has no cosmic power') : null)
          ],
          detail: [
            { k: 'Trait', v: s.traitName ? s.traitName + (s.traitFx ? ' — ' + s.traitFx : '') : '—' },
            { k: 'Flaw', v: s.flaw || '—' },
            { k: 'Skills', v: named(s.skills).map((x) => x.name).join(', ') || '—' },
            { k: 'Background', v: s.bio || '—' }
          ],
          note: note.get(id),
          onNote: (e) => note.set(id, e && e.target ? e.target.value : ''),
          doDel: async () => {
            var r = await sb.from('session_members').delete().eq('session_id', this.state.sid).eq('character_id', id);
            this.setState({ confirm: null });
            if (!r.error) {
              sb.from('session_events').insert({ session_id: this.state.sid, character_id: id, actor_id: this.state.profile.id, kind: 'leave', payload: { reason: 'removed_by_gm' } }).then(() => {});
              this.loadParty();
            }
          }
        });
      });
      var chars = this.state.chars;
      var hhmmss = function (iso) { var d = new Date(iso); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':'); };
      v.feed = this.state.events.map((e) => {
        var c = e.character_id ? chars[e.character_id] : null;
        var what;
        if (e.kind === 'join') what = L('เข้าร่วม session', 'joined the session');
        else if (e.kind === 'leave') what = e.payload && e.payload.reason === 'removed_by_gm' ? L('ถูก GM เอาออกจาก session', 'was removed by the GM') : e.payload && e.payload.reason === 'moved' ? L('ย้ายไป session อื่น', 'moved to another session') : L('ออกจาก session', 'left the session');
        else if (e.kind === 'status') what = { live: L('เริ่ม session', 'session started'), paused: L('พัก session', 'session paused'), ended: L('จบ session', 'session ended') }[(e.payload || {}).status] || e.kind;
        else if (e.kind === 'update') what = Object.keys(e.payload || {}).map((k) => {
          var x = e.payload[k];
          if (k === 'inj') return L('สถานะบาดเจ็บเปลี่ยน', 'injuries changed');
          return (KEYS[k] || k) + ' ' + JSON.stringify(x.from).replace(/"/g, '') + '→' + JSON.stringify(x.to).replace(/"/g, '');
        }).join(' · ');
        else what = e.kind;
        return { time: hhmmss(e.created_at), who: c ? c.name : (e.kind === 'status' ? 'GM' : L('ผู้เล่น', 'Player')), color: c ? C[c.f] : '#FFD400', what: what };
      });
      v.exportParty = () => SP.download('party-' + (sess ? sess.invite_code : 'session') + '.json', Object.keys(chars).map((id) => Object.assign({ name: chars[id].name, factor: chars[id].factor }, chars[id].sheet)));
      v.importFiles = async (e) => {
        var files = Array.prototype.slice.call((e && e.target && e.target.files) || []);
        if (e && e.target) e.target.value = '';
        var add = Object.assign({}, this.state.chars), order = this.state.order.slice();
        for (var f of files) {
          try {
            var d = JSON.parse(await f.text()); var arr = Array.isArray(d) ? d : [d];
            arr.forEach((s) => {
              var id = 'file-' + String(s.name || f.name).toLowerCase().replace(/\s+/g, '-');
              add[id] = toCard({ name: s.name || f.name, factor: s.factor || 'shifter', sheet: s, updated_at: new Date().toISOString() }, L('ไฟล์', 'file'), false);
              if (!order.some((o) => o.id === id)) order.push({ id: id, kind: 'pc' });
            });
          } catch (err) {}
        }
        this.apply({ chars: add, order: order });
      };
      v.onlineCount = Object.keys(chars).filter((k) => chars[k].online).length + ' / ' + Object.keys(chars).length;
      v.t = Object.assign({}, v.t, { importNote: L('การ์ดจากไฟล์ .json แสดงเฉพาะในเครื่องนี้ ไม่บันทึกลง session · โน้ต GM เก็บไว้ในเบราว์เซอร์นี้', 'Cards from .json files stay on this device only. GM notes are kept in this browser.') });
      if (this.state.ready && !sess) v.curTableLabel = L('ยังไม่มี session — สร้างที่ "Session ของฉัน"', 'No session yet: create one in My Sessions');
      return v;
    }
  }
  Page.pageKind = 'GMSheet';
  DC.mount(Page, document.getElementById('app'));
})();
