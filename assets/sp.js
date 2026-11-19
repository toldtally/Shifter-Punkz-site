/* Shifter Punkz — shared Supabase client + helpers for the beta pages.
 * The publishable key is meant to live in the browser; Row Level Security protects the data. */
(function () {
  'use strict';
  var URL_ = 'https://iarvmztizrcerxwjtazz.supabase.co';
  var KEY = 'sb_publishable_uX6i9rP2wu9XWbVBroleig_apPC_-PG';
  // Capture what kind of email link brought us here before the client consumes the hash.
  var landing = (/[#&?]type=(invite|recovery|signup|magiclink|email_change)/.exec(location.hash + location.search) || [])[1] || null;
  var sb = window.supabase.createClient(URL_, KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var ERR = {
    'Invalid login credentials': ['อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'Wrong email or password.'],
    'Email not confirmed': ['ยังไม่ได้ยืนยันอีเมล ลองเช็กกล่องจดหมาย', 'Email not confirmed yet. Check your inbox.'],
    'Signups not allowed for this instance': ['ช่วงทดสอบเปิดเฉพาะคนที่ได้รับเชิญทางอีเมล', 'During the beta, accounts are invite-only.'],
    'User already registered': ['อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน', 'That email already has an account. Try logging in.'],
    'Unsupported provider: provider is not enabled': ['ยังไม่ได้เปิดการเข้าสู่ระบบด้วยช่องทางนี้', 'This sign-in option isn\'t switched on yet.'],
    'Manual linking is disabled': ['ยังไม่ได้เปิดการเชื่อมบัญชีเพิ่ม', 'Linking extra sign-in methods isn\'t switched on yet.'],
    'New password should be different from the old password.': ['รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม', 'Pick a password different from the old one.'],
    'Password should be at least 8 characters.': ['รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', 'Passwords need at least 8 characters.']
  };

  window.SP = {
    sb: sb,
    landing: landing,
    base: location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, ''),
    err: function (e, th) {
      var m = (e && (e.message || e.error_description || e)) || '';
      m = String(m);
      for (var k in ERR) if (m.indexOf(k) !== -1) return ERR[k][th ? 0 : 1];
      if (/rate limit|too many/i.test(m)) return th ? 'ลองถี่เกินไป รอสักครู่แล้วลองใหม่' : 'Too many tries. Wait a moment and try again.';
      if (/Failed to fetch|NetworkError/i.test(m)) return th ? 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่' : 'Couldn\'t reach the server. Check your connection.';
      return (th ? 'เกิดข้อผิดพลาด: ' : 'Something went wrong: ') + m;
    },
    publicId: function (no) { return 'SP-' + String(no || 0).padStart(6, '0'); },
    imageUrl: function (path) {
      if (!path) return '';
      return sb.storage.from('portraits').getPublicUrl(path).data.publicUrl;
    },
    /* Center-crop an image File to a square WebP (JPEG fallback) Blob. */
    squareImage: function (file, size) {
      return new Promise(function (resolve, reject) {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('TYPE'));
        if (file.size > 5 * 1024 * 1024) return reject(new Error('SIZE'));
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
          var side = Math.min(img.naturalWidth, img.naturalHeight);
          var c = document.createElement('canvas');
          c.width = size; c.height = size;
          c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
          URL.revokeObjectURL(url);
          c.toBlob(function (b) {
            if (b && b.type === 'image/webp') return resolve(b);
            c.toBlob(function (j) { j ? resolve(j) : reject(new Error('ENCODE')); }, 'image/jpeg', 0.85);
          }, 'image/webp', 0.85);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('READ')); };
        img.src = url;
      });
    },
    /* Upload to portraits/<uid>/<name>.<ext>, returning the stored path (cache-busted). */
    uploadImage: async function (blob, name) {
      var u = (await sb.auth.getUser()).data.user;
      if (!u) throw new Error('NOT_SIGNED_IN');
      var ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
      var path = u.id + '/' + name + '.' + ext;
      var r = await sb.storage.from('portraits').upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: '3600' });
      if (r.error) throw r.error;
      return path + '?v=' + Date.now();
    },
    imageErr: function (e, th) {
      var m = e && e.message;
      if (m === 'TYPE') return th ? 'รองรับเฉพาะไฟล์ PNG, JPG หรือ WebP' : 'PNG, JPG or WebP only';
      if (m === 'SIZE') return th ? 'ไฟล์ใหญ่เกิน 5 MB' : 'File is over 5 MB';
      if (m === 'READ') return th ? 'เปิดรูปนี้ไม่ได้ ลองไฟล์อื่น' : 'Couldn\'t read that image.';
      return SP.err(e, th);
    }
  };
})();
