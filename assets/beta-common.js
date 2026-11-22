/* Shared helpers for the signed-in beta pages (characters, sheet, sessions, GM monitor). */
(function () {
  'use strict';
  var sb = SP.sb;

  SP.FACTOR = {
    shifter: { key: 'shifter', label: 'SHIFTER', color: '#2EE6F0' },
    outlaw: { key: 'norms', label: 'NORMS', color: '#FF2E88' },
    cpd: { key: 'cpd', label: 'C.P.D.', color: '#FFD400' }
  };

  /* Signed-in user + profile, or a redirect to the sign-in page. */
  SP.requireUser = async function (page) {
    var s = (await sb.auth.getSession()).data.session;
    if (!s) { location.replace('auth.html?next=' + page); return null; }
    var r = await sb.from('profiles').select('*').eq('id', s.user.id).single();
    if (r.error) return { user: s.user, profile: { id: s.user.id, display_name: '', role: 'player', public_no: 0 } };
    return { user: s.user, profile: r.data };
  };

  SP.num = function (v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
  /* Basic Ability as the sheet shows it: every ability starts at 1, plus the points spent on it. */
  SP.baVal = function (v) { return 1 + SP.num(v); };
  /* sessions.scene: one picture (older) or a list of up to 2 */
  SP.sceneList = function (v) { return (Array.isArray(v) ? v : v ? [v] : []).filter(function (x) { return x && x.url; }).slice(0, 2); };
  /* C.P.D. Divisions add +1 to one Basic Ability */
  SP.DIVISIONS = { 'Division 9': 'force', 'Division 7': 'tactical', 'Division 13': 'trick', 'Division 0': 'sense' };
  SP.baOf = function (sheet, factor, k) {
    var s = sheet || {}, ba = s.ba || {};
    return SP.baVal(ba[k]) + (factor === 'cpd' && SP.DIVISIONS[s.traitName] === k ? 1 : 0);
  };

  SP.timeAgo = function (iso, th) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return th ? 'แก้ไขเมื่อสักครู่' : 'edited just now';
    var m = Math.round(s / 60); if (m < 60) return th ? 'แก้ไข ' + m + ' นาทีก่อน' : 'edited ' + m + 'm ago';
    var h = Math.round(m / 60); if (h < 24) return th ? 'แก้ไข ' + h + ' ชม.ก่อน' : 'edited ' + h + 'h ago';
    var d = Math.round(h / 24); return th ? 'แก้ไข ' + d + ' วันก่อน' : 'edited ' + d + 'd ago';
  };

  /* Offer a JSON file to the viewer. */
  SP.download = function (name, obj) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* Ask the viewer for a JSON file; resolves with the parsed object. */
  SP.pickJson = function () {
    return new Promise(function (resolve, reject) {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = function () {
        var f = inp.files && inp.files[0]; if (!f) return reject(new Error('NONE'));
        f.text().then(function (t) { try { resolve(JSON.parse(t)); } catch (e) { reject(e); } }, reject);
      };
      inp.click();
    });
  };

  /* data: URL -> Blob (for portraits picked on the sheet) */
  SP.dataUrlBlob = function (url) {
    var parts = url.split(','), mime = (/data:([^;]+)/.exec(parts[0]) || [])[1] || 'image/webp';
    var bin = atob(parts[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  /* The nav user chip and its menu, driven by the real profile. */
  SP.menuVals = function (page, v) {
    var p = page.state.profile;
    var th = page.state.lang !== 'en';
    if (!p) return;
    var name = p.display_name || (page.state.user && (page.state.user.email || '').split('@')[0]) || '?';
    v.meName = name + (v.roleName && /GMSheet|GMTables/.test(page.constructor.pageKind || '') ? ' · ' + v.roleName : '');
    v.meInitial = name.charAt(0).toUpperCase();
    v.menuIsGm = p.role === 'gm';
    v.menuNotGm = p.role !== 'gm';
    v.menuCanAskGm = p.role !== 'gm' && !!p.gm_allowed;
    var setRole = async function (role) {
      var r = await sb.from('profiles').update({ role: role }).eq('id', p.id).select().single();
      if (r.error) return;
      page.setState({ profile: r.data, role: role, menuRole: role, roleWarn: false, charWarn: false, menuSwitched: role });
      if (page.onRoleChange) page.onRoleChange(role);
    };
    v.switchToGm = function () { setRole('gm'); };
    v.switchToPlayer = function () { setRole('player'); };
    v.navLogout = async function (e) {
      if (e && e.preventDefault) e.preventDefault();
      await sb.auth.signOut();
      location.href = 'auth.html';
    };
    v.protoNote = '';
    if (v.t) v.t = Object.assign({}, v.t, { protoNote: (th ? 'BETA // ' : 'BETA // ') + SP.publicId(p.public_no) + (th ? ' · ช่วงทดสอบ เฉพาะผู้ได้รับเชิญ' : ' · invite-only testing') });
  };
})();
