/* Contact page: Cloudflare Turnstile + sending the form to the contact Worker (api.shifterpunkz.com).
   The page's Component calls SPContact.bind / send / reset (see Contact.dc.html). */
(function () {
  var API = 'https://api.shifterpunkz.com/contact';
  var SITEKEY = '0x4AAAAAAGVSCvY75d4SzXHr';
  var token = '', notify = null, wid = null;
  function say(ok) { if (notify) notify(ok); }
  function render() {
    var box = document.getElementById('ct-ts');
    if (!box || !window.turnstile) return;
    if (wid !== null) { try { window.turnstile.remove(wid); } catch (e) {} wid = null; }
    box.innerHTML = '';
    token = '';
    wid = window.turnstile.render(box, {
      sitekey: SITEKEY, theme: 'dark', language: document.documentElement.lang === 'en' ? 'en' : 'th',
      callback: function (t) { token = t; say(true); },
      'expired-callback': function () { token = ''; say(false); },
      'error-callback': function () { token = ''; say(false); }
    });
  }
  window.spTurnstileReady = function () { render(); };
  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=spTurnstileReady&render=explicit';
  s.async = true; s.defer = true;
  document.head.appendChild(s);
  window.SPContact = {
    bind: function (fn) { notify = fn; setTimeout(render, 0); },
    reset: function () { say(false); setTimeout(render, 0); },
    send: function (d) {
      var body = JSON.stringify(Object.assign({}, d, { token: token }));
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (!r.ok || !j.ok) { var e = new Error(j.error || ('http ' + r.status)); e.code = j.error || 'http'; throw e; }
            return j;
          });
        });
    }
  };
})();
