/* Shifter Punkz BGM bot — music and ambience synthesised live with the Web Audio API.
 * Nothing is downloaded: every track is generated from patterns, so it loops forever without repeating exactly.
 *
 *   const bgm = SPBGM.create();
 *   bgm.setMood('normal' | 'intense' | 'sad' | null);   // crossfades
 *   bgm.setAmbient('rain', true);                        // layer ambiences
 *   bgm.setVolume(0.8); bgm.setAmbientVolume(0.6);
 *   bgm.apply({ mood, ambients: [...], playing });      // apply a synced state (players)
 */
(function () {
  'use strict';

  var MOODS = [
    { id: 'normal', code: 'TRK-01', title: 'Neon Streets', th: 'ปกติ', en: 'Calm', color: '#2EE6F0',
      descTh: 'ซินธ์เวฟเดินเมืองยามค่ำ เหมาะกับสำรวจ คุยกับ NPC', descEn: 'Night-city synthwave for exploring and talking' },
    { id: 'intense', code: 'TRK-02', title: 'C.P.D. Raid', th: 'เร้าใจ', en: 'Intense', color: '#FF2E88',
      descTh: '140 BPM เบสแตก กลองรัว มีช่วง build-up ก่อนระเบิด สำหรับไล่ล่า ต่อสู้ บุกจับ', descEn: '140 BPM, distorted bass, drum fills and a build-up before each drop' },
    { id: 'sad', code: 'TRK-03', title: 'Rain on Concrete', th: 'เศร้า', en: 'Sad', color: '#C084FC',
      descTh: 'เปียโนช้า ๆ บนเครื่องสายและเชลโล สำหรับการสูญเสีย บทอำลา ฉากเงียบ', descEn: 'Slow piano over strings and cello for loss and farewells' }
  ];
  var AMBIENTS = [
    { id: 'rain', th: 'ฝนตก', en: 'Rain' },
    { id: 'city', th: 'เมืองยามค่ำ', en: 'Night city' },
    { id: 'neon', th: 'ไฟนีออนช็อต', en: 'Neon hum' },
    { id: 'siren', th: 'ไซเรน C.P.D.', en: 'C.P.D. sirens' },
    { id: 'wind', th: 'ลม Extincted Zone', en: 'Wasteland wind' },
    { id: 'geiger', th: 'เครื่องวัดรังสี', en: 'Geiger counter' }
  ];

  // loudness trims so moods and ambiences sit at a similar level
  var TRIM = { normal: 1.2, intense: 0.65, sad: 2.1, rain: 0.3, city: 1.2, neon: 3, siren: 3, wind: 0.6, geiger: 3 };

  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  // ---- track definitions (16th-note steps, 16 steps per bar) ----
  var TRACKS = {
    normal: {
      bpm: 96,
      chords: [[45, [57, 60, 64]], [41, [57, 60, 65]], [48, [55, 60, 64]], [43, [55, 59, 62]]], // Am F C G
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1];
        if (s === 0) e.pad(t, tones, dur * 16, out, 0.05);
        if (s % 4 === 0 || s % 4 === 3) e.bass(t, mtof(root + (s % 8 === 4 ? 12 : 0)), dur * 1.6, out, 0.18);
        if (s % 2 === 0) e.hat(t, out, s % 4 === 2 ? 0.035 : 0.02, false);
        if (s === 0 || s === 8) e.kick(t, out, 0.35);
        if (bar % 4 >= 1 && Math.random() < (s % 2 ? 0.25 : 0.55)) e.lead(t, mtof(pick(tones) + 12), dur * 1.5, out, 0.035, 'triangle');
      }
    },
    intense: {
      // C.P.D. Raid — 8-bar loop: 4 bars build, 4 bars full assault, riser + crash at the turn
      bpm: 140,
      chords: [[38, [62, 65, 69]], [38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 64, 67]],
               [38, [62, 65, 69]], [38, [62, 65, 69]], [34, [62, 65, 70]], [33, [61, 64, 69]]], // Dm Dm Bb C | Dm Dm Bb A
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1], phase = bar % 8, full = phase >= 4;
        var bassPat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12];
        e.dbass(t, mtof(root + bassPat[s]), dur * 0.85, out, full ? 0.2 : 0.16);
        if (s % 4 === 0 || (full && s === 14) || (phase === 3 && s >= 12)) e.kick(t, out, 0.75);
        if (s === 4 || s === 12) e.snare(t, out, full ? 0.3 : 0.2);
        e.hat(t, out, s % 2 ? 0.02 : 0.045, full && s % 4 === 2);
        if (phase === 0 && s === 0 && bar > 0) e.crash(t, out, 0.12);
        if (phase === 7 && s === 0) e.riser(t, dur * 16, out, 0.09);
        if (phase === 7 && s >= 8) e.snare(t, out, 0.06 + (s - 8) * 0.035);
        if (phase === 7 && s >= 12) e.tom(t, mtof(50 - (s - 12) * 3), out, 0.25);
        if (full) {
          var arp = [0, 1, 2, 3, 2, 1, 0, 2, 1, 2, 3, 2, 1, 0, 1, 2];
          var oct = [12, 12, 12, 24, 12, 12, 12, 24];
          var note = arp[s] === 3 ? tones[0] + 12 : tones[arp[s]];
          e.lead(t, mtof(note + oct[s % 8]), dur * 0.75, out, 0.05, 'sawtooth');
          if (s === 0 || s === 3 || s === 6 || s === 10) e.stab(t, tones, dur * 1.2, out, 0.08);
        } else if (phase >= 2 && s % 2 === 0) {
          e.lead(t, mtof(tones[(s / 2) % 3] + 12), dur * 0.5, out, 0.03, 'square');
        }
        if (s === 0) e.pad(t, tones, dur * 16, out, full ? 0.03 : 0.045);
      }
    },
    sad: {
      // Rain on Concrete — 8-bar E minor elegy: piano melody over strings and a low cello swell
      bpm: 56,
      chords: [[40, [55, 59, 64]], [36, [55, 60, 64]], [45, [57, 60, 64]], [47, [54, 59, 63]],
               [40, [55, 59, 64]], [43, [55, 59, 62]], [45, [57, 60, 64]], [47, [54, 59, 63]]], // Em C Am B | Em G Am B
      melody: [
        [71, 0, 0, 0, 69, 0, 0, 0, 67, 0, 0, 0, 64, 0, 0, 0],
        [67, 0, 0, 0, 66, 0, 0, 0, 64, 0, 0, 0, 59, 0, 0, 0],
        [69, 0, 0, 0, 67, 0, 64, 0, 60, 0, 0, 0, 64, 0, 0, 0],
        [66, 0, 0, 0, 63, 0, 0, 0, 59, 0, 0, 0, 0, 0, 0, 0],
        [71, 0, 72, 0, 71, 0, 69, 0, 67, 0, 0, 0, 64, 0, 0, 0],
        [67, 0, 0, 0, 71, 0, 0, 0, 74, 0, 72, 0, 71, 0, 0, 0],
        [72, 0, 0, 0, 71, 0, 69, 0, 67, 0, 0, 0, 69, 0, 0, 0],
        [66, 0, 0, 0, 63, 0, 66, 0, 71, 0, 0, 0, 0, 0, 0, 0]
      ],
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1], phase = bar % 8, cycle = Math.floor(bar / 8);
        if (s === 0) {
          e.cello(t, mtof(root - 12), dur * 16, out, 0.09);
          e.strings(t, tones, dur * 16, out, phase >= 4 || cycle > 0 ? 0.07 : 0.04);
        }
        var m = TRACKS.sad.melody[phase][s];
        if (m) e.piano(t + rnd(0, 0.025), mtof(m), out, 0.1 + rnd(-0.015, 0.015));
        if (s % 4 === 2) e.piano(t, mtof(tones[(s / 2) % 3] - 12), out, 0.035);
        if (cycle % 2 === 1 && phase >= 4 && m) e.piano(t + dur * 2, mtof(m + 12), out, 0.03);
      }
    }
  };

  function create() {
    var distCurve = null;
    var ctx = null, master, musicBus, ambBus, reverb, revSend, delay, delaySend, noiseBuf;
    var st = { mood: null, ambients: {}, volume: 0.8, ambVolume: 0.6, playing: false };
    var voices = {};   // mood -> { gain, step, bar, nextTime, stopAt }
    var amb = {};      // ambience id -> { gain, nodes, stop }
    var timer = null, listeners = [];

    function emit() { listeners.forEach(function (f) { try { f(api.state()); } catch (e) {} }); }

    function ensure() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -14; master.ratio.value = 3;
      master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = st.volume; musicBus.connect(master);
      ambBus = ctx.createGain(); ambBus.gain.value = st.ambVolume; ambBus.connect(master);
      // reverb from a generated impulse
      reverb = ctx.createConvolver();
      var len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      reverb.buffer = ir;
      revSend = ctx.createGain(); revSend.gain.value = 0.35; revSend.connect(reverb); reverb.connect(master);
      delay = ctx.createDelay(1); delay.delayTime.value = 0.34;
      var fb = ctx.createGain(); fb.gain.value = 0.32; delay.connect(fb); fb.connect(delay);
      delaySend = ctx.createGain(); delaySend.gain.value = 0.25; delaySend.connect(delay); delay.connect(master);
      distCurve = new Float32Array(1024);
      for (var k = 0; k < 1024; k++) { var x = k / 512 - 1; distCurve[k] = Math.tanh(x * 3.2); }
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var nd = noiseBuf.getChannelData(0); for (var j = 0; j < nd.length; j++) nd[j] = Math.random() * 2 - 1;
      timer = setInterval(tick, 25);
    }

    // ---- instruments ----
    function env(g, t, a, peak, d) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function noise(t, dur) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05); return src;
    }
    var E = {
      bass: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f;
        fl.type = 'lowpass'; fl.Q.value = 6;
        fl.frequency.setValueAtTime(220, t); fl.frequency.exponentialRampToValueAtTime(1400, t + 0.02); fl.frequency.exponentialRampToValueAtTime(260, t + dur);
        env(g, t, 0.008, v, dur);
        o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
      },
      sub: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.1);
      },
      pad: function (t, notes, dur, out, v) {
        notes.forEach(function (m) {
          [-7, 7].forEach(function (det) {
            var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
            fl.type = 'lowpass'; fl.frequency.value = 1100;
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v / notes.length, t + Math.min(1.2, dur * 0.3));
            g.gain.setValueAtTime(v / notes.length, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
            o.connect(fl); fl.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + dur + 0.7);
          });
        });
      },
      lead: function (t, f, dur, out, v, type) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        fl.type = 'lowpass'; fl.frequency.value = 2600;
        env(g, t, 0.006, v, dur);
        o.connect(fl); fl.connect(g); g.connect(out); g.connect(delaySend); o.start(t); o.stop(t + dur + 0.1);
      },
      pluck: function (t, f, out, v) {
        [1, 2.01].forEach(function (h, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = i ? 'sine' : 'triangle'; o.frequency.value = f * h;
          env(g, t, 0.005, v / (i + 1), 1.6);
          o.connect(g); g.connect(out); g.connect(revSend); g.connect(delaySend); o.start(t); o.stop(t + 1.8);
        });
      },
      dbass: function (t, f, dur, out, v) {
        var ws = ctx.createWaveShaper(), post = ctx.createBiquadFilter(), g = ctx.createGain();
        ws.curve = distCurve; ws.oversample = '2x';
        post.type = 'lowpass'; post.frequency.value = 3200;
        env(g, t, 0.004, v, dur);
        [['sawtooth', 0], ['square', -1200]].forEach(function (w) {
          var o = ctx.createOscillator(), fl = ctx.createBiquadFilter();
          o.type = w[0]; o.frequency.value = f; o.detune.value = w[1];
          fl.type = 'lowpass'; fl.Q.value = 8;
          fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(2600, t + 0.015); fl.frequency.exponentialRampToValueAtTime(380, t + dur);
          o.connect(fl); fl.connect(ws); o.start(t); o.stop(t + dur + 0.1);
        });
        ws.connect(post); post.connect(g); g.connect(out);
      },
      stab: function (t, notes, dur, out, v) {
        notes.forEach(function (m) {
          [-12, 12].forEach(function (det) {
            var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
            fl.type = 'lowpass'; fl.frequency.setValueAtTime(4000, t); fl.frequency.exponentialRampToValueAtTime(500, t + dur);
            env(g, t, 0.004, v / notes.length, dur);
            o.connect(fl); fl.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + dur + 0.1);
          });
        });
      },
      crash: function (t, out, v) {
        var n = noise(t, 2), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'highpass'; f.frequency.value = 4500;
        env(g, t, 0.002, v, 1.8); n.connect(f); f.connect(g); g.connect(out); g.connect(revSend);
      },
      riser: function (t, dur, out, v) {
        var n = noise(t, dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur * 0.95); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        n.connect(f); f.connect(g); g.connect(out); g.connect(revSend);
      },
      tom: function (t, f, out, v) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
        env(g, t, 0.003, v, 0.25); o.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + 0.3);
      },
      piano: function (t, f, out, v) {
        [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [1.003, 0.5, 'sine']].forEach(function (h) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = h[2]; o.frequency.value = f * h[0];
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * h[1], t + 0.006);
          g.gain.exponentialRampToValueAtTime(v * h[1] * 0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
          o.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + 3.3);
        });
      },
      strings: function (t, notes, dur, out, v) {
        notes.concat([notes[0] + 12]).forEach(function (m) {
          [-9, 0, 9].forEach(function (det) {
            var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
            vib.frequency.value = 5.2; vg.gain.value = 6; vib.connect(vg); vg.connect(o.detune);
            fl.type = 'lowpass'; fl.frequency.value = 1700; fl.Q.value = 0.7;
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v / 6, t + dur * 0.45);
            g.gain.linearRampToValueAtTime(v / 9, t + dur * 0.9); g.gain.linearRampToValueAtTime(0.0001, t + dur + 1);
            o.connect(fl); fl.connect(g); g.connect(out); g.connect(revSend);
            o.start(t); vib.start(t); o.stop(t + dur + 1.1); vib.stop(t + dur + 1.1);
          });
        });
      },
      cello: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; vib.frequency.value = 4.5; vg.gain.value = 5; vib.connect(vg); vg.connect(o.detune);
        fl.type = 'lowpass'; fl.frequency.value = 600;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
        o.connect(fl); fl.connect(g); g.connect(out); g.connect(revSend); o.start(t); vib.start(t); o.stop(t + dur + 0.5); vib.stop(t + dur + 0.5);
      },
      kick: function (t, out, v) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        env(g, t, 0.003, v, 0.35); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
      },
      snare: function (t, out, v) {
        var n = noise(t, 0.2), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
        env(g, t, 0.002, v, 0.16); n.connect(f); f.connect(g); g.connect(out); g.connect(revSend);
        var o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = 185;
        env(og, t, 0.002, v * 0.6, 0.08); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.12);
      },
      hat: function (t, out, v, open) {
        var n = noise(t, open ? 0.25 : 0.06), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'highpass'; f.frequency.value = 7200;
        env(g, t, 0.001, v, open ? 0.22 : 0.04); n.connect(f); f.connect(g); g.connect(out);
      }
    };

    // ---- music scheduler ----
    function startMood(id) {
      var tr = TRACKS[id]; if (!tr) return;
      var g = ctx.createGain(); g.gain.value = 0.0001; g.connect(musicBus);
      g.gain.exponentialRampToValueAtTime(TRIM[id] || 1, ctx.currentTime + 2.2);
      voices[id] = { gain: g, step: 0, bar: 0, nextTime: ctx.currentTime + 0.08, stopAt: null };
    }
    function fadeMood(id) {
      var v = voices[id]; if (!v || v.stopAt) return;
      v.gain.gain.cancelScheduledValues(ctx.currentTime);
      v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), ctx.currentTime);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.2);
      v.stopAt = ctx.currentTime + 2.4;
    }
    function tick() {
      if (!ctx) return;
      var now = ctx.currentTime;
      Object.keys(voices).forEach(function (id) {
        var v = voices[id], tr = TRACKS[id], dur = 60 / tr.bpm / 4;
        if (v.stopAt && now > v.stopAt) { v.gain.disconnect(); delete voices[id]; return; }
        while (v.nextTime < now + 0.12) {
          var ch = tr.chords[v.bar % tr.chords.length];
          if (!v.stopAt) tr.step(E, v.step, v.bar, v.nextTime, ch, v.gain, dur);
          v.nextTime += dur; v.step++;
          if (v.step >= 16) { v.step = 0; v.bar++; }
        }
      });
      Object.keys(amb).forEach(function (id) { if (amb[id].tick) amb[id].tick(now); });
    }

    // ---- ambiences ----
    function loopNoise(out, type, freq, q) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      src.connect(f); f.connect(out); src.start(); return { src: src, filter: f };
    }
    function lfo(param, rate, depth) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = rate; g.gain.value = depth;
      o.connect(g); g.connect(param); o.start(); return o;
    }
    var AMB = {
      rain: function (g) {
        var a = loopNoise(g, 'highpass', 500), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
        a.filter.disconnect(); a.filter.connect(lp); lp.connect(g);
        var next = ctx.currentTime;
        return { nodes: [a.src], tick: function (now) {
          while (next < now + 0.2) {
            var t = next, n = noise(t, 0.03), f = ctx.createBiquadFilter(), dg = ctx.createGain();
            f.type = 'bandpass'; f.frequency.value = rnd(2500, 6000); f.Q.value = 4;
            env(dg, t, 0.001, rnd(0.08, 0.25), 0.025); n.connect(f); f.connect(dg); dg.connect(g);
            next += rnd(0.02, 0.12);
          }
        } };
      },
      city: function (g) {
        var a = loopNoise(g, 'lowpass', 260, 0.5);
        var l = lfo(a.filter.frequency, 0.05, 120);
        var next = ctx.currentTime + rnd(4, 9);
        return { nodes: [a.src, l], tick: function (now) {
          if (now < next) return;
          var t = now + 0.05, dur = rnd(0.4, 1.1);
          [0, 4].forEach(function (semi) {
            var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), hg = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(pick([55, 57, 58]) + semi);
            f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
            hg.gain.setValueAtTime(0.0001, t); hg.gain.linearRampToValueAtTime(0.03, t + 0.05); hg.gain.linearRampToValueAtTime(0.0001, t + dur);
            o.connect(f); f.connect(hg); hg.connect(g); hg.connect(revSend); o.start(t); o.stop(t + dur + 0.1);
          });
          next = now + rnd(6, 16);
        } };
      },
      neon: function (g) {
        var hum = ctx.createGain(); hum.gain.value = 0.05; hum.connect(g);
        var oscs = [100, 200, 300].map(function (f, i) { var o = ctx.createOscillator(); o.type = i ? 'sine' : 'square'; o.frequency.value = f; var og = ctx.createGain(); og.gain.value = [0.25, 0.4, 0.15][i]; o.connect(og); og.connect(hum); o.start(); return o; });
        var next = ctx.currentTime + 1;
        return { nodes: oscs, tick: function (now) {
          if (now < next) return;
          var t = now + 0.02, burst = Math.floor(rnd(1, 5));
          for (var i = 0; i < burst; i++) {
            var tt = t + i * rnd(0.02, 0.07), n = noise(tt, 0.02), f = ctx.createBiquadFilter(), cg = ctx.createGain();
            f.type = 'highpass'; f.frequency.value = 3000; env(cg, tt, 0.001, 0.12, 0.015); n.connect(f); f.connect(cg); cg.connect(g);
          }
          hum.gain.setValueAtTime(0.05, t); hum.gain.setValueAtTime(0.01, t + 0.05); hum.gain.setValueAtTime(0.05, t + 0.12);
          next = now + rnd(2, 7);
        } };
      },
      siren: function (g) {
        var next = ctx.currentTime + 1.5;
        return { nodes: [], tick: function (now) {
          if (now < next) return;
          var t = now + 0.05, dur = rnd(5, 8), o = ctx.createOscillator(), f = ctx.createBiquadFilter(), sg = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
          o.type = 'triangle'; o.frequency.setValueAtTime(620, t);
          for (var k = 0; k < dur; k += 0.9) { o.frequency.linearRampToValueAtTime(980, t + k + 0.45); o.frequency.linearRampToValueAtTime(620, t + k + 0.9); }
          f.type = 'lowpass'; f.frequency.value = 1800;
          sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.035, t + dur * 0.4); sg.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(f); f.connect(sg);
          if (pan) { pan.pan.setValueAtTime(rnd(-1, 1), t); pan.pan.linearRampToValueAtTime(rnd(-1, 1), t + dur); sg.connect(pan); pan.connect(g); pan.connect(revSend); }
          else { sg.connect(g); sg.connect(revSend); }
          o.start(t); o.stop(t + dur + 0.1);
          next = now + dur + rnd(12, 28);
        } };
      },
      wind: function (g) {
        var a = loopNoise(g, 'bandpass', 500, 1.2);
        var l1 = lfo(a.filter.frequency, 0.08, 320), wg = ctx.createGain(); wg.gain.value = 1;
        a.filter.disconnect(); a.filter.connect(wg); wg.connect(g); wg.connect(revSend);
        var l2 = lfo(wg.gain, 0.13, 0.45);
        return { nodes: [a.src, l1, l2] };
      },
      geiger: function (g) {
        var next = ctx.currentTime, rate = 3;
        return { nodes: [], tick: function (now) {
          while (next < now + 0.2) {
            var t = next, n = noise(t, 0.01), f = ctx.createBiquadFilter(), cg = ctx.createGain();
            f.type = 'highpass'; f.frequency.value = 2500; env(cg, t, 0.0005, rnd(0.15, 0.3), 0.006);
            n.connect(f); f.connect(cg); cg.connect(g);
            if (Math.random() < 0.02) rate = rnd(2, 14);
            next += -Math.log(1 - Math.random()) / rate;
          }
        } };
      }
    };
    function startAmb(id) {
      if (amb[id] || !AMB[id]) return;
      var g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ambBus);
      g.gain.exponentialRampToValueAtTime(TRIM[id] || 1, ctx.currentTime + 1.5);
      var a = AMB[id](g); a.gain = g; amb[id] = a;
    }
    function stopAmb(id) {
      var a = amb[id]; if (!a) return; delete amb[id];
      a.gain.gain.cancelScheduledValues(ctx.currentTime);
      a.gain.gain.setValueAtTime(Math.max(a.gain.gain.value, 0.0001), ctx.currentTime);
      a.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);
      setTimeout(function () { (a.nodes || []).forEach(function (n) { try { n.stop(); } catch (e) {} }); a.gain.disconnect(); }, 1400);
    }

    var api = {
      MOODS: MOODS, AMBIENTS: AMBIENTS,
      state: function () {
        return { mood: st.mood, ambients: Object.keys(st.ambients).filter(function (k) { return st.ambients[k]; }),
          volume: st.volume, ambVolume: st.ambVolume, playing: !!(st.mood || Object.keys(amb).length) };
      },
      onChange: function (f) { listeners.push(f); },
      setMood: function (id) {
        ensure();
        if (id === st.mood) return;
        if (st.mood) fadeMood(st.mood);
        st.mood = id || null;
        if (id) { if (voices[id]) { voices[id].gain.disconnect(); delete voices[id]; } startMood(id); }
        emit();
      },
      setAmbient: function (id, on) {
        ensure();
        st.ambients[id] = !!on;
        if (on) startAmb(id); else stopAmb(id);
        emit();
      },
      setVolume: function (v) { st.volume = v; if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); emit(); },
      setAmbientVolume: function (v) { st.ambVolume = v; if (ambBus) ambBus.gain.setTargetAtTime(v, ctx.currentTime, 0.05); emit(); },
      stopAll: function () {
        if (!ctx) return;
        if (st.mood) fadeMood(st.mood);
        st.mood = null;
        Object.keys(amb).forEach(stopAmb);
        st.ambients = {};
        emit();
      },
      /* apply a synced { mood, ambients } from the GM */
      apply: function (remote) {
        remote = remote || {};
        this.setMood(remote.mood || null);
        var want = {}; (remote.ambients || []).forEach(function (a) { want[a] = true; });
        AMBIENTS.forEach(function (a) { if (!!want[a.id] !== !!st.ambients[a.id]) api.setAmbient(a.id, !!want[a.id]); });
      },
      unlocked: function () { return !!ctx && ctx.state === 'running'; },
      close: function () { if (timer) clearInterval(timer); if (ctx) ctx.close(); ctx = null; voices = {}; amb = {}; }
    };
    return api;
  }

  window.SPBGM = { create: create, MOODS: MOODS, AMBIENTS: AMBIENTS };
})();
