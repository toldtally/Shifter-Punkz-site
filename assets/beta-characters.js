/* My Characters on Supabase: the account's real characters, their session seat, export and delete. */
(function () {
  'use strict';
  var sb = SP.sb;
  var JOIN_ERR = {
    BAD_CODE: ['รหัสต้องเป็นรูปแบบ SP-XXXX (ตัวอักษรหรือตัวเลข 4 ตัว)', 'Codes look like SP-XXXX'],
    SESSION_NOT_FOUND: ['ไม่พบ session นี้ ลองขอรหัสใหม่จาก GM', 'No session with that code.'],
    SESSION_ENDED: ['Session นี้จบไปแล้ว รหัสใช้ไม่ได้อีก', 'That session has ended.'],
    SESSION_FULL: ['Session นี้ที่นั่งเต็มแล้ว', 'That session is full.'],
    OWN_SESSION: ['นี่คือ session ของคุณเอง (ในฐานะ GM)', 'That is your own session (as GM).'],
    NOT_YOUR_CHARACTER: ['ตัวละครนี้ไม่ใช่ของบัญชีนี้', 'That character is not yours.'],
    CHARACTER_SEATED: ['ตัวละครนี้อยู่ใน session อื่นอยู่แล้ว ใช้ตัวละครอื่น หรือออกจาก session เดิมก่อน', 'This character already sits in another session.']
  };
  var joinErr = function (e, th) {
    var m = String((e && e.message) || e);
    for (var k in JOIN_ERR) if (m.indexOf(k) !== -1) return JOIN_ERR[k][th ? 0 : 1];
    return SP.err(e, th);
  };

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { list: [], seats: [], tbl: {}, loading: true });
    }

    async componentDidMount() {
      if (super.componentDidMount) super.componentDidMount();
      var me = await SP.requireUser('characters.html');
      if (!me) return;
      this.setState({ user: me.user, profile: me.profile, role: me.profile.role });
      await this.load();
    }

    async load() {
      var uid = this.state.profile.id;
      var r = await sb.from('characters').select('id, name, factor, portrait_path, sheet, updated_at').eq('owner_id', uid).order('updated_at', { ascending: false });
      // one campaign seat and one one-shot seat per account
      var m = await sb.from('session_members').select('session_id, character_id, format, sessions(id, name, invite_code, status, format)').eq('user_id', uid);
      this.setState({ list: r.data || [], seats: (m.data || []).filter(function (x) { return x.sessions; }), loading: false, toast: r.error ? SP.err(r.error, this.state.lang !== 'en') : this.state.toast });
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      var L = function (a, b) { return th ? a : b; };
      SP.menuVals(this, v);
      var list = this.state.list.map((row) => {
        var s = row.sheet || {};
        var F = SP.FACTOR[row.factor] || SP.FACTOR.shifter;
        return { row: row, s: s, F: F, f: F.key };
      });
      var cur = this.state.filter;
      var shown = list.filter((c) => cur === 'all' || c.f === cur);
      v.countLabel = list.length + L(' ตัวละคร', ' CHARACTERS');
      v.filters = v.filters.map((fl, i) => {
        var id = ['all', 'shifter', 'norms', 'cpd'][i];
        return Object.assign({}, fl, { count: String(id === 'all' ? list.length : list.filter((c) => c.f === id).length) });
      });
      var seats = this.state.seats || [];
      var put = (id, patch) => this.setState({ tbl: Object.assign({}, this.state.tbl, { [id]: Object.assign({}, this.state.tbl[id] || {}, patch) }) });
      var seatName = (sess) => sess ? sess.name : '';
      v.chars = shown.map((c, i) => {
        var row = c.row, s = c.s, id = row.id;
        var tb = this.state.tbl[id] || {};
        var seat = seats.find((x) => x.character_id === id) || null;
        var seatedHere = !!seat;
        var cseat = tb.csid ? seats.find((x) => x.session_id === tb.csid) || null : null;
        var mode = tb.mode || (seatedHere ? 'live' : 'idle');
        if (!seatedHere && (mode === 'live' || mode === 'leaving')) mode = 'idle';
        var sess = seatedHere ? seat.sessions : null;
        var isLive = sess && sess.status === 'live';
        var ipMax = SP.num(s.hpMax) || 10, wmMax = SP.num(s.spMax);
        var ba = s.ba || {};
        var portrait = row.portrait_path ? SP.imageUrl(row.portrait_path) : '';
        return {
          name: row.name, factor: c.F.label, color: c.F.color, initial: row.name.charAt(0).toUpperCase(),
          sub: (s.job ? 'Job: ' + s.job : L('ยังไม่ได้ใส่อาชีพ', 'No job yet')),
          rep: 'REP ' + SP.num(s.repCur) + ' · ' + SP.timeAgo(row.updated_at, th),
          repTag: 'REP ' + SP.num(s.repCur), edited: SP.timeAgo(row.updated_at, th),
          portrait: portrait, hasPortrait: !!portrait, noPortrait: !portrait,
          href: 'character.html?id=' + id,
          exportJson: () => SP.download((row.name || 'character') + '.json', Object.assign({}, s, { name: row.name, factor: row.factor })),
          isConfirm: this.state.confirm === id, notConfirm: this.state.confirm !== id,
          delLabel: L('ลบ ', 'Delete ') + row.name,
          confirmTitle: L('ลบ ' + row.name + ' ถาวร?', 'Delete ' + row.name + ' for good?'),
          askDel: () => this.setState({ confirm: id, toast: '' }),
          cancelDel: () => this.setState({ confirm: null }),
          doDel: async () => {
            var d = await sb.from('characters').delete().eq('id', id);
            if (d.error) return this.setState({ toast: SP.err(d.error, th), confirm: null });
            if (row.portrait_path) sb.storage.from('portraits').remove([row.portrait_path.split('?')[0]]);
            this.setState({ confirm: null, toast: L('ลบ ' + row.name + ' แล้ว', row.name + ' deleted') });
            this.load();
          },
          d: (0.08 + i * 0.08).toFixed(2) + 's',
          bars: [{ k: 'IP', color: '#FF3D6E', v: SP.num(s.hpCur) + '/' + ipMax, pct: Math.round(SP.num(s.hpCur) / ipMax * 100) + '%' }]
            .concat(wmMax && row.factor === 'shifter' ? [{ k: 'WM', color: '#2EE6F0', v: SP.num(s.spCur) + '/' + wmMax, pct: Math.round(SP.num(s.spCur) / wmMax * 100) + '%' }] : []),
          stats: [['FOR', ba.force], ['TAC', ba.tactical], ['TRI', ba.trick], ['SEN', ba.sense]].map((x) => ({ k: x[0], v: String(SP.baVal(x[1])) })),
          tLive: mode === 'live', tLeaving: mode === 'leaving', tIdle: mode === 'idle', tForm: mode === 'form', tConflict: mode === 'conflict',
          tblBorder: mode === 'live' ? (isLive ? 'rgba(74,222,128,0.45)' : 'rgba(255,212,0,0.45)') : mode === 'conflict' ? '#FFD400' : '#2A2740',
          stColor: isLive ? '#4ADE80' : '#FFD400',
          stLabel: isLive ? 'LIVE' : L('รอ GM เริ่ม', 'WAITING'),
          joinedCode: sess ? sess.invite_code : '',
          tableName: seatName(sess),
          code: tb.input || '', hasErr: !!tb.err, err: tb.err || '', invalid: tb.err ? 'true' : 'false',
          fldBorder: tb.err ? '#FF3D6E' : '#3A3655',
          conflictBody: tb.pending && cseat ? L('บัญชีนี้นั่งอยู่ที่ session ' + seatName(cseat.sessions) + ' แล้ว ถ้าย้าย ตัวละครเดิมจะออกจาก session นั้น แล้ว ' + row.name + ' เข้า ' + tb.pending + ' แทน', 'Your account is seated at ' + seatName(cseat.sessions) + '. Moving takes that character out and seats ' + row.name + ' at ' + tb.pending + '.') : tb.pending ? L('บัญชีนี้อยู่ใน session ประเภทเดียวกันแล้ว ถ้าย้าย ตัวละครเดิมจะออกจาก session นั้น แล้ว ' + row.name + ' เข้า ' + tb.pending + ' แทน', 'Your account already sits in a session of this kind. Moving seats ' + row.name + ' at ' + tb.pending + ' instead.') : '',
          openJoin: () => put(id, { mode: 'form', input: '', err: '' }),
          closeJoin: () => put(id, { mode: 'idle', err: '' }),
          onCode: (e) => put(id, { input: String(e && e.target ? e.target.value : '').toUpperCase(), err: '' }),
          join: async (e) => {
            if (e && e.preventDefault) e.preventDefault();
            var code = String(tb.input || '').trim().toUpperCase();
            var r = await sb.rpc('join_session', { p_code: code, p_character: id, p_move: false });
            if (r.error && String(r.error.message).indexOf('ALREADY_SEATED') !== -1) return put(id, { mode: 'conflict', pending: code, err: '', csid: (String(r.error.message).split('ALREADY_SEATED:')[1] || '').trim().slice(0, 36) });
            if (r.error) return put(id, { err: joinErr(r.error, th) });
            put(id, { mode: null, input: '', err: '' });
            await this.load();
            this.setState({ toast: L(row.name + ' เข้าร่วม session แล้ว', row.name + ' joined the session') });
          },
          cancelMove: () => put(id, { mode: 'form', pending: '' }),
          doMove: async () => {
            var r = await sb.rpc('join_session', { p_code: tb.pending, p_character: id, p_move: true });
            if (r.error) return put(id, { mode: 'form', pending: '', err: joinErr(r.error, th) });
            this.setState({ tbl: {} });
            await this.load();
            this.setState({ toast: L('ย้าย ' + row.name + ' แล้ว', row.name + ' moved') });
          },
          askLeave: () => put(id, { mode: 'leaving' }),
          cancelLeave: () => put(id, { mode: null }),
          doLeave: async () => {
            var r = await sb.rpc('leave_session', { p_session: sess ? sess.id : null });
            if (r.error) return this.setState({ toast: SP.err(r.error, th) });
            this.setState({ tbl: {} });
            await this.load();
            this.setState({ toast: L(row.name + ' ออกจาก session แล้ว', row.name + ' left the session') });
          }
        };
      });
      if (this.state.loading) v.countLabel = L('กำลังโหลด…', 'LOADING…');
      v.t = Object.assign({}, v.t, { newHint: L('เลือก Factor แล้วเริ่มกรอกใบตัวละคร · บันทึกเก็บในบัญชีของคุณ', 'Pick a Factor and start your sheet. It saves to your account.') });
      return v;
    }
  }
  Page.pageKind = 'MyCharacters';
  DC.mount(Page, document.getElementById('app'));
})();
