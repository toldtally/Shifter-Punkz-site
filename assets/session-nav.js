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
        if (event === 'SIGNED_OUT') this.setState({ spUser: null, spMenu: false, spWarn: false });
      });
      var s = (await sb.auth.getSession()).data.session;
      if (!s) return;
      var u = s.user || {};
      var meta = u.user_metadata || {};
      this.setState({ spUser: { name: meta.display_name || (u.email || '').split('@')[0], role: 'player', avatar: '' } });
      var r = await sb.from('profiles').select('display_name, role, avatar_path').eq('id', u.id).single();
      if (!r.error && r.data) {
        this.setState({ spUser: {
          name: r.data.display_name || this.state.spUser.name,
          role: r.data.role,
          avatar: r.data.avatar_path ? SP.imageUrl(r.data.avatar_path) : ''
        } });
      }
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.state.lang !== 'en';
      var u = this.state.spUser;
      v.spSignedIn = !!u;
      v.spSignedOut = !u;
      v.spName = u ? u.name : '';
      v.spInitial = u ? (u.name || '?').charAt(0).toUpperCase() : '';
      v.spColor = u && u.role === 'gm' ? '#FFD400' : '#2EE6F0';
      v.spAvatar = (u && u.avatar) || '';
      v.spNoAvatar = !v.spAvatar;
      v.spMenuOpen = !!this.state.spMenu;
      v.spExpanded = this.state.spMenu ? 'true' : 'false';
      v.spToggle = () => this.setState({ spMenu: !this.state.spMenu, spWarn: false });
      v.spIsGm = !!(u && u.role === 'gm');
      v.spNotGm = !v.spIsGm;
      v.spWarn = !!this.state.spWarn;
      v.spWarnExpanded = this.state.spWarn ? 'true' : 'false';
      v.spAskSessions = () => this.setState({ spWarn: !this.state.spWarn });
      v.spWarnText = th ? 'Session ของฉัน ใช้ได้เฉพาะบทบาท GM ตอนนี้บัญชีของคุณเป็น "ผู้เล่น" เปลี่ยนบทบาทเป็น GM ในหน้าตั้งค่าบัญชีก่อนเข้า' : 'My Sessions is for the GM role. Your account is a Player right now; switch to GM in Settings first.';
      v.spCharsLabel = th ? 'ตัวละครของฉัน' : 'My Characters';
      v.spSessionsLabel = th ? 'Session ของฉัน' : 'My Sessions';
      v.spSwitchLabel = th ? 'ไปเปลี่ยนบทบาท' : 'Switch role';
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
