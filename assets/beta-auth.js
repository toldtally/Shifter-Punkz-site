/* Sign-in / sign-up page wired to Supabase Auth. Extends the design's Component. */
(function () {
  'use strict';
  var sb = SP.sb;
  var val = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
  var checked = function (id) { var el = document.getElementById(id); return !!(el && el.checked); };

  var NEXT_KEY = 'sp-next';
  var takeNext = function () {
    var n = new URLSearchParams(location.search).get('next');
    try { if (!n) n = sessionStorage.getItem(NEXT_KEY); sessionStorage.removeItem(NEXT_KEY); } catch (e) {}
    return n && /^[a-z-]+\.html$/.test(n) ? n : null;
  };

  class Page extends Component {
    constructor(props) {
      super(props);
      var q = new URLSearchParams(location.search);
      this.state.mode = q.get('mode') === 'signup' ? 'signup' : 'login';
      this.state.msg = '';
      this.state.msgKind = 'info';
      this.state.busy = false;
      this.state.profile = null;
      this.state.setPwKind = null; // 'invite' | 'recovery'
    }

    th() { return this.state.lang !== 'en'; }
    say(kind, th, en) { this.setState({ msg: this.th() ? th : en, msgKind: kind, busy: false }); }
    fail(e) { this.setState({ msg: SP.err(e, this.th()), msgKind: 'error', busy: false }); }

    async componentDidMount() {
      sb.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') this.setState({ mode: 'setpw', setPwKind: 'recovery', msg: '' });
        if (event === 'SIGNED_OUT') this.setState({ mode: 'login', profile: null });
      });
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      await this.loadProfile();
      if (SP.landing === 'invite' || SP.landing === 'recovery') {
        this.setState({ mode: 'setpw', setPwKind: SP.landing });
      } else {
        var go = takeNext();
        if (go) { location.replace(go); return; }
        this.setState({ mode: 'done' });
      }
    }

    async loadProfile() {
      var u = (await sb.auth.getUser()).data.user;
      if (!u) return null;
      var r = await sb.from('profiles').select('*').eq('id', u.id).single();
      if (r.error) { this.fail(r.error); return null; }
      this.setState({ profile: r.data, role: r.data.role, name: r.data.display_name });
      return r.data;
    }

    async signup() {
      var name = val('dname').trim(), email = val('email').trim(), pw = val('pw');
      if (!email || pw.length < 8) return this.say('error', 'กรอกอีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร', 'Enter an email and a password of at least 8 characters.');
      this.setState({ busy: true, msg: '' });
      var r = await sb.auth.signUp({
        email: email, password: pw,
        options: { emailRedirectTo: SP.base + 'auth.html', data: { display_name: name, news_opt_in: checked('news') } }
      });
      if (r.error) return this.fail(r.error);
      if (r.data.session) { await this.loadProfile(); return this.setState({ mode: 'done', busy: false, msg: '' }); }
      this.say('ok', 'สมัครแล้ว! เปิดอีเมลเพื่อกดยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ', 'Done! Confirm your account from the email we sent, then log in.');
    }

    async login() {
      var email = val('lemail').trim(), pw = val('lpw');
      if (!email || !pw) return this.say('error', 'กรอกอีเมลและรหัสผ่าน', 'Enter your email and password.');
      this.setState({ busy: true, msg: '' });
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) return this.fail(r.error);
      await this.loadProfile();
      var next = takeNext();
      if (next) { location.href = next; return; }
      this.setState({ mode: 'done', busy: false, msg: '' });
    }

    async savePassword() {
      var pw = val('sp-pw');
      if (pw.length < 8) return this.say('error', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'Passwords need at least 8 characters.');
      this.setState({ busy: true, msg: '' });
      var r = await sb.auth.updateUser({ password: pw });
      if (r.error) return this.fail(r.error);
      if (this.state.setPwKind === 'invite') {
        var u = r.data.user;
        var up = await sb.from('profiles').update({ display_name: val('sp-name').trim() }).eq('id', u.id);
        if (up.error) return this.fail(up.error);
      }
      await this.loadProfile();
      history.replaceState(null, '', location.pathname);
      this.setState({ mode: 'done', busy: false, msg: '' });
    }

    async forgot(e) {
      if (e && e.preventDefault) e.preventDefault();
      var email = val('lemail').trim();
      if (!email) return this.say('error', 'กรอกอีเมลในช่องด้านบนก่อน แล้วกด "ลืมรหัสผ่าน?" อีกครั้ง', 'Type your email above first, then tap "Forgot password?" again.');
      this.setState({ busy: true, msg: '' });
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: SP.base + 'auth.html' });
      if (r.error) return this.fail(r.error);
      this.say('ok', 'ส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่อีเมลแล้ว', 'We sent a reset link to your email.');
    }

    async social(provider) {
      this.setState({ busy: true, msg: '' });
      var n = new URLSearchParams(location.search).get('next');
      try { if (n) sessionStorage.setItem(NEXT_KEY, n); } catch (e) {}
      var r = await sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: SP.base + 'auth.html' } });
      if (r.error) this.fail(r.error);
    }

    async setRole(id) {
      if (!this.state.profile || id === this.state.role) return;
      var r = await sb.from('profiles').update({ role: id }).eq('id', this.state.profile.id);
      if (r.error) return this.fail(r.error);
      this.setState({ role: id, switched: true, profile: Object.assign({}, this.state.profile, { role: id }) });
    }

    async onAvatar(e) {
      var input = e && e.target, file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file || !this.state.profile) return;
      this.setState({ busy: true, msg: '' });
      try {
        var blob = await SP.squareImage(file, 256);
        var path = await SP.uploadImage(blob, 'profile');
        var r = await sb.from('profiles').update({ avatar_path: path }).eq('id', this.state.profile.id);
        if (r.error) throw r.error;
        this.setState({ profile: Object.assign({}, this.state.profile, { avatar_path: path }) });
        this.say('ok', 'อัปโหลดรูปโปรไฟล์แล้ว', 'Profile picture uploaded.');
      } catch (err) {
        this.setState({ msg: SP.imageErr(err, this.th()), msgKind: 'error', busy: false });
      }
    }

    async logout() {
      await sb.auth.signOut();
      this.setState({ mode: 'login', profile: null, msg: '' });
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.th();
      var L = function (a, b) { return th ? a : b; };
      var mode = this.state.mode;
      var p = this.state.profile;
      var kind = this.state.msgKind;
      v.isSetPw = mode === 'setpw';
      v.notDone = mode !== 'done' && mode !== 'setpw';
      v.submit = () => (mode === 'signup' ? this.signup() : this.login());
      v.socialGoogle = () => this.social('google');
      v.socialDiscord = () => this.social('discord');
      v.logout = () => this.logout();
      v.forgot = (e) => this.forgot(e);
      v.onAvatar = (e) => this.onAvatar(e);
      v.savePassword = () => this.savePassword();
      v.goSignup = () => this.setState({ mode: 'signup', msg: '' });
      v.goLogin = () => this.setState({ mode: 'login', msg: '' });
      v.roleSwitch = v.roleSwitch.map((r) => Object.assign({}, r, { pick: () => this.setRole(r.id) }));
      v.hasMsg = !!this.state.msg;
      v.msg = this.state.msg;
      v.msgColor = kind === 'error' ? '#FF3D6E' : kind === 'ok' ? '#4ADE80' : '#2EE6F0';
      v.publicId = p ? SP.publicId(p.public_no) : '';
      var isGm = !!(p && p.role === 'gm' && p.gm_allowed);
      v.goHref = isGm ? 'sessions.html' : 'characters.html';
      v.goTarget = '_self';
      v.goLabel = isGm ? L('Session ของฉัน', 'My Sessions') : L('ตัวละครของฉัน', 'My Characters');
      var invite = this.state.setPwKind === 'invite';
      v.setPwNeedsName = invite;
      v.setPwName = (p && p.display_name) || '';
      v.setPwTitle = invite ? L('ยินดีต้อนรับสู่ทีมทดสอบ', 'Welcome to the beta') : L('ตั้งรหัสผ่านใหม่', 'Set a new password');
      v.setPwSub = invite ? L('ตั้งชื่อที่แสดงและรหัสผ่าน แล้วเริ่มใช้งานได้เลย', 'Pick a display name and a password to get started.') : L('กรอกรหัสผ่านใหม่สำหรับบัญชีนี้', 'Enter a new password for this account.');
      v.setPwLabel = L('รหัสผ่านใหม่', 'NEW PASSWORD');
      v.setPwBtn = this.state.busy ? L('กำลังบันทึก…', 'Saving…') : L('บันทึกและเริ่มใช้งาน', 'Save and continue');
      v.t = Object.assign({}, v.t, {
        protoNote: L('BETA // ช่วงทดสอบ เปิดเฉพาะผู้ที่ได้รับเชิญ', 'BETA // Invite-only testing'),
        createBtn: this.state.busy && mode === 'signup' ? L('กำลังสร้างบัญชี…', 'Creating…') : v.t.createBtn,
        loginBtn: this.state.busy && mode === 'login' ? L('กำลังเข้าสู่ระบบ…', 'Logging in…') : v.t.loginBtn
      });
      if (p) v.welcome = L('ยินดีต้อนรับ, ', 'Welcome, ') + (p.display_name || L('นักเล่นหน้าใหม่', 'new recruit'));
      return v;
    }
  }

  DC.mount(Page, document.getElementById('app'));
})();
