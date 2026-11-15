/* Champ Grows — code-drawn art. Every sprite has a code fallback; a painted PNG can replace it via ASSETS. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixc = (a, b, t) => 'rgb(' + Math.round(lerp(a[0], b[0], t)) + ',' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ')';

  // ---- ASSETS: set `src` to a PNG path (e.g. 'assets/fish.png') to replace the code-drawn sprite. null = code art.
  // Sprites face RIGHT (+x), centred. `scale` = sprite length in cells.
  const ASSETS = {
    fish:      { src: null, img: null, scale: 0.75 },
    perch:     { src: null, img: null, scale: 1.05 },
    rock:      { src: null, img: null, scale: 1.0 },
    whirlpool: { src: null, img: null, scale: 1.35 },
    sailboat:  { src: null, img: null, scale: 3.0 },
    paddler:   { src: null, img: null, scale: 2.3 },
    champHead: { src: null, img: null, scale: 1.25 },
    shore:     { src: null, img: null, scale: 1 }
  };
  function loadAssets() {
    Object.keys(ASSETS).forEach((k) => {
      const a = ASSETS[k];
      if (a.src && !a.img) { const im = new Image(); im.onerror = () => { a.img = null; a.src = null; }; im.src = a.src; a.img = im; }
    });
  }
  function asset(k) { const a = ASSETS[k]; return a && a.img && a.img.complete && a.img.naturalWidth ? a : null; }
  function drawAsset(ctx, a, x, y, ang, cell) {
    const w = a.scale * cell, h = w * a.img.naturalHeight / a.img.naturalWidth;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(a.img, -w / 2, -h / 2, w, h); ctx.restore();
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ------------------------------------------------------------------ water
  // Lake moods. The time of day lives in the FRAME (shore, trees, HUD shade); the water itself only
  // shifts inside a narrow blue-teal band and stays one calm colour, so nothing on the play field
  // competes with Champ, the fish and the hazards.
  const MOODS = {
    day:     { w: '#0d6a98' },
    morning: { w: '#1583a0', grade: 'rgba(255,226,160,0.55)', haze: 'rgba(255,250,225,0.16)' },
    golden:  { w: '#1a6f94', grade: 'rgba(255,150,50,0.9)', tint: 'rgba(255,140,40,0.2)' },
    dusk:    { w: '#1c4f88', grade: 'rgba(255,110,170,0.6)', tint: 'rgba(40,20,80,0.22)' },
    night:   { w: '#123a66', tint: 'rgba(6,12,40,0.50)' },
    storm:   { w: '#2a5a70', tint: 'rgba(20,32,44,0.32)', rain: true },
    summer:  { w: '#0f8fa8', grade: 'rgba(255,250,200,0.4)' }
  };
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (h, k) => { const c = hexRgb(h); return 'rgb(' + c.map((v) => Math.round(clamp(k > 0 ? v + (255 - v) * k : v * (1 + k), 0, 255))).join(',') + ')'; };
  // the shore with the mood's light baked in (built once per mood per layout, so it costs nothing per frame)
  function shoreFor(L, moodId) {
    const M = MOODS[moodId] || MOODS.day;
    if (!M.grade && !M.tint && !M.haze) return L.shore;
    L.shoreMood = L.shoreMood || {};
    if (L.shoreMood.src !== L.shore) L.shoreMood = { src: L.shore };
    if (L.shoreMood[moodId]) return L.shoreMood[moodId];
    const c = document.createElement('canvas'); c.width = L.shore.width; c.height = L.shore.height;
    const g = c.getContext('2d'); g.drawImage(L.shore, 0, 0); g.scale(L.dpr, L.dpr);
    if (M.grade) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = M.grade; g.fillRect(0, 0, L.W, L.H); }
    g.globalCompositeOperation = 'source-over';
    if (M.tint) { g.fillStyle = M.tint; g.fillRect(0, 0, L.W, L.H); }
    if (M.haze) { const hg = g.createLinearGradient(0, 0, 0, L.H * 0.5); hg.addColorStop(0, M.haze); hg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hg; g.fillRect(0, 0, L.W, L.H * 0.5); }
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(L.lake);
    L.shoreMood[moodId] = c; return c;
  }
  // weather over the frame only: storm rain falls on the shore and HUD band, never on the water
  function drawMood(ctx, L, t, moodId) {
    const M = MOODS[moodId]; if (!M || !M.rain) return;
    if (!L.outside || L.outside.src !== L.lake) { const o = new Path2D(); o.rect(-40, -40, L.W + 80, L.H + 80); o.addPath(L.lake); L.outside = { p: o, src: L.lake }; }
    ctx.save(); ctx.clip(L.outside.p, 'evenodd');
    ctx.strokeStyle = 'rgba(210,230,245,0.30)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < 70; i++) { const sx = ((i * 97.3 + t * 160) % (L.W + 80)) - 40, sy = ((i * 211.7 + t * 620) % (L.H + 60)) - 30; ctx.moveTo(sx, sy); ctx.lineTo(sx - 5, sy + 15); }
    ctx.stroke(); ctx.restore();
  }
  let waterGrad = null, waterGradKey = '';
  function drawWater(ctx, L, t, moodId) {
    const M = MOODS[moodId] || MOODS.day, key = L.W + 'x' + L.H + (moodId || 'day');
    if (!waterGrad || waterGradKey !== key) {
      // one flat colour with a gentle vertical gradient (top and bottom within ~6% lightness)
      waterGrad = ctx.createLinearGradient(0, L.gy, 0, L.gy + L.gh);
      waterGrad.addColorStop(0, shade(M.w, 0.04)); waterGrad.addColorStop(1, shade(M.w, -0.08));
      waterGradKey = key;
    }
    ctx.fillStyle = waterGrad; ctx.fillRect(0, 0, L.W, L.H);
  }

  // ------------------------------------------------------------------ lake outline + shore
  function lakePath(L, seed) {
    const r = mulberry(seed || 11), c = L.cell;
    const pad = 0.14 * c, rc = 0.62 * c;
    const x0 = L.gx - pad, y0 = L.gy - pad, x1 = L.gx + L.gw + pad, y1 = L.gy + L.gh + pad;
    // perimeter samples with outward normals
    const pts = [], step = c * 0.28;
    function edge(ax, ay, bx, by, nx, ny) {
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) { const t = i / n; pts.push({ x: lerp(ax, bx, t), y: lerp(ay, by, t), nx, ny }); }
    }
    function corner(cx, cy, a0) {
      const n = 5;
      for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI / 2; pts.push({ x: cx + Math.cos(a) * rc, y: cy + Math.sin(a) * rc, nx: Math.cos(a), ny: Math.sin(a) }); }
    }
    edge(x0 + rc, y0, x1 - rc, y0, 0, -1);
    corner(x1 - rc, y0 + rc, -Math.PI / 2);
    edge(x1, y0 + rc, x1, y1 - rc, 1, 0);
    corner(x1 - rc, y1 - rc, 0);
    edge(x1 - rc, y1, x0 + rc, y1, 0, 1);
    corner(x0 + rc, y1 - rc, Math.PI / 2);
    edge(x0, y1 - rc, x0, y0 + rc, -1, 0);
    corner(x0 + rc, y0 + rc, Math.PI);
    const p1 = r() * TAU, p2 = r() * TAU, p3 = r() * TAU;
    const out = pts.map((p, i) => {
      const u = i * 0.55;
      const nz = 0.5 + 0.5 * (Math.sin(u * 0.9 + p1) * 0.5 + Math.sin(u * 2.3 + p2) * 0.3 + Math.sin(u * 0.37 + p3) * 0.2);
      const off = (0.02 + 0.20 * nz) * c;
      return { x: p.x + p.nx * off, y: p.y + p.ny * off };
    });
    const path = new Path2D(), n = out.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let m0 = mid(out[0], out[1]); path.moveTo(m0.x, m0.y);
    for (let i = 1; i <= n; i++) { const p = out[i % n], q = out[(i + 1) % n], m = mid(p, q); path.quadraticCurveTo(p.x, p.y, m.x, m.y); }
    path.closePath();
    return path;
  }

  function treeAt(g, x, y, rad, kind, r) {
    // shadow
    g.fillStyle = 'rgba(0,30,20,0.28)'; g.beginPath(); g.ellipse(x + rad * 0.28, y + rad * 0.38, rad * 1.02, rad * 0.86, 0, 0, TAU); g.fill();
    const pals = [['#2f6d36', '#3f8a44', '#5aa75a'], ['#2a6340', '#38815a', '#52a373'], ['#b4501f', '#d96f26', '#f0a03a'], ['#a8322a', '#cf4a35', '#ee7b4d'], ['#7a8a2a', '#9bb039', '#c6d65a']];
    const pal = pals[kind % pals.length];
    g.fillStyle = pal[0]; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = rad * (0.25 + r() * 0.3);
      g.fillStyle = i % 2 ? pal[1] : pal[2]; g.beginPath(); g.arc(x + Math.cos(a) * d - rad * 0.12, y + Math.sin(a) * d - rad * 0.14, rad * (0.42 + r() * 0.2), 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(255,255,220,0.22)'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.34, rad * 0.32, 0, TAU); g.fill();
  }

  function buildShore(L) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.W * L.dpr); c.height = Math.ceil(L.H * L.dpr);
    const g = c.getContext('2d'); g.scale(L.dpr, L.dpr);
    const r = mulberry(1234 + L.cols * 31 + L.rows), cell = L.cell;
    const path = L.lake;
    // grass
    const gr = g.createLinearGradient(0, 0, 0, L.H); gr.addColorStop(0, '#2d6a3a'); gr.addColorStop(0.5, '#3c8442'); gr.addColorStop(1, '#2f6e3a');
    g.fillStyle = gr; g.fillRect(0, 0, L.W, L.H);
    for (let i = 0; i < 40; i++) {
      const x = r() * L.W, y = r() * L.H, rad = 30 + r() * 80;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad); const lite = r() > 0.5;
      rg.addColorStop(0, lite ? 'rgba(160,220,110,0.16)' : 'rgba(10,60,40,0.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.fillStyle = 'rgba(200,255,150,0.12)';
    for (let i = 0; i < 380; i++) g.fillRect(r() * L.W, r() * L.H, 1.6, 3);
    // beach (outer halves of strokes survive the cut-out)
    g.lineJoin = 'round';
    g.strokeStyle = '#b6a064'; g.lineWidth = cell * 1.42; g.stroke(path);
    g.strokeStyle = '#e6d49c'; g.lineWidth = cell * 1.08; g.stroke(path);
    g.strokeStyle = '#f2e6bb'; g.lineWidth = cell * 0.62; g.stroke(path);
    g.strokeStyle = '#c9b57b'; g.lineWidth = cell * 0.16; g.stroke(path);
    // pebbles along the beach
    const rx0 = L.gx, ry0 = L.gy, rx1 = L.gx + L.gw, ry1 = L.gy + L.gh;
    const dist = (x, y) => Math.hypot(Math.max(rx0 - x, 0, x - rx1), Math.max(ry0 - y, 0, y - ry1));
    for (let i = 0; i < 160; i++) {
      const x = r() * L.W, y = r() * L.H, d = dist(x, y);
      if (d < cell * 0.12 || d > cell * 0.62) continue;
      g.fillStyle = r() > 0.5 ? 'rgba(120,105,70,0.7)' : 'rgba(255,255,240,0.7)';
      g.beginPath(); g.ellipse(x, y, 1 + r() * 1.8, 0.8 + r() * 1.2, r() * 3, 0, TAU); g.fill();
    }
    // cut out the lake
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fill(path);
    g.globalCompositeOperation = 'source-over';
    // trees and bushes only on the grass, never on the beach
    const placed = [];
    const tries = Math.floor(L.W * L.H / 900);
    for (let i = 0; i < tries; i++) {
      const rad = cell * (0.28 + r() * 0.34), x = r() * (L.W + 20) - 10, y = r() * (L.H + 20) - 10;
      if (dist(x, y) < cell * 0.78 + rad) continue;
      let ok = true;
      for (const q of placed) { if (Math.hypot(q.x - x, q.y - y) < (q.r + rad) * 0.85) { ok = false; break; } }
      if (!ok) continue;
      placed.push({ x, y, r: rad });
    }
    placed.sort((a, b) => a.y - b.y);
    placed.forEach((p) => {
      if (r() < 0.2) { // flower bush
        g.fillStyle = 'rgba(0,40,20,0.25)'; g.beginPath(); g.ellipse(p.x + 2, p.y + 3, p.r * 0.8, p.r * 0.6, 0, 0, TAU); g.fill();
        g.fillStyle = '#3f8a44'; g.beginPath(); g.arc(p.x, p.y, p.r * 0.62, 0, TAU); g.fill();
        for (let k = 0; k < 6; k++) { g.fillStyle = ['#ffd24a', '#ff9ab0', '#ffffff'][k % 3]; g.beginPath(); g.arc(p.x + (r() - 0.5) * p.r, p.y + (r() - 0.5) * p.r, 1.8, 0, TAU); g.fill(); }
      } else treeAt(g, p.x, p.y, p.r, Math.floor(r() * 5), r);
    });
    // a little lighthouse on the breakwater side, if there is room on the grass
    const lh = findLandmarkSpot(L, dist);
    if (lh) drawLighthouse(g, lh.x, lh.y, lh.r);
    // top shade so the HUD stays readable
    const ts = g.createLinearGradient(0, 0, 0, L.topH + 10); ts.addColorStop(0, 'rgba(2,24,38,0.78)'); ts.addColorStop(0.7, 'rgba(2,24,38,0.35)'); ts.addColorStop(1, 'rgba(2,24,38,0)');
    g.fillStyle = ts; g.fillRect(0, 0, L.W, L.topH + 10);
    return c;
  }
  function findLandmarkSpot(L, dist) {
    const bottomRoom = L.H - (L.gy + L.gh), r = 12;
    const cands = [
      { x: L.W - 28, y: L.gy + L.gh + bottomRoom * 0.55 },
      { x: L.W - 22, y: L.gy + L.gh + bottomRoom * 0.55 },
      { x: L.gx + L.gw + (L.W - L.gx - L.gw) * 0.5, y: L.gy + L.gh - 40 }
    ];
    for (const p of cands) { if (dist(p.x, p.y) > L.cell * 0.85 + r && p.x < L.W - r && p.y < L.H - r && p.y > L.topH + 20) return { x: p.x, y: p.y, r }; }
    return null;
  }
  function drawLighthouse(g, x, y, r) {
    // long cast shadow shows it is a tall tower
    g.save(); g.translate(x, y); g.rotate(0.6);
    g.fillStyle = 'rgba(0,30,20,0.32)'; g.beginPath(); g.moveTo(0, -r * 0.7); g.lineTo(r * 3.4, -r * 0.4); g.lineTo(r * 3.4, r * 0.4); g.lineTo(0, r * 0.7); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#d9d2c2'; g.beginPath(); g.arc(x, y, r * 0.95, 0, TAU); g.fill();          // base
    g.strokeStyle = '#7a6e5c'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fbf7ee'; g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r * 0.7, 0, TAU); g.fill(); // tower top
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.2; g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r * 0.62, 0, TAU); g.stroke(); // railing
    g.fillStyle = '#c0382d'; g.beginPath(); g.arc(x - r * 0.18, y - r * 0.18, r * 0.42, 0, TAU); g.fill();      // red lantern roof
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.14, 0, TAU); g.fill();
    // warm lamp glow
    const gl = g.createRadialGradient(x - r * 0.18, y - r * 0.18, 0, x - r * 0.18, y - r * 0.18, r * 1.8);
    gl.addColorStop(0, 'rgba(255,230,140,0.35)'); gl.addColorStop(1, 'rgba(255,230,140,0)'); g.fillStyle = gl; g.beginPath(); g.arc(x - r * 0.18, y - r * 0.18, r * 1.8, 0, TAU); g.fill();
  }

  // static layer under the snake: subtle checker + shallows glow along the shore
  function buildGridLayer(L) {
    const c = document.createElement('canvas'); c.width = Math.ceil(L.W * L.dpr); c.height = Math.ceil(L.H * L.dpr);
    const g = c.getContext('2d'); g.scale(L.dpr, L.dpr);
    g.save(); g.clip(L.lake);
    // shallows
    [[L.cell * 2.6, 0.05], [L.cell * 1.7, 0.07], [L.cell * 0.9, 0.09]].forEach((p) => {
      g.lineWidth = p[0]; g.strokeStyle = 'rgba(130,240,225,' + p[1] + ')'; g.stroke(L.lake);
    });
    g.fillStyle = 'rgba(255,255,255,0.022)';
    for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) if ((x + y) & 1) g.fillRect(L.gx + x * L.cell, L.gy + y * L.cell, L.cell, L.cell);
    g.restore();
    return c;
  }

  // ------------------------------------------------------------------ fish
  // One clear silhouette, one colour: near-white body, coral tail, dark outline. `len` = nose to tail tip.
  // flip = -1 mirrors it (faces left) without turning it upside down.
  const FISH_INK = '#07384a';
  function fishShape(ctx, L, body, tail, fin, ink, olw, extra) {
    ctx.lineJoin = 'round';
    // tail
    ctx.beginPath(); ctx.moveTo(-L * 0.2, 0); ctx.lineTo(-L * 0.5, -L * 0.24); ctx.quadraticCurveTo(-L * 0.4, 0, -L * 0.5, L * 0.24); ctx.closePath();
    ctx.fillStyle = tail; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = olw; ctx.stroke();
    // dorsal fin
    ctx.beginPath(); ctx.moveTo(-L * 0.12, -L * 0.2); ctx.quadraticCurveTo(L * 0.0, -L * 0.42, L * 0.16, -L * 0.22); ctx.closePath();
    ctx.fillStyle = fin; ctx.fill(); ctx.stroke();
    // body
    ctx.beginPath(); ctx.ellipse(L * 0.1, 0, L * 0.36, L * 0.27, 0, 0, TAU);
    ctx.fillStyle = body; ctx.fill(); ctx.stroke();
    if (extra) extra();
    // gill + eye
    ctx.strokeStyle = 'rgba(7,56,74,0.45)'; ctx.lineWidth = Math.max(1, olw * 0.6); ctx.beginPath(); ctx.arc(L * 0.2, 0, L * 0.15, -1.0, 1.0); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(L * 0.32, -L * 0.06, L * 0.055, 0, TAU); ctx.fill();
  }
  function drawFish(ctx, x, y, len, ang, flip) {
    const a = asset('fish'); if (a) { drawAsset(ctx, a, x, y, ang, len / 0.75); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0); if (flip < 0) ctx.scale(-1, 1);
    fishShape(ctx, len, '#f4fbff', '#ff7a59', '#ff7a59', FISH_INK, 2);
    ctx.restore();
  }

  // Golden perch: bigger, saturated gold, same dark outline; the ring around it is its timer.
  function drawPerch(ctx, x, y, len, ang, flip, frac, t) {
    const R = len * 0.6;
    const urgent = frac < 0.3, blink = urgent && Math.sin(t * 18) > 0;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,25,40,0.45)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = blink ? '#ffffff' : (urgent ? '#ff6a4d' : '#ffd02e'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.stroke();
    ctx.restore();
    const A = asset('perch'); if (A) { drawAsset(ctx, A, x, y, ang, len); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0); if (flip < 0) ctx.scale(-1, 1);
    const L = len * 0.92;
    fishShape(ctx, L, '#ffd02e', '#ff9a1f', '#ff9a1f', FISH_INK, 2, () => {
      ctx.save(); ctx.clip(); ctx.fillStyle = 'rgba(150,80,0,0.28)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-L * 0.1 + i * L * 0.13, -L * 0.3, L * 0.06, L * 0.6);
      ctx.fillStyle = 'rgba(255,255,230,0.55)'; ctx.beginPath(); ctx.ellipse(L * 0.06, -L * 0.12, L * 0.18, L * 0.05, 0, 0, TAU); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  }

  // a little tree / bush on a Daily Lake islet (seen from above)
  function drawIsleTree(ctx, x, y, cell, seed, k) {
    if (k <= 0) return;
    const r = mulberry(seed * 131 + 7), rad = cell * (0.27 + r() * 0.06) * k, rot = r() * TAU;
    ctx.fillStyle = 'rgba(0,30,20,0.32)'; ctx.beginPath(); ctx.ellipse(x + rad * 0.3, y + rad * 0.4, rad, rad * 0.85, 0, 0, TAU); ctx.fill();
    // a pine seen from above: a dark spiky star with a darker heart
    const spiky = (rr, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = rot + i * TAU / 16, d = i % 2 ? rr * 0.68 : rr; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } ctx.closePath(); ctx.fill(); };
    spiky(rad, '#1d4a34'); spiky(rad * 0.66, '#2b6446'); ctx.fillStyle = '#163a29'; ctx.beginPath(); ctx.arc(x, y, rad * 0.18, 0, TAU); ctx.fill();
  }

  // ------------------------------------------------------------------ rocks, whirlpools
  function drawRock(ctx, x, y, cell, seed, k, t) {
    // k: 0..1 rise-in progress (overshoot allowed)
    ctx.save(); ctx.translate(x, y);
    // ripple ring where it meets the water
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 + 0.1 * Math.sin(t * 2 + seed)) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, cell * 0.06, cell * (0.56 + 0.03 * Math.sin(t * 2 + seed)), cell * 0.5, 0, 0, TAU); ctx.stroke();
    const A = asset('rock'); if (A) { ctx.scale(k, k); drawAsset(ctx, A, 0, 0, 0, cell); ctx.restore(); return; }
    ctx.scale(k, k);
    const r = mulberry(seed * 977 + 5), n = 9, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.3, d = cell * (0.36 + r() * 0.1); pts.push([Math.cos(a) * d, Math.sin(a) * d * 0.94]); }
    ctx.fillStyle = 'rgba(0,20,40,0.35)'; ctx.beginPath(); ctx.ellipse(cell * 0.06, cell * 0.14, cell * 0.5, cell * 0.4, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    const g = ctx.createLinearGradient(-cell * 0.4, -cell * 0.4, cell * 0.4, cell * 0.45);
    g.addColorStop(0, '#d6dde0'); g.addColorStop(0.45, '#98a5ab'); g.addColorStop(1, '#4f5d66');
    ctx.fillStyle = g; ctx.fill(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#26343c'; ctx.lineWidth = Math.max(2, cell * 0.07); ctx.stroke();
    // facets
    ctx.strokeStyle = 'rgba(30,45,55,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(pts[1][0] * 0.3, pts[1][1] * 0.3); ctx.lineTo(pts[4][0] * 0.8, pts[4][1] * 0.8); ctx.moveTo(pts[1][0] * 0.3, pts[1][1] * 0.3); ctx.lineTo(pts[7][0] * 0.8, pts[7][1] * 0.8); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.beginPath(); ctx.ellipse(-cell * 0.14, -cell * 0.16, cell * 0.15, cell * 0.08, -0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(95,140,70,0.6)'; ctx.beginPath(); ctx.ellipse(cell * 0.12, cell * 0.22, cell * 0.13, cell * 0.06, 0.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const WHIRL_COL = [['#bff6ff', '#38c6e6', '#0a4f78'], ['#f1d6ff', '#a56cff', '#3a1a78']];
  function drawWhirl(ctx, x, y, cell, t, idx, a) {
    const R = cell * 0.78, col = WHIRL_COL[idx % 2];
    ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a;
    const A = asset('whirlpool'); if (A) { ctx.rotate(-t * 2); drawAsset(ctx, A, 0, 0, 0, cell); ctx.restore(); return; }
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, 'rgba(2,12,36,0.95)'); gr.addColorStop(0.5, col[2]); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let i = 0; i <= 26; i++) {
        const u = i / 26, th = arm * TAU / 3 + u * 4.4 - t * 3.2, rr = R * (0.12 + 0.88 * u);
        const px = Math.cos(th) * rr, py = Math.sin(th) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.strokeStyle = col[0]; ctx.globalAlpha = a * 0.85; ctx.lineWidth = R * 0.15; ctx.stroke();
      ctx.strokeStyle = col[1]; ctx.globalAlpha = a * 0.6; ctx.lineWidth = R * 0.3; ctx.stroke();
    }
    const rim = R * (0.96 + 0.03 * Math.sin(t * 4));
    ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(2,20,40,0.6)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, rim, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ boats
  function drawSailboat(ctx, x, y, ang, cell, t, v, sway) {
    const A = asset('sailboat'); if (A) { drawAsset(ctx, A, x, y, ang, cell); return; }
    const c = cell, pals = [['#ffffff', '#d83a3a'], ['#fff6dc', '#2b6fd6'], ['#ffffff', '#f2a92c']], pal = pals[v % 3];
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // wake
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const o = (k + (t * 1.5) % 1) * c * 0.9;
      ctx.globalAlpha = 0.5 - k * 0.14; ctx.beginPath(); ctx.moveTo(-c * 1.1 - o, -c * 0.3 - o * 0.2); ctx.lineTo(-c * 0.8 - o, 0); ctx.lineTo(-c * 1.1 - o, c * 0.3 + o * 0.2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // shadow + hull
    ctx.fillStyle = 'rgba(0,25,45,0.3)'; ctx.beginPath(); ctx.ellipse(c * 0.05, c * 0.16, c * 1.2, c * 0.42, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c * 1.3, 0); ctx.bezierCurveTo(c * 0.7, -c * 0.6, -c * 0.7, -c * 0.6, -c * 1.12, -c * 0.38);
    ctx.lineTo(-c * 1.12, c * 0.38); ctx.bezierCurveTo(-c * 0.7, c * 0.6, c * 0.7, c * 0.6, c * 1.3, 0); ctx.closePath();
    const hg = ctx.createLinearGradient(0, -c * 0.45, 0, c * 0.45); hg.addColorStop(0, '#fdfdfd'); hg.addColorStop(1, '#bcc9d2');
    ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = '#1d3340'; ctx.lineWidth = Math.max(2, c * 0.06); ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = pal[1]; ctx.lineWidth = c * 0.09; ctx.beginPath(); ctx.moveTo(c * 1.0, 0); ctx.bezierCurveTo(c * 0.5, -c * 0.33, -c * 0.7, -c * 0.34, -c * 1.0, -c * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c * 1.0, 0); ctx.bezierCurveTo(c * 0.5, c * 0.33, -c * 0.7, c * 0.34, -c * 1.0, c * 0.22); ctx.stroke();
    // deck
    ctx.fillStyle = '#c99a5b'; ctx.beginPath(); ctx.ellipse(-c * 0.1, 0, c * 0.78, c * 0.2, 0, 0, TAU); ctx.fill();
    // sails seen from above: a big bellied mainsail on its boom, jib forward, mast and pennant
    const s = sway, sb = Math.sin(t * 2.2) * 0.06;
    ctx.save(); ctx.translate(c * 0.25, 0); ctx.rotate(s * (0.42 + sb));
    ctx.fillStyle = 'rgba(0,25,45,0.22)'; ctx.beginPath(); ctx.moveTo(c * 0.08, c * 0.1); ctx.quadraticCurveTo(-c * 0.6, s * c * 0.95 + c * 0.1, -c * 1.25, c * 0.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal[0]; ctx.strokeStyle = '#1d3340'; ctx.lineWidth = Math.max(1.5, c * 0.05); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-c * 0.62, s * c * 0.9, -c * 1.3, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(29,51,64,0.35)'; ctx.lineWidth = 1.2; for (const k of [0.35, 0.65]) { ctx.beginPath(); ctx.moveTo(-c * 1.3 * k, 0); ctx.lineTo(-c * 1.3 * k + c * 0.05, s * c * 0.9 * (1 - Math.abs(2 * k - 1)) * 0.95); ctx.stroke(); }
    ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = Math.max(2, c * 0.07); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-c * 1.3, 0); ctx.stroke(); // boom
    ctx.restore();
    ctx.fillStyle = pal[1]; ctx.strokeStyle = '#1d3340'; ctx.lineWidth = Math.max(1.2, c * 0.04);
    ctx.beginPath(); ctx.moveTo(c * 1.12, 0); ctx.quadraticCurveTo(c * 0.72, s * c * 0.5, c * 0.28, s * c * 0.12); ctx.lineTo(c * 0.28, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#26343c'; ctx.beginPath(); ctx.arc(c * 0.25, 0, c * 0.09, 0, TAU); ctx.fill();
    ctx.fillStyle = pal[1]; ctx.beginPath(); ctx.moveTo(c * 0.25, 0); ctx.lineTo(c * 0.25 - c * 0.3, -s * c * 0.08 + Math.sin(t * 9) * c * 0.05); ctx.lineTo(c * 0.25, c * 0.06); ctx.fill();
    ctx.restore();
  }

  function drawPaddler(ctx, x, y, ang, cell, t, v) {
    const A = asset('paddler'); if (A) { drawAsset(ctx, A, x, y, ang, cell); return; }
    const c = cell, bc = ['#ffffff', '#d4dde3'];
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) { const o = (k + (t * 1.2) % 1) * c * 0.7; ctx.globalAlpha = 0.5 - k * 0.2; ctx.beginPath(); ctx.moveTo(-c * 0.95 - o, -c * 0.22 - o * 0.2); ctx.lineTo(-c * 0.7 - o, 0); ctx.lineTo(-c * 0.95 - o, c * 0.22 + o * 0.2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,25,45,0.28)'; ctx.beginPath(); ctx.ellipse(c * 0.04, c * 0.12, c * 1.0, c * 0.3, 0, 0, TAU); ctx.fill();
    // board
    ctx.beginPath(); ctx.moveTo(c * 1.05, 0); ctx.bezierCurveTo(c * 0.7, -c * 0.3, -c * 0.7, -c * 0.3, -c * 0.95, -c * 0.2); ctx.lineTo(-c * 0.95, c * 0.2); ctx.bezierCurveTo(-c * 0.7, c * 0.3, c * 0.7, c * 0.3, c * 1.05, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -c * 0.3, 0, c * 0.3); g.addColorStop(0, bc[0]); g.addColorStop(1, bc[1]);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1d3340'; ctx.lineWidth = Math.max(2, c * 0.06); ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#e0402f'; ctx.lineWidth = c * 0.1; ctx.beginPath(); ctx.moveTo(c * 0.85, 0); ctx.lineTo(-c * 0.8, 0); ctx.stroke();
    // paddle swinging side to side
    const sw = Math.sin(t * 3.4), px = sw * c * 0.35;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = c * 0.05; ctx.beginPath(); ctx.moveTo(px - c * 0.3 * Math.sign(sw || 1), -c * 0.46); ctx.lineTo(px + c * 0.3 * Math.sign(sw || 1), c * 0.46); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(px - c * 0.3 * Math.sign(sw || 1), -c * 0.46, c * 0.16, c * 0.07, 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + c * 0.3 * Math.sign(sw || 1), c * 0.46, c * 0.16, c * 0.07, 0.4, 0, TAU); ctx.fill();
    // person
    ctx.fillStyle = '#2d5ec7'; ctx.beginPath(); ctx.ellipse(-c * 0.05, 0, c * 0.16, c * 0.3, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = '#142a5e'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f0c196'; ctx.beginPath(); ctx.arc(-c * 0.02, 0, c * 0.14, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-c * 0.04, 0, c * 0.14, Math.PI * 0.55, Math.PI * 1.45); ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------------ Champ
  // Round corners, then resample a polyline at an even spacing.
  function smoothResample(pts, cell, ds) {
    if (pts.length < 2) return pts.slice();
    const rr = cell * 0.55, poly = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = Math.hypot(a.x - b.x, a.y - b.y), d2 = Math.hypot(c.x - b.x, c.y - b.y);
      const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (d1 < 0.5 || d2 < 0.5 || Math.abs(cr) < 0.01 * d1 * d2) { poly.push(b); continue; }
      const r = Math.min(rr, d1 * 0.5, d2 * 0.5);
      const p1 = { x: b.x + (a.x - b.x) / d1 * r, y: b.y + (a.y - b.y) / d1 * r }, p2 = { x: b.x + (c.x - b.x) / d2 * r, y: b.y + (c.y - b.y) / d2 * r };
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, u = 1 - t;
        poly.push({ x: u * u * p1.x + 2 * u * t * b.x + t * t * p2.x, y: u * u * p1.y + 2 * u * t * b.y + t * t * p2.y });
      }
    }
    poly.push(pts[pts.length - 1]);
    // resample
    const out = [{ x: poly[0].x, y: poly[0].y }];
    let carry = 0, px = poly[0].x, py = poly[0].y;
    for (let i = 1; i < poly.length; i++) {
      let qx = poly[i].x, qy = poly[i].y, seg = Math.hypot(qx - px, qy - py);
      while (seg > 0 && carry + seg >= ds) {
        const need = ds - carry, t = need / seg;
        px = px + (qx - px) * t; py = py + (qy - py) * t; out.push({ x: px, y: py });
        seg = Math.hypot(qx - px, qy - py); carry = 0;
      }
      carry += seg; px = qx; py = qy;
    }
    const last = poly[poly.length - 1], lo = out[out.length - 1];
    if (Math.hypot(last.x - lo.x, last.y - lo.y) > ds * 0.15) out.push({ x: last.x, y: last.y });
    return out;
  }

  // ---- Champ's looks. Unlockable in game ("Champ grows"); every skin is a palette for the same creature.
  // Every look follows one rule: the head is clearly lighter and warmer than the body (>= 20% in
  // luminance), so on any water the head is the brightest large shape and you can find yourself at once.
  const SKIN_BASE = {
    lake:   { name: 'Lake Green', head: [182, 240, 106], body: [63, 174, 74],  crest: '#ff7a59', fin: ['#ffb08a', '#ff7a59'], cheek: 'rgba(255,110,130,0.42)' },
    maple:  { name: 'Maple',      head: [255, 214, 120], body: [222, 104, 44], crest: '#ffd24a', fin: ['#ffe58a', '#f2b22c'], cheek: 'rgba(255,90,90,0.4)' },
    ice:    { name: 'Ice-Out',    head: [191, 234, 245], body: [122, 184, 230], crest: '#3a6fd8', fin: ['#a9cdff', '#5b8ee8'], cheek: 'rgba(255,140,170,0.45)' },
    sunset: { name: 'Sunset',     head: [255, 198, 222], body: [192, 98, 198], crest: '#3fe0c5', fin: ['#a8fbe9', '#3fd8bd'], cheek: 'rgba(255,90,140,0.42)' },
    night:  { name: 'Midnight',   head: [172, 190, 255], body: [84, 104, 214], crest: '#8ff7ff', fin: ['#c4fbff', '#5fd6ee'], cheek: 'rgba(160,200,255,0.35)' },
    gold:   { name: 'Golden',     head: [255, 246, 180], body: [224, 138, 26], crest: '#ff7a59', fin: ['#ffe2b0', '#f0a040'], cheek: 'rgba(255,120,90,0.4)' }
  };
  const SKINS = {};
  Object.keys(SKIN_BASE).forEach((k) => {
    const b = SKIN_BASE[k], lift = (c, t) => c.map((v) => v + (255 - v) * t), dim = (c, t) => c.map((v) => v * (1 - t));
    SKINS[k] = Object.assign({}, b, {
      shade: dim(b.body, 0.32), light: lift(b.body, 0.45),
      hg: ['rgb(' + lift(b.head, 0.45).map(Math.round) + ')', 'rgb(' + b.head.join(',') + ')', 'rgb(' + dim(b.head, 0.12).map(Math.round) + ')']
    });
  });
  const OUTLINE = '#07384a';
  const rgb = (a) => 'rgb(' + (a[0] | 0) + ',' + (a[1] | 0) + ',' + (a[2] | 0) + ')';
  const mixa = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // Stroke a pass along the body as long polylines: a new run starts only when colour or width changes.
  function strokeRuns(ctx, samples, n, ox, oy, widthFn, colFn) {
    let path = null, col = '', w = -1;
    const flush = () => { if (path) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(path); path = null; } };
    for (let i = n - 1; i >= 1; i--) {
      const a = samples[i - 1], b = samples[i]; if (b.brk) { flush(); continue; }
      const c = colFn(b), ww = Math.round(widthFn(a, b) * 2) / 2;
      if (!path || c !== col || ww !== w) { flush(); path = new Path2D(); path.moveTo(b.x + ox * b.r, b.y + oy * b.r); col = c; w = ww; }
      path.lineTo(a.x + ox * a.r, a.y + oy * a.r);
    }
    flush();
  }

  /* S: { strands:[[{x,y}...]], cell, time, bulges:[cellsFromHead], mouth, blink, look:{x,y}, pulse, dead, deadAmp,
          headAngle, angleHook, skin, mood:'happy'|'worry'|'' } */
  function drawChamp(ctx, S) {
    const cell = S.cell, P = S.skin || SKINS.lake; let npts = 0; S.strands.forEach((q) => { npts += q.length; });
    const ds = cell * (npts > 48 ? 0.23 : 0.17);
    // 1. dense samples across strands
    const samples = [];
    let off = 0;
    S.strands.forEach((pts) => {
      const dense = smoothResample(pts, cell, ds);
      let acc = 0;
      for (let i = 0; i < dense.length; i++) {
        if (i) acc += Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y);
        samples.push({ x: dense[i].x, y: dense[i].y, s: (off + acc) / cell, brk: i === 0 });
      }
      off += acc;
    });
    const n = samples.length; if (!n) return;
    const total = samples[n - 1].s;
    // 2. tangents (pointing head -> tail) + a gentle swimming undulation (small, so coils keep their gap)
    const T = S.time;
    for (let i = 0; i < n; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const p = samples[i]; p.tx = tx; p.ty = ty;
      const ramp = Math.min(1, p.s / 2.2);
      let w = Math.sin(p.s * 1.15 - T * 5.2) * cell * 0.025 * ramp;
      if (S.dead) w += Math.sin(p.s * 2.4 - T * 24) * cell * 0.3 * (S.deadAmp || 0) * Math.min(1, p.s / 1.5 + 0.2);
      p.x += -ty * w; p.y += tx * w;
    }
    // 3. radius: one constant width (0.72 cell outside the outline, so a strip of water always shows
    //    between parallel coils), tapering over the last 3 cells (only the last 1.5 on a short Champ, so
    //    the neck stays full width); fish bulges travel down the body
    const ow = Math.max(2.5, cell * 0.1), R = cell * 0.36 - ow, taper = Math.min(clamp(1.5 + (total - 6) * 0.75, 1.5, 3), total * 0.5);
    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const f = clamp((total - p.s) / taper, 0, 1);
      const r = R * (0.32 + 0.68 * Math.pow(f, 0.7));
      p.r0 = r;
      let bump = 0;
      // a meal swells the body behind the head and shrinks as it is digested on its way to the tail
      for (let k = 0; k < S.bulges.length; k++) { const b = S.bulges[k], d = (p.s - b) / 0.62; bump += Math.exp(-d * d) * clamp(1 - (b - 2) / 9, 0.2, 1); }
      p.bump = Math.min(1, bump);
      p.r = r + cell * 0.14 * Math.min(1.1, bump);
    }
    const body = P.body;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 4a. soft shadow on the lake bed (single paths per width bucket so it never stacks into dots)
    if (!S.noShadow) {
      const sx = cell * 0.08, sy = cell * 0.14, buckets = new Map();
      for (let i = 1; i < n; i++) {
        const a = samples[i - 1], b = samples[i]; if (b.brk) continue;
        const w = Math.round((a.r0 + b.r0 + ow * 2) / 3) * 3;
        let pth = buckets.get(w); if (!pth) { pth = new Path2D(); buckets.set(w, pth); }
        pth.moveTo(a.x + sx, a.y + sy); pth.lineTo(b.x + sx, b.y + sy);
      }
      ctx.strokeStyle = 'rgba(0,26,46,0.22)';
      buckets.forEach((pth, w) => { ctx.lineWidth = w; ctx.stroke(pth); });
    }
    // 4b. one pair of flippers at the neck (under the body)
    if (total > 2.4) {
      let k = 0; while (k < n - 1 && samples[k].s < 1.3) k++;
      const p = samples[k];
      if (!(p.brk && k > 0)) for (const sd of [-1, 1]) {
        const nx = -p.ty * sd, ny = p.tx * sd; // outward normal
        const paddle = S.dead ? 0 : Math.sin(T * 6.5) * 0.42;
        const ang = Math.atan2(ny * 0.86 + p.ty * 0.52, nx * 0.86 + p.tx * 0.52) + sd * paddle * 0.7;
        const Lf = cell * 0.62, W = cell * 0.3;
        ctx.save(); ctx.translate(p.x + nx * p.r0 * 0.6, p.y + ny * p.r0 * 0.6); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(0, -W * 0.5); ctx.quadraticCurveTo(Lf * 0.55, -W * 1.0, Lf, -W * 0.05); ctx.quadraticCurveTo(Lf * 0.62, W * 0.75, 0, W * 0.5); ctx.closePath();
        const fg = ctx.createLinearGradient(0, 0, Lf, 0); fg.addColorStop(0, P.fin[1]); fg.addColorStop(1, P.fin[0]);
        ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = ow * 0.8; ctx.stroke();
        ctx.restore();
      }
    }
    // 4c. outline (segments batched into runs of equal width: far fewer draw calls on long bodies)
    strokeRuns(ctx, samples, n, 0, 0, (a, b) => Math.round((a.r + b.r) + ow * 2), () => OUTLINE);
    for (let i = 0; i < n; i++) { const b = samples[i]; const nextBrk = i === n - 1 || samples[i + 1].brk; if (b.brk && nextBrk) { ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + ow, 0, TAU); ctx.fill(); } }
    // 4d. rounded body in ONE colour: shade (lower right) -> base -> light stripe (upper left), all opaque
    const passes = [[0, 0, 1.0, rgb(P.shade)], [-0.1, -0.14, 0.8, rgb(body)], [-0.22, -0.3, 0.38, rgb(mixa(body, P.light, 0.55))]];
    for (const [ox, oy, wk, col] of passes) strokeRuns(ctx, samples, n, ox, oy, (a, b) => Math.round((a.r + b.r) * wk), () => col);
    for (let i = 0; i < n; i++) { const b = samples[i]; const nextBrk = i === n - 1 || samples[i + 1].brk; if (b.brk && nextBrk) { ctx.fillStyle = rgb(body); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); } }
    // 4e. one small pale dapple every 3 cells (just enough texture to show the body is moving)
    const spots = new Path2D();
    for (let i = 2; i < n - 1; i++) {
      const p = samples[i], q = samples[i - 1]; if (p.brk) continue;
      const seg = Math.floor((p.s - 2) / 3); if (p.s < 2 || seg === Math.floor((q.s - 2) / 3) || p.s > total - 2) continue;
      const side = seg & 1 ? 1 : -1, sx = p.x - p.ty * side * p.r * 0.35, sy = p.y + p.tx * side * p.r * 0.35, sr = p.r * 0.32;
      spots.moveTo(sx + sr, sy); spots.arc(sx, sy, sr, 0, TAU);
    }
    ctx.fillStyle = rgb(mixa(body, P.light, 0.5)); ctx.fill(spots);
    // 4f. tail fluke: two rounded lobes in the body colour
    if (n > 4) {
      const tp = samples[n - 1], tq = samples[Math.max(0, n - 4)];
      const ang = Math.atan2(tp.y - tq.y, tp.x - tq.x), wag = S.dead ? 0 : Math.sin(T * 7) * 0.32, fs = cell * 0.78;
      ctx.save(); ctx.translate(tp.x, tp.y); ctx.rotate(ang + wag);
      ctx.beginPath(); ctx.moveTo(-fs * 0.08, 0);
      ctx.quadraticCurveTo(fs * 0.12, -fs * 0.1, fs * 0.36, -fs * 0.38); ctx.quadraticCurveTo(fs * 0.5, -fs * 0.42, fs * 0.5, -fs * 0.3);
      ctx.quadraticCurveTo(fs * 0.44, -fs * 0.08, fs * 0.3, 0);
      ctx.quadraticCurveTo(fs * 0.44, fs * 0.08, fs * 0.5, fs * 0.3); ctx.quadraticCurveTo(fs * 0.5, fs * 0.42, fs * 0.36, fs * 0.38);
      ctx.quadraticCurveTo(fs * 0.12, fs * 0.1, -fs * 0.08, 0); ctx.closePath();
      ctx.fillStyle = rgb(body); ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = ow * 0.8; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    // 5. head: faces along the curve, looking back about 0.6 cell
    const hp = samples[0];
    let k2 = 0; while (k2 < n - 1 && Math.hypot(samples[k2].x - hp.x, samples[k2].y - hp.y) < cell * 0.6) k2++;
    if (k2 > 0) { const tgt = Math.atan2(hp.y - samples[k2].y, hp.x - samples[k2].x); S.headAngle = S.angleHook ? S.angleHook(tgt) : tgt; }
    drawHead(ctx, hp.x, hp.y, S, cell);
  }

  function drawHead(ctx, x, y, S, cell) {
    const A = asset('champHead'), P = S.skin || SKINS.lake;
    const ang = S.headAngle, c = cell * 1.06, pulse = S.pulse || 0, T = S.time, mood = S.dead ? 'dead' : (S.mood || '');
    // shadow
    if (!S.noShadow) { ctx.fillStyle = 'rgba(0,26,46,0.24)'; ctx.beginPath(); ctx.ellipse(x + cell * 0.12, y + cell * 0.2, c * 0.68, c * 0.6, ang, 0, TAU); ctx.fill(); }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.scale(1 + 0.12 * pulse, 1 - 0.1 * pulse);
    if (A) { drawAsset(ctx, A, 0, 0, 0, c); ctx.restore(); return; }
    const ow = Math.max(2, c * 0.075);
    // ear frills
    ctx.lineJoin = 'round';
    const fl = Math.sin(T * 6) * 0.1;
    [-1, 1].forEach((sd) => {
      ctx.save(); ctx.translate(-c * 0.2, sd * c * 0.4); ctx.rotate(sd * (0.75 + fl));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-c * 0.1, sd * c * 0.1, -c * 0.38, sd * c * 0.32); ctx.quadraticCurveTo(-c * 0.05, sd * c * 0.4, c * 0.18, sd * c * 0.14); ctx.closePath();
      ctx.fillStyle = P.fin[1]; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = ow * 0.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, c * 0.03); ctx.beginPath(); ctx.moveTo(-c * 0.02, sd * c * 0.06); ctx.lineTo(-c * 0.26, sd * c * 0.26); ctx.stroke();
      ctx.restore();
    });
    // two little horn nubs at the back of the crown
    [-1, 1].forEach((sd) => {
      ctx.save(); ctx.translate(-c * 0.5, sd * c * 0.22); ctx.rotate(sd * 0.45);
      ctx.beginPath(); ctx.ellipse(-c * 0.08, 0, c * 0.17, c * 0.095, 0, 0, TAU);
      ctx.fillStyle = OUTLINE; ctx.lineWidth = ow * 1.6; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.fillStyle = P.crest; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-c * 0.1, -c * 0.025, c * 0.06, c * 0.025, 0, 0, TAU); ctx.fill();
      ctx.restore();
    });
    // skull + snout (outline first, fills after so the seam vanishes)
    const sk = { x: c * 0.04, rx: c * 0.6, ry: c * 0.5 }, sn = { x: c * 0.44, rx: c * 0.3, ry: c * 0.34 };
    ctx.fillStyle = OUTLINE;
    ctx.beginPath(); ctx.ellipse(sk.x, 0, sk.rx + ow, sk.ry + ow, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sn.x, 0, sn.rx + ow, sn.ry + ow, 0, 0, TAU); ctx.fill();
    const hg = ctx.createRadialGradient(c * 0.12, -c * 0.2, c * 0.05, c * 0.1, 0, c * 0.75);
    hg.addColorStop(0, P.hg[0]); hg.addColorStop(0.45, P.hg[1]); hg.addColorStop(1, P.hg[2]);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(sk.x, 0, sk.rx, sk.ry, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sn.x, 0, sn.rx, sn.ry, 0, 0, TAU); ctx.fill();
    // crown freckles + brow shine
    ctx.fillStyle = rgb(mixa(P.head, P.body, 0.45));
    [[-c * 0.22, 0, 0.06], [-c * 0.12, -c * 0.13, 0.04], [-c * 0.12, c * 0.13, 0.04]].forEach(([fx, fy, fr]) => { ctx.beginPath(); ctx.arc(fx, fy, c * fr, 0, TAU); ctx.fill(); });
    ctx.fillStyle = 'rgba(255,255,230,0.32)'; ctx.beginPath(); ctx.ellipse(c * 0.22, -c * 0.34, c * 0.24, c * 0.065, -0.25, 0, TAU); ctx.fill();
    // cheeks (rosier when happy)
    ctx.fillStyle = P.cheek; const ck = mood === 'happy' ? 1.35 : 1;
    [-1, 1].forEach((sd) => { ctx.beginPath(); ctx.ellipse(c * 0.36, sd * c * 0.28, c * 0.1 * ck, c * 0.065 * ck, 0, 0, TAU); ctx.fill(); });
    // nostrils
    ctx.fillStyle = 'rgba(5,60,60,0.7)';
    [-1, 1].forEach((sd) => { ctx.beginPath(); ctx.ellipse(c * 0.67, sd * c * 0.09, c * 0.028, c * 0.04, 0, 0, TAU); ctx.fill(); });
    // mouth
    const m = S.mouth || 0;
    if (mood === 'dead') {
      ctx.fillStyle = '#5a0f1f'; ctx.beginPath(); ctx.ellipse(c * 0.56, 0, c * 0.1, c * 0.12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff6f8a'; ctx.beginPath(); ctx.ellipse(c * 0.74, c * 0.02, c * 0.17, c * 0.08, 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (m > 0.04) {
      const rx = c * (0.07 + 0.2 * m), ry = c * (0.06 + 0.2 * m);
      ctx.fillStyle = '#5a0f1f'; ctx.beginPath(); ctx.ellipse(c * 0.6, 0, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ff7a96'; ctx.beginPath(); ctx.ellipse(c * 0.56, 0, rx * 0.6, ry * 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; [-1, 1].forEach((sd) => { ctx.beginPath(); ctx.moveTo(c * 0.6 + rx * 0.5, sd * ry * 0.95); ctx.lineTo(c * 0.6 + rx * 0.95, sd * ry * 0.55); ctx.lineTo(c * 0.6 + rx * 0.2, sd * ry * 0.5); ctx.fill(); });
    } else {
      ctx.strokeStyle = 'rgba(5,70,70,0.75)'; ctx.lineWidth = Math.max(1.5, c * 0.045); ctx.lineCap = 'round';
      const sm = mood === 'happy' ? 0.24 : mood === 'worry' ? 0.06 : 0.16;
      ctx.beginPath(); ctx.moveTo(c * 0.6, -c * 0.16); ctx.quadraticCurveTo(c * (0.6 + sm), 0, c * 0.6, c * 0.16); ctx.stroke();
    }
    // eyes
    const er = c * 0.19, ex = c * 0.15;
    [-1, 1].forEach((sd) => {
      const ey = sd * c * 0.32;
      if (mood === 'dead') {
        ctx.strokeStyle = '#06262f'; ctx.lineWidth = Math.max(2, c * 0.07); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - er * 0.6, ey - er * 0.6); ctx.lineTo(ex + er * 0.6, ey + er * 0.6); ctx.moveTo(ex + er * 0.6, ey - er * 0.6); ctx.lineTo(ex - er * 0.6, ey + er * 0.6); ctx.stroke();
        return;
      }
      if (mood === 'happy') { // closed, smiling eyes: one thick curved lid line
        ctx.strokeStyle = '#06262f'; ctx.lineWidth = Math.max(2.2, c * 0.085); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(ex - er * 0.35, ey, er * 0.75, -Math.PI * 0.45, Math.PI * 0.45); ctx.stroke();
        return;
      }
      ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(ex, ey, er + ow * 0.7, 0, TAU); ctx.fill();
      const open = 1 - (S.blink || 0) * 0.92;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(1, Math.max(0.08, open));
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.fill();
      const big = mood === 'worry' ? 0.5 : 0.6;
      const lx = clamp(S.look.x, -1, 1) * er * 0.38, ly = clamp(S.look.y, -1, 1) * er * 0.38;
      ctx.fillStyle = '#10343f'; ctx.beginPath(); ctx.arc(lx + er * 0.12, ly, er * big, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(lx + er * 0.12 - er * 0.18, ly - er * 0.22, er * 0.22, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(lx + er * 0.3, ly + er * 0.2, er * 0.09, 0, TAU); ctx.fill();
      ctx.restore();
      // brows: worried brows tilt up toward the middle
      if (mood === 'worry') {
        ctx.strokeStyle = '#06262f'; ctx.lineWidth = Math.max(2, c * 0.055); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex - er * 0.9, ey + sd * er * 1.25); ctx.lineTo(ex + er * 0.6, ey + sd * er * 0.95); ctx.stroke();
      }
    });
    // a sweat drop when danger is right ahead
    if (mood === 'worry') {
      const k = (T * 2.2) % 1;
      ctx.fillStyle = 'rgba(200,240,255,' + (0.95 - k * 0.6) + ')'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2;
      const dx = -c * 0.05, dy = -c * 0.62 - k * c * 0.1;
      ctx.beginPath(); ctx.moveTo(dx, dy - c * 0.12); ctx.quadraticCurveTo(dx + c * 0.09, dy, dx, dy + c * 0.06); ctx.quadraticCurveTo(dx - c * 0.09, dy, dx, dy - c * 0.12); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    // dizzy stars in screen space
    if (mood === 'dead') {
      for (let i = 0; i < 4; i++) {
        const a = T * 6 + i * TAU / 4, sx = x + Math.cos(a) * c * 0.75, sy = y - c * 0.7 + Math.sin(a) * c * 0.25;
        ctx.fillStyle = i % 2 ? '#ffd24a' : '#fff'; star(ctx, sx, sy, c * 0.16);
      }
    }
  }

  // A small curled Champ for menus (skin picker, title badge). Draws into the given 2D context.
  function drawChampBadge(ctx, w, h, skinId, t) {
    const cell = Math.min(h / 2.6, w / 5.4), P = SKINS[skinId] || SKINS.lake;
    const pts = [];
    for (let i = 0; i <= 30; i++) { const u = i / 30; pts.push({ x: w * (0.78 - u * 0.62), y: h * 0.55 + Math.sin(u * 5.2 + 0.4) * cell * 0.55 * Math.min(1, u * 3) }); }
    let ang = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
    drawChamp(ctx, { strands: [pts], cell, time: t || 0, bulges: [], mouth: 0, blink: 0, look: { x: 1, y: 0.3 }, pulse: 0, dead: 0, skin: P, mood: 'happy', headAngle: ang, angleHook: null, noShadow: false });
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    ctx.closePath(); ctx.fill();
  }

  window.Art = { ASSETS, SKINS, drawIsleTree, MOODS, drawMood, shoreFor, drawChampBadge, loadAssets, mulberry, drawWater, lakePath, buildShore, buildGridLayer, drawFish, drawPerch, drawRock, drawWhirl, drawSailboat, drawPaddler, drawChamp, star, clamp, lerp };
})();
