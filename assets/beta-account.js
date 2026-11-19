/* Account settings wired to Supabase. Extends the design's Component. */
(function () {
  'use strict';
  var sb = SP.sb;

  class Page extends Component {
    constructor(props) {
      super(props);
      Object.assign(this.state, { name: '', email: '', news: false, google: false, discord: false,
        profile: null, identities: [], msg: '', msgKind: 'info', busy: false, ready: false });
    }

    th() { return this.state.lang !== 'en'; }
    say(kind, th, en) { this.setState({ msg: this.th() ? th : en, msgKind: kind, busy: false }); }
    fail(e) { this.setState({ msg: SP.err(e, this.th()), msgKind: 'error', busy: false }); }

    async componentDidMount() {
      var s = (await sb.auth.getSession()).data.session;
      if (!s) { location.replace('auth.html?next=account.html'); return; }
      await this.load();
    }

    async load() {
      var u = (await sb.auth.getUser()).data.user;
      if (!u) { location.replace('auth.html?next=account.html'); return; }
      var r = await sb.from('profiles').select('*').eq('id', u.id).single();
      if (r.error) return this.fail(r.error);
      var ids = u.identities || [];
      var has = function (p) { return ids.some(function (i) { return i.provider === p; }); };
      this.setState({ ready: true, profile: r.data, name: r.data.display_name, role: r.data.role, news: r.data.news_opt_in,
        email: u.email || '', identities: ids, google: has('google'), discord: has('discord') });
    }

    async patch(fields, okTh, okEn) {
      this.setState({ busy: true, msg: '' });
      var r = await sb.from('profiles').update(fields).eq('id', this.state.profile.id).select().single();
      if (r.error) return this.fail(r.error);
      this.setState({ profile: r.data });
      if (okTh) this.say('ok', okTh, okEn); else this.setState({ busy: false });
      return r.data;
    }

    async onAvatar(e) {
      var input = e && e.target, file = input && input.files && input.files[0];
      if (input) input.value = '';
      if (!file) return;
      this.setState({ busy: true, msg: '' });
      try {
        var blob = await SP.squareImage(file, 256);
        var path = await SP.uploadImage(blob, 'profile');
        await this.patch({ avatar_path: path }, 'อัปโหลดรูปโปรไฟล์แล้ว', 'Profile picture updated.');
      } catch (err) {
        this.setState({ msg: SP.imageErr(err, this.th()), msgKind: 'error', busy: false });
      }
    }

    async toggleProvider(provider, linked) {
      this.setState({ busy: true, msg: '' });
      if (!linked) {
        var r = await sb.auth.linkIdentity({ provider: provider, options: { redirectTo: SP.base + 'account.html' } });
        if (r.error) this.fail(r.error);
        return;
      }
      if (this.state.identities.length < 2) return this.say('error', 'ต้องเหลือวิธีเข้าสู่ระบบอย่างน้อย 1 วิธี', 'Keep at least one way to sign in.');
      var id = this.state.identities.find(function (i) { return i.provider === provider; });
      var u = await sb.auth.unlinkIdentity(id);
      if (u.error) return this.fail(u.error);
      await this.load();
      this.say('ok', 'ยกเลิกการเชื่อมต่อแล้ว', 'Disconnected.');
    }

    async resetPassword() {
      this.setState({ busy: true, msg: '' });
      var r = await sb.auth.resetPasswordForEmail(this.state.email, { redirectTo: SP.base + 'auth.html' });
      if (r.error) return this.fail(r.error);
      this.say('ok', 'ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ' + this.state.email + ' แล้ว', 'We sent a password link to ' + this.state.email + '.');
    }

    async logout(e) {
      if (e && e.preventDefault) e.preventDefault();
      await sb.auth.signOut();
      location.href = 'auth.html';
    }

    async doDelete(e) {
      if (e && e.preventDefault) e.preventDefault();
      this.setState({ busy: true, msg: '' });
      var uid = this.state.profile.id;
      var files = await sb.storage.from('portraits').list(uid, { limit: 1000 });
      if (files.data && files.data.length) {
        await sb.storage.from('portraits').remove(files.data.map(function (f) { return uid + '/' + f.name; }));
      }
      var r = await sb.rpc('delete_my_account');
      if (r.error) return this.fail(r.error);
      await sb.auth.signOut();
      location.href = '../index.html';
    }

    renderVals() {
      var v = super.renderVals();
      var th = this.th();
      var L = function (a, b) { return th ? a : b; };
      var p = this.state.profile;
      var kind = this.state.msgKind;
      v.email = this.state.email;
      v.publicId = p ? SP.publicId(p.public_no) : '…';
      v.saveProfile = () => {
        var n = (this.state.name || '').trim();
        if (!n) return this.say('error', 'ใส่ชื่อที่แสดงก่อนบันทึก', 'Add a display name first.');
        this.patch({ display_name: n }, 'บันทึกโปรไฟล์แล้ว', 'Profile saved.');
      };
      v.savedMsg = '';
      v.roles = v.roles.map((r) => Object.assign({}, r, {
        pick: () => { if (p && r.id !== this.state.role) this.patch({ role: r.id }).then((d) => { if (d) this.setState({ role: r.id, switched: true }); }); }
      }));
      v.methods = v.methods.map((m, i) => {
        if (i === 0) return Object.assign({}, m, { status: this.state.email, act: () => this.resetPassword() });
        var prov = i === 1 ? 'google' : 'discord';
        return Object.assign({}, m, { act: () => this.toggleProvider(prov, this.state[prov]) });
      });
      v.toggleNews = () => {
        var next = !this.state.news;
        this.setState({ news: next });
        this.patch({ news_opt_in: next });
      };
      v.onAvatar = (e) => this.onAvatar(e);
      v.logout = (e) => this.logout(e);
      v.doDelete = (e) => this.doDelete(e);
      v.hasMsg = !!this.state.msg;
      v.msg = this.state.msg;
      v.msgColor = kind === 'error' ? '#FF3D6E' : kind === 'ok' ? '#4ADE80' : '#2EE6F0';
      v.savedMsg = this.state.msg ? '> ' + this.state.msg : '';
      v.avatarUrl = p && p.avatar_path ? SP.imageUrl(p.avatar_path) : '';
      v.noAvatar = !v.avatarUrl;
      v.t = Object.assign({}, v.t, {
        protoNote: L('BETA // ', 'BETA // ') + (p ? SP.publicId(p.public_no) : '') + L(' · ช่วงทดสอบ เปิดเฉพาะผู้ที่ได้รับเชิญ', ' · Invite-only testing'),
        avatarHint: L('PNG / JPG / WebP ไม่เกิน 5 MB', 'PNG / JPG / WebP, up to 5 MB')
      });
      if (!this.state.ready) v.shownName = L('กำลังโหลด…', 'Loading…');
      return v;
    }
  }

  DC.mount(Page, document.getElementById('app'));
})();
