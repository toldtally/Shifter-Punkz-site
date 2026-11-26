/* Public pages: if a beta tester is signed in, swap the nav "log in" chip
 * for their name with a Settings / Log out menu. Signed-out visitors see the page unchanged. */
(function () {
  'use strict';
  var sb = SP.sb;

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { spUser: null, spMenu: false });
    }

    async componentDidMount() {
      if (super.componentDidMount) super.componentDidMount();
      document.addEventListener('click', (e) => {
        if (this.state.spMenu && !(e.target.closest && e.target.closest('[data-sp-menu]'))) this.setState({ spMenu: false });
      });
      sb.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') this.setState({ spUser: null, spMenu: false, spWarn: false, spCharWarn: false });
      });
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      var u = s.user || {};
      var meta = u.user_metadata || {};
      this.setState({ spUser: { name: meta.display_name || (u.email || '').split('@')[0], role: 'player', avatar: '' } });
      var r = await sb.from('profiles').select('display_name, role, avatar_path, gm_allowed').eq('id', u.id).single();
      if (!r.error && r.data) {
        this.setState({ spUser: {
          name: r.data.display_name || this.state.spUser.name,
          role: r.data.role,
          gmAllowed: !!r.data.gm_allowed,
          avatar: r.data.avatar_path ? SP.imageUrl(r.data.avatar_path) : ''
        } });
      }
      // book owners (a registered book code) get the One-Shot downloads
      var b = await sb.from('book_codes').select('book').limit(1);
      if (!b.error) this.setState({ spOwnsBook: (b.data || []).length > 0 });
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      var u = this.state.spUser;
      v.spSignedIn = !!u;
      if (v.books) {
        var owns = !!(u && this.state.spOwnsBook);
        v.books = v.books.map((bk) => {
          if (!bk.download) return bk;
          return Object.assign({}, bk, {
            dlColor: owns ? '#4ADE80' : '#FFD400',
            dlText: owns
              ? (th ? 'ไฟล์ One-Shot กำลังเตรียมอยู่ จะเปิดให้ดาวน์โหลดที่นี่เร็วๆ นี้' : 'The One-Shot files are being prepared. Downloads open here soon.')
              : (th ? '🔒 เปิดให้ดาวน์โหลดฟรีสำหรับผู้ที่ซื้อหนังสือแล้วเท่านั้น' : '🔒 Free download for book owners only.') + (u ? (th ? ' ลงทะเบียนรหัสหนังสือได้ที่หน้าตั้งค่าบัญชี' : ' Register your book code in Settings.') : (th ? ' เข้าสู่ระบบแล้วลงทะเบียนรหัสหนังสือที่หน้าตั้งค่าบัญชี' : ' Sign in and register your book code in Settings.'))
          });
        });
      }
      v.spSignedOut = !u;
      v.spName = u ? u.name : '';
      v.spInitial = u ? (u.name || '?').charAt(0).toUpperCase() : '';
      v.spColor = u && u.role === 'gm' ? '#FFD400' : '#2EE6F0';
      v.spAvatar = (u && u.avatar) || '';
      v.spNoAvatar = !v.spAvatar;
      v.spMenuOpen = !!this.state.spMenu;
      v.spExpanded = this.state.spMenu ? 'true' : 'false';
      v.spToggle = () => this.setState({ spMenu: !this.state.spMenu, spWarn: false, spCharWarn: false, spSwitched: '' });
      v.spIsGm = !!(u && u.role === 'gm');
      v.spNotGm = !v.spIsGm;
      v.spCanAskGm = v.spNotGm && !!(u && u.gmAllowed);
      v.spWarn = !!this.state.spWarn;
      v.spWarnExpanded = this.state.spWarn ? 'true' : 'false';
      v.spAskSessions = u && u.gmAllowed ? () => { location.href = 'beta/sessions.html'; } : () => this.setState({ spWarn: !this.state.spWarn, spCharWarn: false });
      v.spWarnText = this.state.spErr || (th ? 'Session ของฉัน ใช้ได้เฉพาะบทบาท CM ตอนนี้บัญชีของคุณเป็น "ผู้เล่น" เปลี่ยนเป็น CM ก่อนเข้า (1 บัญชีเป็นได้ทีละ 1 บทบาท)' : 'My Sessions is for the CM role. Your account is a Player right now; switch to CM first (one role at a time).');
      v.spSwitchedGm = this.state.spSwitched === 'gm';
      v.spSwitchedPlayer = this.state.spSwitched === 'player';
      v.spSwitchedLabel = th ? '✓ เปลี่ยนบทบาทเป็น CM แล้ว' : '✓ You are now a CM';
      v.spSwitchedPlayerLabel = th ? '✓ เปลี่ยนบทบาทเป็นผู้เล่นแล้ว' : '✓ You are now a Player';
      v.spCharWarn = !!this.state.spCharWarn;
      v.spCharWarnExpanded = this.state.spCharWarn ? 'true' : 'false';
      // a CM can play at another CM's table without switching roles
      v.spAskChars = () => { location.href = 'beta/characters.html'; };
      v.spCharWarnText = this.state.spErr || (th ? 'ตัวละครของฉัน ใช้ได้เฉพาะบทบาทผู้เล่น ตอนนี้บัญชีของคุณเป็น "CM" เปลี่ยนเป็นผู้เล่นก่อนเข้า (1 บัญชีเป็นได้ทีละ 1 บทบาท)' : 'My Characters is for the Player role. Your account is a CM right now; switch to Player first (one role at a time).');
      v.spSwitchPlayerLabel = th ? 'เปลี่ยนเป็นผู้เล่น' : 'Switch to Player';
      var setRole = async (role) => {
        var s = (await sb.auth.getSession()).data.session;
        if (!s) return;
        var r = await sb.from('profiles').update({ role: role }).eq('id', s.user.id);
        if (r.error) return this.setState({ spErr: SP.err(r.error, th) });
        this.setState({ spUser: Object.assign({}, this.state.spUser, { role: role }), spWarn: false, spCharWarn: false, spSwitched: role, spErr: '' });
      };
      v.spSwitchToGm = () => setRole('gm');
      v.spSwitchToPlayer = () => setRole('player');
      v.spCharsLabel = th ? 'ตัวละครของฉัน' : 'My Characters';
      v.spSessionsLabel = th ? 'Session ของฉัน' : 'My Sessions';
      v.spSwitchLabel = th ? 'เปลี่ยนเป็น CM' : 'Switch to CM';
      v.spKey = (e) => { if (e && e.key === 'Escape') this.setState({ spMenu: false }); };
      v.spLogout = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        await sb.auth.signOut();
        this.setState({ spUser: null, spMenu: false });
      };
      v.spSettingsLabel = th ? 'ตั้งค่าบัญชี' : 'Settings';
      v.spLogoutLabel = th ? 'ออกจากระบบ' : 'Log out';
      return v;
    }
  }

  DC.mount(Page, document.getElementById('app'));
})();
