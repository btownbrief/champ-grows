/* Champ Grows — WebAudio synth sfx + a light lake-lullaby music loop. No audio files. */
(function () {
  'use strict';
  let ctx = null, master = null, sfxBus = null, musicBus = null, delayIn = null;
  const S = { sfx: true, music: true };
  let musicTimer = null, musicStep = 0, nextTime = 0, musicOn = false, suspendedByHidden = false;

  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28]; // major pentatonic climb
  const hz = (semi, base) => (base || 523.25) * Math.pow(2, semi / 12);

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = S.sfx ? 1 : 0; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = S.music ? 0.5 : 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      musicBus.connect(lp); lp.connect(master);
      // soft echo for the music
      delayIn = ctx.createGain();
      const d = ctx.createDelay(1.0); d.delayTime.value = 0.34;
      const fb = ctx.createGain(); fb.gain.value = 0.38;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 1400;
      delayIn.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(lp);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state !== 'running') { try { c.resume(); } catch (e) {} }
    return c;
  }

  // one oscillator note
  function tone(o) {
    const c = ctx; if (!c || !S.sfx) return;
    const t0 = c.currentTime + (o.at || 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const v = (o.vol == null ? 0.2 : o.vol), a = o.attack || 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  function noise(o) {
    const c = ctx; if (!c || !S.sfx) return;
    const t0 = c.currentTime + (o.at || 0), len = Math.max(0.05, o.dur);
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1800, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + len);
    f.Q.value = o.q || 0.9;
    const g = c.createGain(); g.gain.setValueAtTime(o.vol || 0.15, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t0);
  }

  const Snd = {
    state: S,
    unlock() { resume(); if (S.music && !musicOn) Snd.startMusic(); },
    setSfx(v) { S.sfx = !!v; if (sfxBus) sfxBus.gain.value = S.sfx ? 1 : 0; },
    setMusic(v) {
      S.music = !!v;
      if (musicBus) musicBus.gain.setTargetAtTime(S.music ? 0.5 : 0, ctx.currentTime, 0.05);
      if (S.music) Snd.startMusic(); else Snd.stopMusic();
    },
    // game sounds ---------------------------------------------------
    eat(streak) {
      if (!resume()) return;
      const i = Math.min(9, Math.max(0, streak - 1));
      const f = hz(SCALE[i]);
      tone({ f: f, to: f * 1.5, dur: 0.09, type: 'triangle', vol: 0.26 });
      tone({ f: f * 2, dur: 0.16, type: 'sine', vol: 0.14, at: 0.05 });
      noise({ f: 2600, to: 900, dur: 0.12, vol: 0.12 });
    },
    perch() {
      if (!resume()) return;
      [0, 4, 7, 12, 16].forEach((s, k) => tone({ f: hz(s, 659.25), dur: 0.22, type: 'triangle', vol: 0.2, at: k * 0.065 }));
      noise({ f: 3800, to: 1200, dur: 0.3, vol: 0.12 });
    },
    perchSpawn() { if (!resume()) return; tone({ f: 988, dur: 0.14, vol: 0.12, type: 'sine' }); tone({ f: 1318, dur: 0.22, vol: 0.12, type: 'sine', at: 0.1 }); },
    perchGone() { if (!resume()) return; tone({ f: 600, to: 300, dur: 0.25, vol: 0.1, type: 'sine' }); },
    turn() { if (!resume()) return; tone({ f: 760, to: 520, dur: 0.035, vol: 0.05, type: 'sine' }); },
    portal() {
      if (!resume()) return;
      tone({ f: 220, to: 880, dur: 0.28, type: 'sine', vol: 0.18 });
      noise({ f: 600, to: 3000, dur: 0.3, vol: 0.12, q: 2 });
    },
    rockWarn() { if (!resume()) return; tone({ f: 330, to: 300, dur: 0.1, type: 'square', vol: 0.04 }); },
    rock() {
      if (!resume()) return;
      tone({ f: 150, to: 55, dur: 0.22, type: 'sine', vol: 0.38 });
      noise({ f: 700, to: 200, dur: 0.18, vol: 0.2, ftype: 'lowpass' });
    },
    horn() {
      if (!resume()) return;
      tone({ f: 196, dur: 0.38, type: 'sawtooth', vol: 0.07, attack: 0.04 });
      tone({ f: 247, dur: 0.38, type: 'sawtooth', vol: 0.05, attack: 0.04 });
    },
    die() {
      if (!resume()) return;
      tone({ f: 420, to: 70, dur: 0.7, type: 'sawtooth', vol: 0.22 });
      tone({ f: 200, to: 50, dur: 0.8, type: 'sine', vol: 0.3 });
      noise({ f: 1200, to: 150, dur: 0.6, vol: 0.2 });
    },
    bonk() { if (!resume()) return; tone({ f: 140, to: 60, dur: 0.2, type: 'sine', vol: 0.4 }); noise({ f: 500, dur: 0.14, vol: 0.2 }); },
    click() { if (!resume()) return; tone({ f: 640, to: 900, dur: 0.07, type: 'triangle', vol: 0.16 }); },
    back() { if (!resume()) return; tone({ f: 700, to: 480, dur: 0.08, type: 'triangle', vol: 0.14 }); },
    go() { if (!resume()) return; tone({ f: hz(0), dur: 0.1, vol: 0.18 }); tone({ f: hz(7), dur: 0.16, vol: 0.18, at: 0.08 }); },
    tick(k) { if (!resume()) return; tone({ f: 700 + 700 * Math.min(1.4, k || 0), dur: 0.035, type: 'square', vol: 0.035 }); },
    milestone() { if (!resume()) return; [0, 4, 7, 12].forEach((s, k) => tone({ f: hz(s, 587.33), dur: 0.16, type: 'triangle', vol: 0.15, at: k * 0.06 })); },
    medal(k) { if (!resume()) return; const base = [392, 494, 587.33][k] || 440; [0, 4, 7, 12, 16].forEach((st, i) => tone({ f: hz(st, base), dur: 0.26, type: i % 2 ? 'sine' : 'triangle', vol: 0.17, at: i * 0.07 })); noise({ f: 5000, to: 2500, dur: 0.35, vol: 0.06 }); },
    worry() { if (!resume()) return; tone({ f: 980, to: 1180, dur: 0.06, type: 'sine', vol: 0.05 }); },
    locked() { if (!resume()) return; tone({ f: 200, dur: 0.12, type: 'square', vol: 0.08 }); tone({ f: 160, dur: 0.16, type: 'square', vol: 0.08, at: 0.1 }); },
    best() {
      if (!resume()) return;
      [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, k) => tone({ f: hz(s, 523.25), dur: 0.2, type: 'triangle', vol: 0.2, at: k * 0.09 }));
    },
    unlockMode() {
      if (!resume()) return;
      [0, 7, 12, 19, 24].forEach((s, k) => tone({ f: hz(s, 440), dur: 0.3, type: 'sine', vol: 0.18, at: k * 0.08 }));
    },
    // music ---------------------------------------------------------
    startMusic() {
      if (!ensure() || musicOn || !S.music) return;
      musicOn = true; musicStep = 0; nextTime = ctx.currentTime + 0.1;
      musicTimer = setInterval(sched, 90);
    },
    stopMusic() { musicOn = false; if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } },
    setMusicDuck(d) { if (musicBus && S.music) musicBus.gain.setTargetAtTime(0.5 * d, ctx.currentTime, 0.15); },
    suspend() { if (ctx && ctx.state === 'running') { suspendedByHidden = true; try { ctx.suspend(); } catch (e) {} } },
    resumeFromHidden() { if (ctx && suspendedByHidden) { suspendedByHidden = false; try { ctx.resume(); } catch (e) {} } }
  };

  // ---------------------------------------------------------------- music
  // A small arranger: each theme has a key, scale, 4-chord loop and an 8-bar melody (2 x 4 bars).
  // Layers: 0 = pad + bass + arp, 1 = + percussion, 2 = + bells/counter-melody. The game raises the layer as Champ grows.
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
  const _ = null;
  const THEMES = {
    // Lake Day (Classic): C major, easy-going
    classic: { key: 60, sc: MAJ, bpm: 92, chords: [0, 5, 3, 4], kick: [0, 4], lead: 'tri', echo: 0.32,
      mel: [4, _, 2, 4, 5, _, 4, 2,  0, _, 2, _, 5, 4, 2, _,  3, _, 5, 7, 5, _, 3, 2,  1, _, 4, _, 6, 5, 4, _,
            4, _, 2, 4, 5, _, 7, 5,  7, _, 9, _, 7, 5, 4, _,  3, 4, 5, _, 7, _, 8, 7,  4, _, 2, _, 0, _, _, _] },
    // Morning School: D major, bouncy
    school: { key: 62, sc: MAJ, bpm: 104, chords: [0, 5, 3, 4], kick: [0, 3, 4, 6], lead: 'sq', echo: 0.22,
      mel: [0, 2, 4, _, 4, 2, 4, 7,  5, _, 4, 2, _, 4, 2, _,  3, 4, 5, _, 7, 5, 4, 3,  4, _, _, 1, 2, _, 4, _,
            7, _, 7, 5, 4, _, 2, 4,  5, 4, 2, _, 0, _, 2, _,  3, _, 5, _, 7, 8, 7, 5,  4, 2, 1, _, 0, _, _, _] },
    // Dusk Swirl (Whirlpools): A minor, dreamy, sparse, long echo
    whirl: { key: 57, sc: MIN, bpm: 80, chords: [0, 5, 3, 4], kick: [0], lead: 'sine', echo: 0.5,
      mel: [4, _, _, 2, _, _, 0, _,  2, _, _, 0, _, _, -2, _,  3, _, 2, _, 3, 5, _, _,  4, _, _, _, 1, _, _, _,
            7, _, _, 6, _, 4, _, _,  5, _, _, 4, _, 2, _, _,  3, _, 4, _, 5, _, 6, _,  4, _, _, _, _, _, _, _] },
    // Breakwater: E minor, heavier, steady kick
    break: { key: 52, sc: MIN, bpm: 96, chords: [0, 5, 2, 6], kick: [0, 2, 4, 6], lead: 'saw', echo: 0.25,
      mel: [0, _, 0, 2, _, 4, _, 2,  -2, _, -2, 0, _, 2, _, 4,  2, _, 2, 4, _, 6, _, 4,  1, _, 3, _, 4, _, 3, 1,
            7, _, 6, 4, _, 2, _, 4,  5, _, 4, 2, _, 0, _, _,  4, _, 6, _, 7, _, 9, 7,  8, _, 7, _, 4, _, _, _] },
    // Rush Hour (Lake Traffic): F major, driving
    traffic: { key: 65, sc: MAJ, bpm: 112, chords: [0, 5, 3, 4], kick: [0, 2, 4, 6], lead: 'sq', echo: 0.18, drive: true,
      mel: [4, 4, _, 2, 4, _, 5, 4,  2, _, 0, _, 2, 4, 2, _,  3, 3, _, 5, 7, _, 5, 3,  4, _, 4, 6, _, 7, _, _,
            7, 7, _, 5, 7, _, 9, 7,  5, _, 4, _, 2, 4, 5, _,  6, _, 5, 4, _, 2, _, 4,  4, _, 2, _, 0, _, _, _] },
    // Daily Lake: G major, bright and hopeful
    daily: { key: 55, sc: MAJ, bpm: 96, chords: [0, 5, 3, 4], kick: [0, 4], lead: 'tri', echo: 0.36,
      mel: [4, _, 6, _, 7, _, 6, 4,  2, _, 4, _, 6, _, 4, _,  3, _, 5, _, 7, _, 9, _,  8, _, 7, 6, 4, _, _, _,
            7, _, 9, _, 11, _, 9, 7,  6, _, 4, _, 2, _, 4, _,  5, _, 7, _, 9, _, 8, 7,  7, _, _, _, _, _, _, _] }
  };
  THEMES.title = Object.assign({}, THEMES.classic, { bpm: 84, title: true });
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const deg = (th, d) => th.key + th.sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
  let theme = THEMES.title, nextTheme = null, layer = 0;
  Snd.setTheme = (id) => { const t = THEMES[id] || THEMES.classic; if (t !== theme) nextTheme = t; };
  Snd.setLayer = (n) => { layer = n; };
  function sched() {
    if (!ctx || !musicOn) return;
    while (nextTime < ctx.currentTime + 0.35) {
      const step = musicStep % 64;                 // 8 bars x 8 eighths
      if (step === 0 && nextTheme) { theme = nextTheme; nextTheme = null; musicStep = 0; }
      // 24-bar form: A, then B (melody a third higher), then a breakdown (bells answer the melody)
      const part = Math.floor(musicStep / 64) % 3;
      const th = theme, E = 60 / th.bpm / 2, t = nextTime;
      const bar = Math.floor(step / 8), inBar = step % 8;
      const root = th.chords[bar % 4], triad = [root, root + 2, root + 4];
      // pad on each bar
      if (inBar === 0) pad(triad.map((d) => deg(th, d)), t, E * 8);
      // bass: root on 1 and 3 (driving themes: every eighth, octave bounce)
      if (th.drive && !th.title) bass(midi(deg(th, root) - 24 + (inBar % 2 ? 12 : 0)), t, 0.05, E * 0.9);
      else if (inBar === 0 || inBar === 4) bass(midi(deg(th, root) - 24), t, 0.075, E * 3.5);
      else if (inBar === 6 && !th.title) bass(midi(deg(th, root + 4) - 24), t, 0.05, E * 1.5);
      // arpeggio plucks
      if (inBar % 2 === 0 || inBar === 3) pluck(midi(deg(th, triad[[0, 2, 1, 2, 0, 1, 2, 1][inBar]]) + 12), t, 0.032, 0.4, 'triangle');
      // melody (title: only every other phrase, softer)
      const m = th.mel[step];
      if (m != null && (!th.title || bar < 4)) {
        if (part === 0 || th.title) lead(midi(deg(th, m) + 12), t, th.title ? 0.035 : 0.05, E * 1.7, th.lead, th.echo);
        else if (part === 1) lead(midi(deg(th, m + 2) + 12), t, 0.048, E * 1.7, th.lead, th.echo);
        else if (bar >= 4) lead(midi(deg(th, m) + 24), t, 0.03, E * 2.2, 'sine', th.echo + 0.15);
        else if (inBar % 2 === 0) pluck(midi(deg(th, m) + 24), t, 0.03, 0.7, 'sine', true);
      }
      // percussion layer
      if (layer >= 1 && !th.title) {
        if (th.kick.indexOf(inBar) >= 0) kick(t);
        if (inBar % 2 === 1) hat(t, 0.03);
        if (inBar === 4) snare(t);
      }
      // bells / counter-melody layer
      if ((layer >= 2 || (part === 2 && layer >= 1)) && !th.title && (inBar === 2 || inBar === 6)) pluck(midi(deg(th, triad[inBar === 2 ? 2 : 1]) + 24), t, 0.026, 0.6, 'sine', true);
      nextTime += E; musicStep++;
    }
  }
  function env(g, t, v, a, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function pluck(f, t, v, dur, type, echo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'triangle'; o.frequency.value = f; env(g, t, v, 0.008, dur || 0.5);
    o.connect(g); g.connect(musicBus); if (echo) g.connect(delayIn);
    o.start(t); o.stop(t + (dur || 0.5) + 0.05);
  }
  const LEADS = { tri: 'triangle', sq: 'square', saw: 'sawtooth', sine: 'sine' };
  function lead(f, t, v, dur, kind, echo) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = LEADS[kind] || 'triangle'; o.frequency.value = f;
    // a touch of vibrato on long notes
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.004; vib.connect(vg); vg.connect(o.frequency);
    lp.type = 'lowpass'; lp.frequency.value = kind === 'sq' || kind === 'saw' ? 1700 : 3200;
    const vol = kind === 'sq' || kind === 'saw' ? v * 0.55 : v;
    env(g, t, vol, 0.015, dur);
    o.connect(lp); lp.connect(g); g.connect(musicBus);
    const eg = ctx.createGain(); eg.gain.value = echo || 0.3; g.connect(eg); eg.connect(delayIn);
    o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
  }
  function bass(f, t, v, dur) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 600;
    env(g, t, v, 0.01, dur); o.connect(lp); lp.connect(g); g.connect(musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  function pad(notes, t, len) {
    notes.forEach((m) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = midi(m);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 0.4); g.gain.linearRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + len + 0.05);
    });
  }
  let noiseBuf = null;
  function nbuf() { if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
  function hat(t, v) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nbuf(); f.type = 'highpass'; f.frequency.value = 7000; env(g, t, v, 0.002, 0.05);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random() * 0.2, 0.06);
  }
  function snare(t) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = nbuf(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.7; env(g, t, 0.05, 0.003, 0.14);
    s.connect(f); f.connect(g); g.connect(musicBus); s.start(t, Math.random() * 0.1, 0.16);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env(g, t, 0.16, 0.004, 0.18); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.22);
  }

  window.Snd = Snd;
})();
