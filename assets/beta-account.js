/* Account settings wired to Supabase. Extends the design's Component. */
(function () {
  'use strict';
  var sb = SP.sb;

  var BOOK_NAMES = {
    core: ['Core Rulebook', 'Core Rulebook', '#FF2E88'],
    'dossier-cpd': ['Shifter แฟ้มลับ C.P.D.', 'Shifter Dossier: C.P.D. Edition', '#FFD400'],
    'gadget-blueprint': ['Gadget Blueprint', 'Gadget Blueprint', '#2EE6F0'],
    'one-shot': ['ชุด One-Shot', 'One-Shot Collection', '#C084FC']
  };

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
      sb.rpc('am_i_admin').then((a) => { if (a.data === true) this.setState({ isAdmin: true }); });
      var b = await sb.from('book_codes').select('book, redeemed_at').order('redeemed_at');
      this.setState({ owned: b.data || [] });
      // campaign books the account owns, and its tables (scene pictures go into one of them)
      var pk = await sb.rpc('my_packs');
      var ss = await sb.from('sessions').select('id, name, status').eq('gm_id', u.id).neq('status', 'ended').order('created_at', { ascending: false });
      this.setState({ packs: pk.data || [], mySessions: ss.data || [] });
    }

    async importPack(book) {
      var pk = (this.state.packs || []).find(function (x) { return x.book === book; });
      if (!pk || pk.imported_at) return;
      var sid = (this.state.packSess || {})[book] || null;
      this.setState({ packBusy: book, packMsg: null });
      var r = await sb.rpc('import_pack', { p_book: book, p_session: sid });
      if (r.error) {
        var m = r.error.message || '', th = this.th();
        var txt = /CHARACTER_LIMIT/.test(m) ? (th ? 'ตัวละครจะเกินจำนวนสูงสุด ลบตัวละครเก่าบางตัวก่อนแล้ว Import ใหม่' : 'This would go over your character limit. Delete some characters and try again.')
          : /PACK_PICK_SESSION/.test(m) ? (th ? 'เลือก session ที่จะใส่รูปฉากก่อน' : 'Pick a session for the scene pictures first.')
          : /PACK_ALREADY_IMPORTED/.test(m) ? (th ? 'ชุดนี้ Import เข้าบัญชีไปแล้ว' : 'This pack is already in your account.')
          : SP.err(r.error, th);
        this.setState({ packBusy: null, packMsg: { book: book, err: true, text: txt } });
        return;
      }
      var d = r.data || {};
      var pk2 = await sb.rpc('my_packs');
      this.setState({ packBusy: null, packs: pk2.data || this.state.packs, packMsg: { book: book, err: false, text: this.th()
        ? 'Import แล้ว: PC ' + (d.pcs || 0) + ' ตัว · NPC ' + (d.npcs || 0) + ' ตัว · รูปฉาก ' + (d.scenes || 0) + ' รูป'
        : 'Imported: ' + (d.pcs || 0) + ' PCs · ' + (d.npcs || 0) + ' NPCs · ' + (d.scenes || 0) + ' scenes' } });
    }

    async redeem(e) {
      if (e && e.preventDefault) e.preventDefault();
      var code = String(this.state.bookCode || '').trim().toUpperCase();
      var bad = function (th, en) { return { kind: 'error', th: th, en: en }; };
      if (!/^BK-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(code.replace(/\s/g, ''))) {
        return this.setState({ bookMsg: bad('รหัสหนังสือเป็นรูปแบบ BK-XXXX-XXXX อยู่ในหน้าแรกของหนังสือ', 'Book codes look like BK-XXXX-XXXX, inside the front cover.') });
      }
      this.setState({ bookBusy: true, bookMsg: null });
      var wasGm = !!(this.state.profile && this.state.profile.gm_allowed);
      var r = await sb.rpc('redeem_book_code', { p_code: code });
      var res = r.error ? 'ERR:' + r.error.message : String(r.data || '');
      var ERR = {
        BOOK_CODE_NOT_FOUND: ['ไม่พบรหัสนี้ ลองตรวจตัวอักษรอีกครั้ง', 'That code doesn\'t exist. Check the letters and try again.'],
        BOOK_CODE_USED: ['รหัสนี้ถูกใช้กับบัญชีอื่นไปแล้ว', 'That code has already been used on another account.'],
        BOOK_CODE_ALREADY_YOURS: ['รหัสนี้ลงทะเบียนกับบัญชีนี้ไว้แล้ว', 'That code is already on this account.'],
        TOO_MANY_TRIES: ['ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', 'Too many wrong tries. Wait an hour and try again.']
      };
      if (res.indexOf('ERR:') === 0) {
        var k = Object.keys(ERR).filter(function (x) { return res.indexOf(x) !== -1; })[0];
        var m = k ? ERR[k] : [SP.err(r.error || res, true), SP.err(r.error || res, false)];
        return this.setState({ bookBusy: false, bookMsg: bad(m[0], m[1]) });
      }
      await this.load();
      var pt = (this.state.packs || []).find(function (x) { return x.book === res; });
      var name = BOOK_NAMES[res] ? BOOK_NAMES[res][this.th() ? 0 : 1] : pt ? (pt.title || res) : BOOK_NAMES.core[this.th() ? 0 : 1];
      this.setState({ bookBusy: false, bookCode: '', bookMsg: wasGm
        ? { kind: 'ok', th: 'เพิ่ม ' + name + ' เข้าบัญชีแล้ว', en: name + ' added to your account.' }
        : { kind: 'ok', th: 'เพิ่ม ' + name + ' แล้ว · ปลดล็อกบทบาท GM แล้ว เลือกเป็น GM ได้ที่ส่วนบทบาทด้านล่าง', en: name + ' added. The GM role is unlocked: pick it under Role below.' } });
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
      var cap = await SP.captcha();
      var r = await sb.auth.resetPasswordForEmail(this.state.email, { redirectTo: SP.base + 'auth.html', captchaToken: cap || undefined });
      if (r.error) return this.fail(r.error);
      this.say('ok', 'ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ' + this.state.email + ' แล้ว', 'We sent a password link to ' + this.state.email + '.');
    }

    /* called by the design's change-password form */
    async changePassword(pw) {
      var r = await sb.auth.updateUser({ password: pw });
      if (r.error) throw r.error;
    }
    pwErr(e) { return SP.err(e, this.th()); }

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
      try { await SP.removeFolder('scenes', uid); } catch (e) {}
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
      v.isAdmin = !!this.state.isAdmin;
      v.publicId = p ? SP.publicId(p.public_no) : '…';
      v.saveProfile = () => {
        var n = (this.state.name || '').trim();
        if (!n) return this.say('error', 'ใส่ชื่อที่แสดงก่อนบันทึก', 'Add a display name first.');
        this.patch({ display_name: n }, 'บันทึกโปรไฟล์แล้ว', 'Profile saved.');
      };
      v.savedMsg = '';
      var th = this.th(), L = function (a, b) { return th ? a : b; };
      var owned = this.state.owned || [], bm = this.state.bookMsg, gmOk = !!(p && p.gm_allowed);
      var self = this, packs = this.state.packs || [], sess = this.state.mySessions || [], pm = this.state.packMsg;
      v.bk = {
        title: L('อยากเป็น GM?', 'Want to be a GM?'),
        chip: gmOk ? L('GM ปลดล็อกแล้ว', 'GM UNLOCKED') : L('GM ล็อกอยู่', 'GM LOCKED'),
        chipColor: gmOk ? '#4ADE80' : '#8C88A6',
        sub: gmOk ? L('กรอกรหัสจากหนังสือเล่มอื่นเพื่อเพิ่มเข้าบัญชีได้ รหัสแต่ละเล่มใช้ได้ครั้งเดียว', 'Add codes from your other books here. Each code works once.')
                  : L('บทบาท GM เปิดให้เจ้าของหนังสือ Shifter Punkz TRPG อย่างน้อย 1 เล่ม กรอกรหัสในหน้าแรกของหนังสือเพื่อปลดล็อก รหัสแต่ละเล่มใช้ได้ครั้งเดียว', 'The GM role is for owners of at least one Shifter Punkz TRPG book. Enter the code inside the front cover to unlock it. Each code works once.'),
        hasOwned: owned.length > 0,
        owned: owned.map(function (o) { var pt = (self.state.packs || []).find(function (x) { return x.book === o.book; }); var n = BOOK_NAMES[o.book] || (pt ? [pt.title || o.book, pt.title || o.book, '#2EE6F0'] : BOOK_NAMES.core); return { name: th ? n[0] : n[1], accent: n[2], when: L('ลงทะเบียน ', 'Added ') + new Date(o.redeemed_at).toLocaleDateString(th ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }; }),
        label: L('รหัสหนังสือ', 'BOOK CODE'),
        code: this.state.bookCode || '',
        onCode: (e) => this.setState({ bookCode: String(e && e.target ? e.target.value : '').toUpperCase(), bookMsg: null }),
        invalid: bm && bm.kind === 'error' ? 'true' : 'false',
        busy: this.state.bookBusy ? 'true' : 'false',
        btn: L('ลงทะเบียนหนังสือ', 'Register book'),
        redeem: (e) => this.redeem(e),
        hasMsg: !!bm,
        msg: bm ? (th ? bm.th : bm.en) : '',
        msgColor: bm && bm.kind === 'error' ? '#FF3D6E' : '#4ADE80',
        hasPacks: packs.length > 0,
        packs: packs.map((k) => {
          var sid = (this.state.packSess || {})[k.book] || '', busy = this.state.packBusy === k.book, mine = pm && pm.book === k.book;
          var needS = k.scenes > 0;
          return {
            title: k.title || k.book,
            counts: 'PC ' + k.pcs + ' · NPC ' + k.npcs + ' · Scene ' + k.scenes,
            done: !!k.imported_at,
            doneText: (mine && !pm.err ? pm.text + ' · ' : '') + L('Import เข้าบัญชีแล้วเมื่อ ', 'Imported on ') + (k.imported_at ? new Date(k.imported_at).toLocaleDateString(th ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
            canImport: !k.imported_at,
            needSession: needS,
            sessLabel: L('ใส่รูปฉากไว้ใน session', 'PUT SCENE PICTURES IN SESSION'),
            sess: sid,
            sessOpts: [{ v: '', label: sess.length ? L('— เลือก session —', '— Pick a session —') : L('ยังไม่มี session · สร้างที่ Session ของฉัน ก่อน', 'No sessions yet · create one in My sessions'), sel: !sid }]
              .concat(sess.map(function (x) { return { v: x.id, label: x.name, sel: x.id === sid }; })),
            onSession: (e) => this.setState({ packSess: Object.assign({}, this.state.packSess, { [k.book]: e && e.target ? e.target.value : '' }), packMsg: null }),
            btn: busy ? L('กำลัง Import…', 'Importing…') : L('Import เข้าบัญชี', 'Import to my account'),
            busy: busy ? 'true' : 'false',
            off: busy || (needS && !sid),
            op: busy || (needS && !sid) ? '0.45' : '1',
            run: () => this.importPack(k.book),
            note: mine && pm.err ? pm.text : L('Import ได้ครั้งเดียว · PC นับรวมในจำนวนตัวละครสูงสุด · NPC เข้า NPC Network ใช้ได้ทุก session และทำสำเนาได้', 'One import per book · PCs count toward your character limit · NPCs go to your NPC Network for every session and can be duplicated'),
            noteColor: mine && pm.err ? '#FF3D6E' : '#8C88A6'
          };
        })
      };
      v.canGm = !!(p && p.gm_allowed);
      v.menuCanAskGm = !!(p && p.gm_allowed && this.state.role !== 'gm');
      // a GM can sit at another GM's table without switching roles
      v.askChars = () => { location.href = 'characters.html'; };
      if (p && p.gm_allowed) v.askSessions = () => { location.href = 'sessions.html'; };
      v.roles = v.roles.map((r) => Object.assign({}, r, {
        pick: () => { if (p && r.id !== this.state.role) this.patch({ role: r.id }).then((d) => { if (d) this.setState({ role: r.id, switched: true }); }); }
      }));
      v.methods = v.methods.map((m, i) => {
        if (i === 0) return Object.assign({}, m, { status: this.state.email });
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
      v.navLogout = (e) => this.logout(e);
      var menuRole = (role) => {
        if (!p) return;
        this.patch({ role: role }).then((d) => { if (d) this.setState({ role: role, switched: true, menuRole: role, roleWarn: false, charWarn: false, menuSwitched: role }); });
      };
      v.switchToGm = () => menuRole('gm');
      v.switchToPlayer = () => menuRole('player');
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
