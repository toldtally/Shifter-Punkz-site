/* My Sessions on Supabase: the CM's sessions, seats, invite codes and start / pause / end. */
(function () {
  'use strict';
  var sb = SP.sb;

  var ago = function (iso, th) {
    if (!iso) return th ? 'ยังไม่เคยเล่น' : 'Not played yet';
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return th ? 'เล่นล่าสุด ' + Math.max(1, m) + ' นาทีก่อน' : 'Last played ' + Math.max(1, m) + 'm ago';
    var h = Math.round(m / 60); if (h < 24) return th ? 'เล่นล่าสุด ' + h + ' ชม.ก่อน' : 'Last played ' + h + 'h ago';
    var d = Math.round(h / 24); return th ? 'เล่นล่าสุด ' + d + ' วันก่อน' : 'Last played ' + d + 'd ago';
  };

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { tables: [], loading: true });
    }

    async componentDidMount() {
      var me = await SP.requireUser('sessions.html');
      if (!me) return;
      if (!me.profile.gm_allowed) { location.replace('characters.html'); return; }
      this.setState({ user: me.user, profile: me.profile, role: 'gm' });
      await this.load();
    }
    onRoleChange() {}

    async load() {
      var r = await sb.from('sessions').select('*').eq('gm_id', this.state.profile.id).order('created_at', { ascending: false });
      if (r.error) return this.setState({ loading: false, toast: SP.err(r.error, this.state.lang !== 'en') });
      var ids = r.data.map(function (s) { return s.id; });
      var seats = ids.length ? await sb.from('session_members').select('session_id, characters(name), profiles(display_name)').in('session_id', ids) : { data: [] };
      var bySes = {};
      (seats.data || []).forEach(function (m) {
        (bySes[m.session_id] = bySes[m.session_id] || []).push((m.characters ? m.characters.name : '?') + ' (' + (m.profiles && m.profiles.display_name ? m.profiles.display_name : '—') + ')');
      });
      var th = this.state.lang !== 'en';
      this.setState({ loading: false, tables: r.data.map(function (s) {
        return { id: s.id, code: s.invite_code, th: s.name, en: s.name, type: s.format, st: s.status, lv: s.level || null, max: s.max_players,
          players: bySes[s.id] || [], sessions: s.play_count,
          lastTh: s.status === 'live' ? 'กำลังเล่น' : s.status === 'ended' ? 'จบแล้ว' : s.play_count === 0 ? 'ยังไม่เคยเล่น' : ago(s.last_played_at, true),
          lastEn: s.status === 'live' ? 'Running now' : s.status === 'ended' ? 'Ended' : s.play_count === 0 ? 'Not played yet' : ago(s.last_played_at, false) };
      }) });
    }

    renameSession(x, v) {
      var n = String(v || '').trim().slice(0, 60);
      if (!n) return;
      this.setState({ renaming: null });
      this.act(function () { return sb.from('sessions').update({ name: n }).eq('id', x.id); },
        'เปลี่ยนชื่อเป็น "' + n + '" แล้ว', 'Renamed to "' + n + '"');
    }
    setLevel(x, lv) {
      var n = x.th || x.en;
      this.act(function () { return sb.from('sessions').update({ level: lv }).eq('id', x.id); },
        'Session Lv ของ "' + n + '" เป็น ' + (lv || '-') + ' แล้ว', 'Set "' + n + '" to Session Lv ' + (lv || '-'));
    }
    async act(fn, okTh, okEn) {
      var th = this.state.lang !== 'en';
      var r = await fn();
      if (r && r.error) return this.setState({ confirm: null, toast: SP.err(r.error, th) });
      this.setState({ confirm: null, toast: th ? okTh : okEn });
      await this.load();
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      var L = function (a, b) { return th ? a : b; };
      SP.menuVals(this, v);
      var cur = this.state.filter;
      var shown = this.state.tables.filter(function (x) { return cur === 'all' || x.st === cur; });
      var cf = this.state.confirm;
      v.cards = v.cards.map((c, i) => {
        var x = shown[i];
        var nm = x.th;
        var patch = {
          monitorHref: 'gm.html?s=' + x.id,
          copy: () => { try { if (navigator.clipboard) navigator.clipboard.writeText(x.code).catch(() => {}); } catch (e) {} this.setState({ copied: x.id }); },
          pause: () => this.act(() => sb.rpc('pause_session', { p_session: x.id }), 'พัก "' + nm + '" แล้ว', 'Paused "' + nm + '"')
        };
        var mine = cf && cf.id === x.id ? cf.kind : null;
        if (mine === 'start') patch.confirm = () => this.act(() => sb.rpc('start_session', { p_session: x.id }), 'เริ่ม session "' + nm + '" แล้ว', 'Session started: ' + nm);
        if (mine === 'reset') patch.confirm = () => this.act(() => sb.rpc('regenerate_invite_code', { p_session: x.id }), 'สร้างรหัสเชิญใหม่แล้ว', 'New invite code ready');
        if (mine === 'end') patch.confirm = () => this.act(() => sb.rpc('end_session', { p_session: x.id }), (x.type === 'campaign' ? 'จบแคมเปญ "' : 'จบ session "') + nm + '" แล้ว · บันทึกยังเปิดดูได้', 'Ended "' + nm + '" · notes stay readable');
        if (mine === 'reopen') patch.confirm = () => this.act(() => sb.rpc('reopen_session', { p_session: x.id }).then((r) => { if (!r.error) this._reopened = r.data; return r; }), 'เปิด "' + nm + '" ใหม่แล้ว · ดูรหัสเชิญใหม่ที่การ์ด', 'Reopened "' + nm + '" · the new invite code is on its card');
        if (mine === 'del') patch.confirm = () => this.act(async () => { try { await SP.removeFolder('scenes', this.state.profile.id + '/' + x.id); } catch (e) {} return sb.from('sessions').delete().eq('id', x.id); }, 'ลบ "' + nm + '" แล้ว', 'Deleted "' + nm + '"');
        return Object.assign({}, c, patch);
      });
      v.create = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        var n = String(this.state.fName || '').trim();
        if (!n) return this.setState({ nameErr: true });
        var r = await sb.from('sessions').insert({ name: n.slice(0, 60), format: this.state.fType, max_players: this.state.fMax, level: (function (n) { return n >= 1 && n <= 20 ? n : null; })(parseInt(this.state.fLv, 10)) }).select().single();
        if (r.error) return this.setState({ toast: SP.err(r.error, th) });
        this.setState({ create: false, fName: '', fLv: '', nameErr: false, filter: 'all', toast: L('สร้าง session "' + n + '" แล้ว · รหัสเชิญ ' + r.data.invite_code, 'Session "' + n + '" created · invite code ' + r.data.invite_code) });
        await this.load();
      };
      v.countLabel = this.state.loading ? L('กำลังโหลด…', 'LOADING…') : this.state.tables.length + L(' SESSION', ' SESSIONS');
      return v;
    }
  }
  Page.pageKind = 'GMTables';
  DC.mount(Page, document.getElementById('app'));
})();
