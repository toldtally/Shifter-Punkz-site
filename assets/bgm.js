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
      descTh: 'อินดัสเทรียลอิเล็กโทร 112 BPM กลองหนักแน่น เบสปั๊มตามจังหวะ เสียงโลหะกระทบ สำหรับเดินเมือง สำรวจ คุยกับ NPC', descEn: '112 BPM industrial electro: punchy drums, pumping bass and metal hits for roaming the city' },
    { id: 'intense', code: 'TRK-02', title: 'C.P.D. Raid', th: 'เร้าใจ', en: 'Intense', color: '#FF2E88',
      descTh: '150 BPM อินดัสเทรียลแอ็กชัน เบสรีสแตก ไซเรนซินธ์ กลิตช์ build-up แล้วดรอปหนัก สำหรับไล่ล่า ต่อสู้ บุกจับ', descEn: '150 BPM industrial action: torn reese bass, siren synth, glitch build-ups and heavy drops' },
    { id: 'sad', code: 'TRK-03', title: 'Rain on Concrete', th: 'เศร้า', en: 'Sad', color: '#C084FC',
      descTh: 'เปียโนช้า ๆ บนเครื่องสายและเชลโล สำหรับการสูญเสีย บทอำลา ฉากเงียบ', descEn: 'Slow piano over strings and cello for loss and farewells' },
    { id: 'mystery', code: 'TRK-04', title: 'Data Trail', th: 'น่าสงสัย', en: 'Suspicious', color: '#FFD400',
      descTh: 'ดาร์กอินดัสเทรียล 92 BPM เสียงหัวใจเต้น โดรนต่ำ สัญญาณกลิตช์ สำหรับแทรกซึม สืบสวน ตามรอย', descEn: '92 BPM dark industrial: heartbeat kick, low drone and data glitches for stealth and investigations' }
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
  var TRIM = { normal: 1.15, intense: 0.55, sad: 2.1, mystery: 1.0, rain: 0.3, city: 3.5, neon: 3, siren: 3, wind: 0.6, geiger: 3 };

  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  // ---- track definitions (16th-note steps, 16 steps per bar) ----
  var TRACKS = {
    normal: {
      // Neon Streets — industrial electro groove: punchy kick, gated snare, pumping 16th bass, metal hats, clanks
      bpm: 112,
      chords: [[40, [64, 67, 71]], [40, [64, 67, 71]], [36, [64, 67, 72]], [38, [62, 66, 69]],
               [40, [64, 67, 71]], [40, [64, 67, 71]], [36, [64, 67, 72]], [35, [63, 66, 71]]], // Em Em C D | Em Em C B
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1], phase = bar % 8, intro = bar < 2;
        // drums
        if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1) || (s === 14 && phase === 7)) e.ikick(t, out, 0.62);
        if (!intro && (s === 4 || s === 12)) e.isnare(t, out, 0.2);
        if (s % 4 === 2) e.metal(t, out, 0.05, 9000);
        else if (!intro && s % 2 === 1) e.metal(t, out, 0.018, 11000);
        if (!intro && (s === 7 || (s === 15 && phase % 2 === 1))) e.clank(t, out, 0.05);
        // pumping bass: rests on the kick, octave jumps on the off-beats
        var bp = [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1], oct = [0, 0, 12, 0, 0, 0, 12, 7, 0, 0, 12, 0, 0, 12, 0, 12];
        if (bp[s]) e.gbass(t, mtof(root + oct[s]), dur * 0.8, out, 0.22);
        // ducked pad, a hook every other bar, glitch at the end of the 8-bar phrase
        if (s === 0) e.dpad(t, tones, dur * 16, dur * 4, out, 0.045);
        var hook = [0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 0, 3, 0, 2, 0];
        if (bar % 2 === 1 && !intro && hook[s]) e.lead(t, mtof(tones[hook[s] - 1] + 12), dur * 1.2, out, 0.035, 'square');
        if (phase === 7 && s >= 12) e.glitch(t, dur, out, 0.05);
      }
    },
    intense: {
      // C.P.D. Raid — 8-bar loop: 4 bars of tension (reese, siren synth, riser), 4 bars of full industrial assault
      bpm: 150,
      chords: [[38, [62, 65, 69]], [38, [62, 65, 69]], [34, [62, 65, 70]], [36, [60, 64, 67]],
               [38, [62, 65, 69]], [38, [62, 65, 69]], [34, [62, 65, 70]], [33, [61, 64, 69]]], // Dm Dm Bb C | Dm Dm Bb A
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1], phase = bar % 8, full = phase >= 4;
        if (!full) {
          // tension: four-on-the-floor, ticking metal, a long torn reese and a rising siren
          if (s % 4 === 0) e.ikick(t, out, 0.7);
          e.metal(t, out, s % 4 === 2 ? 0.05 : 0.02, 10000);
          if (s === 0) e.reese(t, mtof(root), dur * 16, out, 0.08);
          if (s === 0 && phase >= 2) e.siren(t, mtof(tones[0] + 12), dur * 16, out, 0.045);
          if (phase === 3) { e.isnare(t, out, 0.05 + s * 0.016); if (s === 0) e.riser(t, dur * 16, out, 0.1); }
          if (phase === 3 && s >= 12) e.glitch(t, dur, out, 0.06);
        } else {
          // drop: kick + snare, 16th distorted bass, stabs, metal and clank hits
          if (phase === 4 && s === 0) { e.impact(t, out, 0.5); e.crash(t, out, 0.14); }
          if (s % 4 === 0 || s === 14 || (phase === 7 && s === 10)) e.ikick(t, out, 0.8);
          if (s === 4 || s === 12) e.isnare(t, out, 0.32);
          e.metal(t, out, s % 2 ? 0.02 : 0.045, 9500);
          if (s === 6 || s === 15) e.clank(t, out, 0.06);
          var bassPat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12];
          e.dbass(t, mtof(root + bassPat[s]), dur * 0.85, out, 0.26);
          if (s === 0 || s === 3 || s === 6 || s === 10) e.stab(t, tones, dur * 1.1, out, 0.09);
          var arp = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2];
          if (phase >= 6) e.lead(t, mtof(tones[arp[s]] + 24), dur * 0.7, out, 0.04, 'sawtooth');
          if (phase === 7 && s >= 12) e.glitch(t, dur, out, 0.07);
        }
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
    ,
    mystery: {
      // Data Trail — dark industrial stealth: heartbeat kick, low drone, ticking metal, data glitches, a cold bell motif
      bpm: 92,
      chords: [[38, [62, 65, 69]], [38, [62, 65, 69]], [34, [62, 65, 70]], [37, [61, 64, 68]],
               [38, [62, 65, 69]], [38, [62, 65, 69]], [43, [62, 67, 70]], [37, [61, 64, 68]]], // Dm Dm Bb C#dim | Dm Dm Gm C#dim
      motif: [[74, 0, 0, 0, 0, 0, 73, 0, 0, 0, 0, 0, 70, 0, 0, 0], [0, 0, 69, 0, 0, 0, 0, 0, 68, 0, 0, 0, 0, 0, 0, 0]],
      step: function (e, s, bar, t, ch, out, dur) {
        var root = ch[0], tones = ch[1], phase = bar % 8;
        if (s === 0) e.drone(t, mtof(root - 12), dur * 16, out, 0.12);
        // heartbeat
        if (s === 0 || s === 3) e.ikick(t, out, s ? 0.3 : 0.45);
        if (s === 8 && phase % 2 === 1) e.ikick(t, out, 0.25);
        // ticking metal 16ths with accents, a clank on the backbeat
        e.metal(t, out, s % 4 === 0 ? 0.035 : 0.012, 12000);
        if (s === 12 && phase >= 2) e.clank(t, out, 0.035);
        if (s === 4 && phase >= 4) e.isnare(t, out, 0.06);
        // low pulse bass
        if (s === 0 || s === 6 || s === 10) e.mbass(t, mtof(root + (s === 10 ? 1 : 0)), dur * 2, out, 0.18);
        // cold bell motif and its answer
        var mot = (phase === 2 || phase === 6) ? TRACKS.mystery.motif[0] : (phase === 3 || phase === 7) ? TRACKS.mystery.motif[1] : null;
        if (mot && mot[s]) e.bell(t, mtof(mot[s]), out, 0.04);
        // data glitches here and there
        if ((s === 14 && Math.random() < 0.4) || (phase === 7 && s >= 13)) e.glitch(t, dur, out, 0.035);
      }
    }
  };

  function create() {
    var distCurve = null, hardCurve = null;
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
      distCurve = new Float32Array(1024); hardCurve = new Float32Array(1024);
      for (var k = 0; k < 1024; k++) { var x = k / 512 - 1; distCurve[k] = Math.tanh(x * 3.2); hardCurve[k] = Math.tanh(x * 7) * 0.9; }
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
      mbass: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        fl.type = 'lowpass'; fl.frequency.value = 700; fl.Q.value = 2;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 0.5));
        o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + Math.min(dur, 0.5) + 0.05);
      },
      keys: function (t, notes, dur, out, v) {
        var g = ctx.createGain(), trem = ctx.createOscillator(), tg = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        trem.frequency.value = 5.5; tg.gain.value = v * 0.45; trem.connect(tg); tg.connect(g.gain);
        notes.forEach(function (m) {
          [['sine', 1, 1], ['triangle', 2, 0.18]].forEach(function (h) {
            var o = ctx.createOscillator(), og = ctx.createGain(); o.type = h[0]; o.frequency.value = mtof(m) * h[1]; og.gain.value = h[2] / notes.length;
            o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
          });
        });
        g.connect(out); g.connect(revSend); g.connect(delaySend); trem.start(t); trem.stop(t + dur + 0.05);
      },
      bell: function (t, f, out, v) {
        var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
        car.frequency.value = f; mod.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2, t); mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
        mod.connect(mg); mg.connect(car.frequency);
        env(g, t, 0.003, v, 2.2); car.connect(g); g.connect(out); g.connect(revSend); g.connect(delaySend);
        car.start(t); mod.start(t); car.stop(t + 2.4); mod.stop(t + 2.4);
      },
      tick: function (t, out, v) {
        var n = noise(t, 0.015), f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = 6;
        env(g, t, 0.0005, v, 0.012); n.connect(f); f.connect(g); g.connect(out);
      },
      rim: function (t, out, v) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1700;
        env(g, t, 0.0008, v, 0.03); o.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + 0.05);
      },
      // industrial kit
      ikick: function (t, out, v) {
        var o = ctx.createOscillator(), ws = ctx.createWaveShaper(), g = ctx.createGain();
        ws.curve = hardCurve;
        o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
        env(g, t, 0.002, v, 0.3); o.connect(ws); ws.connect(g); g.connect(out); o.start(t); o.stop(t + 0.4);
        var c = noise(t, 0.01), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
        cf.type = 'highpass'; cf.frequency.value = 2500; env(cg, t, 0.0005, v * 0.35, 0.008);
        c.connect(cf); cf.connect(cg); cg.connect(out);
      },
      isnare: function (t, out, v) {
        var n = noise(t, 0.14), f = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
        f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.6; ws.curve = hardCurve;
        g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + 0.07); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); // gated
        n.connect(f); f.connect(ws); ws.connect(g); g.connect(out); g.connect(revSend);
        var o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'triangle';
        o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.06);
        env(og, t, 0.001, v * 0.7, 0.07); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.1);
      },
      metal: function (t, out, v, hp) {
        var g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = hp || 8000;
        [263, 400, 421, 474, 587, 845].forEach(function (fr) {
          var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * 2; o.connect(f); o.start(t); o.stop(t + 0.08);
        });
        env(g, t, 0.0008, v, 0.05); f.connect(g); g.connect(out);
      },
      clank: function (t, out, v) {
        [[523, 1], [1187, 0.6], [1823, 0.45], [2711, 0.3]].forEach(function (h) {
          var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = h[0] * rnd(0.98, 1.02);
          env(g, t, 0.001, v * h[1], 0.35); o.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + 0.4);
        });
      },
      gbass: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), o2 = ctx.createOscillator(), fl = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'square'; o2.frequency.value = f / 2;
        fl.type = 'lowpass'; fl.Q.value = 9;
        fl.frequency.setValueAtTime(260, t); fl.frequency.exponentialRampToValueAtTime(1800, t + 0.012); fl.frequency.exponentialRampToValueAtTime(300, t + dur);
        ws.curve = distCurve; env(g, t, 0.003, v, dur);
        o.connect(fl); o2.connect(fl); fl.connect(ws); ws.connect(g); g.connect(out);
        o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      },
      reese: function (t, f, dur, out, v) {
        var fl = ctx.createBiquadFilter(), ws = ctx.createWaveShaper(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
        fl.type = 'lowpass'; fl.Q.value = 5; fl.frequency.value = 700; l.frequency.value = 0.6; lg.gain.value = 450; l.connect(lg); lg.connect(fl.frequency);
        ws.curve = hardCurve;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        [-18, 18, 0].forEach(function (det, i) {
          var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = i === 2 ? f / 2 : f; o.detune.value = det;
          o.connect(fl); o.start(t); o.stop(t + dur + 0.05);
        });
        fl.connect(ws); ws.connect(g); g.connect(out); l.start(t); l.stop(t + dur + 0.05);
      },
      siren: function (t, f, dur, out, v) {
        var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
        l.frequency.value = 3; lg.gain.value = 40; l.connect(lg); lg.connect(o.detune);
        fl.type = 'bandpass'; fl.frequency.value = 1800; fl.Q.value = 1.5;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(fl); fl.connect(g); g.connect(out); g.connect(delaySend); o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
      },
      glitch: function (t, dur, out, v) {
        var n = 3 + Math.floor(Math.random() * 3), step = dur / n;
        for (var i = 0; i < n; i++) {
          var o = ctx.createOscillator(), g = ctx.createGain(), tt = t + i * step;
          o.type = 'square'; o.frequency.value = pick([220, 440, 880, 1320, 1760, 3520]) * rnd(0.97, 1.03);
          env(g, tt, 0.0005, v, step * 0.6); o.connect(g); g.connect(out); g.connect(delaySend); o.start(tt); o.stop(tt + step);
        }
      },
      impact: function (t, out, v) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.8);
        env(g, t, 0.003, v, 1.1); o.connect(g); g.connect(out); g.connect(revSend); o.start(t); o.stop(t + 1.2);
        var n = noise(t, 0.6), f = ctx.createBiquadFilter(), ng = ctx.createGain(); f.type = 'lowpass'; f.frequency.value = 1200;
        env(ng, t, 0.002, v * 0.5, 0.5); n.connect(f); f.connect(ng); ng.connect(out); ng.connect(revSend);
      },
      dpad: function (t, notes, dur, beat, out, v) {
        // pad ducked on every beat, like a sidechained synth
        var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
        for (var b = 0; b * beat < dur; b++) {
          var bt = t + b * beat; g.gain.setValueAtTime(0.0001, bt); g.gain.linearRampToValueAtTime(v, bt + beat * 0.55);
        }
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.2);
        notes.forEach(function (m) {
          [-10, 10].forEach(function (det) {
            var o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), og = ctx.createGain();
            o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; og.gain.value = 1 / notes.length;
            fl.type = 'lowpass'; fl.frequency.value = 1500;
            o.connect(fl); fl.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.3);
          });
        });
        g.connect(out); g.connect(revSend);
      },
      drone: function (t, f, dur, out, v) {
        var fl = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain();
        fl.type = 'lowpass'; fl.frequency.value = 260; fl.Q.value = 4; l.frequency.value = 0.15; lg.gain.value = 120; l.connect(lg); lg.connect(fl.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.3); g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
        [0, 7, -5].forEach(function (det) {
          var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det; o.connect(fl); o.start(t); o.stop(t + dur + 0.6);
        });
        fl.connect(g); g.connect(out); g.connect(revSend); l.start(t); l.stop(t + dur + 0.6);
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
        // Bangkok at night: a far-off traffic bed, cars, motorbikes and the odd bus passing by, a horn now and then
        var bed = loopNoise(g, 'lowpass', 170, 0.4), bedG = ctx.createGain(); bedG.gain.value = 0.16;
        bed.filter.disconnect(); bed.filter.connect(bedG); bedG.connect(g);
        var l1 = lfo(bedG.gain, 0.045, 0.06);
        var far = loopNoise(g, 'bandpass', 750, 0.7), farG = ctx.createGain(); farG.gain.value = 0.05;
        far.filter.disconnect(); far.filter.connect(farG); farG.connect(g); farG.connect(revSend);
        var l2 = lfo(farG.gain, 0.07, 0.03);
        var nextCar = ctx.currentTime + rnd(0.8, 2.5), nextHorn = ctx.currentTime + rnd(10, 22);
        function pass(t, kind) {
          // kind: car | bike | bus — a whoosh that swells and fades, an engine note that drops as it goes by (doppler)
          var K = { car: { dur: rnd(2.6, 4.2), eng: rnd(70, 105), wave: 'sawtooth', lvl: rnd(0.35, 0.6), hiss: 1 },
                    bike: { dur: rnd(1.8, 2.8), eng: rnd(140, 210), wave: 'square', lvl: rnd(0.2, 0.32), hiss: 0.7 },
                    bus: { dur: rnd(4.5, 6.5), eng: rnd(42, 58), wave: 'sawtooth', lvl: rnd(0.5, 0.75), hiss: 1.4 } }[kind];
          var d = K.dur, mid = t + d * rnd(0.42, 0.55), dir = Math.random() < 0.5 ? -1 : 1, near = rnd(0.55, 1);
          var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null, out = ctx.createGain();
          out.gain.setValueAtTime(0.0001, t);
          out.gain.exponentialRampToValueAtTime(K.lvl * near, mid);
          out.gain.exponentialRampToValueAtTime(0.0001, t + d);
          if (pan) { pan.pan.setValueAtTime(-0.9 * dir, t); pan.pan.linearRampToValueAtTime(0.9 * dir, t + d); out.connect(pan); pan.connect(g); pan.connect(revSend); }
          else { out.connect(g); out.connect(revSend); }
          // tyre and air whoosh
          var n = noise(t, d), bf = ctx.createBiquadFilter(), hg = ctx.createGain();
          bf.type = 'bandpass'; bf.Q.value = 0.9;
          bf.frequency.setValueAtTime(420, t); bf.frequency.exponentialRampToValueAtTime(1300 * near, mid); bf.frequency.exponentialRampToValueAtTime(380, t + d);
          hg.gain.value = 0.9 * K.hiss; n.connect(bf); bf.connect(hg); hg.connect(out);
          // engine note
          var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), eg = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
          o.type = K.wave;
          o.frequency.setValueAtTime(K.eng * 1.06, t); o.frequency.linearRampToValueAtTime(K.eng * 1.04, mid - 0.15); o.frequency.linearRampToValueAtTime(K.eng * 0.9, mid + 0.25); o.frequency.linearRampToValueAtTime(K.eng * 0.86, t + d);
          vib.frequency.value = kind === 'bike' ? rnd(9, 14) : rnd(4, 7); vg.gain.value = K.eng * 0.015; vib.connect(vg); vg.connect(o.frequency);
          lp.type = 'lowpass'; lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(kind === 'bike' ? 1500 : 700, mid); lp.frequency.linearRampToValueAtTime(240, t + d);
          eg.gain.value = kind === 'bike' ? 0.22 : 0.3;
          o.connect(lp); lp.connect(eg); eg.connect(out);
          o.start(t); vib.start(t); o.stop(t + d + 0.1); vib.stop(t + d + 0.1);
        }
        function horn(t) {
          // a short car or tuk-tuk horn somewhere down the street
          var two = Math.random() < 0.5, base = pick([392, 440, 466, 523]);
          for (var i = 0; i < (two ? 2 : 1); i++) {
            var tt = t + i * 0.22, dur = two ? 0.14 : rnd(0.25, 0.5);
            [1, 1.26].forEach(function (m) {
              var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), hg = ctx.createGain();
              o.type = 'square'; o.frequency.value = base * m;
              f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.5;
              hg.gain.setValueAtTime(0.0001, tt); hg.gain.linearRampToValueAtTime(0.03, tt + 0.02); hg.gain.setValueAtTime(0.03, tt + dur - 0.03); hg.gain.linearRampToValueAtTime(0.0001, tt + dur);
              o.connect(f); f.connect(hg); hg.connect(g); hg.connect(revSend); o.start(tt); o.stop(tt + dur + 0.05);
            });
          }
        }
        return { nodes: [bed.src, far.src, l1, l2], tick: function (now) {
          if (now >= nextCar) {
            var r = Math.random(), kind = r < 0.55 ? 'car' : r < 0.9 ? 'bike' : 'bus';
            pass(now + 0.05, kind);
            nextCar = now + (Math.random() < 0.25 ? rnd(0.6, 1.4) : rnd(2.2, 6.5));
          }
          if (now >= nextHorn) { horn(now + 0.05); nextHorn = now + rnd(14, 34); }
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
