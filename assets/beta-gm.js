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
      ba: ['force', 'tactical', 'trick', 'sense'].map(function (k) { return SP.baOf(s, ch.factor, k); }),
      se: SP.num(s.se), ex: SP.num(s.ex), adv: SP.num(s.adv), coins: SP.num(s.coins),
      boost: s.boost && s.boost.kind ? (s.boost.kind === 'dice' ? 'D8' : s.boost.kind === 'pwr' ? 'PWR+' : String(((s.skills || [])[s.boost.sk] || {}).name || 'SKILL').slice(0, 24)) + ' +' + SP.num(s.boost.n) : '',
      inj: (s.dead ? ['KIA'] : s.coma ? ['COMA'] : []).concat(Object.keys(inj).filter(function (k) { return inj[k]; })),
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
      Object.assign(this.state, { chars: {}, order: [], feed: [], events: [], removed: [], turn: 0, round: 1, sessions: [], sid: null, members: [], ready: false, online: {},
        notes: [], noteSel: null, noteSavedAt: null, noteAskDel: false,
        scenes: [], sceneShown: [], sceneLink: '', sceneAskDel: null, sceneMsg: '',
        npcLib: [], encounter: [] });
      window.addEventListener('beforeunload', (e) => {
        if (this._notePend && Object.keys(this._notePend).length) { this.flushNotes(); e.preventDefault(); e.returnValue = ''; }
      });
    }

    async componentDidMount() {
      this._clock = setInterval(() => this.setState({ now: Date.now() }), 1000);
      var me = await SP.requireUser('gm.html');
      if (!me) return;
      this.setState({ user: me.user, profile: me.profile, role: me.profile.role });
      if (!me.profile.gm_allowed) { location.replace('characters.html'); return; }
      if (me.profile.role !== 'gm') return;
      this.loadNpcs();
      await this.loadSessions();
      var want = new URLSearchParams(location.search).get('s');
      var ss = this.state.sessions;
      if (want && !ss.find((s) => s.id === want)) {
        var arch = await sb.from('sessions').select('*').eq('id', want).eq('gm_id', me.profile.id).maybeSingle();
        if (arch.data) { ss = ss.concat([arch.data]); this.apply({ sessions: ss }); }
      }
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
      if (p && !this._applying && this.state.sid && 'rpMode' in p) {
        sb.from('sessions').update({ turn_based: !p.rpMode }).eq('id', this.state.sid).then((r) => { if (r.error) this.apply({ toast: SP.err(r.error, this.state.lang !== 'en') }); });
      }
      if (p && !this._applying && this.state.sid && ('order' in p || 'turn' in p || 'round' in p)) {
        clearTimeout(this._saveT);
        this._saveT = setTimeout(() => {
          this._saveT = null;
          sb.from('sessions').update({ turn_order: this.state.order, turn: this.state.turn, round: this.state.round }).eq('id', this.state.sid).then(() => {});
        }, 400);
      }
    }
    apply(patch) { this._applying = true; super.setState(patch); this._applying = false; }

    async loadSessions() {
      var r = await sb.from('sessions').select('*').eq('gm_id', this.state.profile.id).neq('status', 'ended').order('created_at', { ascending: false });
      var list = r.data || [];
      var cur = this.state.session;
      if (cur && !list.find((x) => x.id === cur.id)) list = list.concat([Object.assign({}, cur, { status: 'ended' })]);
      this.apply({ sessions: list });
    }

    async open(sid) {
      if (this._notePend && Object.keys(this._notePend).length) { clearTimeout(this._noteT); await this.flushNotes(); }
      this.unsub();
      var sess = this.state.sessions.find((s) => s.id === sid);
      this.apply({ sceneShown: SP.sceneList(sess.scene), scenes: [], sceneMsg: '', sceneAskDel: null, encounter: SP.encounterList(sess.encounter) });
      this.apply({ sid: sid, session: sess, turn: sess.turn || 0, round: sess.round || 1, order: sess.turn_order || [], rpMode: sess.turn_based === false, copied: false, confirm: null });
      if (history.replaceState) history.replaceState(null, '', 'gm.html?s=' + sid);
      await this.loadParty();
      var ev = await sb.from('session_events').select('*').eq('session_id', sid).order('created_at', { ascending: false }).limit(100);
      this.apply({ events: ev.data || [], ready: true });
      await this.loadNotes();
      await this.loadScenes();
      this.subscribe(sid);
    }

    /* Session notes: the GM's private log for this session, one entry per play. */
    async loadNotes() {
      var sid = this.state.sid;
      var r = await sb.from('session_notes').select('*').eq('session_id', sid).order('play_no', { ascending: false });
      if (sid !== this.state.sid) return;
      var rows = (r.data || []).map(function (n) { return { id: n.id, no: n.play_no, at: new Date(n.created_at).getTime(), title: n.title, body: n.body, upd: new Date(n.updated_at).getTime() }; });
      this.apply({ notes: rows, noteSel: rows[0] ? rows[0].id : null, noteAskDel: false, noteErr: false,
        noteSavedAt: rows.reduce(function (m, n) { return Math.max(m, n.upd); }, 0) || null, noteSaving: false });
    }
    editNote(id, patch) {
      this.apply({ notes: this.state.notes.map(function (n) { return n.id === id ? Object.assign({}, n, patch) : n; }), noteSaving: true, noteErr: false });
      this._notePend = this._notePend || {};
      this._notePend[id] = Object.assign(this._notePend[id] || {}, patch);
      clearTimeout(this._noteT);
      this._noteT = setTimeout(() => this.flushNotes(), 700);
    }
    async flushNotes() {
      var pend = this._notePend || {}; this._notePend = {};
      var ok = true;
      for (var id in pend) {
        var r = await sb.from('session_notes').update(pend[id]).eq('id', id);
        if (r.error) { ok = false; this._notePend[id] = Object.assign(pend[id], this._notePend[id] || {}); }
      }
      this.apply(ok ? { noteSaving: false, noteSavedAt: Date.now() } : { noteSaving: false, noteErr: true });
      if (!ok) { clearTimeout(this._noteT); this._noteT = setTimeout(() => this.flushNotes(), 5000); }
    }

    /* Scene screen: the GM's picture library (session_images) and what's on players' screens (sessions.scene). */
    async setLevel(lv) {
      var sid = this.state.sid, sess = this.state.session;
      if (!sid || !sess || sess.format !== 'campaign') return;
      var prev = sess.level;
      this.apply({ session: Object.assign({}, sess, { level: lv }) });
      var r = await sb.from('sessions').update({ level: lv }).eq('id', sid);
      if (r.error) this.apply({ session: Object.assign({}, this.state.session, { level: prev }) });
    }
    async loadScenes() {
      var sid = this.state.sid;
      var r = await sb.from('session_images').select('*').eq('session_id', sid).order('created_at', { ascending: false });
      if (sid !== this.state.sid) return;
      this.apply({ scenes: (r.data || []).map(function (x) { return { id: x.id, url: x.url, title: x.title, path: x.path }; }) });
    }
    sceneSay(th, en, err) { this.setState({ sceneMsg: this.state.lang !== 'en' ? th : en, sceneMsgErr: !!err }); }
    async sceneSet(list) {
      var sid = this.state.sid;
      if (!sid) return;
      var prev = this.state.sceneShown;
      this.setState({ sceneShown: list, sceneAskDel: null });
      var r = await sb.from('sessions').update({ scene: list.length ? list : null }).eq('id', sid);
      if (r.error) { this.apply({ sceneShown: prev }); this.sceneSay('ขึ้นภาพไม่สำเร็จ: ' + r.error.message, 'Couldn\'t update the screen: ' + r.error.message, true); }
    }
    async sceneAddRow(row) {
      var r = await sb.from('session_images').insert(Object.assign({ session_id: this.state.sid }, row)).select().single();
      if (r.error) throw r.error;
      if (r.data.session_id === this.state.sid) this.apply({ scenes: [{ id: r.data.id, url: r.data.url, title: r.data.title, path: r.data.path }].concat(this.state.scenes) });
    }
    async sceneAddFiles(files) {
      var sid = this.state.sid, th = this.state.lang !== 'en';
      if (!sid || !files.length) return;
      var done = 0;
      for (var f of files) {
        this.sceneSay('กำลังอัปโหลด ' + (done + 1) + '/' + files.length + '…', 'Uploading ' + (done + 1) + '/' + files.length + '…');
        try {
          var blob = await SP.fitImage(f, 1920);
          var path = this.state.profile.id + '/' + sid + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (blob.type === 'image/webp' ? '.webp' : '.jpg');
          var up = await sb.storage.from('scenes').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
          if (up.error) throw up.error;
          var url = sb.storage.from('scenes').getPublicUrl(path).data.publicUrl;
          try { await this.sceneAddRow({ url: url, path: path, title: f.name.replace(/\.[^.]+$/, '').slice(0, 80) }); }
          catch (e) { sb.storage.from('scenes').remove([path]); throw e; }
          done++;
        } catch (e) { return this.setState({ sceneMsg: f.name + ': ' + SP.imageErr(e, th), sceneMsgErr: true }); }
      }
      this.setState({ sceneMsg: '' });
    }
    async sceneAddLink(url) {
      var th = this.state.lang !== 'en';
      if (!this.state.sid) return;
      if (!/^https:\/\/\S+$/i.test(url) || url.length > 2000) return this.sceneSay('ใส่ลิงก์รูปที่ขึ้นต้นด้วย https://', 'Use an image link that starts with https://', true);
      var title = '';
      try { title = decodeURIComponent(url.split('?')[0].split('/').pop() || ''); } catch (e) {}
      try { await this.sceneAddRow({ url: url, path: null, title: title.replace(/\.[^.]+$/, '').slice(0, 80) }); this.setState({ sceneLink: '', sceneMsg: '' }); }
      catch (e) { this.setState({ sceneMsg: SP.err(e, th), sceneMsgErr: true }); }
    }
    async sceneDel(it) {
      if ((this.state.sceneShown || []).some(function (x) { return x.id === it.id; })) await this.sceneSet(this.state.sceneShown.filter(function (x) { return x.id !== it.id; }));
      var r = await sb.from('session_images').delete().eq('id', it.id);
      if (r.error) return this.setState({ sceneAskDel: null, sceneMsg: SP.err(r.error, this.state.lang !== 'en'), sceneMsgErr: true });
      if (it.path) sb.storage.from('scenes').remove([it.path]);
      this.apply({ scenes: this.state.scenes.filter(function (x) { return x.id !== it.id; }), sceneAskDel: null });
    }

    /* NPCs: the GM's library (NPC page) and the Encounter strip players see (sessions.encounter) */
    async loadNpcs() {
      var r = await sb.from('npcs').select('id, name, portrait_url, data').eq('gm_id', this.state.profile.id).order('name');
      this.apply({ npcLib: (r.data || []).map(function (n) { return { id: n.id, name: n.name, role: (n.data && n.data.role) || '', pic: n.portrait_url || '', factor: (n.data && n.data.factor) || '', stat: (n.data && n.data.stat) || null }; }) });
    }
    /* an encounter NPC's current IP / WM: merge into npcs.data.stat (debounced per NPC) */
    npcStatSave(id, stat) {
      this._npcT = this._npcT || {};
      clearTimeout(this._npcT[id]);
      this._npcT[id] = setTimeout(async () => {
        var r = await sb.from('npcs').select('data').eq('id', id).single();
        if (r.error) return;
        var data = Object.assign({}, r.data.data || {});
        data.stat = Object.assign({}, data.stat || {}, { ipCur: stat.ipCur, wmCur: stat.wmCur });
        await sb.from('npcs').update({ data: data }).eq('id', id);
      }, 500);
    }
    async encSet(list) {
      var sid = this.state.sid;
      if (!sid) return;
      var prev = this.state.encounter;
      this.setState({ encounter: list });
      var r = await sb.from('sessions').update({ encounter: list.length ? list : null }).eq('id', sid);
      if (r.error) this.apply({ encounter: prev, toast: SP.err(r.error, this.state.lang !== 'en') });
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

    /* the GM's own rolls (not the secret ones) go to everyone at the table */
    diceRoller() {
      return async (sizes, cosmic, meta, opt) => {
        var r = await sb.rpc('roll_dice', { p_session: opt && opt.secret ? null : this.state.sid || null, p_character: null, p_sizes: sizes, p_cosmic: cosmic, p_meta: meta });
        if (r.error) throw new Error(SP.err(r.error, this.state.lang !== 'en'));
        return r.data;
      };
    }
    dicePost() {} // the server already wrote the roll to the session

    subscribe(sid) {
      this._ch = sb.channel('gm-' + sid)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'session_members', filter: 'session_id=eq.' + sid }, () => this.loadParty())
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_events', filter: 'session_id=eq.' + sid }, (p) => {
          this.apply({ events: [p.new].concat(this.state.events).slice(0, 100) });
          // someone else's roll tumbles on screen too
          if (p.new && p.new.kind === 'roll' && p.new.actor_id !== this.state.profile.id && window.SPDice) window.SPDice.show(p.new.payload, this.state.lang !== 'en', { anchor: p.new.character_id ? document.getElementById('pc-' + p.new.character_id) : null });
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
          if (p.new && 'scene' in p.new) this.apply({ sceneShown: SP.sceneList(p.new.scene) });
          if (p.new && 'encounter' in p.new) this.apply({ encounter: SP.encounterList(p.new.encounter) });
          if (p.new && 'turn_based' in p.new) this.apply({ rpMode: p.new.turn_based === false });
          // a player ended their own turn
          if (p.new && 'turn' in p.new && !this._saveT && (p.new.turn !== this.state.turn || p.new.round !== this.state.round)) this.apply({ turn: p.new.turn || 0, round: p.new.round || 1 });
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
      v.curTableLabel = sess ? L('Session: ', 'SESSION: ') + sess.name + ({ live: '', paused: L(' · พักอยู่', ' · PAUSED'), idle: L(' · รอรอบถัดไป', ' · BETWEEN PLAYS'), ended: L(' · จบแล้ว (ARCHIVE)', ' · ENDED (ARCHIVE)') }[sess.status] || '') : L('สร้าง session ก่อนที่ Session ของฉัน', 'Create one in My Sessions first');
      v.curCode = sess ? sess.invite_code : '—';
      v.curLv = sess && sess.level ? sess.level : '-';
      var lvCamp = !!(sess && sess.format === 'campaign' && sess.status !== 'ended');
      v.lvEdit = lvCamp; v.lvFixed = !lvCamp;
      v.lvOpts = [{ v: '', label: '-', sel: !(sess && sess.level) }].concat(Array.from({ length: 20 }, function (_, k) { return { v: String(k + 1), label: String(k + 1), sel: !!(sess && sess.level === k + 1) }; }));
      v.onLv = (e) => this.setLevel(parseInt(e && e.target ? e.target.value : '', 10) || null);
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
      // play controls on the real session: pause / resume / start next play, end the play (campaign),
      // end the session (one-shot) or the whole campaign; an ended session opens as a read-only archive
      var st = sess ? sess.status : 'idle';
      var camp = !!(sess && sess.format === 'campaign');
      var refresh = async () => {
        var one = await sb.from('sessions').select('*').eq('id', sess.id).single();
        await this.loadSessions();
        if (!one.error) this.apply({ session: one.data });
        await this.loadParty();
      };
      var rpc = async (fn) => {
        if (!sess || this._busy) return false;
        this._busy = true;
        var r = await sb.rpc(fn, { p_session: sess.id });
        this._busy = false;
        if (r.error) { this.setState({ ending: false, toast: SP.err(r.error, th) }); return false; }
        this.setState({ ending: false });
        await refresh();
        return true;
      };
      v.isCampaign = camp && st !== 'ended';
      v.showCtl = !!sess && st !== 'ended';
      v.showEndPlay = !(camp && st === 'idle');
      v.pausedPressed = st === 'live' ? 'false' : 'true';
      v.pauseLabel = st === 'live' ? L('❚❚ พัก session', '❚❚ Pause session')
        : st === 'paused' ? L('▶ เริ่ม session ต่อ', '▶ Resume session')
        : (camp && sess && sess.play_count > 0) ? L('▶ เริ่ม session ใหม่', '▶ Start next session') : L('▶ เริ่ม session', '▶ Start session');
      v.pauseBg = st === 'live' ? 'transparent' : '#FFD400';
      v.pauseFg = st === 'live' ? '#FFD400' : '#0B0A12';
      v.feedState = st === 'live' ? 'STREAMING' : st === 'ended' ? 'ARCHIVE' : 'PAUSED';
      v.feedStateColor = st === 'live' ? '#4ADE80' : '#8C88A6';
      v.togglePause = () => rpc(st === 'live' ? 'pause_session' : 'start_session');
      v.askEnd = async () => {
        if (!sess) return;
        if (camp) { if (await rpc('finish_play')) this.setState({ toast: L('จบรอบเล่นแล้ว ผู้เล่นยังอยู่ในแคมเปญ', 'Play ended. Players stay in the campaign.') }); return; }
        this.setState({ ending: this.state.ending === 'session' ? false : 'session', pendingTable: null });
      };
      v.askEndCamp = () => { if (sess) this.setState({ ending: this.state.ending === 'campaign' ? false : 'campaign', pendingTable: null }); };
      v.endExpanded = this.state.ending === 'session' ? 'true' : 'false';
      v.endCampExpanded = this.state.ending === 'campaign' ? 'true' : 'false';
      v.hasEnd = !!(this.state.ending && sess && st !== 'ended');
      v.endTitle = sess ? (camp ? L('จบแคมเปญ ' + sess.name + '?', 'End the campaign ' + sess.name + '?') : L('จบ session ' + sess.name + '?', 'End ' + sess.name + '?')) : '';
      v.endOk = camp ? L('จบแคมเปญ', 'End campaign') : L('จบ session', 'End session');
      v.doEnd = async () => { if (await rpc('end_session')) this.setState({ toast: camp ? L('จบแคมเปญแล้ว', 'Campaign ended') : L('จบ session แล้ว', 'Session ended') }); };
      v.cancelEnd = () => this.setState({ ending: false });
      v.hasEnded = !!(sess && st === 'ended');
      v.endedNote = sess ? (camp ? L('แคมเปญ ' + sess.name + ' จบแล้ว', sess.name + ' (campaign) has ended') : L('session ' + sess.name + ' จบแล้ว', sess.name + ' has ended')) : '';
      v.hasIdle = !!(sess && camp && st === 'idle' && sess.play_count > 0);
      // session notes, saved to Supabase (GM only)
      var notes = this.state.notes || [];
      var selNote = notes.find((n) => n.id === this.state.noteSel) || notes[0] || null;
      var hm = (ms) => new Date(ms).toLocaleTimeString(th ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
      v.onNoteTitle = (e) => { if (selNote) this.editNote(selNote.id, { title: String(e && e.target ? e.target.value : '').slice(0, 120) }); };
      v.onNoteBody = (e) => { if (selNote) this.editNote(selNote.id, { body: String(e && e.target ? e.target.value : '').slice(0, 50000) }); };
      v.noteStatus = this.state.noteErr ? L('บันทึกไม่สำเร็จ กำลังลองใหม่…', 'Save failed, retrying…')
        : this.state.noteSaving ? L('กำลังบันทึก…', 'SAVING…')
        : this.state.noteSavedAt ? L('บันทึกอัตโนมัติ · ', 'AUTOSAVED · ') + hm(this.state.noteSavedAt) : '';
      v.noteStatusColor = this.state.noteErr ? '#FF3D6E' : this.state.noteSaving ? '#FFD400' : '#8C88A6';
      v.newNote = async () => {
        if (!sess || this._noteAdding) return;
        this._noteAdding = true;
        var no = Math.max(notes.reduce((m, n) => Math.max(m, n.no), 0) + 1, 1);
        var r = await sb.from('session_notes').insert({ session_id: sess.id, play_no: no }).select().single();
        this._noteAdding = false;
        if (r.error) return this.setState({ toast: SP.err(r.error, th) });
        var n = { id: r.data.id, no: r.data.play_no, at: new Date(r.data.created_at).getTime(), title: '', body: '' };
        this.apply({ notes: [n].concat(this.state.notes || []), noteSel: n.id, noteAskDel: false, noteSavedAt: Date.now() });
        setTimeout(() => { var el = document.getElementById('note-title'); if (el) el.focus(); }, 50);
      };
      v.doDelNote = async () => {
        if (!selNote) return;
        var r = await sb.from('session_notes').delete().eq('id', selNote.id);
        if (r.error) return this.setState({ noteAskDel: false, toast: SP.err(r.error, th) });
        var rest = notes.filter((n) => n.id !== selNote.id);
        if (this._notePend) delete this._notePend[selNote.id];
        this.apply({ notes: rest, noteSel: rest[0] ? rest[0].id : null, noteAskDel: false });
      };
      v.copyCode = () => { try { if (navigator.clipboard && sess) navigator.clipboard.writeText(sess.invite_code).catch(() => {}); } catch (e) {} this.setState({ copied: true }); };
      var ids = Object.keys(this.state.chars);
      v.party = v.party.map((p, i) => {
        var id = ids[i], c = this.state.chars[id], s = c.sheet || {};
        var none = L('— ยังไม่มี', '— none yet');
        var grp = (k, color, items, emptyText) => ({ k: k, color: color, items: items, empty: items.length === 0, emptyText: emptyText || none });
        var named = (arr) => (arr || []).filter((x) => x && (x.name || x.type));
        return Object.assign({}, p, {
          slots: String(SP.num(s.slots) || 5),
          loadout: [
            grp('BONDED ITEM', '#FF2E88', named(s.bonded).map((b) => ({ name: b.name, meta: '', fx: b.effect || '' }))),
            ...(c.f === 'cpd' ? [] : [grp(c.f === 'norms' ? 'COSMIC GADGETS' : 'COSMIC ABILITIES', '#C084FC', named(s.cosmic).map((x) => ({ name: (x.type ? x.type + ' · ' : '') + x.name, meta: 'CD ' + (x.cd || 0), fx: (x.fx || '') + (x.passive ? (x.fx ? ' · ' : '') + 'Passive: ' + x.passive : '') })))]),
            grp('WEAPONS', '#FF3D6E', named(s.weapons).map((w) => ({ name: w.name, meta: 'R' + (w.range || '-') + ' · DMG ' + (w.dmg || '-'), fx: w.fx || '' }))),
            grp('GEARS', '#2EE6F0', named(s.gears).map((g) => ({ name: g.name, meta: '', fx: g.fx || '' })))
          ],
          detail: [
            { k: 'Trait', v: s.traitName ? s.traitName + (s.traitFx ? ' — ' + s.traitFx : '') : '—' },
            // Flaw has no box on the sheet any more (it lives in Background); older sheets that still carry one keep showing it
            ...(s.flaw ? [{ k: 'Flaw', v: s.flaw }] : []),
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
        else if (e.kind === 'roll') what = window.SPDice ? window.SPDice.line(e.payload, th) : 'roll';
        else what = e.kind;
        if (e.kind === 'roll' && !c) return { time: hhmmss(e.created_at), who: String((e.payload || {}).who || 'GM').slice(0, 40), color: '#FFD400', what: what };
        return { time: hhmmss(e.created_at), who: c ? c.name : (e.kind === 'status' ? 'GM' : L('ผู้เล่น', 'Player')), color: c ? C[c.f] : '#FFD400', what: what };
      });
      v.onlineCount = Object.keys(chars).filter((k) => chars[k].online).length + ' / ' + Object.keys(chars).length;
      if (this.state.ready && !sess) v.curTableLabel = L('ยังไม่มี session — สร้างที่ "Session ของฉัน"', 'No session yet: create one in My Sessions');
      return v;
    }
  }
  Page.pageKind = 'GMSheet';
  DC.mount(Page, document.getElementById('app'));
})();
