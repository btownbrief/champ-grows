/* Champ Grows — a snake game on Lake Champlain.
   Grid logic underneath; Champ is drawn as one smooth serpent gliding between cells.
   Tick model: at each tick the head commits to its next cell and then glides there over `step` ms.
   Effects of eating fire when the head visually arrives (~85% through the glide). */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const cv = $('c'), ctx = cv.getContext('2d');

  // ------------------------------------------------------------------ config
  const SPEEDS = {
    // step = base * (floor + (1 - floor) * exp(-eaten / k)): keeps tightening for the whole run, no hard knee
    chill:  { name: 'Chill',  base: 180, floor: 0.70, k: 30, boat: 0.8, perch: 10 },
    normal: { name: 'Normal', base: 140, floor: 0.62, k: 28, boat: 1.0, perch: 8 },
    fast:   { name: 'Fast',   base: 106, floor: 0.66, k: 26, boat: 1.2, perch: 7 }
  };
  const MODES = [
    { id: 'classic', name: 'Classic',        unlock: 0,   blurb: "Eat fish. Grow long. Don't tangle." },
    { id: 'daily',   name: 'Daily Lake',     unlock: 0,   blurb: '' },
    { id: 'school',  name: 'School of Fish', unlock: 150, fish: 30,  blurb: 'Morning on the lake: a whole school at once. Chain big streaks.' },
    { id: 'whirl',   name: 'Whirlpools',     unlock: 350, fish: 90,  blurb: 'Dusk: dive into one whirlpool, pop out of its twin.' },
    { id: 'break',   name: 'Breakwater',     unlock: 600, fish: 180, blurb: 'Stormy: every meal drops a boulder. Plan your lane.' },
    { id: 'traffic', name: 'Lake Traffic',   unlock: 900, fish: 300, blurb: 'Summer rush: sailboats and paddleboards cross the lake.' }
  ];
  const MODE_MOOD = { classic: 'day', school: 'morning', whirl: 'dusk', break: 'storm', traffic: 'summer' };
  const MODE_THEME = { classic: 'classic', school: 'school', whirl: 'whirl', break: 'break', traffic: 'traffic' };
  // Daily Lake medal targets per twist (always Normal speed)
  // Targets tuned to measured play (2026-11-15 review): Silver about 1.2x a decent player's median run,
  // Gold about 1.25x their best run in 30. Daily lakes have islands, so ~0.85x of the Normal targets.
  const MEDALS = { classic: [770, 2210, 3740], school: [430, 1360, 2470], whirl: [680, 1870, 3660], break: [550, 1620, 3320], traffic: [510, 1530, 2720], golden: [900, 2600, 4300] };
  const MEDAL_NAMES = ['Bronze', 'Silver', 'Gold'];
  const STREAK_CAP = 10; // the streak bonus stops growing here
  // The game-over card comes in about 0.63 s after the hit (0.11 s hit-freeze + this); a tap skips the wait.
  const OVER_AT = 0.52;
  // Per-mode medals (a mastery ladder in every mode); scaled by speed
  const MODE_MEDALS = { classic: [900, 2600, 4400], school: [500, 1600, 2900], whirl: [800, 2200, 4300], break: [650, 1900, 3900], traffic: [600, 1800, 3200] };
  const SPEED_K = { chill: 0.8, normal: 1, fast: 1.3 };
  const modeTargets = (mode, speed) => (MODE_MEDALS[mode] || MODE_MEDALS.classic).map((v) => Math.round(v * (SPEED_K[speed] || 1) / 10) * 10);
  const modeMedal = (score, mode, speed) => { const t = modeTargets(mode, speed); return score >= t[2] ? 2 : score >= t[1] ? 1 : score >= t[0] ? 0 : -1; };
  // Champ grows: looks unlocked by playing
  const SKIN_ORDER = ['lake', 'maple', 'ice', 'sunset', 'night', 'gold'];
  const SKIN_GOAL = {
    lake:   { txt: 'Starter look', have: () => 1, need: 1 },
    maple:  { txt: 'Medals on 3 Daily Lakes', have: () => medalDays(), need: 3 },
    ice:    { txt: 'Grow to length 25', have: () => save.maxLen || 0, need: 25 },
    sunset: { txt: 'Finish all tasks on 2 days', have: () => save.taskDays || 0, need: 2 },
    night:  { txt: 'Score 1500 in one run', have: () => maxBest(), need: 1500 },
    gold:   { txt: 'Gold on a Daily Lake', have: () => goldDays(), need: 1 }
  };
  const MODE_ICONS = {
    classic: '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="12" rx="7" ry="4.6" fill="#cfeaff" stroke="#07384a" stroke-width="1.5"/><path d="M17 12l5-4v8z" fill="#ff8a5b" stroke="#07384a" stroke-width="1.3" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.2" fill="#07384a"/></svg>',
    school:  '<svg viewBox="0 0 24 24"><g fill="#cfeaff" stroke="#07384a" stroke-width="1.1"><ellipse cx="9" cy="7" rx="4.4" ry="2.6"/><ellipse cx="14" cy="13" rx="4.4" ry="2.6"/><ellipse cx="8" cy="18" rx="4.4" ry="2.6"/></g><g fill="#ff8a5b"><path d="M13 7l3-2v4zM18 13l3-2v4zM12 18l3-2v4z"/></g></svg>',
    whirl:   '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"><circle cx="12" cy="12" r="10" fill="#0a3560"/><path d="M12 3a9 9 0 0 1 9 9M12 21a9 9 0 0 1-9-9" stroke="#bff6ff" stroke-width="2.4"/><path d="M12 7a5 5 0 0 1 5 5M12 17a5 5 0 0 1-5-5" stroke="#a56cff" stroke-width="2.4"/></svg>',
    break:   '<svg viewBox="0 0 24 24"><path d="M4 17l2-8 6-3 7 4 1 7-5 3H8z" fill="#98a5ab" stroke="#26343c" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 10l5-2 4 3" stroke="#d6dde0" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
    traffic: '<svg viewBox="0 0 24 24"><path d="M3 18h18l-3 3H6z" fill="#fff" stroke="#07384a" stroke-width="1.4" stroke-linejoin="round"/><path d="M11 3v14L4 17z" fill="#ffd24a" stroke="#07384a" stroke-width="1.3" stroke-linejoin="round"/><path d="M13 7v10h6z" fill="#fff" stroke="#07384a" stroke-width="1.3" stroke-linejoin="round"/></svg>'
  };
  MODE_ICONS.daily = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3" fill="#cfeaff" stroke="#07384a" stroke-width="1.5"/><path d="M3 9.5h18" stroke="#07384a" stroke-width="1.5"/><rect x="3.75" y="5.75" width="16.5" height="3.2" rx="2" fill="#ff8a5b"/><path d="M7 3.5v3M17 3.5v3" stroke="#07384a" stroke-width="1.8" stroke-linecap="round"/><path d="M6 16c1.5-1.6 3-1.6 4 0s3 1.6 4 0 3-1.6 4 0" fill="none" stroke="#1b7aa8" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="12.6" r="1.4" fill="#98a5ab"/><circle cx="15.5" cy="12.4" r="1.1" fill="#98a5ab"/></svg>';
  const TWIST = { classic: 'islands', school: 'islands + a school of fish', whirl: 'islands + whirlpools', break: 'islands + falling boulders', traffic: 'islands + boat traffic', golden: 'islands + golden hour (lots of perch)' };
  const TWIST_BANNER = { classic: 'ISLANDS', school: 'SCHOOL OF FISH', whirl: 'WHIRLPOOLS', break: 'FALLING BOULDERS', traffic: 'BOAT TRAFFIC', golden: 'GOLDEN HOUR' };
  const ICON_SPEAKER = '<svg viewBox="0 0 24 24" fill="#effbff" stroke="none"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="#effbff" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_MUSIC = '<svg viewBox="0 0 24 24" fill="#effbff" stroke="none"><path d="M9 17.5V6l10-2v11.5" fill="none" stroke="#effbff" stroke-width="2" stroke-linejoin="round"/><ellipse cx="6.5" cy="17.5" rx="3" ry="2.4"/><ellipse cx="16.5" cy="15.5" rx="3" ry="2.4"/></svg>';

  const TIPS = { school: 'Chain the school!', whirl: 'Dive in a whirlpool!', break: 'Rings drop boulders', traffic: 'Dodge the boats!' };
  const DEATH = {
    wall:  { t: 'Beached!',   m: ["That's the shore, friend.", 'Champ smooched the sand.', 'Even Champ cannot swim on land.'] },
    self:  { t: 'Tangled!',   m: ['Champ tied himself in a knot.', "Don't bite your own tail!", 'Too many coils, not enough lake.'] },
    isle:  { t: 'Aground!',  m: ['Champ found an island the hard way.', 'Islands do not move. Champ does.', 'Nice island. Ouch.'] },
    rock:  { t: 'Bonk!',      m: ['Breakwater 1, Champ 0.', 'That boulder was there first.', 'Rocks always win.'] },
    boat:  { t: 'Boat bonk!', m: ['Right into a sailboat.', 'Rush hour on the lake.', 'Watch out for paddleboards!'] }
  };

  // ------------------------------------------------------------------ save
  const SAVE_KEY = 'champgrows.v1';
  let save = { best: {}, sfx: true, music: true, speed: 'normal', mode: 'classic', plays: 0, fish: 0, seen: {}, skin: 'lake', dlog: {}, maxLen: 0 };
  function loadSave() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) {}
    if (!SPEEDS[save.speed]) save.speed = 'normal';
    if (!MODES.some((m) => m.id === save.mode)) save.mode = 'classic';
    if (!save.dlog || typeof save.dlog !== 'object') save.dlog = {};
    // one-time: saves from before fish-based unlocks keep the modes they had already opened by score
    if (!save.mig2) { const lb = legacyBest(); save.legacy = MODES.filter((m) => m.fish && lb >= m.unlock).map((m) => m.id); save.mig2 = 1; writeSave(); }
    if (!Art.SKINS[save.skin]) save.skin = 'lake';
  }
  function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  const bestKey = (mode, speed) => mode + '.' + speed;
  const getBest = (mode, speed) => save.best[bestKey(mode, speed)] || 0;
  function maxBest() { let m = 0; for (const k in save.best) m = Math.max(m, save.best[k] || 0); return m; }
  function legacyBest() { let m = 0; for (const k in save.best) if (k.indexOf('school.') !== 0) m = Math.max(m, save.best[k] || 0); return m; }
  const isUnlocked = (m) => !m.fish || (save.fish || 0) >= m.fish || (save.legacy || []).indexOf(m.id) >= 0 || (window.__unlockAll === true);
  const unlockedIds = () => MODES.filter((m) => isUnlocked(m)).map((m) => m.id);
  function medalOf(score, twist) { const t = MEDALS[twist] || MEDALS.classic; return score >= t[2] ? 2 : score >= t[1] ? 1 : score >= t[0] ? 0 : -1; }
  function medalDays() { let n = 0; for (const k in save.dlog) if (save.dlog[k].m >= 0) n++; return n; }
  function goldDays() { let n = 0; for (const k in save.dlog) if (save.dlog[k].m >= 2) n++; return n; }
  const skinUnlocked = (id) => window.__unlockAll === true || SKIN_GOAL[id].have() >= SKIN_GOAL[id].need;

  // ---- Daily Lake: one seeded lake per calendar day (islands + a twist), with a day streak
  const fmtDay = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function shiftKey(key, off) { const p = key.split('-').map(Number); return fmtDay(new Date(p[0], p[1] - 1, p[2] + off)); }
  function dayKey(off) { const k = window.__dayKey || fmtDay(new Date()); return off ? shiftKey(k, off) : k; }
  function dailyInfo() {
    const key = dayKey(); let h = 2166136261;
    for (const ch of 'champ:' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const seed = h >>> 0, r = Art.mulberry(seed);
    const twist = ['classic', 'school', 'whirl', 'golden', 'break', 'traffic'][Math.floor(r() * 6)];
    return { key, seed, twist, mood: ['golden', 'morning', 'dusk', 'day', 'summer'][Math.floor(r() * 5)] };
  }
  function getDaily() {
    const key = dayKey();
    const d = save.daily = Object.assign({ day: '', best: 0, streak: 0, last: '' }, save.daily || {});
    if (d.day !== key) { d.day = key; d.best = 0; d.plays = 0; }
    return d;
  }
  function dailyStreak() { const d = getDaily(); return (d.last === dayKey() || d.last === dayKey(-1)) ? d.streak : 0; }

  // ---- Daily tasks: three small goals a day, seeded by date, progress carries across runs that day
  const TASKS = {
    fishRun: { t: (n) => 'Eat ' + n + ' fish in one run', n: [12, 18, 24] },
    streak:  { t: (n) => 'Reach a x' + n + ' streak', n: [5, 7, 9] },
    len:     { t: (n) => 'Grow to length ' + n, n: [16, 22, 28] },
    perch:   { t: (n) => 'Catch ' + n + ' golden perch today', n: [2, 3, 4], day: true },
    fishDay: { t: (n) => 'Eat ' + n + ' fish today', n: [40, 60, 80], day: true },
    score:   { t: (n) => 'Score ' + n + ' in one run', n: [500, 900, 1400] },
    daily:   { t: () => "Swim today's Daily Lake", n: [1], day: true },
    modes:   { t: (n) => 'Play ' + n + ' different modes today', n: [2, 3], day: true, need: 2 }
  };
  function getTasks() {
    const key = dayKey();
    let T0 = save.tasks;
    if (!T0 || T0.day !== key) {
      let h = 2166136261; for (const ch of 'tasks:' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      const r = Art.mulberry(h >>> 0), ids = Object.keys(TASKS).filter((id) => !TASKS[id].need || unlockedIds().length >= TASKS[id].need + 1), picks = [];
      while (picks.length < 3 && ids.length) { const id = ids.splice(Math.floor(r() * ids.length), 1)[0], ns = TASKS[id].n; picks.push({ id, n: ns[Math.floor(r() * ns.length)] }); }
      T0 = save.tasks = { day: key, picks, prog: {}, done: [false, false, false], modes: [] };
    }
    return T0;
  }
  const taskText = (p) => TASKS[p.id].t(p.n);
  // called with this run's numbers; returns tasks newly completed
  function progressTasks(run) {
    const T0 = getTasks(), got = [];
    T0.picks.forEach((p, i) => {
      if (T0.done[i]) return;
      const def = TASKS[p.id]; let v = T0.prog[p.id] || 0;
      if (p.id === 'fishRun') v = Math.max(v, run.eaten);
      else if (p.id === 'streak') v = Math.max(v, run.streak);
      else if (p.id === 'len') v = Math.max(v, run.len);
      else if (p.id === 'score') v = Math.max(v, run.score);
      else if (p.id === 'perch') v = (T0.base_perch || 0) + run.perch;
      else if (p.id === 'fishDay') v = (T0.base_fish || 0) + run.eaten;
      else if (p.id === 'daily') v = T0.dailyPlayed ? 1 : 0;
      else if (p.id === 'modes') v = T0.modes.length;
      T0.prog[p.id] = Math.min(v, p.n); void def;
      if (v >= p.n) { T0.done[i] = true; got.push(p); }
    });
    if (got.length && T0.done.every(Boolean) && !T0.star) { T0.star = 1; save.taskDays = (save.taskDays || 0) + 1; }
    return got;
  }
  // fold this run's cumulative numbers into the day's base at the end of a run
  function bankTasks(run) { const T0 = getTasks(); T0.base_perch = (T0.base_perch || 0) + run.perch; T0.base_fish = (T0.base_fish || 0) + run.eaten; }

  // ------------------------------------------------------------------ rng
  let rs = (Date.now() ^ 0x9e3779b9) >>> 0;
  function rand() { rs |= 0; rs = rs + 0x6D2B79F5 | 0; let t = Math.imul(rs ^ rs >>> 15, 1 | rs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  const rr = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // ------------------------------------------------------------------ layout
  const L = { W: 0, H: 0, dpr: 1, cell: 30, cols: 0, rows: 0, gx: 0, gy: 0, gw: 0, gh: 0, topH: 0, orient: '', lake: null, shore: null, gridLayer: null };
  function insets() {
    const cs = getComputedStyle($('probe'));
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  function layout(opts) {
    opts = opts || {};
    const W = Math.max(window.innerWidth, 200), H = Math.max(window.innerHeight, 200), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ins = insets();
    const hudH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hudH')) || 56;
    const ax0 = ins.l, ax1 = W - ins.r, ay0 = ins.t + hudH, ay1 = H - Math.max(ins.b, 6);
    const aw = ax1 - ax0, ah = ay1 - ay0, short = Math.min(aw, ah);
    let cols = L.cols, rows = L.rows;
    if (opts.newGrid || !cols) {
      const c0 = clamp(short / 13.2, 26, 46);
      cols = clamp(Math.floor(aw / c0 - 0.9), 8, 26); rows = clamp(Math.floor(ah / c0 - 0.9), 8, 30);
    }
    const cell = Math.min(aw / (cols + 0.9), ah / (rows + 0.9));
    L.W = W; L.H = H; L.dpr = dpr; L.cols = cols; L.rows = rows; L.cell = cell;
    L.gw = cols * cell; L.gh = rows * cell;
    L.gx = ax0 + (aw - L.gw) / 2; L.gy = ay0 + (ah - L.gh) / 2; L.topH = ay0;
    L.orient = W >= H ? 'land' : 'port';
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    L.lake = Art.lakePath(L, 11 + cols * 7 + rows);
    L.shore = Art.buildShore(L);
    L.gridLayer = Art.buildGridLayer(L);
  }
  let layoutSize = { w: 0, h: 0, o: '' }, resizeTimer = 0, pendingLayout = false;
  const midSwim = () => G && !G.demo && (G.state === 'play' || G.state === 'ready' || G.state === 'dying');
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth, h = window.innerHeight, o = w >= h ? 'land' : 'port';
      if (w === layoutSize.w && h === layoutSize.h) return;
      const flip = o !== layoutSize.o, broken = layoutSize.w < 100;
      // Mid-swim, small height-only changes (Safari's toolbar) wait for the next pause so nothing jumps under the finger.
      if (!flip && !broken && w === layoutSize.w && Math.abs(h - layoutSize.h) < 120 && midSwim()) { pendingLayout = true; return; }
      layoutSize = { w, h, o, ang: layoutSize.ang || 0 };
      // Rotating mid-run keeps the same board, refitted to the new screen, and pauses so the player can re-orient.
      if (flip && G && !G.demo) {
        // Turn the board with the phone: same run, now shaped for the new screen
        const ang = curAng(), d = (((ang - (layoutSize.ang || 0)) % 360) + 360) % 360;
        rotateBoard(d === 90 ? -1 : 1); layoutSize.ang = ang;
        L.cols = G.cols; L.rows = G.rows;
        if (midSwim() && G.state !== 'dying') pauseGame();
      }
      if (broken || (flip && G && G.demo)) { layout({ newGrid: true }); if (G && G.demo) startDemo(); }
      else layout({});
      pendingLayout = false;
    }, 120);
  }
  const curAng = () => (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
  // Rotate every grid thing by 90 degrees. sign +1 = clockwise on screen, -1 = counter-clockwise.
  function rotateBoard(sign) {
    const g = G, C = g.cols, R = g.rows;
    const P = sign > 0 ? (o) => { const x = o.x; o.x = R - 1 - o.y; o.y = x; } : (o) => { const x = o.x; o.x = o.y; o.y = C - 1 - x; };
    const V = sign > 0 ? (d) => ({ x: -d.y, y: d.x }) : (d) => ({ x: d.y, y: -d.x });
    g.snake.forEach(P); if (g.prevTail) P(g.prevTail);
    g.foods.forEach((f) => { P(f); if (f.px != null) { const q = { x: f.px, y: f.py }; P(q); f.px = q.x; f.py = q.y; } if (f.dir) { const v = V({ x: f.dir[0], y: f.dir[1] }); f.dir = [v.x, v.y]; } });
    g.eating.forEach((e) => P(e.f)); g.rocks.forEach(P); g.pend.forEach(P); g.sinking.forEach(P);
    if (g.portals) g.portals.forEach(P);
    const rotLane = (b) => {
      if (sign > 0) { if (b.axis === 'h') { b.axis = 'v'; b.lane = R - 1 - b.lane; } else { b.axis = 'h'; if (b.pos != null) b.pos = R - b.pos; b.dir = -b.dir; } }
      else { if (b.axis === 'h') { b.axis = 'v'; if (b.pos != null) b.pos = C - b.pos; b.dir = -b.dir; } else { b.axis = 'h'; b.lane = C - 1 - b.lane; } }
    };
    g.boats.forEach(rotLane); g.warns.forEach(rotLane);
    g.dir = V(g.dir); g.queue = g.queue.map(V); if (g.cue) { const v = V(g.cue); g.cue.x = v.x; g.cue.y = v.y; }
    g.headAng += sign * Math.PI / 2; g.rewOff = null; g.ripples = []; g.parts = []; g.pops = [];
    g.cols = R; g.rows = C;
  }
  function applyPendingLayout() { if (!pendingLayout) return; pendingLayout = false; layoutSize = { w: window.innerWidth, h: window.innerHeight, o: window.innerWidth >= window.innerHeight ? 'land' : 'port', ang: curAng() }; layout({}); }

  // ------------------------------------------------------------------ run state
  let G = null;
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const opp = (a, b) => a.x === -b.x && a.y === -b.y;

  function newRun(mode, speed, opts) {
    opts = opts || {};
    let daily = null;
    if (mode === 'daily') { daily = dailyInfo(); mode = daily.twist === 'golden' ? 'classic' : daily.twist; speed = 'normal'; }
    layout({ newGrid: true });
    layoutSize = { w: window.innerWidth, h: window.innerHeight, o: L.orient, ang: curAng() };
    let cols = L.cols, rows = L.rows;
    if (opts.demo && L.orient === 'port') { // title demo stays in the open water above the control panel
      const pn = document.querySelector('.title-controls'), top = pn && pn.getBoundingClientRect().top;
      if (top > 0) { const mr = Math.floor((top - L.gy) / L.cell) - 1; if (mr >= 7) rows = Math.min(rows, mr); }
    }
    const horizontal = cols > rows;
    const dir = horizontal ? { x: 1, y: 0 } : { x: 0, y: -1 };
    const hx = horizontal ? Math.floor(cols * 0.4) : Math.floor(cols / 2), hy = horizontal ? Math.floor(rows / 2) : Math.floor(rows * 0.66);
    const snake = [];
    for (let i = 0; i < 4; i++) snake.push({ x: hx - dir.x * i, y: hy - dir.y * i, brk: false });
    const sp = SPEEDS[speed];
    G = {
      mode, speed, demo: !!opts.demo, bot: !!opts.bot, cols, rows,
      snake, prevTail: { x: snake[3].x, y: snake[3].y }, tailBrk: false,
      dir, queue: [], acc: 0, step: sp.base, grow: 0, tickN: 0, grace: null, tpDone: false, justTp: false,
      state: 'ready', readyT: 0.7, wait: !opts.demo && save.plays < 2,
      time: 0, score: 0, shown: 0, eaten: 0, streak: 0, bestStreak: 0, sinceEat: 999, streakWin: mode === 'school' ? 12 : 16,
      mood: daily ? daily.mood : (opts.demo ? 'day' : MODE_MOOD[mode] || 'day'), dayCycle: !daily && !opts.demo && mode === 'classic', dayIdx: 0, golden: !!(daily && daily.twist === 'golden'), lastEatT: -9, medal: -1,
      foods: [], eating: [], rocks: [], pend: [], sinking: [], portals: null, portalT: 0, boats: [], warns: [], boatT: 3,
      perchIn: daily && daily.twist === 'golden' ? rr(4, 6) : rr(10, 16), perchCount: 0,
      bulges: [], ripples: [], parts: [], pops: [], fx: [],
      mouth: 0, blinkAt: 1.5 + rand() * 2, headAng: Math.atan2(dir.y, dir.x), pulse: 0, look: { x: 1, y: 0 },
      shake: 0, freeze: 0, dead: 0, deadT: 0, deadCause: '', lunge: null, overShown: false, flash: 0,
      hintFish: !opts.demo && save.plays < 2, gentle: !opts.demo && save.plays < 2, rippleT: 0, newBestShown: false, prevBest: getBest(mode, speed),
      portalPulse: [-9, -9], daily
    };
    G.step = stepFor(G);
    if (daily) G.prevBest = getDaily().best;
    if (!opts.demo) { save.plays++; writeSave(); G.unl0 = unlockedIds(); G.skin0 = SKIN_ORDER.filter(skinUnlocked); G.fish0 = save.fish || 0; }
    placeFirstFood();
    if (daily) placeIslands(daily.seed);
    if (mode === 'school') { const n = schoolCount(); for (let i = 1; i < n; i++) spawnFood('fish'); }
    if (mode === 'whirl') placePortals();
    updateHud(true);
    return G;
  }
  const schoolCount = () => (G.cols * G.rows >= 200 ? 4 : 3);

  // ---- grid helpers
  function occ() {
    const g = G, o = new Uint8Array(g.cols * g.rows);
    g.snake.forEach((c) => { o[c.y * g.cols + c.x] = 1; });
    g.rocks.forEach((c) => { o[c.y * g.cols + c.x] = 2; });
    g.pend.forEach((c) => { o[c.y * g.cols + c.x] = 3; });
    if (g.portals) g.portals.forEach((c) => { o[c.y * g.cols + c.x] = 4; });
    g.foods.forEach((c) => { o[c.y * g.cols + c.x] = 5; });
    return o;
  }
  const inB = (x, y) => x >= 0 && y >= 0 && x < G.cols && y < G.rows;
  function flood(o, sx, sy, blockSnake) {
    const g = G, seen = new Uint8Array(g.cols * g.rows), q = [[sx, sy]]; let n = 0;
    if (!inB(sx, sy)) return { seen, n: 0 };
    seen[sy * g.cols + sx] = 1;
    while (q.length) {
      const [x, y] = q.pop(); n++;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + d[0], ny = y + d[1]; if (!inB(nx, ny)) continue;
        const i = ny * g.cols + nx; if (seen[i]) continue;
        const v = o[i]; if (v === 2 || v === 3 || v === 4 || (blockSnake && v === 1)) continue;
        seen[i] = 1; q.push([nx, ny]);
      }
    }
    return { seen, n };
  }
  function laneBlocked(x, y) {
    const g = G;
    for (const b of g.boats) { if (b.axis === 'h' ? Math.abs(y - b.lane) <= 1 : Math.abs(x - b.lane) <= 1) return true; }
    for (const w of g.warns) { if (w.axis === 'h' ? Math.abs(y - w.lane) <= 1 : Math.abs(x - w.lane) <= 1) return true; }
    return false;
  }

  function placeFirstFood() {
    const g = G, h = g.snake[0], d = g.dir, px = -d.y, py = d.x;
    const side = rand() < 0.5 ? -1 : 1;
    const dist = g.cols > g.rows ? 6 : 5;
    let x = h.x + d.x * dist + px * side * 3, y = h.y + d.y * dist + py * side * 3;
    if (!inB(x, y)) { x = h.x + d.x * dist - px * side * 3; y = h.y + d.y * dist - py * side * 3; }
    if (inB(x, y)) { g.foods.push(mkFood('fish', x, y)); g.hintDir = (x - h.x) * px + (y - h.y) * py > 0 ? (px || py) : -(px || py); g.hintSide = { x: Math.sign(x - h.x) * (d.y !== 0 ? 1 : 0) + 0, y: 0 }; }
    else spawnFood('fish');
  }
  function mkFood(type, x, y) {
    // golden perch timer: one second shorter once the run is past 30 fish, so the dash for it is a real call
    const life = type === 'perch' ? SPEEDS[G.speed].perch - (G.eaten >= 30 ? 1 : 0) : 0;
    return { type, x, y, born: G.time, ph: rand() * TAU, face: rand() < 0.5 ? -1 : 1, life, life0: life, pop: 0, seed: Math.floor(rand() * 999) };
  }

  function spawnFood(type) {
    const g = G, o = occ(), h = g.snake[0];
    const fl = flood(o, h.x, h.y, true);
    const cand = []; let tw = 0;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      const i = y * g.cols + x; if (o[i] !== 0) continue;
      if (!fl.seen[i]) continue;
      if (Math.abs(x - h.x) + Math.abs(y - h.y) < (type === 'perch' ? 4 : 3)) continue;
      if (g.pops.some((p) => p.cxl != null && Math.abs(p.cxl - x) <= 2 && Math.abs(p.cyl - y) <= 2)) continue;
      if (g.mode === 'traffic' && laneBlocked(x, y)) continue;
      const edge = x === 0 || y === 0 || x === g.cols - 1 || y === g.rows - 1;
      const w = edge ? 0.4 : 1; cand.push([x, y, w]); tw += w;
    }
    if (!cand.length) return null;
    let r = rand() * tw, c = cand[cand.length - 1];
    for (const k of cand) { r -= k[2]; if (r <= 0) { c = k; break; } }
    const f = mkFood(type, c[0], c[1]); g.foods.push(f); return f;
  }

  function placeIslands(seed) {
    const g = G, r = Art.mulberry(seed ^ 0x51ed), h = g.snake[0];
    const SHAPES = [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]], [[0, 0]]];
    const want = clamp(Math.round(g.cols * g.rows / 75), 3, 6);
    let placed = 0, n = 0;
    for (let t = 0; t < 120 && placed < want; t++) {
      const sh = SHAPES[Math.floor(r() * SHAPES.length)], u = r(), v = r(), sd = Math.floor(r() * 9999);
      const ox = 2 + Math.floor(u * (g.cols - 4)), oy = 2 + Math.floor(v * (g.rows - 4));
      const cells = sh.map(([a, b]) => ({ x: ox + a, y: oy + b }));
      if (cells.some((c) => c.x < 2 || c.y < 2 || c.x > g.cols - 3 || c.y > g.rows - 3)) continue;
      if (cells.some((c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) < 4)) continue;
      // keep the lane straight ahead of the start open
      if (cells.some((c) => g.dir.y !== 0 ? (Math.abs(c.x - h.x) <= 1 && (c.y - h.y) * g.dir.y > 0) : (Math.abs(c.y - h.y) <= 1 && (c.x - h.x) * g.dir.x > 0))) continue;
      if (cells.some((c) => g.snake.some((b) => b.x === c.x && b.y === c.y) || g.foods.some((f) => Math.abs(f.x - c.x) <= 1 && Math.abs(f.y - c.y) <= 1))) continue;
      if (cells.some((c) => g.rocks.some((k) => Math.abs(k.x - c.x) <= 2 && Math.abs(k.y - c.y) <= 2))) continue;
      cells.forEach((c, i) => g.rocks.push({ x: c.x, y: c.y, seed: sd + i * 31, born: 0.12 + (n++) * 0.05, isle: true }));
      placed++;
    }
  }

  function placePortals() {
    const g = G, o = occ(), h = g.snake[0], tries = 60;
    for (let t = 0; t < tries; t++) {
      const a = { x: 2 + Math.floor(rand() * (g.cols - 4)), y: 2 + Math.floor(rand() * (g.rows - 4)) };
      const b = { x: 2 + Math.floor(rand() * (g.cols - 4)), y: 2 + Math.floor(rand() * (g.rows - 4)) };
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < Math.max(7, Math.min(g.cols, g.rows) * 0.6)) continue;
      if (o[a.y * g.cols + a.x] || o[b.y * g.cols + b.x]) continue;
      if (Math.abs(a.x - h.x) + Math.abs(a.y - h.y) < 4 || Math.abs(b.x - h.x) + Math.abs(b.y - h.y) < 4) continue;
      g.portals = [a, b]; g.portalT = g.time; burst(cx(a.x), cy(a.y), 'swirl', 0); burst(cx(b.x), cy(b.y), 'swirl', 1);
      return true;
    }
    return false;
  }

  // ---- rocks (Breakwater)
  function placeRock() {
    const g = G, o = occ(), h = g.snake[0];
    for (let t = 0; t < 40; t++) {
      const x = 1 + Math.floor(rand() * (g.cols - 2)), y = 1 + Math.floor(rand() * (g.rows - 2));
      if (o[y * g.cols + x] !== 0) continue;
      if (Math.abs(x - h.x) + Math.abs(y - h.y) < 4) continue;
      // not directly in the lane ahead
      const fx = x - h.x, fy = y - h.y;
      if (g.dir.x !== 0 ? (fy === 0 && fx * g.dir.x > 0 && fx * g.dir.x < 7) : (fx === 0 && fy * g.dir.y > 0 && fy * g.dir.y < 7)) continue;
      // keep the lake connected
      const o2 = o.slice(); o2[y * g.cols + x] = 3;
      const fl = flood(o2, h.x, h.y, false);
      let free = 0; for (let i = 0; i < o2.length; i++) if (o2[i] !== 2 && o2[i] !== 3 && o2[i] !== 4) free++;
      if (fl.n < free * 0.93) continue;
      if (g.foods.some((f) => !fl.seen[f.y * g.cols + f.x])) continue;
      g.pend.push({ x, y, t0: g.time, seed: Math.floor(rand() * 9999) });
      Snd.rockWarn();
      return true;
    }
    return false;
  }

  // ---- boats (Lake Traffic)
  function planBoat() {
    const g = G, h = g.snake[0];
    const horizontal = rand() < (g.cols > g.rows ? 0.35 : 0.65);
    const axis = horizontal ? 'h' : 'v', n = horizontal ? g.rows : g.cols;
    for (let t = 0; t < 12; t++) {
      const lane = Math.floor(rand() * n);
      const head = horizontal ? h.y : h.x;
      if (Math.abs(lane - head) < 3) continue;
      if (g.boats.some((b) => b.axis === axis && Math.abs(b.lane - lane) < 3) || g.warns.some((b) => b.axis === axis && Math.abs(b.lane - lane) < 3)) continue;
      if (g.rocks.some((r) => r.isle && (horizontal ? r.y === lane : r.x === lane))) continue;
      const kind = rand() < 0.55 ? 'sail' : 'paddle', sp = SPEEDS[g.speed].boat;
      g.warns.push({
        axis, lane, dir: rand() < 0.5 ? 1 : -1, kind, t0: g.time,
        speed: (kind === 'sail' ? rr(2.7, 3.5) : rr(1.8, 2.3)) * sp * (1 + Math.min(0.25, g.eaten * 0.008)),
        len: kind === 'sail' ? 3 : 2.3, v: Math.floor(rand() * 3), sway: rand() < 0.5 ? 1 : -1
      });
      Snd.horn();
      return;
    }
  }
  function updateBoats(dt) {
    const g = G;
    g.boatT -= dt;
    const maxB = Math.min(3, 1 + Math.floor(g.eaten / 7));
    if (g.boatT <= 0) { if (g.boats.length + g.warns.length < maxB) planBoat(); g.boatT = rr(3.2, 5.4); }
    for (let i = g.warns.length - 1; i >= 0; i--) {
      const w = g.warns[i];
      if (g.time - w.t0 >= 1.5) {
        const N = w.axis === 'h' ? g.cols : g.rows;
        g.boats.push({ axis: w.axis, lane: w.lane, dir: w.dir, kind: w.kind, speed: w.speed, len: w.len, v: w.v, sway: w.sway, pos: w.dir > 0 ? -w.len / 2 - 0.4 : N + w.len / 2 + 0.4, wakeT: 0 });
        g.warns.splice(i, 1);
      }
    }
    for (let i = g.boats.length - 1; i >= 0; i--) {
      const b = g.boats[i], N = b.axis === 'h' ? g.cols : g.rows;
      b.pos += b.dir * b.speed * dt;
      b.wakeT -= dt;
      if (b.wakeT <= 0) { b.wakeT = 0.16; const p = boatPx(b); ripple(p.x - (b.axis === 'h' ? b.dir * b.len * 0.45 * L.cell : 0), p.y - (b.axis === 'v' ? b.dir * b.len * 0.45 * L.cell : 0), 1.0, 0.7, true); }
      if (b.pos < -b.len - 1 || b.pos > N + b.len + 1) g.boats.splice(i, 1);
    }
    // collision with the head (cell units)
    if (g.state === 'play' && g.boats.length) {
      const hp = headCellPos();
      for (const b of g.boats) {
        const bx = b.axis === 'h' ? b.pos : b.lane + 0.5, by = b.axis === 'h' ? b.lane + 0.5 : b.pos;
        const along = b.axis === 'h' ? Math.abs(hp.x - bx) : Math.abs(hp.y - by), perp = b.axis === 'h' ? Math.abs(hp.y - by) : Math.abs(hp.x - bx);
        const hl = b.kind === 'sail' ? 1.0 : 0.72, hw = b.kind === 'sail' ? 0.3 : 0.2;
        if (along < hl + 0.22 && perp < hw + 0.24) { die('boat'); return; }
        if (!b.shaved && along < hl + 0.5 && perp < 1.3) { b.shaved = true; g.score += 15; g.shown = g.score; updateHud(false, true); banner('CLOSE SHAVE +15', 'gold'); Snd.tick(1.2); buzz(8); }
      }
    }
  }
  function boatPx(b) {
    return b.axis === 'h' ? { x: L.gx + b.pos * L.cell, y: L.gy + (b.lane + 0.5) * L.cell } : { x: L.gx + (b.lane + 0.5) * L.cell, y: L.gy + b.pos * L.cell };
  }

  // ---- coordinates
  const cx = (x) => L.gx + (x + 0.5) * L.cell;
  const cy = (y) => L.gy + (y + 0.5) * L.cell;
  function visT() { const g = G; if (g.state === 'dying' || g.state === 'over') return g.frozenT == null ? 1 : g.frozenT; if (g.tickN === 0) return 1; return clamp(g.acc / g.step, 0, 1); }
  function headCellPos() { // head centre in cell units (cell centre = +0.5)
    const g = G, s0 = g.snake[0], s1 = g.snake[1] || s0, t = visT();
    if (s0.brk) return { x: s0.x + 0.5, y: s0.y + 0.5 };
    let x = lerp(s1.x, s0.x, t) + 0.5, y = lerp(s1.y, s0.y, t) + 0.5;
    if (g.lunge) { x += g.lunge.x; y += g.lunge.y; }
    return { x, y };
  }

  // ------------------------------------------------------------------ input
  function steer(d) {
    const g = G; if (!g || g.demo || (g.state !== 'play' && g.state !== 'ready')) return false;
    const ref = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (g.state === 'ready' && g.wait) startPlay();
    if (same(d, ref) || opp(d, ref)) return false;
    if (g.queue.length >= 2) return false;
    if (g.hintShown) hideGhost();
    g.cue = { x: d.x, y: d.y, t: g.time };
    if (g.state === 'play' && !g.queue.length && rewindTurn(d)) return true;
    g.queue.push({ x: d.x, y: d.y });
    if (g.state === 'ready') { g.readyT = 0; }
    return true;
  }
  // Turn forgiveness: a swipe that lands just after Champ left a cell can re-route the move that just
  // started, as if the swipe had arrived a moment earlier. Only for a straight, safe, uneventful move,
  // and only when that is clearly what the player meant: the swipe came very early in the glide (a), or
  // turning back there lines Champ up with a fish and turning at the next cell would not (b), or turning
  // at the next cell would be fatal while the previous cell is safe (c). Otherwise it queues as normal.
  // Never rewind away from a fish: if turning at the next cell lines Champ up with one (and is safe) and
  // turning at the previous cell does not, the swipe always waits for the next cell, however early it came.
  const REWIND = 0.5, REWIND_EARLY = 0.18;
  function rewindWanted(d) {
    const g = G, f = g.acc / g.step;
    if (f > REWIND) return false;
    const s0 = g.snake[0], s1 = g.snake[1];
    const lined = (x, y) => g.foods.some((fd) => d.x !== 0 ? (fd.y === y && (fd.x - x) * d.x > 0) : (fd.x === x && (fd.y - y) * d.y > 0));
    const nextFatal = cellFatal(s0.x + d.x, s0.y + d.y, g.grow <= 0);
    if (lined(s0.x, s0.y) && !lined(s1.x, s1.y) && !nextFatal) return false;
    if (f < REWIND_EARLY) return true;
    if (lined(s1.x, s1.y) && !lined(s0.x, s0.y)) return true;
    if (nextFatal && !cellFatal(s1.x + d.x, s1.y + d.y, false)) return true;
    return false;
  }
  function rewindTurn(d) {
    const g = G;
    if (g.tickN === 0 || g.freeze > 0 || g.grace != null || g.acc > g.step * REWIND) return false;
    if (g.lastTurnTick === g.tickN || g.justTp || g.tpDone) return false;
    if (g.eating.some((e) => e.tickN === g.tickN)) return false;
    const s0 = g.snake[0], s1 = g.snake[1];
    if (!s1 || s0.brk || s1.brk) return false;
    const nx = s1.x + d.x, ny = s1.y + d.y;
    if (g.portals && g.portals.some((p) => (p.x === nx && p.y === ny) || (p.x === s0.x && p.y === s0.y))) return false;
    if (cellFatal(nx, ny, false)) return false;
    if (g.mode === 'traffic' && g.boats.length) return false; // boat timing is continuous; keep it simple
    if (!rewindWanted(d)) return false;
    const t = clamp(g.acc / g.step, 0, 1);
    const oldX = lerp(cx(s1.x), cx(s0.x), t), oldY = lerp(cy(s1.y), cy(s0.y), t);
    s0.x = nx; s0.y = ny;
    g.rewOff = { x: oldX - lerp(cx(s1.x), cx(nx), t), y: oldY - lerp(cy(s1.y), cy(ny), t) }; g.rewT0 = t;
    g.dir = { x: d.x, y: d.y }; g.lastTurnTick = g.tickN; g.rewinds = (g.rewinds || 0) + 1;
    Snd.turn();
    for (let i = g.pend.length - 1; i >= 0; i--) if (g.pend[i].x === nx && g.pend[i].y === ny) g.pend.splice(i, 1);
    const fi = g.foods.findIndex((f) => f.x === nx && f.y === ny);
    if (fi >= 0) eatFood(g.foods.splice(fi, 1)[0]);
    return true;
  }
  const ptrs = new Map();
  function canSteer() { return G && !G.demo && (G.state === 'play' || G.state === 'ready'); }
  // A fresh tap during the death animation brings the card at once. The finger that skipped can't also
  // press "Swim again" under it: that button ignores clicks until the finger lifts (plus a moment).
  let againLock = 0, skipPtr = null;
  window.addEventListener('pointerdown', (e) => {
    Snd.unlock();
    if (G && !G.demo && G.state === 'dying' && !G.overShown && performance.now() - (G.diedAt || 0) > 150) {
      G.skipDeath = true; skipPtr = e.pointerId; againLock = Infinity; return;
    }
    if (!canSteer()) return;
    if (e.target.closest && e.target.closest('button') && !e.target.closest('#hud')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, turned: false, at: 0 });
    if (G.state === 'ready' && G.wait) startPlay();
    try { cv.setPointerCapture && e.target === cv && cv.setPointerCapture(e.pointerId); } catch (err) {}
  }, { passive: true });
  // Swipe reader. One flick = one turn:
  //  - below the threshold nothing happens (and the anchor stays put, so slow drags still add up);
  //  - a stroke along or against the way Champ is heading (or the last queued turn) can only mean its
  //    sideways half: the anchor holds while the stroke grows, and it turns as soon as the sideways half
  //    reaches the threshold and 60% of the along half (so a diagonal flick works at any touch rate);
  //    only once the along half passes 1.7x the threshold with little sideways travel is the stroke
  //    dropped and the anchor moved, so a thumb's return stroke can never build up into a turn;
  //  - after a turn in the same touch, a second turn needs a longer, cleaner stroke (1.7x the threshold,
  //    2:1 against the other axis) and 70 ms, so the natural hook at the end of a flick is not a turn.
  const swipeTh = () => clamp(L.cell * 0.55, 16, 26);
  function readSwipe(p, x, y, now) {
    const g = G, dx = x - p.x, dy = y - p.y, th = swipeTh(), ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < th && ay < th) return null;
    const ref = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    let horiz = ax > ay;
    if (horiz ? ref.x !== 0 : ref.y !== 0) { // dominant axis is the way Champ already goes (or its reverse)
      const minor = horiz ? ay : ax, major = horiz ? ax : ay;
      if (minor >= th && minor >= 0.6 * major) horiz = !horiz;
      else { if (p.turned || major >= 1.7 * th) { p.x = x; p.y = y; } return null; } // after a turn: re-anchor at once, as the hook rule expects
    }
    const along = horiz ? ax : ay, cross = horiz ? ay : ax;
    if (p.turned && (along < 1.7 * th || along < 2 * cross || now - p.at < 70)) return null;
    return horiz ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up);
  }
  window.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p || !canSteer()) return;
    const now = performance.now(), d = readSwipe(p, e.clientX, e.clientY, now);
    if (!d) return;
    if (steer(d)) { p.turned = true; p.at = now; }
    p.x = e.clientX; p.y = e.clientY;
  }, { passive: true });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (skipPtr === e.pointerId) { skipPtr = null; againLock = performance.now() + 300; } };
  window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
  window.addEventListener('lostpointercapture', endPtr);
  window.addEventListener('blur', () => { ptrs.clear(); if (skipPtr != null) { skipPtr = null; againLock = 0; } });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' };
  window.addEventListener('keydown', (e) => {
    Snd.unlock();
    const k = e.key;
    if (G && !G.demo && G.state === 'ready' && G.wait && (KEYS[k] || k === ' ')) startPlay();
    if (KEYS[k]) {
      if (canSteer()) { steer(DIRS[KEYS[k]]); e.preventDefault(); }
      return;
    }
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (G && !G.demo && (G.state === 'play' || G.state === 'ready')) { pauseGame(); e.preventDefault(); }
      else if (G && G.state === 'paused') { resumeGame(); e.preventDefault(); }
      return;
    }
    if (k === 'Enter' || k === ' ') {
      if (!$('title').classList.contains('hidden') && document.activeElement && document.activeElement.tagName !== 'BUTTON') { startRun(); e.preventDefault(); }
      else if (!$('over').classList.contains('hidden')) { startRun(); e.preventDefault(); }
    }
    if (k === 'm' || k === 'M') toggleSfx();
  });

  // ------------------------------------------------------------------ simulation
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  function cellFatal(nx, ny, willPop) {
    const g = G;
    if (!inB(nx, ny)) return 'wall';
    for (const r of g.rocks) if (r.x === nx && r.y === ny) return r.isle ? 'isle' : 'rock';
    const n = g.snake.length;
    for (let i = 0; i < n; i++) { const c = g.snake[i]; if (c.x === nx && c.y === ny) { if (willPop && i === n - 1) return null; return 'self'; } }
    return null;
  }
  function graceMs() { return clamp(G.step * 0.8, 70, 130); }

  function tick() { // returns 'moved' | 'stall' | 'dead'
    const g = G;
    if (g.bot) botSteer();
    // whirlpool: head sitting in a portal → pop out of the twin
    if (g.portals && !g.tpDone) {
      const h = g.snake[0];
      const pi = g.portals.findIndex((p) => p.x === h.x && p.y === h.y);
      if (pi >= 0) {
        const B = g.portals[1 - pi];
        if (g.snake.some((c, i) => i > 0 && c.x === B.x && c.y === B.y)) { die('self', g.dir); return 'dead'; }
        g.snake.unshift({ x: B.x, y: B.y, brk: true });
        if (g.grow > 0) g.grow--; else g.tpPop = true; // keep the body length honest
        g.tpDone = true; g.justTp = true; g.portalPulse[pi] = g.time; g.portalPulse[1 - pi] = g.time; g.tpTick = g.tickN;
        Snd.portal(); burst(cx(g.portals[pi].x), cy(g.portals[pi].y), 'swirl', pi); burst(cx(B.x), cy(B.y), 'swirl', 1 - pi);
        g.pulse = 1;
      }
    }
    const h = g.snake[0];
    let d = g.queue.length ? g.queue[0] : g.dir;
    const willPop = g.grow <= 0;
    let fatal = cellFatal(h.x + d.x, h.y + d.y, willPop);
    if (fatal && g.queue.length) { // a fatal turn while straight is safe: treat it as a slip, keep swimming
      const straight = cellFatal(h.x + g.dir.x, h.y + g.dir.y, willPop);
      if (!straight) { g.queue.length = 0; d = g.dir; fatal = null; }
    }
    if (fatal && g.justTp) { // pop out in any open direction
      const opts = [g.dir, { x: g.dir.y, y: -g.dir.x }, { x: -g.dir.y, y: g.dir.x }];
      const ok = opts.find((o) => !cellFatal(h.x + o.x, h.y + o.y, willPop));
      if (ok) { g.dir = ok; g.queue.length = 0; d = ok; fatal = null; }
    }
    if (fatal) {
      if (g.grace == null) g.grace = graceMs();
      if (g.grace > 0) return 'stall';
      die(fatal, d); return 'dead';
    }
    g.grace = null; g.tpDone = false; g.justTp = false;
    let turned = false;
    if (g.queue.length) { g.dir = g.queue.shift(); Snd.turn(); turned = true; }
    const nx = h.x + g.dir.x, ny = h.y + g.dir.y;
    g.snake.unshift({ x: nx, y: ny, brk: false });
    const hadTp = g.tpPop; g.tailBrk = false;
    if (g.grow > 0) { g.grow--; g.prevTail = { x: g.snake[g.snake.length - 1].x, y: g.snake[g.snake.length - 1].y }; g.tailBrk = false; }
    else {
      if (g.tpPop) { g.snake.pop(); g.tpPop = false; g.snake[g.snake.length - 1].brk = false; g.tailBrk = true; }
      const t = g.snake.pop(); g.prevTail = { x: t.x, y: t.y };
      g.tailBrk = hadTp || !!g.snake[g.snake.length - 1].brk;
    }
    g.tickN++; g.sinceEat++; g.rewOff = null;
    if (turned) g.lastTurnTick = g.tickN;
    g.bulges.forEach((b) => { b.k++; });
    g.bulges = g.bulges.filter((b) => b.k - 1 < g.snake.length + 1);
    // cancel a pending rock under the head
    for (let i = g.pend.length - 1; i >= 0; i--) if (g.pend[i].x === nx && g.pend[i].y === ny) g.pend.splice(i, 1);
    // eating
    const fi = g.foods.findIndex((f) => f.x === nx && f.y === ny);
    if (fi >= 0) eatFood(g.foods.splice(fi, 1)[0]);
    // streak: the window was set when the fish appeared; it ends on the move the window runs out
    else if (g.streak > 0 && g.sinceEat >= g.streakWin) { g.streakLost = { tickN: g.tickN, v: g.streak }; g.streak = 0; }
    return 'moved';
  }
  // Streak window, set when a fish appears: the straight-line distance to it plus a little slack.
  // A direct line always keeps the streak; a detour or a miss loses it. Never down to spawn luck.
  function setStreakWin(hx, hy) {
    const g = G, school = g.mode === 'school';
    const slack = g.eaten <= 10 ? (school ? 6 : 10) : g.eaten <= 25 ? (school ? 5 : 8) : g.eaten <= 50 ? (school ? 4 : 6) : (school ? 3 : 4);
    let near = 1e9;
    for (const f of g.foods) if (f.type === 'fish') near = Math.min(near, Math.abs(f.x - hx) + Math.abs(f.y - hy));
    if (near === 1e9) for (const f of g.foods) near = Math.min(near, Math.abs(f.x - hx) + Math.abs(f.y - hy));
    g.streakWin = (near === 1e9 ? 12 : near) + slack;
  }

  // Beginner ease: the first 2 runs start 1.2x slower and fade to normal over the first 6 fish.
  function stepFor(g) { const sp = SPEEDS[g.speed]; return sp.base * (sp.floor + (1 - sp.floor) * Math.exp(-g.eaten / sp.k)) * (g.gentle ? 1 + 0.2 * Math.max(0, 1 - g.eaten / 6) : 1); }
  function eatFood(f) {
    const g = G;
    if (g.streakLost && g.streakLost.tickN === g.tickN) g.streak = g.streakLost.v; // a forgiven (rewound) turn ate on the last move of the window
    g.streakLost = null;
    g.streak = (g.sinceEat <= g.streakWin && g.streak > 0) ? g.streak + 1 : 1;
    g.sinceEat = 0; g.bestStreak = Math.max(g.bestStreak, g.streak);
    const bonus = (g.mode === 'school' ? 3 : 5) * (Math.min(g.streak, STREAK_CAP) - 1);
    const snack = g.tpTick != null && g.tickN - g.tpTick <= 5;
    const pts = (f.type === 'perch' ? 50 : 10) * (snack ? 2 : 1) + bonus;
    if (snack) g.snackNow = true;
    g.score += pts; g.eaten++; if (!g.demo) save.fish++; if (f.type === 'perch') g.perchEaten = (g.perchEaten || 0) + 1;
    if (f.type !== 'perch') g.grow += 1; // the golden perch does not grow Champ: it sheds tail when it lands (eatFx)
    g.bulges.push({ k: 0, big: f.type === 'perch' });
    g.step = stepFor(g);
    g.eating.push({ f, tickN: g.tickN });
    g.fx.push({ tickN: g.tickN, frac: 0.82, fn: () => eatFx(f, pts) });
    g.hintFish = false;
    // mode follow-ups
    if (f.type === 'perch') { g.perchIn = g.golden ? rr(4, 7) : rr(11, 17); }
    else spawnFood('fish');
    if (g.mode === 'break') placeRock();
    if (g.mode === 'whirl' && g.eaten % 6 === 0) placePortals();
    setStreakWin(f.x, f.y);
  }
  // Golden perch relief: Champ sheds up to 3 tail segments (never below length 4), with a puff at the tail.
  function shedTail(n) {
    const g = G, k = Math.min(n, g.snake.length - 4); if (k <= 0) return 0;
    const cut = g.snake.splice(g.snake.length - k, k);
    g.prevTail = { x: cut[0].x, y: cut[0].y };
    const last = g.snake[g.snake.length - 1]; g.tailBrk = !!last.brk;
    g.bulges = g.bulges.filter((b) => b.k - 1 < g.snake.length + 1);
    cut.forEach((c, i) => { if (i % 2 === 0) burst(cx(c.x), cy(c.y), 'puff', 0); });
    return k;
  }
  function eatFx(f, pts) {
    const g = G, x = cx(f.x), y = cy(f.y);
    g.eating = g.eating.filter((e) => e.f !== f);
    if (f.type === 'perch') shedTail(3);
    g.pulse = 1.4; g.lastEatT = g.time; ripple(x, y, 1.1, 0.35, true);
    burst(x, y, f.type === 'perch' ? 'gold' : 'splash', 0);
    if (g.demo) return;
    Snd.eat(g.streak); if (f.type === 'perch') Snd.perch();
    // one small +N, behind Champ (never ahead of the head); a live streak shows in its colour
    popAt(f, '+' + pts, f.type === 'perch' ? '#ffd24a' : g.streak >= 2 ? '#ffab85' : '#ffffff');
    // one HUD banner per meal, most important wins (milestones and streak steps are left to the chime)
    let ban = null, cls = '';
    if (g.snackNow) { g.snackNow = false; ban = 'WHIRL SNACK x2'; cls = 'violet'; }
    if (f.type === 'perch') {
      g.shake = Math.max(g.shake, 5); g.freeze = Math.max(g.freeze, 0.06);
      if (!save.perchTip) { save.perchTip = 1; writeSave(); ban = 'Golden perch: shed a little tail'; cls = 'gold'; }
    }
    buzz(f.type === 'perch' ? [18, 30, 18] : 10);
    g.shown = g.score; updateHud(false, true);
    const done = progressTasks({ eaten: g.eaten, streak: g.streak, len: g.snake.length + g.grow, score: g.score, perch: g.perchEaten || 0 });
    if (done.length) { ban = 'TASK DONE!'; cls = 'task'; setTimeout(() => Snd.unlockMode(), 200); g.tasksDone = (g.tasksDone || 0) + done.length; }
    if (!g.newBestShown && g.prevBest > 0 && g.score > g.prevBest) { g.newBestShown = true; Snd.best(); ban = 'NEW BEST!'; cls = 'gold'; }
    let medalUp = -1;
    const curMedal = g.daily ? medalOf(g.score, g.daily.twist) : modeMedal(g.score, g.mode, g.speed);
    if (g.medal0 == null) g.medal0 = g.daily ? medalOf(getDaily().best, g.daily.twist) : modeMedal(g.prevBest, g.mode, g.speed);
    if (curMedal > g.medal && curMedal > g.medal0) { g.medal = curMedal; medalUp = curMedal; ban = MEDAL_NAMES[curMedal].toUpperCase() + ' MEDAL!'; cls = 'medal m' + curMedal; }
    if (ban) banner(ban, cls);
    if (medalUp >= 0) setTimeout(() => Snd.medal(medalUp), 90);
    else if (g.eaten % 10 === 0) setTimeout(() => Snd.milestone(), 120);
  }
  // Score pop-up placement: two cells behind the head (drifting further back), or beside it when
  // that would leave the lake; never over the head's 3x3 cells or a fish.
  function popAt(f, text, col) {
    const g = G, d = g.dir, px = -d.y, py = d.x;
    const opts = [[-d.x * 2, -d.y * 2, -d.x, -d.y], [px * 2, py * 2, px, py], [-px * 2, -py * 2, -px, -py], [-d.x * 2 + px * 2, -d.y * 2 + py * 2, -d.x, -d.y]];
    const fishNear = (x, y) => g.foods.some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
    let o = opts.find((q) => inB(f.x + q[0], f.y + q[1]) && inB(f.x + q[0] + q[2], f.y + q[1] + q[3]) && !fishNear(f.x + q[0], f.y + q[1])) || opts.find((q) => inB(f.x + q[0], f.y + q[1]));
    if (!o) return;
    g.pops.push({ x: cx(f.x + o[0]), y: cy(f.y + o[1]), vx: o[2] * L.cell * 0.8, vy: o[3] * L.cell * 0.8, cxl: f.x + o[0], cyl: f.y + o[1], text, col, size: 16, age: 0, life: 0.5 });
  }

  function die(cause, d) {
    const g = G; if (g.state === 'dying' || g.state === 'over') return;
    if (g.demo) { restartDemoSoon(); g.state = 'over'; return; }
    g.frozenT = g.tickN === 0 ? 1 : clamp(g.acc / g.step, 0, 1);
    g.state = 'dying'; g.deadCause = cause; g.deadT = 0; g.dead = 1; g.diedAt = performance.now();
    const dd = d || g.dir;
    g.lunge = cause === 'boat' ? null : { x: dd.x * 0.0, y: dd.y * 0.0, tx: dd.x, ty: dd.y };
    g.freeze = 0.11; g.shake = 9; g.flash = 1;
    Snd.die(); buzz([40, 30, 60]); Snd.setMusicDuck(0.45); $('banner').classList.add('hidden'); $('hud').classList.remove('ban');
    hideGhost();
    const p = headCellPos();
    burst(L.gx + p.x * L.cell + (g.lunge ? g.lunge.tx * L.cell * 0.4 : 0), L.gy + p.y * L.cell + (g.lunge ? g.lunge.ty * L.cell * 0.4 : 0), 'splash', 0);
  }

  function startPlay() { const g = G; g.state = 'play'; if (g.tickN === 0) g.acc = 0; g.wait = false; if (!g.demo) Snd.go(); hideGhost(); }

  function update(dt) {
    const g = G; if (!g) return;
    if (!(g.state === 'ready' && g.tickN > 0)) g.time += dt;
    g.pulse = Math.max(0, g.pulse - dt * 5);
    g.flash = Math.max(0, g.flash - dt * 3);
    g.shake = Math.max(0, g.shake - dt * 30);
    updateFx(dt);
    if (g.freeze > 0) { g.freeze -= dt; return; }
    if (g.state === 'ready') {
      if (!g.wait) { g.readyT -= dt; if (g.readyT <= 0) startPlay(); }
      else if (g.queue.length) startPlay();
      if (g.demo) startPlay();
    } else if (g.state === 'play') {
      playUpdate(dt);
    } else if (g.state === 'dying') {
      g.deadT += dt;
      if ((g.deadT > OVER_AT || g.skipDeath) && !g.overShown) { g.overShown = true; showOver(); }
    }
  }

  function playUpdate(dt) {
    const g = G;
    g.acc += dt * 1000;
    if (g.grace != null && g.grace > 0) g.grace -= dt * 1000;
    let guard = 0;
    while (g.acc >= g.step && guard++ < 3) {
      const r = tick();
      if (r === 'stall') { g.acc = g.step; break; }
      if (r === 'dead') return;
      g.acc -= g.step;
      if (g.state !== 'play') return;
    }
    // keep the lake stocked
    if (g.tickN !== g.stockTick) {
      g.stockTick = g.tickN;
      const want = g.mode === 'school' ? schoolCount() : 1, have = g.foods.reduce((n, f) => n + (f.type === 'fish' ? 1 : 0), 0);
      if (have < want && spawnFood('fish') && have === 0) setStreakWin(g.snake[0].x, g.snake[0].y);
    }
    // delayed arrival effects
    if (g.fx.length) {
      const t = visT();
      g.fx = g.fx.filter((e) => { if (e.tickN < g.tickN || (e.tickN === g.tickN && t >= e.frac)) { e.fn(); return false; } return true; });
    }
    // timers
    if (g.hintFish === false && g.hintDir) g.hintDir = 0;
    // perch
    const pf = g.foods.find((f) => f.type === 'perch');
    if (pf) {
      pf.life -= dt;
      if (pf.life <= 0) { g.foods.splice(g.foods.indexOf(pf), 1); burst(cx(pf.x), cy(pf.y), 'puff', 0); Snd.perchGone(); g.perchIn = g.golden ? rr(3, 5) : rr(9, 14); }
    } else if (g.eaten >= (g.golden ? 1 : 3)) {
      g.perchIn -= dt;
      if (g.perchIn <= 0) { const f = spawnFood('perch'); if (f) { Snd.perchSpawn(); burst(cx(f.x), cy(f.y), 'gold', 0); } g.perchIn = 5; }
    }
    // rocks
    for (let i = g.pend.length - 1; i >= 0; i--) {
      const p = g.pend[i];
      if (g.time - p.t0 >= 0.95) {
        g.pend.splice(i, 1);
        const h = g.snake[0];
        if (g.snake.some((c) => c.x === p.x && c.y === p.y) || g.foods.some((f) => f.x === p.x && f.y === p.y)) continue;
        g.rocks.push({ x: p.x, y: p.y, seed: p.seed, born: g.time });
        burst(cx(p.x), cy(p.y), 'splash', 0); ripple(cx(p.x), cy(p.y), 1.6, 1, true); Snd.rock(); buzz(14);
        const cap = Math.max(7, Math.floor(g.cols * g.rows / 26));
        if (g.rocks.filter((k) => !k.isle).length > cap) { const oi = g.rocks.findIndex((k) => !k.isle), old = g.rocks.splice(oi, 1)[0]; g.sinking.push({ x: old.x, y: old.y, seed: old.seed, t: 0 }); }
        void h;
      }
    }
    for (let i = g.sinking.length - 1; i >= 0; i--) { g.sinking[i].t += dt; if (g.sinking[i].t > 0.5) g.sinking.splice(i, 1); }
    if (g.mode === 'traffic') updateBoats(dt);
    if (g.mode === 'school') driftSchool(dt);
    if (g.dayCycle) dayCycle();
    // streak ring
    updateStreakHud();
    if (!g.demo) Snd.setLayer((g.snake.length >= 12 || g.streak >= 3 ? 1 : 0) + (g.snake.length >= 24 || g.streak >= 6 ? 1 : 0));
  }

  // ---- School of Fish: the school drifts, and fish dart away when Champ's head gets close
  function driftSchool(dt) {
    const g = G, h = g.snake[0];
    for (const f of g.foods) {
      if (f.type !== 'fish') continue;
      f.mvT = (f.mvT == null ? rr(0.6, 1.6) : f.mvT) - dt;
      if (f.mk != null && f.mk < 1) f.mk = Math.min(1, f.mk + dt / 0.28);
      if (f.mvT > 0) continue;
      const d = Math.abs(f.x - h.x) + Math.abs(f.y - h.y);
      f.mvT = d <= 3 ? rr(0.55, 0.8) : rr(1.1, 1.9);
      if (d <= 1) continue; // too late, little fish
      const o = occ(), opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
        const nx = f.x + dx, ny = f.y + dy; if (!inB(nx, ny) || o[ny * g.cols + nx] !== 0) return false;
        if (Math.abs(nx - h.x) + Math.abs(ny - h.y) < 2) return false;
        return true;
      });
      if (!opts.length) continue;
      // near Champ: flee (bigger distance wins); far: wander
      opts.sort((a, b) => (Math.abs(f.x + b[0] - h.x) + Math.abs(f.y + b[1] - h.y)) - (Math.abs(f.x + a[0] - h.x) + Math.abs(f.y + a[1] - h.y)));
      const pickd = d <= 3 && rand() < 0.75 ? opts[0] : opts[Math.floor(rand() * opts.length)];
      f.px = f.x; f.py = f.y; f.x += pickd[0]; f.y += pickd[1]; f.mk = 0; f.dir = pickd;
      if (d <= 3) ripple(cx(f.px), cy(f.py), 0.7, 0.5, true);
    }
  }
  // ---- Classic: a day on the lake. Every 12 fish the light on the shore moves on: midday, golden hour, dusk, night.
  const DAY_STEPS = [['day'], ['golden'], ['dusk'], ['night']];
  function dayCycle() {
    const g = G, i = Math.min(3, Math.floor(g.eaten / 12));
    if (i !== g.dayIdx) { g.dayIdx = i; g.mood = DAY_STEPS[i][0]; } // the shore's light just changes: no banner, no flash
  }

  // ------------------------------------------------------------------ fx
  function ripple(x, y, size, life, white) { if (G.ripples.length < 90) G.ripples.push({ x, y, age: 0, life: life || 0.9, size: size || 1, white: !!white }); }
  function burst(x, y, kind, idx) {
    const g = G, P = g.parts, c = L.cell;
    if (P.length > 260) return;
    if (kind === 'splash' || kind === 'gold' || kind === 'puff') {
      const n = kind === 'puff' ? 8 : 16, gold = kind === 'gold';
      for (let i = 0; i < n; i++) {
        const a = rand() * TAU, sp = c * rr(2.2, 5.2);
        P.push({ k: 'drop', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - c * 1.2, age: 0, life: rr(0.35, 0.7), s: rr(0.07, 0.15) * c, col: gold ? (i % 2 ? '#ffe27a' : '#fff4c2') : (i % 3 ? '#e8f8ff' : '#9fe3ff'), g: c * 9 });
      }
      for (let i = 0; i < 4; i++) { const a = rand() * TAU; P.push({ k: 'bub', x: x + Math.cos(a) * c * 0.3, y: y + Math.sin(a) * c * 0.3, vx: Math.cos(a) * c * 0.6, vy: Math.sin(a) * c * 0.6, age: 0, life: rr(0.5, 0.9), s: rr(0.05, 0.1) * c }); }
      ripple(x, y, 1.3, 0.7, true);
      if (gold) for (let i = 0; i < 8; i++) { const a = rand() * TAU, sp = c * rr(1, 3); P.push({ k: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rr(0.5, 0.9), s: rr(0.12, 0.22) * c, col: '#ffe27a' }); }
    } else if (kind === 'swirl') {
      const col = idx ? '#d4b0ff' : '#bff6ff';
      for (let i = 0; i < 14; i++) { const a = rand() * TAU, d = c * rr(0.2, 0.8); P.push({ k: 'swirl', x, y, a, d, age: 0, life: rr(0.5, 0.9), s: rr(0.05, 0.1) * c, col }); }
    }
  }
  function updateFx(dt) {
    const g = G;
    for (let i = g.ripples.length - 1; i >= 0; i--) { g.ripples[i].age += dt; if (g.ripples[i].age > g.ripples[i].life) g.ripples.splice(i, 1); }
    for (let i = g.parts.length - 1; i >= 0; i--) {
      const p = g.parts[i]; p.age += dt;
      if (p.age > p.life) { g.parts.splice(i, 1); continue; }
      if (p.k === 'drop' || p.k === 'bub' || p.k === 'star') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt; if (p.k === 'drop') p.vy += (p.g || 0) * dt * 0.35; }
      else if (p.k === 'swirl') { p.a += dt * 7; p.d *= 1 - 1.4 * dt; }
    }
    // a pop-up gives way the moment Champ's head comes near it: words never sit where you are steering
    const hp = g.snake && g.snake.length ? headCellPos() : null;
    for (let i = g.pops.length - 1; i >= 0; i--) {
      const p = g.pops[i]; p.age += dt;
      let near = false;
      if (hp && p.cxl != null) {
        const k = p.age / p.life, e = 1 - (1 - k) * (1 - k), px = (p.x + (p.vx || 0) * e - L.gx) / L.cell, py = (p.y + (p.vy || 0) * e - L.gy) / L.cell;
        const hw = (p.text.length * 9 + 4) / 2 / L.cell, hh = 10 / L.cell, hx = Math.floor(hp.x), hy = Math.floor(hp.y);
        const hit = (x0, y0, x1, y1) => px - hw < x1 && px + hw > x0 && py - hh < y1 && py + hh > y0;
        near = hit(hx - 1, hy - 1, hx + 2, hy + 2) || g.foods.some((f) => hit(f.x, f.y, f.x + 1, f.y + 1));
      }
      if (p.age > p.life || near) g.pops.splice(i, 1);
    }
    // fish pop-in
    for (const f of g.foods) f.pop = Math.min(1, f.pop + dt / 0.12); // scale-in: 0.12 s, from 70% size
    for (const r of g.rocks) r.k = Math.min(1, (g.time - r.born) / 0.28);
  }

  // ------------------------------------------------------------------ bot (title demo + test driver)
  function botSteer() {
    const g = G, n = g.snake.length, h = g.snake[0];
    const o = occ();
    // time-aware snake blocking
    const bodyAt = new Int16Array(g.cols * g.rows).fill(-1);
    g.snake.forEach((c, i) => { bodyAt[c.y * g.cols + c.x] = i; });
    const danger = new Uint8Array(g.cols * g.rows);
    if (g.mode === 'traffic') {
      g.boats.forEach((b) => {
        const bx = b.axis === 'h' ? b.pos : b.lane + 0.5, by = b.axis === 'h' ? b.lane + 0.5 : b.pos;
        for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
          const ax = b.axis === 'h' ? (x + 0.5 - bx) * b.dir : 0, ay = b.axis === 'v' ? (y + 0.5 - by) * b.dir : 0;
          const along = b.axis === 'h' ? ax : ay, perp = b.axis === 'h' ? Math.abs(y + 0.5 - by) : Math.abs(x + 0.5 - bx);
          if (perp < 1.2 && along > -2.2 && along < 2.8 + b.speed * 1.2) danger[y * g.cols + x] = 1;
        }
      });
    }
    const dirs = [g.dir, { x: g.dir.y, y: -g.dir.x }, { x: -g.dir.y, y: g.dir.x }];
    // BFS from head for distances
    const dist = new Int16Array(g.cols * g.rows).fill(-1), q = [[h.x, h.y]];
    dist[h.y * g.cols + h.x] = 0; const first = new Int8Array(g.cols * g.rows).fill(-1);
    const fatalAt = (x, y, d) => {
      if (!inB(x, y)) return true; const i = y * g.cols + x, v = o[i];
      if (v === 2 || v === 3 || v === 4) return true;
      const bi = bodyAt[i]; if (bi >= 0 && d < n - bi + (g.grow > 0 ? 1 : 0)) return true;
      return false;
    };
    let qi = 0;
    while (qi < q.length) {
      const [x, y] = q[qi++], dd = dist[y * g.cols + x];
      for (let k = 0; k < 4; k++) {
        const dv = [[1, 0], [-1, 0], [0, 1], [0, -1]][k], nx = x + dv[0], ny = y + dv[1];
        if (!inB(nx, ny)) continue; const ni = ny * g.cols + nx; if (dist[ni] >= 0) continue;
        if (dd === 0 && opp({ x: dv[0], y: dv[1] }, g.dir)) continue;
        if (fatalAt(nx, ny, dd + 1)) continue;
        if (danger[ni] && dd < 6) continue;
        dist[ni] = dd + 1; first[ni] = dd === 0 ? k : first[y * g.cols + x]; q.push([nx, ny]);
      }
    }
    let best = -1, bd = 1e9;
    g.foods.forEach((f) => { const d = dist[f.y * g.cols + f.x]; if (d > 0 && d < bd) { bd = d; best = first[f.y * g.cols + f.x]; } });
    const dv4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // safety: open area after the move
    const area = (d) => { const nx = h.x + d.x, ny = h.y + d.y; if (fatalAt(nx, ny, 1) || (danger[ny * g.cols + nx] && inB(nx, ny))) return -1; const o2 = o.slice(); g.snake.forEach((c, i) => { if (i < n - 3) o2[c.y * g.cols + c.x] = 1; else o2[c.y * g.cols + c.x] = 0; }); const f = flood(o2, nx, ny, true); return f.n; };
    let choice = null;
    if (best >= 0) { const d = { x: dv4[best][0], y: dv4[best][1] }; if (area(d) >= Math.min(n + 2, 30)) choice = d; }
    if (!choice) { let ba = -2; for (const d of dirs) { const a = area(d); if (a > ba) { ba = a; choice = d; } } }
    g.queue.length = 0;
    if (choice && !same(choice, g.dir)) g.queue.push(choice);
  }

  // ------------------------------------------------------------------ render
  let T = 0;
  function draw() {
    const g = G, c = L.cell;
    if (!L.shore || !L.shore.width || !L.gridLayer || !L.gridLayer.width) return;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.fillStyle = '#0b5a86'; ctx.fillRect(0, 0, L.W, L.H);
    ctx.save();
    if (g && g.shake > 0.2) ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
    const mood = g ? g.mood : 'day';
    Art.drawWater(ctx, L, T, mood);
    ctx.drawImage(L.gridLayer, 0, 0, L.W, L.H);
    if (g) drawWorld(g);
    ctx.drawImage(Art.shoreFor(L, mood), 0, 0, L.W, L.H);
    // living foam line
    ctx.save(); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.16 + 0.08 * Math.sin(T * 1.7)) + ')'; ctx.lineWidth = c * 0.2; ctx.stroke(L.lake);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.5, c * 0.05); ctx.stroke(L.lake);
    ctx.restore();
    Art.drawMood(ctx, L, T, mood);
    if (g) drawPopups(g);
    ctx.restore();
    // death dip + vignette
    if (g && g.dead) {
      const k = smooth(0, 0.5, g.deadT);
      ctx.fillStyle = 'rgba(2,14,28,' + (0.42 * k) + ')'; ctx.fillRect(0, 0, L.W, L.H);
      const vg = ctx.createRadialGradient(L.W / 2, L.H / 2, Math.min(L.W, L.H) * 0.25, L.W / 2, L.H / 2, Math.max(L.W, L.H) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.5 * k) + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, L.W, L.H);
    }
    if (g && g.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (g.flash * 0.28) + ')'; ctx.fillRect(0, 0, L.W, L.H); }
  }

  function drawWorld(g) {
    const c = L.cell, t = T;
    // ripples
    ctx.save(); ctx.lineWidth = 2;
    for (const r of g.ripples) {
      const k = r.age / r.life, rad = c * (0.25 + k * 0.9) * r.size;
      ctx.strokeStyle = 'rgba(' + (r.white ? '255,255,255' : '190,240,255') + ',' + ((1 - k) * (r.white ? 0.5 : 0.28)) + ')';
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.9, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // boat lane warnings
    for (const w of g.warns) drawWarn(g, w);
    // pending rocks
    for (const p of g.pend) {
      const k = clamp((g.time - p.t0) / 0.95, 0, 1), x = cx(p.x), y = cy(p.y), pulse = 0.5 + 0.5 * Math.sin(g.time * 14);
      ctx.fillStyle = 'rgba(0,25,45,' + (0.18 + 0.2 * k) + ')'; ctx.beginPath(); ctx.ellipse(x, y + c * 0.08, c * (0.2 + 0.32 * k), c * (0.16 + 0.26 * k), 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,90,' + (0.5 + 0.4 * pulse) + ')'; ctx.lineWidth = 2.5; ctx.setLineDash([c * 0.18, c * 0.14]);
      ctx.beginPath(); ctx.arc(x, y, c * (0.62 - 0.14 * k), g.time * 2, g.time * 2 + TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    // food
    const hp = headCellPos();
    for (const f of g.foods) drawFood(g, f, t);
    for (const e of g.eating) {
      const f = e.f, kk = e.tickN === g.tickN ? smooth(0.35, 0.85, visT()) : 1;
      drawFood(g, f, t, 1 - kk, { x: lerp(cx(f.x), L.gx + hp.x * c, kk * 0.7), y: lerp(cy(f.y), L.gy + hp.y * c, kk * 0.7) });
    }
    // hint ring on the first fish
    if (g.hintFish && g.foods[0]) {
      const f = g.foods[0], k = (t * 1.3) % 1;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx(f.x), cy(f.y), c * (0.5 + k * 0.8), 0, TAU); ctx.stroke();
    }
    // shallows under daily islands
    for (const r of g.rocks) if (r.isle) {
      const k = clamp(r.k == null ? 1 : r.k, 0, 1); if (k <= 0) continue;
      const x = cx(r.x), y = cy(r.y), gr = ctx.createRadialGradient(x, y, c * 0.2, x, y, c * 0.95 * k);
      gr.addColorStop(0, 'rgba(120,225,215,0.55)'); gr.addColorStop(0.6, 'rgba(90,200,200,0.25)'); gr.addColorStop(1, 'rgba(90,200,200,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, c * 0.95 * k, 0, TAU); ctx.fill();
    }
    // islet sand, joined across neighbouring island cells
    const isles = g.rocks.filter((r) => r.isle && (r.k == null ? 1 : r.k) > 0);
    if (isles.length) {
      const has = (x, y) => isles.some((r) => r.x === x && r.y === y);
      ctx.save(); ctx.lineCap = 'round';
      for (const [col, w] of [['#8f7c52', 1.08], ['#bfa874', 0.94], ['#7b8487', 0.66]]) { // sand ring, grey rock centre
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = c * w;
        for (const r of isles) {
          const k = easeOutBack(clamp(r.k == null ? 1 : r.k, 0, 1)), x = cx(r.x), y = cy(r.y);
          ctx.beginPath(); ctx.arc(x, y, Math.max(0, c * w * 0.5 * k), 0, TAU); ctx.fill();
          if (k >= 0.99) for (const [dx, dy] of [[1, 0], [0, 1]]) if (has(r.x + dx, r.y + dy)) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx(r.x + dx), cy(r.y + dy)); ctx.stroke(); }
        }
      }
      ctx.restore();
    }
    // rocks
    for (const r of g.rocks) { if (r.hid) continue; const k = r.k == null ? 1 : r.k, e = easeOutBack(k) > 0 ? easeOutBack(k) : 0; if (r.isle) Art.drawIsleTree(ctx, cx(r.x), cy(r.y), c, r.seed, e); else Art.drawRock(ctx, cx(r.x), cy(r.y), c, r.seed, e, t); }
    for (const s of g.sinking) Art.drawRock(ctx, cx(s.x), cy(s.y), c, s.seed, Math.max(0, 1 - s.t / 0.5), t);
    // wake behind the head
    drawSnake(g);
    drawCue(g);
    // portals over the snake so it dives in and pops out
    if (g.portals) {
      const born = clamp((g.time - g.portalT) / 0.4, 0, 1);
      g.portals.forEach((p, i) => {
        const pulse = 1 + 0.25 * Math.max(0, 1 - (g.time - g.portalPulse[i]) * 3);
        Art.drawWhirl(ctx, cx(p.x), cy(p.y), c * pulse * easeOutBack(born), t + i * 2, i, 0.95 * born);
      });
    }
    // boats
    for (const b of g.boats) {
      const p = boatPx(b), ang = b.axis === 'h' ? (b.dir > 0 ? 0 : Math.PI) : (b.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (b.kind === 'sail') Art.drawSailboat(ctx, p.x, p.y, ang, c, t + b.v, b.v, b.sway); else Art.drawPaddler(ctx, p.x, p.y, ang, c, t + b.v, b.v);
    }
    // particles
    for (const p of g.parts) drawPart(p);
  }

  // swipe acknowledged: a chevron pops out of Champ's head in the new direction
  function drawCue(g) {
    const q = g.cue; if (!q || g.demo || (g.state !== 'play' && g.state !== 'ready')) return;
    const k = (g.time - q.t) / 0.32; if (k < 0 || k >= 1) return;
    const c = L.cell, hv = g.headVis || { x: L.gx + headCellPos().x * c, y: L.gy + headCellPos().y * c }, hp = { x: (hv.x - L.gx) / c, y: (hv.y - L.gy) / c }, d = 0.75 + 0.45 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2);
    const x = L.gx + hp.x * c + q.x * c * d, y = L.gy + hp.y * c + q.y * c * d, px = -q.y, py = q.x, s = c * 0.24 * (k < 0.2 ? 0.7 + k * 1.5 : 1);
    ctx.save(); ctx.globalAlpha = 1 - k * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [col, w] of [['rgba(4,34,52,0.55)', 7], ['#ffffff', 3.5]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      ctx.moveTo(x - q.x * s + px * s, y - q.y * s + py * s); ctx.lineTo(x + q.x * s * 0.35, y + q.y * s * 0.35); ctx.lineTo(x - q.x * s - px * s, y - q.y * s - py * s); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWarn(g, w) {
    const c = L.cell, k = (g.time - w.t0) / 1.5, pulse = 0.5 + 0.5 * Math.sin(g.time * 16);
    ctx.save();
    ctx.fillStyle = 'rgba(255,130,60,' + (0.07 + 0.08 * pulse) + ')';
    if (w.axis === 'h') ctx.fillRect(L.gx, L.gy + w.lane * c, L.gw, c); else ctx.fillRect(L.gx + w.lane * c, L.gy, c, L.gh);
    // chevrons marching in the travel direction at the entry edge
    ctx.strokeStyle = 'rgba(255,196,120,' + (0.55 + 0.4 * pulse) + ')'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < 3; i++) {
      const off = ((g.time * 3 + i) % 3) * c * 0.75;
      let x, y, ax, ay;
      if (w.axis === 'h') { x = (w.dir > 0 ? L.gx + c * 0.2 : L.gx + L.gw - c * 0.2) + w.dir * off; y = L.gy + (w.lane + 0.5) * c; ax = w.dir; ay = 0; }
      else { y = (w.dir > 0 ? L.gy + c * 0.2 : L.gy + L.gh - c * 0.2) + w.dir * off; x = L.gx + (w.lane + 0.5) * c; ax = 0; ay = w.dir; }
      const px = -ay, py = ax, s = c * 0.26;
      ctx.beginPath(); ctx.moveTo(x - ax * s + px * s, y - ay * s + py * s); ctx.lineTo(x + ax * s * 0.4, y + ay * s * 0.4); ctx.lineTo(x - ax * s - px * s, y - ay * s - py * s); ctx.stroke();
    }
    ctx.restore(); void k;
  }

  function drawFood(g, f, t, scaleOverride, posOverride) {
    const c = L.cell, big = f.type === 'perch';
    let bx = cx(f.x), by = cy(f.y);
    if (f.mk != null && f.mk < 1 && !posOverride) { const e = smooth(0, 1, f.mk); bx = lerp(cx(f.px), bx, e); by = lerp(cy(f.py), by, e); }
    // no spin: a fish faces one way and bobs 2 px; school fish face the way they swim
    const x = posOverride ? posOverride.x : bx, y = posOverride ? posOverride.y : by + Math.sin(t * 2.4 + f.ph) * 2;
    const pop = scaleOverride != null ? scaleOverride : 0.7 + 0.3 * easeOutBack(clamp(f.pop, 0, 1));
    if (pop <= 0.01) return;
    let ang = 0, flip = f.face || 1;
    if (f.dir) { if (f.dir[0]) flip = f.dir[0]; else { ang = f.dir[1] * Math.PI / 2; flip = 1; } }
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop); ctx.translate(-x, -y);
    // soft disc behind it so it reads on every water colour
    ctx.fillStyle = big ? 'rgba(255,214,60,0.22)' : 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(x, y, c * (big ? 0.62 : 0.55), 0, TAU); ctx.fill();
    if (big) Art.drawPerch(ctx, x, y, c * 1.15, ang, flip, clamp(f.life / (f.life0 || SPEEDS[g.speed].perch), 0, 1), t);
    else Art.drawFish(ctx, x, y, c * 1.0, ang, flip);
    ctx.restore();
  }
  function drawPart(p) {
    const k = p.age / p.life, a = 1 - k;
    if (p.k === 'drop') { ctx.fillStyle = p.col; ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 - k * 0.5), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    else if (p.k === 'bub') { ctx.strokeStyle = 'rgba(220,250,255,' + a * 0.8 + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (1 + k), 0, TAU); ctx.stroke(); }
    else if (p.k === 'star') { ctx.globalAlpha = a; ctx.fillStyle = p.col; Art.star(ctx, p.x, p.y, p.s * (1 - k * 0.4)); ctx.globalAlpha = 1; }
    else if (p.k === 'swirl') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x + Math.cos(p.a) * p.d, p.y + Math.sin(p.a) * p.d, p.s, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
  }
  function drawPopups(g) {
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const p of g.pops) {
      const k = p.age / p.life, e = 1 - (1 - k) * (1 - k), x = p.x + (p.vx || 0) * e, y = p.y + (p.vy || 0) * e, s = p.size * (k < 0.15 ? 0.7 + k / 0.15 * 0.3 : 1);
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.font = '400 ' + s + 'px "Lilita One", "Trebuchet MS", sans-serif';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(4,34,52,0.85)'; ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.col; ctx.fillText(p.text, x, y);
    }
    ctx.restore();
  }

  // ---- the serpent
  // Face: happy right after a meal, worried when the next move would be fatal.
  function champMood(g) {
    if (g.dead) return '';
    if (g.time - g.lastEatT < 0.18) return 'happy'; // short, so the white eyes are almost always showing
    if (g.demo || g.state !== 'play') return '';
    const h = g.snake[0], d = g.queue.length ? g.queue[0] : g.dir;
    if (g.grace != null || (cellFatal(h.x + d.x, h.y + d.y, g.grow <= 0) && g.acc > g.step * 0.25)) { g.worried = 1; return 'worry'; }
    g.worried = 0; return '';
  }
  function ctr(c) { return { x: cx(c.x), y: cy(c.y) }; }
  function drawSnake(g) {
    const c = L.cell, S = g.snake, n = S.length, t = visT();
    // head position
    const s0 = S[0], s1 = S[1] || s0;
    let hv = s0.brk ? ctr(s0) : { x: lerp(cx(s1.x), cx(s0.x), t), y: lerp(cy(s1.y), cy(s0.y), t) };
    g.headVis = hv;
    if (g.rewOff && !s0.brk) { const k = clamp(1 - (t - (g.rewT0 || 0)) / 0.4, 0, 1); if (k > 0) { hv.x += g.rewOff.x * k * k; hv.y += g.rewOff.y * k * k; } }
    // death lunge / bounce
    let lungeOff = null;
    if (g.state === 'dying' || g.state === 'over') {
      if (g.lunge) { const k = g.deadT, bump = k < 0.13 ? Math.sin(k / 0.13 * Math.PI / 2) * 0.42 : 0.42 * Math.max(0, 1 - (k - 0.13) / 0.22) - 0.0; lungeOff = { x: g.lunge.tx * bump * c, y: g.lunge.ty * bump * c }; hv = { x: ctr(s0).x + lungeOff.x, y: ctr(s0).y + lungeOff.y }; }
    }
    const strands = []; let cur = [hv];
    if (s0.brk) { strands.push(cur); cur = []; }
    for (let i = 1; i < n; i++) {
      cur.push(ctr(S[i]));
      if (i < n - 1 && S[i].brk) { strands.push(cur); cur = []; }
    }
    if (g.state === 'play' || g.state === 'ready' || g.state === 'dying' || g.state === 'over') {
      if (!g.tailBrk && n > 1) {
        const tv = { x: lerp(cx(g.prevTail.x), cx(S[n - 1].x), t), y: lerp(cy(g.prevTail.y), cy(S[n - 1].y), t) };
        const last = cur[cur.length - 1]; if (Math.hypot(tv.x - last.x, tv.y - last.y) > 0.5) cur.push(tv);
      }
    }
    if (cur.length) strands.push(cur);
    // wake V behind head
    const ang0 = g.headAng;
    if (g.state === 'play' || g.state === 'ready') {
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const bx = Math.cos(ang0), by = Math.sin(ang0), px = -by, py = bx;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hv.x - bx * c * 0.35 + px * sd * c * 0.45, hv.y - by * c * 0.35 + py * sd * c * 0.45); ctx.lineTo(hv.x - bx * c * 1.7 + px * sd * c * 1.15, hv.y - by * c * 1.7 + py * sd * c * 1.15); ctx.stroke(); }
      ctx.restore();
    }
    // eyes/mouth
    let look = { x: 1, y: 0 }, mouthT = 0;
    const hc = { x: (hv.x - L.gx) / c, y: (hv.y - L.gy) / c };
    let nearest = null, nd = 1e9;
    for (const f of g.foods) { const dx = f.x + 0.5 - hc.x, dy = f.y + 0.5 - hc.y, d = Math.hypot(dx, dy); if (d < nd) { nd = d; nearest = { dx, dy, d }; } }
    const hb = Math.cos(g.headAng), hbs = Math.sin(g.headAng);
    if (nearest && !g.dead) {
      const fx = nearest.dx * hb + nearest.dy * hbs, lx = -nearest.dx * hbs + nearest.dy * hb;
      look = { x: fx / (nearest.d || 1), y: lx / (nearest.d || 1) };
      if (fx > -0.3 && fx < 3.4 && Math.abs(lx) < 1.5) mouthT = 1 - clamp((fx - 0.4) / 3.0, 0, 1);
    }
    g.mouth = lerp(g.mouth, mouthT, 0.25);
    // blink
    let blink = 0; const bt = g.time - g.blinkAt;
    if (bt > 0) { blink = bt < 0.13 ? bt / 0.13 : bt < 0.26 ? 1 - (bt - 0.13) / 0.13 : 0; if (bt > 0.26) g.blinkAt = g.time + rr(1.8, 4.5); }
    const bulges = g.bulges.map((b) => b.k - 1 + t);
    const S2 = {
      strands, cell: c, time: T, bulges, mouth: g.mouth, blink, look, pulse: g.pulse, dead: g.dead ? 1 : 0, deadAmp: g.dead ? Math.max(0, 1 - g.deadT / 0.9) * smooth(0, 0.12, g.deadT) : 0,
      headAngle: g.headAng, skin: Art.SKINS[save.skin] || Art.SKINS.lake, mood: champMood(g)
    };
    S2.getAngle = null;
    // angle: look back ~0.6 cell along the drawn curve (computed inside via callback)
    S2.angleHook = (tgt) => { let d = tgt - g.headAng; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; g.headAng += d * (g.dead ? 0 : 0.5); S2.headAngle = g.headAng; return g.headAng; };
    Art.drawChamp(ctx, S2);
  }

  // ------------------------------------------------------------------ HUD / screens
  let lastScoreText = '';
  function updateHud(force, bump) {
    const g = G; if (!g || g.demo) return;
    const s = String(g.shown);
    if (s !== lastScoreText || force) { $('sc').textContent = s; lastScoreText = s; if (bump) { const el = $('sc'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
    const best = Math.max(g.prevBest, g.shown), lbl = $('scBest').parentNode.querySelector('.lbl');
    if (g.daily) {
      const tg = MEDALS[g.daily.twist] || MEDALS.classic, k = tg.findIndex((v) => g.shown < v);
      lbl.textContent = k < 0 ? 'GOLD!' : MEDAL_NAMES[k].toUpperCase(); $('scBest').textContent = k < 0 ? g.shown : tg[k];
      $('scBest').className = 'num2 md' + (k < 0 ? 2 : k); $('scBest').parentNode.style.visibility = '';
    } else if (g.prevBest > 0 && g.shown > g.prevBest) { lbl.textContent = 'NEW BEST'; $('scBest').className = 'num2 up'; $('scBest').textContent = '+' + (g.shown - g.prevBest); $('scBest').parentNode.style.visibility = ''; }
    else { lbl.textContent = 'BEST'; $('scBest').className = 'num2'; $('scBest').textContent = g.prevBest; $('scBest').parentNode.style.visibility = g.prevBest > 0 ? '' : 'hidden'; }
    updateStreakHud(true);
  }
  function updateStreakHud(force) {
    const g = G, el = $('streak'); if (!g || g.demo) return;
    const on = g.streak >= 2 && g.sinceEat < g.streakWin;
    // the bonus stops growing at x10 (STREAK_CAP): from there the ring turns gold and reads MAX
    if (on) { const mx = g.streak >= STREAK_CAP; $('stx').textContent = mx ? 'MAX' : 'x' + g.streak; el.classList.toggle('max', mx); el.style.setProperty('--p', clamp(1 - g.sinceEat / g.streakWin, 0, 1).toFixed(3)); }
    if (el.classList.contains('off') === on) { el.classList.toggle('off', !on); if (on) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
    void force;
  }
  let bannerTimer = 0;
  function banner(text, cls) {
    const b = $('banner'); b.textContent = text; b.className = cls || ''; void b.offsetWidth; b.classList.add('show'); $('hud').classList.add('ban');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.classList.add('hidden'); $('hud').classList.remove('ban'); }, 900);
  }
  function buzz(p) { try { if (G && G.demo) return; if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch (e) {} }

  // ghost hand
  function showGhost() {
    const g = G, gh = $('ghost'); if (!g || g.demo || !g.wait) return;
    const h = headCellPos(), f = g.foods[0];
    let dir = 'right';
    if (f) { const dx = f.x - g.snake[0].x, dy = f.y - g.snake[0].y; dir = g.dir.y !== 0 ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
    gh.className = 'dir' + dir;
    gh.querySelector('.finger').style.top = clamp(L.gy + (h.y + 0.5) * L.cell + L.cell * 5, L.topH + 60, L.H - 120) + 'px';
    const fx = gh.querySelector('.finger'); fx.style.left = (L.W / 2) + 'px';
    gh.querySelector('.say').style.top = (parseFloat(fx.style.top) + 44) + 'px'; gh.querySelector('.say').style.left = (L.W / 2) + 'px';
    gh.querySelector('.say').textContent = 'Swipe to swim ' + ({ left: '\u2190', right: '\u2192', up: '\u2191', down: '\u2193' }[dir]); gh.classList.remove('hidden'); g.hintShown = true;
    if (!matchMedia('(hover:none) and (pointer:coarse)').matches) { $('keyhint').classList.remove('hidden'); gh.querySelector('.say').textContent = 'Press an arrow key or swipe'; }
  }
  function hideGhost() { $('ghost').classList.add('hidden'); $('keyhint').classList.add('hidden'); if (G) G.hintShown = false; }

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }

  function startRun() {
    cancelAnimationFrame(countRaf);
    Snd.unlock(); Snd.click(); Snd.setMusicDuck(1);
    hide('title'); hide('over'); hide('pause'); hide('tasks'); hide('skins');
    show('hud');
    newRun(save.mode, save.speed, {});
    { const T0 = getTasks(); if (T0.modes.indexOf(save.mode) < 0) T0.modes.push(save.mode); if (save.mode === 'daily') T0.dailyPlayed = 1; G.taskDone0 = progressTasks({ eaten: 0, streak: 0, len: 0, score: 0, perch: 0 }); }
    Snd.setTheme(G.daily ? 'daily' : MODE_THEME[G.mode] || 'classic'); Snd.setLayer(0);
    setupHudBest();
    if (G.taskDone0 && G.taskDone0.length) { const t0 = G.taskDone0[0]; setTimeout(() => { if (G && !G.demo) { banner('TASK DONE!'); Snd.unlockMode(); } }, 1300); void t0; }
    if (G.wait) showGhost();
    G.state = 'ready';
    if (G.daily) { const d = getDaily(); if (d.plays === 0 || d.plays == null) setTimeout(() => G && !G.demo && banner('DAILY LAKE: ' + TWIST_BANNER[G.daily.twist]), 350); d.plays = (d.plays || 0) + 1; writeSave(); return; }
    const tip = TIPS[save.mode];
    if (tip && !(save.tips && save.tips[save.mode]) && !G.wait) { save.tips = save.tips || {}; save.tips[save.mode] = 1; writeSave(); setTimeout(() => G && !G.demo && banner(tip), 350); }
  }
  function setupHudBest() { updateHud(true); }
  function goTitle() {
    cancelAnimationFrame(countRaf);
    Snd.setMusicDuck(1);
    hide('over'); hide('pause'); hide('hud'); hide('skins'); hide('tasks'); hideGhost(); show('title');
    Snd.setTheme('title'); Snd.setLayer(0);
    renderTitle();
    startDemo();
  }
  function startDemo() {
    const modes = ['school', 'classic'];
    newRun(modes[Math.floor(rand() * modes.length)], 'normal', { demo: true, bot: true });
    G.state = 'play'; G.step = 175; G.perchIn = 99;
    // keep the demo below the logo: invisible walls over the top rows
    const tg = document.querySelector('.tag'), tb = tg && tg.getBoundingClientRect().bottom;
    if (L.orient === 'port' && tb > 0) { const top = Math.min(G.rows - 5, Math.floor((tb - L.gy) / L.cell) + 1); for (let y = 0; y < top; y++) for (let x = 0; x < G.cols; x++) G.rocks.push({ x, y, seed: 0, born: -9, hid: true }); G.foods = G.foods.filter((f) => f.y >= top); const y0 = top + Math.floor((G.rows - top) / 2); G.snake = G.snake.map((c, i) => ({ x: 4 - i, y: y0, brk: false })); G.dir = { x: 1, y: 0 }; G.headAng = 0; G.prevTail = { x: 0, y: y0 }; if (!G.foods.length) spawnFood('fish'); }
  }
  let demoTimer = 0;
  function restartDemoSoon() { clearTimeout(demoTimer); demoTimer = setTimeout(() => { if (G && G.demo) startDemo(); }, 400); }

  function pauseGame() {
    const g = G; if (!g || g.demo || (g.state !== 'play' && g.state !== 'ready')) return;
    g.state = 'paused'; ptrs.clear(); $('btnResume').textContent = 'Keep swimming'; show('pause'); Snd.back(); Snd.setMusicDuck(0.4); hideGhost(); applyPendingLayout();
  }
  function resumeGame() {
    const g = G; if (!g || g.state !== 'paused') return;
    hide('pause'); g.state = 'ready'; g.wait = g.wait && g.tickN === 0; g.readyT = 0.7; Snd.click(); Snd.setMusicDuck(1);
    if (g.wait) showGhost(); else banner('Ready?');
  }

  function showOver() {
    const g = G, key = bestKey(g.mode, g.speed);
    save.maxLen = Math.max(save.maxLen || 0, g.snake.length);
    let prevBest, isNew, dayStreak = 0, rec = null, prevMedal = -1;
    if (g.daily) {
      const d = getDaily(), rk = g.daily.key;
      if (d.day !== rk) { d.day = rk; d.best = 0; } // run started before midnight: it belongs to its own day
      prevBest = d.best; isNew = g.score > d.best;
      if (isNew) d.best = g.score;
      if (d.last !== rk) { d.streak = d.last === shiftKey(rk, -1) ? (d.streak || 0) + 1 : 1; d.last = rk; }
      dayStreak = d.streak;
      save.best['daily.normal'] = Math.max(save.best['daily.normal'] || 0, g.score);
      rec = save.dlog[rk] || { s: 0, m: -1 }; prevMedal = rec.m;
      rec.s = Math.max(rec.s, g.score); rec.tw = g.daily.twist; rec.m = medalOf(rec.s, rec.tw); save.dlog[rk] = rec;
      const keys = Object.keys(save.dlog).sort(); while (keys.length > 21) delete save.dlog[keys.shift()];
    } else {
      prevBest = getBest(g.mode, g.speed); isNew = g.score > prevBest;
      if (isNew) save.best[key] = g.score;
    }
    progressTasks({ eaten: g.eaten, streak: g.bestStreak, len: g.snake.length, score: g.score, perch: g.perchEaten || 0 });
    bankTasks({ eaten: g.eaten, perch: g.perchEaten || 0 });
    save.lastScore = g.score;
    const unl0 = g.unl0 || [], skin0 = g.skin0 || [];
    const newly = MODES.filter((m) => unl0.indexOf(m.id) < 0 && isUnlocked(m));
    newly.forEach((m) => { save.seen[m.id] = 'new'; });
    const newSkins = SKIN_ORDER.filter((id) => skin0.indexOf(id) < 0 && skinUnlocked(id));
    if (newSkins.length) save.seen.skin = 'new';
    writeSave();
    const info = DEATH[g.deadCause] || DEATH.self;
    $('ovTitle').textContent = info.t;
    const ob = $('ovBest'), best = Math.max(prevBest, g.score), fresh = isNew && g.score > 0;
    const modeName = (MODES.find((m) => m.id === g.mode) || {}).name;
    ob.classList.remove('new', 'close');
    let bestText;
    if (fresh && prevBest === 0 && !g.daily) bestText = 'First score in ' + modeName + '!';
    else if (fresh) bestText = g.daily ? 'NEW BEST TODAY!' : 'NEW BEST!';
    else if (g.score > 0 && g.score === prevBest) { bestText = 'Tied your best!'; ob.classList.add('close'); }
    else if (g.score > 0 && best > 0 && g.score >= best * 0.7) { bestText = (best - g.score) + ' short of your best (' + best + ')'; ob.classList.add('close'); }
    else bestText = (g.daily ? "Today's best " : 'Best ') + best;
    ob.textContent = bestText;
    // ---- exactly one "next goal" row: news first, then the closest thing to chase
    const goal = $('ovGoal'); let gHtml = '', gNews = false, gPct = null;
    const medalI = (i) => '<i class="gi mdot m' + i + '"></i>';
    const tg = g.daily ? (MEDALS[g.daily.twist] || MEDALS.classic) : modeTargets(g.mode, g.speed);
    const have = g.daily ? rec.s : best, mNow = g.daily ? rec.m : modeMedal(best, g.mode, g.speed), mWas = g.daily ? prevMedal : modeMedal(prevBest, g.mode, g.speed);
    const nextMode = MODES.find((m) => !isUnlocked(m));
    const T0 = getTasks(), ti = T0.done.findIndex((d) => !d);
    if (newly.length) { gNews = true; gHtml = '<i class="gi">&#9733;</i><span class="gt"><span>New lake: <b>' + newly.map((m) => m.name).join(', ') + '</b>!</span></span>'; }
    else if (newSkins.length) { gNews = true; gHtml = '<i class="gi">&#9733;</i><span class="gt"><span>New look for Champ: <b>' + newSkins.map((id) => Art.SKINS[id].name).join(', ') + '</b>!</span></span>'; }
    else if (mNow > mWas && mNow >= 0) { gNews = true; gHtml = medalI(mNow) + '<span class="gt"><span><b>' + MEDAL_NAMES[mNow] + '</b> ' + (g.daily ? 'on today’s lake' : 'in ' + modeName) + '!</span></span>'; }
    else if (mNow < 2) { const k = mNow + 1; gPct = clamp(have / tg[k], 0, 1); gHtml = medalI(k) + '<span class="gt"><span><b>' + (tg[k] - have) + '</b> more for ' + MEDAL_NAMES[k] + (g.daily ? ' today' : ' in ' + modeName) + '</span><span class="gb"><i></i></span></span>'; }
    else if (nextMode) { const hv = save.fish || 0; gPct = clamp(hv / nextMode.fish, 0, 1); gHtml = '<i class="gi">&#128031;</i><span class="gt"><span><b>' + (nextMode.fish - hv) + '</b> more fish for ' + nextMode.name + '</span><span class="gb"><i></i></span></span>'; }
    else if (ti >= 0) { const p = T0.picks[ti], v = Math.min(T0.prog[p.id] || 0, p.n); gPct = v / p.n; gHtml = '<i class="gi">&#10003;</i><span class="gt"><span>' + taskText(p) + ' <b>' + v + '/' + p.n + '</b></span><span class="gb"><i></i></span></span>'; }
    goal.innerHTML = gHtml; goal.className = 'ov-goal' + (gNews ? ' news' : '') + (gHtml ? '' : ' hidden');
    if (gPct != null) setTimeout(() => { const i = goal.querySelector('.gb i'); if (i) i.style.width = Math.round(gPct * 100) + '%'; }, 260);
    if (newly.length || newSkins.length) setTimeout(() => Snd.unlockMode(), 350);
    else if (mNow > mWas && mNow >= 0) setTimeout(() => Snd.medal(mNow), 500);
    // ---- details (folded away)
    $('ovMsg').textContent = pick(info.m);
    const stats = [[g.snake.length, 'length'], [g.eaten, 'fish']];
    if (g.bestStreak >= 2) stats.push(['x' + g.bestStreak, 'best streak']);
    $('ovStats').innerHTML = stats.map((x) => '<div><b>' + x[0] + '</b>' + x[1] + '</div>').join('');
    $('ovUnlock').classList.add('hidden');
    const nx = $('ovNext'); nx.className = 'ov-next hidden';
    if (g.daily) {
      let week = '';
      for (let i = -6; i <= 0; i++) {
        const k = shiftKey(g.daily.key, i), r = save.dlog[k], p = k.split('-').map(Number), dn = 'SMTWTFS'[new Date(p[0], p[1] - 1, p[2]).getDay()];
        week += '<div class="wd' + (i === 0 ? ' today' : '') + '"><i class="' + (r ? (r.m >= 0 ? 'm' + r.m : 'played') : '') + '"></i><span>' + dn + '</span></div>';
      }
      nx.innerHTML = '<div class="week">' + week + '</div><div class="nx-s">' + (dayStreak >= 2 ? 'Day ' + dayStreak + ' streak! ' : '') + 'A new lake every day</div>';
      nx.classList.add('daily'); nx.classList.remove('hidden');
    } else if (nextMode) {
      nx.innerHTML = '<div class="nx-t">' + ((nextMode.fish - (save.fish || 0))) + ' more fish for <b>' + nextMode.name + '</b></div>'; nx.classList.remove('hidden');
    }
    $('ovTasks').innerHTML = tasksHtml(true);
    const om = $('ovMedals');
    om.innerHTML = '<div class="medals sm">' + tg.map((v, i) => '<div class="md m' + i + (have >= v ? ' on' : '') + '"><i></i><span>' + v + '</span></div>').join('') + '</div>';
    om.classList.remove('hidden');
    setDetails(false);
    hide('hud'); show('over'); applyPendingLayout(); placeOverCard();
    countUp($('ovScore'), g.score, () => { if (fresh) { ob.classList.add('new'); if (!newly.length && !newSkins.length) Snd.best(); } });
  }
  function setDetails(open) {
    $('ovMore').classList.toggle('hidden', !open); $('btnDetails').setAttribute('aria-expanded', open ? 'true' : 'false'); $('btnDetails').textContent = open ? 'Hide details' : 'Details';
    const card = document.querySelector('.card.over'); card.classList.toggle('open', open);
    if (open) { const H = window.innerHeight, cr = card.getBoundingClientRect(), mt = parseFloat(card.style.marginTop) || 0, over = cr.bottom - (H - 10); if (over > 0) card.style.marginTop = Math.max(0, mt - over) + 'px'; }
    else if (!$('over').classList.contains('hidden')) placeOverCard();
  }
  // Put "Swim again" where the thumb rests: its centre at about 67% of the screen height.
  function placeOverCard() {
    const card = document.querySelector('.card.over'), btn = $('btnAgain'); card.style.marginTop = '0px';
    const H = window.innerHeight, cr = card.getBoundingClientRect(), br = btn.getBoundingClientRect();
    const above = br.top + br.height / 2 - cr.top, top = clamp(H * 0.67 - above, 6, Math.max(6, H - (cr.height) - 6));
    card.style.marginTop = Math.max(0, top - cr.top) + 'px';
  }
  let countRaf = 0;
  function countUp(el, to, done) {
    cancelAnimationFrame(countRaf);
    el.textContent = '0';
    if (to <= 0) { done && done(); return; }
    const t0 = performance.now() + 40, dur = Math.min(440, 220 + to * 0.6), steps = Math.min(10, Math.max(4, Math.round(to / 10)));
    let lastStep = -1;
    const f = (now) => {
      const k = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - k, 3), v = Math.round(to * e), st = Math.floor(e * steps);
      el.textContent = v;
      if (st !== lastStep && k > 0 && k < 1) { lastStep = st; Snd.tick(e); }
      if (k < 1) countRaf = requestAnimationFrame(f);
      else { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); Snd.tick(1.3); done && done(); }
    };
    countRaf = requestAnimationFrame(f);
  }

  // title UI
  function renderTitle() {
    const wrap = $('modes'); wrap.innerHTML = '';
    MODES.forEach((m) => {
      const un = isUnlocked(m), b = document.createElement('button');
      b.className = 'mode' + (m.id === save.mode ? ' sel' : '') + (un ? '' : ' locked') + (save.seen[m.id] === 'new' && un ? ' fresh' : '');
      b.dataset.id = m.id;
      const best = getBest(m.id, save.speed), isDaily = m.id === 'daily';
      if (isDaily) { const d = getDaily(), st = dailyStreak(); b.className += ' daily'; if (st >= 1) b.dataset.streak = 'DAY ' + st; }
      const lock = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2.5" fill="#9fc9de"/><path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="#9fc9de" stroke-width="2.4"/></svg>';
      let dsub = 'New lake today!';
      if (isDaily) { const tb = getDaily().best; if (tb) { const md = medalOf(tb, dailyInfo().twist); dsub = (md >= 0 ? '<i class="mdot m' + md + '"></i>' : '') + 'Today ' + tb + (md >= 0 ? ' ' + MEDAL_NAMES[md] : ''); } }
      b.innerHTML = '<span class="ic">' + (un ? MODE_ICONS[m.id] : lock) + '</span><span><div class="nm">' + m.name + '</div><div class="sb">' + (isDaily ? dsub : un ? (best ? (modeMedal(best, m.id, save.speed) >= 0 ? '<i class="mdot m' + modeMedal(best, m.id, save.speed) + '"></i>' : '') + 'Best ' + best : 'Not played yet') : 'Eat ' + m.fish + ' fish') + '</div></span>' +
        (un ? '' : '<span class="bar"><i style="width:' + Math.round(clamp((save.fish || 0) / m.fish, 0, 1) * 100) + '%"></i></span>');
      b.addEventListener('click', () => {
        Snd.unlock();
        if (!un) { Snd.locked(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); $('modeBlurb').textContent = 'Champ needs ' + (m.fish - (save.fish || 0)) + ' more fish (any mode) to find this lake.'; return; }
        Snd.click(); save.mode = m.id; if (save.seen[m.id] === 'new') delete save.seen[m.id]; writeSave(); renderTitle();
      });
      wrap.appendChild(b);
    });
    const cur = MODES.find((m) => m.id === save.mode);
    const dly = save.mode === 'daily';
    if (dly) { const tw = dailyInfo().twist, tg = MEDALS[tw]; $('modeBlurb').innerHTML = "Today's lake: " + TWIST[tw] + '. <span class="tgt"><i class="mdot m0"></i>' + tg[0] + ' <i class="mdot m1"></i>' + tg[1] + ' <i class="mdot m2"></i>' + tg[2] + '</span>'; }
    else $('modeBlurb').textContent = cur.blurb;
    $('speedSeg').classList.toggle('dim', dly);
    $('speedSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.speed === (dly ? 'normal' : save.speed)));
    updateAudioButtons();
    drawSkinButton();
    renderTaskChip();
  }
  // ---- Daily tasks UI
  function tasksHtml(compact) {
    const T0 = getTasks();
    return (compact ? '' : '') + T0.picks.map((p, i) => {
      const v = T0.done[i] ? p.n : Math.min(T0.prog[p.id] || 0, p.n), pct = Math.round(v / p.n * 100);
      return '<div class="tk' + (T0.done[i] ? ' done' : '') + '"><i class="tick"></i><div class="tt"><div>' + taskText(p) + '</div><span class="tb"><i style="width:' + pct + '%"></i></span></div><b>' + (T0.done[i] ? '' : v + '/' + p.n) + '</b></div>';
    }).join('');
  }
  function renderTaskChip() {
    const T0 = getTasks(), n = T0.done.filter(Boolean).length, el = $('taskChip');
    el.innerHTML = '<span class="dots">' + T0.done.map((d) => '<i class="' + (d ? 'on' : '') + '"></i>').join('') + '</span>' + (n === 3 ? "All of today's tasks done!" : "Today's tasks " + n + '/3') + '<span class="chev">&rsaquo;</span>';
    el.classList.toggle('all', n === 3);
    el.classList.toggle('hidden', (save.plays || 0) < 3); // a new player sees logo, Play and modes only
  }
  function openTasks() { Snd.unlock(); Snd.click(); $('taskList').innerHTML = tasksHtml(false); $('taskReward').textContent = 'Finish all three today: a task star (' + (save.taskDays || 0) + ' so far). 2 stars unlock the Sunset look.'; show('tasks'); }

  // ---- Champ's look (skins)
  function paintBadge(canvas, id) {
    const r = canvas.getBoundingClientRect(), w = Math.max(10, r.width || canvas.width), h = Math.max(10, r.height || canvas.height), dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const c2 = canvas.getContext('2d'); c2.setTransform(dpr, 0, 0, dpr, 0, 0); c2.clearRect(0, 0, w, h);
    Art.drawChampBadge(c2, w, h, id, 0.4);
  }
  function drawSkinButton() { const b = $('btnSkin'); if (!b) return; paintBadge(b.querySelector('canvas'), save.skin); b.classList.toggle('fresh', save.seen.skin === 'new'); }
  function openSkins() {
    Snd.unlock(); Snd.click(); delete save.seen.skin; writeSave();
    const grid = $('skinGrid'); grid.innerHTML = '';
    SKIN_ORDER.forEach((id) => {
      const ok = skinUnlocked(id), sg = SKIN_GOAL[id], b = document.createElement('button');
      b.className = 'sk' + (save.skin === id ? ' sel' : '') + (ok ? '' : ' locked');
      const have = Math.min(sg.have(), sg.need);
      b.innerHTML = (ok ? '' : '<span class="lockb"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2.5" fill="#ffd24a"/><path d="M8 10V8a4 4 0 0 1 8 0v2" fill="none" stroke="#ffd24a" stroke-width="2.4"/></svg></span>') + '<canvas></canvas><div class="nm">' + Art.SKINS[id].name + '</div><div class="sb">' + (ok ? (save.skin === id ? 'Wearing' : 'Tap to wear') : sg.txt) + '</div>' +
        (ok ? '' : '<span class="bar"><i style="width:' + Math.round(have / sg.need * 100) + '%"></i></span><span class="cnt">' + have + '/' + sg.need + '</span>');
      b.addEventListener('click', () => {
        if (!ok) { Snd.locked(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        Snd.click(); save.skin = id; writeSave(); openSkins(); drawSkinButton();
      });
      grid.appendChild(b);
    });
    show('skins');
    grid.querySelectorAll('canvas').forEach((cv2, i) => { paintBadge(cv2, SKIN_ORDER[i]); if (!skinUnlocked(SKIN_ORDER[i])) cv2.style.opacity = '.55'; });
    drawSkinButton();
  }
  function updateAudioButtons() {
    ['btnSfx', 'btnSfx2'].forEach((id) => { const b = $(id); b.innerHTML = ICON_SPEAKER; b.classList.toggle('off', !save.sfx); b.setAttribute('aria-pressed', save.sfx ? 'true' : 'false'); });
    { const b = $('btnMuteHud'); b.innerHTML = ICON_SPEAKER; b.classList.toggle('off', !save.sfx && !save.music); }
    ['btnMusic', 'btnMusic2'].forEach((id) => { const b = $(id); b.innerHTML = ICON_MUSIC; b.classList.toggle('off', !save.music); b.setAttribute('aria-pressed', save.music ? 'true' : 'false'); });
  }
  function toggleSfx() { save.sfx = !save.sfx; Snd.setSfx(save.sfx); writeSave(); updateAudioButtons(); if (save.sfx) Snd.click(); }
  function toggleMusic() { save.music = !save.music; Snd.unlock(); Snd.setMusic(save.music); writeSave(); updateAudioButtons(); Snd.click(); }

  // ------------------------------------------------------------------ wiring
  function wire() {
    $('btnPlay').addEventListener('click', startRun);
    $('btnSkin').addEventListener('click', openSkins);
    $('taskChip').addEventListener('click', openTasks);
    $('btnTasksDone').addEventListener('click', () => { hide('tasks'); startRun(); });
    $('btnSkinsDone').addEventListener('click', () => { Snd.back(); hide('skins'); renderTitle(); });
    $('btnAgain').addEventListener('click', () => { if (performance.now() < againLock) return; startRun(); });
    $('btnMenu2').addEventListener('click', () => { Snd.back(); goTitle(); });
    $('btnDetails').addEventListener('click', () => { Snd.click(); setDetails($('ovMore').classList.contains('hidden')); });
    $('btnMenu').addEventListener('click', () => { Snd.back(); goTitle(); });
    $('btnRestart').addEventListener('click', startRun);
    $('btnResume').addEventListener('click', resumeGame);
    $('btnPause').addEventListener('click', pauseGame);
    $('speedSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; Snd.unlock(); Snd.click(); save.speed = b.dataset.speed; writeSave(); renderTitle(); });
    ['btnSfx', 'btnSfx2'].forEach((id) => $(id).addEventListener('click', () => { Snd.unlock(); toggleSfx(); }));
    $('btnMuteHud').addEventListener('click', () => { Snd.unlock(); const on = !(save.sfx || save.music); save.sfx = on; save.music = on; Snd.setSfx(on); Snd.setMusic(on); writeSave(); updateAudioButtons(); if (on) Snd.click(); });
    ['btnMusic', 'btnMusic2'].forEach((id) => $(id).addEventListener('click', toggleMusic));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (!window.__noPause && G && !G.demo && (G.state === 'play' || G.state === 'ready')) pauseGame(); Snd.suspend(); }
      else Snd.resumeFromHidden();
    });
    window.addEventListener('pagehide', () => { if (!window.__noPause && G && !G.demo && (G.state === 'play' || G.state === 'ready')) pauseGame(); });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 60));
  }

  // ------------------------------------------------------------------ main loop
  let last = 0, perf = [];
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    T = ts / 1000;
    const t0 = performance.now();
    if (G && G.state !== 'paused' && !window.__manual) update(dt);
    draw();
    perf.push(performance.now() - t0); if (perf.length > 120) perf.shift();
  }

  function init() {
    loadSave();
    Snd.setSfx(save.sfx); Snd.state.music = save.music;
    Art.loadAssets();
    layout({ newGrid: true });
    layoutSize = { w: window.innerWidth, h: window.innerHeight, o: L.orient, ang: curAng() };
    wire(); renderTitle(); startDemo();
    try { document.fonts && document.fonts.ready.then(() => { if (G && G.demo) startDemo(); }); } catch (e) {}
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ test hooks
  function simulate(ms) {
    let left = ms / 1000;
    while (left > 0) { const dt = Math.min(0.016, left); T += dt; if (G && G.state !== 'paused') update(dt); left -= dt; }
    draw();
  }
  window.__T = {
    start(mode, speed, o) { o = o || {}; if (mode) save.mode = mode; if (speed) save.speed = speed; if (o.unlockAll !== false) window.__unlockAll = true; hide('title'); hide('over'); hide('pause'); show('hud'); newRun(save.mode, save.speed, { bot: !!o.bot }); Snd.setTheme(G.daily ? 'daily' : MODE_THEME[G.mode] || 'classic'); G.wait = false; G.readyT = 0.05; G.state = 'ready'; if (o.immediate !== false) { G.readyT = 0; startPlay(); } return this.state(); },
    step: simulate,
    state() {
      const g = G; if (!g) return null;
      return {
        mode: g.mode, speed: g.speed, state: g.state, score: g.score, eaten: g.eaten, streak: g.streak, len: g.snake.length, head: { x: g.snake[0].x, y: g.snake[0].y }, dir: { x: g.dir.x, y: g.dir.y },
        queue: g.queue.map((q) => ({ x: q.x, y: q.y })), cols: g.cols, rows: g.rows, step: Math.round(g.step), tick: g.tickN, grace: g.grace,
        foods: g.foods.map((f) => ({ x: f.x, y: f.y, type: f.type, life: Math.round(f.life * 10) / 10 })), rocks: g.rocks.map((r) => ({ x: r.x, y: r.y })), pend: g.pend.length,
        portals: g.portals && g.portals.map((p) => ({ x: p.x, y: p.y })), boats: g.boats.map((b) => ({ axis: b.axis, lane: b.lane, pos: Math.round(b.pos * 10) / 10, kind: b.kind })), warns: g.warns.length,
        cause: g.deadCause, cell: Math.round(L.cell * 10) / 10, body: g.snake.map((c) => c.x + ',' + c.y + (c.brk ? '!' : '')).join(' '), overShown: g.overShown, grow: g.grow, bulges: g.bulges.length, daily: g.daily ? g.daily.key + ':' + g.daily.twist : null, rewinds: g.rewinds || 0
      };
    },
    dir(name) { return steer(DIRS[name]); },
    bot(on) { if (G) G.bot = !!on; },
    seed(n) { rs = n >>> 0; },
    place(type, x, y) { const g = G; g.foods = g.foods.filter((f) => !(type === 'perch' && f.type === 'perch')); g.foods.push(mkFood(type, x, y)); return true; },
    clearFood() { G.foods = []; },
    setHead(x, y, dx, dy) { const g = G; const len = g.snake.length; g.snake = []; for (let i = 0; i < len; i++) g.snake.push({ x: x - dx * i, y: y - dy * i, brk: false }); g.dir = { x: dx, y: dy }; g.queue = []; g.prevTail = { x: g.snake[len - 1].x, y: g.snake[len - 1].y }; g.headAng = Math.atan2(dy, dx); g.acc = 0; },
    setPortals(a, b) { G.portals = [a, b]; G.portalT = G.time - 1; },
    giveBest(n) { save.best['classic.normal'] = n; writeSave(); renderTitle(); },
    resetSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} save = { best: {}, sfx: true, music: true, speed: 'normal', mode: 'classic', plays: 0, fish: 0, seen: {}, skin: 'lake', dlog: {}, maxLen: 0, mig2: 1, legacy: [] }; window.__unlockAll = false; renderTitle(); },
    setPlays(n) { save.plays = n; },
    kill(cause) { die(cause || 'self'); },
    bench(n) { const t0 = performance.now(); for (let i = 0; i < n; i++) { T += 0.016; if (G && G.state !== 'paused') update(0.016); draw(); } return (performance.now() - t0) / n; },
    perf() { const a = perf.slice().sort((x, y) => x - y); return { avg: perf.reduce((s, v) => s + v, 0) / (perf.length || 1), p95: a[Math.floor(a.length * 0.95)] || 0, n: perf.length }; },
    layout() { return { W: L.W, H: L.H, cell: L.cell, cols: L.cols, rows: L.rows, gx: L.gx, gy: L.gy, gw: L.gw, gh: L.gh, dpr: L.dpr }; },
    pause: pauseGame, resume: resumeGame, title: goTitle, save() { return save; },
    G() { return G; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
