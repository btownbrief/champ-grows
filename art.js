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
  let waterTile = null;
  function buildWaterTile() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), r = mulberry(7);
    // soft blobs
    for (let i = 0; i < 26; i++) {
      const x = r() * S, y = r() * S, rad = 18 + r() * 40;
      for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, 'rgba(150,225,255,0.07)'); gr.addColorStop(1, 'rgba(150,225,255,0)');
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    // light worms (caustics), tiled by wrap
    for (let i = 0; i < 54; i++) {
      const cx = r() * S, cy = r() * S, a = r() * TAU, len = 50 + r() * 110, amp = 5 + r() * 12, wl = 28 + r() * 40, ph = r() * TAU, w = 1.2 + r() * 2.2;
      const pts = [];
      for (let t = -len / 2; t <= len / 2; t += 6) {
        const off = Math.sin(t / wl * TAU + ph) * amp;
        pts.push([cx + Math.cos(a) * t - Math.sin(a) * off, cy + Math.sin(a) * t + Math.cos(a) * off]);
      }
      for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
        [[w * 3.4, 0.02], [w * 2, 0.035], [w, 0.07]].forEach((p) => {
          g.lineWidth = p[0]; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(175,238,255,' + p[1] + ')';
          g.beginPath(); pts.forEach((q, k) => k ? g.lineTo(q[0] + ox, q[1] + oy) : g.moveTo(q[0] + ox, q[1] + oy)); g.stroke();
        });
      }
    }
    waterTile = c; return c;
  }

  function tiled(ctx, tile, scale, ox, oy, W, H, alpha, comp) {
    const ts = tile.width * scale;
    let sx = -(((ox % ts) + ts) % ts), sy = -(((oy % ts) + ts) % ts);
    ctx.save(); ctx.globalAlpha = alpha; if (comp) ctx.globalCompositeOperation = comp;
    for (let y = sy; y < H; y += ts) for (let x = sx; x < W; x += ts) ctx.drawImage(tile, x, y, ts + 0.6, ts + 0.6);
    ctx.restore();
  }

  // Lake moods: each mode gets its own time of day / weather so modes feel like different places.
  const MOODS = {
    day:     { g: ['#0b5a86', '#0c6c9c', '#09507a'], a1: 0.7, a2: 0.45, sp: 1 },
    morning: { g: ['#1689a4', '#20a0b8', '#11738f'], a1: 0.85, a2: 0.5, sp: 0.8, grade: 'rgba(255,226,160,0.55)', haze: 'rgba(255,250,225,0.10)' },
    dusk:    { g: ['#1f3f7c', '#2c4282', '#182e60'], a1: 0.55, a2: 0.42, sp: 0.7, grade: 'rgba(255,110,170,0.55)', tint: 'rgba(40,20,80,0.10)' },
    storm:   { g: ['#2b5568', '#33606f', '#203f52'], a1: 0.4, a2: 0.5, sp: 1.8, tint: 'rgba(20,32,44,0.22)', rain: true },
    summer:  { g: ['#078aa6', '#0aa0b8', '#067693'], a1: 0.85, a2: 0.55, sp: 1.2, grade: 'rgba(255,250,200,0.35)' },
    golden:  { g: ['#1f6a92', '#1f6a92', '#185478'], gs: [[0, '#e8a356'], [0.16, '#9c8a72'], [0.34, '#2a6f93'], [1, '#185478']], a1: 0.6, a2: 0.4, sp: 0.9, tint: 'rgba(255,170,80,0.06)', sunpath: true },
    night:   { g: ['#0b2a50', '#0e3360', '#08203f'], a1: 0.5, a2: 0.35, sp: 0.6, tint: 'rgba(8,16,52,0.30)', stars: true, moon: true }
  };
  // colour grade over the whole scene (lake, shore and grass): soft-light for warm light, plain wash for gloom, rain for storms
  function drawMood(ctx, L, t, moodId) {
    const M = MOODS[moodId]; if (!M) return;
    if (M.grade) { ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = M.grade; ctx.fillRect(-20, -20, L.W + 40, L.H + 40); ctx.restore(); }
    if (M.glare) { ctx.save(); ctx.globalCompositeOperation = 'screen'; const gx = L.W * 0.8, gy = L.H * 0.12, gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(L.W, L.H) * 0.9); gr.addColorStop(0, M.glare); gr.addColorStop(0.5, 'rgba(255,140,60,0.18)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, L.W, L.H); ctx.restore(); }
    if (M.tint) { ctx.fillStyle = M.tint; ctx.fillRect(-20, -20, L.W + 40, L.H + 40); }
    if (M.haze) { const hg = ctx.createLinearGradient(0, 0, 0, L.H * 0.5); hg.addColorStop(0, M.haze); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(0, 0, L.W, L.H * 0.5); }
    if (M.sunpath) { // low sun: a column of warm glitter on the water and a soft glow on the far shore
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sx = L.gx + L.gw * 0.68;
      ctx.fillStyle = 'rgba(255,190,90,0.8)';
      for (let i = 0; i < 46; i++) { const u = (i * 0.618034) % 1, y = L.gy + u * L.gh, spread = L.cell * (0.6 + u * 2.4), x = sx + Math.sin(i * 12.9898) * spread, k = 0.5 + 0.5 * Math.sin(t * (2 + (i % 5)) + i); if (k < 0.35) continue; ctx.globalAlpha = (k - 0.35) * (1 - u * 0.5); ctx.fillRect(x - L.cell * 0.22 * k, y, L.cell * 0.44 * k, 1.6); }
      ctx.restore();
    }
    if (M.moon) { // moon reflection: a pale glow and a few rippling streaks
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const mx = L.gx + L.gw * 0.3, my = L.gy + L.gh * 0.22, gl = ctx.createRadialGradient(mx, my, 0, mx, my, L.cell * 3.2);
      gl.addColorStop(0, 'rgba(220,235,255,0.35)'); gl.addColorStop(1, 'rgba(200,220,255,0)'); ctx.fillStyle = gl; ctx.fillRect(mx - L.cell * 3.2, my - L.cell * 3.2, L.cell * 6.4, L.cell * 6.4);
      ctx.fillStyle = 'rgba(235,242,255,0.7)';
      for (let i = 0; i < 7; i++) { const w = L.cell * (1.3 - Math.abs(i - 3) * 0.28) * (0.8 + 0.2 * Math.sin(t * 2 + i)), y = my - L.cell * 0.9 + i * L.cell * 0.3; ctx.fillRect(mx - w / 2 + Math.sin(t * 1.5 + i) * 3, y, w, 1.8); }
      ctx.restore();
    }
    if (M.rain) {
      ctx.save(); ctx.strokeStyle = 'rgba(210,230,245,0.28)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < 70; i++) { const sx = ((i * 97.3 + t * 160) % (L.W + 80)) - 40, sy = ((i * 211.7 + t * 620) % (L.H + 60)) - 30; ctx.moveTo(sx, sy); ctx.lineTo(sx - 5, sy + 15); }
      ctx.stroke(); ctx.restore();
    }
  }
  let waterGrad = null, waterGradKey = '';
  function drawWater(ctx, L, t, moodId) {
    const M = MOODS[moodId] || MOODS.day, key = L.W + 'x' + L.H + (moodId || 'day');
    if (!waterGrad || waterGradKey !== key) {
      waterGrad = ctx.createLinearGradient(0, 0, 0, L.H);
      if (M.gs) { const y0 = L.gy, y1 = L.gy + L.gh; waterGrad = ctx.createLinearGradient(0, y0, 0, y1); M.gs.forEach(([k, c]) => waterGrad.addColorStop(k, c)); }
      else { waterGrad.addColorStop(0, M.g[0]); waterGrad.addColorStop(0.5, M.g[1]); waterGrad.addColorStop(1, M.g[2]); }
      waterGradKey = key;
    }
    ctx.fillStyle = waterGrad; ctx.fillRect(0, 0, L.W, L.H);
    if (!waterTile) buildWaterTile();
    tiled(ctx, waterTile, 1.0, t * 9 * M.sp, t * 5 * M.sp, L.W, L.H, M.a1, 'screen');
    tiled(ctx, waterTile, 1.7, -t * 7 * M.sp + 40, t * 4 * M.sp + 90, L.W, L.H, M.a2, 'screen');
  }
  function drawNightStars(ctx, L, t, glints) {
    ctx.save(); ctx.fillStyle = '#fff6d0';
    for (let i = 0; i < glints.length; i++) {
      const g = glints[i], k = 0.5 + 0.5 * Math.sin(t * g.sp * 0.7 + g.ph), x = L.gx + g.x * L.gw, y = L.gy + g.y * L.gh;
      ctx.globalAlpha = 0.25 + 0.55 * k; ctx.beginPath(); ctx.arc(x, y, 0.8 + k * 1.3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }


  // twinkling glints over the water
  function drawGlints(ctx, L, t, glints) {
    ctx.save(); ctx.fillStyle = '#fff';
    for (let i = 0; i < glints.length; i++) {
      const g = glints[i], k = Math.sin(t * g.sp + g.ph);
      if (k < 0.82) continue;
      const a = (k - 0.82) / 0.18, s = g.s * (0.5 + a);
      ctx.globalAlpha = a * 0.85;
      const x = L.gx + g.x * L.gw, y = L.gy + g.y * L.gh;
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y); ctx.fill();
    }
    ctx.restore();
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
    g.fillStyle = 'rgba(255,255,255,0.032)';
    for (let y = 0; y < L.rows; y++) for (let x = 0; x < L.cols; x++) if ((x + y) & 1) g.fillRect(L.gx + x * L.cell, L.gy + y * L.cell, L.cell, L.cell);
    g.restore();
    return c;
  }

  // ------------------------------------------------------------------ fish
  function drawFish(ctx, x, y, len, ang, ph, tint) {
    const a = asset('fish'); if (a) { drawAsset(ctx, a, x, y, ang, len / 0.75); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const L = len, sw = Math.sin(ph) * 0.45;
    // glow so fish read against the water
    const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.9); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, L * 0.9, 0, TAU); ctx.fill();
    // tail
    ctx.save(); ctx.translate(-L * 0.34, 0); ctx.rotate(sw);
    ctx.fillStyle = tint ? '#ffb347' : '#ff8a5b'; ctx.strokeStyle = '#0a3a4e'; ctx.lineWidth = L * 0.06; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.06, 0); ctx.lineTo(-L * 0.3, -L * 0.24); ctx.quadraticCurveTo(-L * 0.2, 0, -L * 0.3, L * 0.24); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // body
    const bg = ctx.createLinearGradient(0, -L * 0.25, 0, L * 0.25);
    bg.addColorStop(0, tint ? '#fff4d0' : '#f4fbff'); bg.addColorStop(0.55, tint ? '#e8c37a' : '#a9d7f0'); bg.addColorStop(1, tint ? '#b98a38' : '#5f9fc8');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.42, L * 0.24, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#0a3a4e'; ctx.lineWidth = L * 0.06; ctx.stroke();
    // fin + gill + eye
    ctx.fillStyle = '#ff8a5b'; ctx.beginPath(); ctx.moveTo(-L * 0.04, -L * 0.2); ctx.quadraticCurveTo(L * 0.06, -L * 0.42, L * 0.14, -L * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,58,78,0.45)'; ctx.lineWidth = L * 0.04; ctx.beginPath(); ctx.arc(L * 0.12, 0, L * 0.17, -1.0, 1.0); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.27, -L * 0.06, L * 0.07, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a2433'; ctx.beginPath(); ctx.arc(L * 0.285, -L * 0.06, L * 0.04, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-L * 0.05, -L * 0.1, L * 0.18, L * 0.04, -0.1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPerch(ctx, x, y, len, ang, ph, frac, t) {
    // aura + timer ring first (unrotated)
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const aura = ctx.createRadialGradient(x, y, 0, x, y, len * 1.15);
    aura.addColorStop(0, 'rgba(255,225,110,' + (0.45 + 0.2 * pulse) + ')'); aura.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(x, y, len * 1.15, 0, TAU); ctx.fill();
    // timer ring: shrinks clockwise; urgent colours near the end
    const urgent = frac < 0.3, blink = urgent && Math.sin(t * 18) > 0;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,25,40,0.5)'; ctx.lineWidth = len * 0.2; ctx.beginPath(); ctx.arc(x, y, len * 0.82, 0, TAU); ctx.stroke();
    ctx.strokeStyle = blink ? '#ffffff' : (urgent ? '#ff6a4d' : '#ffd24a'); ctx.lineWidth = len * 0.13;
    ctx.beginPath(); ctx.arc(x, y, len * 0.82, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(frac, 0, 1)); ctx.stroke();
    ctx.restore();
    const A = asset('perch'); if (A) { drawAsset(ctx, A, x, y, ang, len); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const L = len * 0.9, sw = Math.sin(ph) * 0.4;
    ctx.save(); ctx.translate(-L * 0.34, 0); ctx.rotate(sw);
    ctx.fillStyle = '#ff9e2c'; ctx.strokeStyle = '#6a3300'; ctx.lineWidth = L * 0.06; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(L * 0.06, 0); ctx.lineTo(-L * 0.32, -L * 0.28); ctx.quadraticCurveTo(-L * 0.2, 0, -L * 0.32, L * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const bg = ctx.createLinearGradient(0, -L * 0.28, 0, L * 0.28);
    bg.addColorStop(0, '#fff0a0'); bg.addColorStop(0.5, '#ffc83a'); bg.addColorStop(1, '#e08a14');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.45, L * 0.27, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a3300'; ctx.lineWidth = L * 0.06; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(160,80,0,0.35)'; for (let i = -1; i <= 2; i++) ctx.fillRect(-L * 0.18 + i * L * 0.15, -L * 0.3, L * 0.07, L * 0.6);
    ctx.restore();
    // spiny dorsal
    ctx.fillStyle = '#ff7a2c'; ctx.beginPath(); ctx.moveTo(-L * 0.18, -L * 0.24);
    for (let i = 0; i < 4; i++) { ctx.lineTo(-L * 0.12 + i * L * 0.1, -L * 0.45); ctx.lineTo(-L * 0.06 + i * L * 0.1, -L * 0.25); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(L * 0.28, -L * 0.07, L * 0.075, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1500'; ctx.beginPath(); ctx.arc(L * 0.295, -L * 0.07, L * 0.045, 0, TAU); ctx.fill();
    ctx.restore();
    // sparkles
    ctx.save(); ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      const k = (t * 1.4 + i / 3) % 1, a = i * 2.1 + t, rr = len * (0.5 + k * 0.5);
      ctx.globalAlpha = (1 - k) * 0.9; const sx = x + Math.cos(a) * rr, sy = y + Math.sin(a) * rr, s = len * 0.09 * (1 - k * 0.5);
      ctx.beginPath(); ctx.moveTo(sx - s, sy); ctx.lineTo(sx, sy - s * 1.8); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy + s * 1.8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // a little tree / bush on a Daily Lake islet (seen from above)
  function drawIsleTree(ctx, x, y, cell, seed, k) {
    if (k <= 0) return;
    const r = mulberry(seed * 131 + 7), rad = cell * (0.3 + r() * 0.08) * k, kind = Math.floor(r() * 4);
    const pals = [['#2f6d36', '#3f8a44', '#5aa75a'], ['#b4501f', '#d96f26', '#f0a03a'], ['#2a6340', '#38815a', '#52a373'], ['#a8322a', '#cf4a35', '#ee7b4d']][kind];
    ctx.fillStyle = 'rgba(0,30,20,0.3)'; ctx.beginPath(); ctx.ellipse(x + rad * 0.35, y + rad * 0.45, rad, rad * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = pals[0]; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = rad * (0.2 + r() * 0.3); ctx.fillStyle = i % 2 ? pals[1] : pals[2]; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d - rad * 0.12, y + Math.sin(a) * d - rad * 0.14, rad * (0.42 + r() * 0.18), 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,220,0.25)'; ctx.beginPath(); ctx.arc(x - rad * 0.3, y - rad * 0.34, rad * 0.3, 0, TAU); ctx.fill();
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
    ctx.globalAlpha = a; ctx.strokeStyle = col[0]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * (0.96 + 0.03 * Math.sin(t * 4)), 0, TAU); ctx.stroke();
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
    const c = cell, cols = [['#ffd24a', '#ff7a59'], ['#7be06a', '#2f9e5b'], ['#ff9ab0', '#c0386b']], bc = cols[v % 3];
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let k = 0; k < 2; k++) { const o = (k + (t * 1.2) % 1) * c * 0.7; ctx.globalAlpha = 0.5 - k * 0.2; ctx.beginPath(); ctx.moveTo(-c * 0.95 - o, -c * 0.22 - o * 0.2); ctx.lineTo(-c * 0.7 - o, 0); ctx.lineTo(-c * 0.95 - o, c * 0.22 + o * 0.2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,25,45,0.28)'; ctx.beginPath(); ctx.ellipse(c * 0.04, c * 0.12, c * 1.0, c * 0.3, 0, 0, TAU); ctx.fill();
    // board
    ctx.beginPath(); ctx.moveTo(c * 1.05, 0); ctx.bezierCurveTo(c * 0.7, -c * 0.3, -c * 0.7, -c * 0.3, -c * 0.95, -c * 0.2); ctx.lineTo(-c * 0.95, c * 0.2); ctx.bezierCurveTo(-c * 0.7, c * 0.3, c * 0.7, c * 0.3, c * 1.05, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -c * 0.3, 0, c * 0.3); g.addColorStop(0, bc[0]); g.addColorStop(1, bc[1]);
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1d3340'; ctx.lineWidth = Math.max(2, c * 0.06); ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = c * 0.05; ctx.beginPath(); ctx.moveTo(c * 0.8, 0); ctx.lineTo(-c * 0.8, 0); ctx.stroke();
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
  const SKINS = {
    lake:   { name: 'Lake Green', head: [150, 232, 96], mid: [62, 190, 110], tail: [36, 140, 126], shade: [22, 112, 92], light: [232, 255, 196], spot: [34, 140, 96], crest: '#ff7a59', crestD: '#b8402a', fin: ['#ffb08a', '#ff7a59'], hg: ['#d8ff9c', '#8fe36a', '#3fb56e'], cheek: 'rgba(255,110,130,0.42)' },
    maple:  { name: 'Maple', head: [255, 196, 96], mid: [238, 116, 52], tail: [178, 56, 42], shade: [140, 42, 30], light: [255, 236, 186], spot: [196, 70, 40], crest: '#ffd24a', crestD: '#a8761a', fin: ['#ffe58a', '#f2b22c'], hg: ['#fff1b8', '#ffb04d', '#e0632e'], cheek: 'rgba(255,90,90,0.4)' },
    ice:    { name: 'Ice-Out', head: [226, 247, 255], mid: [156, 210, 242], tail: [96, 156, 214], shade: [74, 124, 184], light: [255, 255, 255], spot: [118, 178, 226], crest: '#3a6fd8', crestD: '#1d3f8a', fin: ['#a9cdff', '#5b8ee8'], hg: ['#ffffff', '#cdeeff', '#86bfe8'], cheek: 'rgba(255,140,170,0.45)' },
    sunset: { name: 'Sunset', head: [255, 176, 204], mid: [206, 112, 204], tail: [112, 82, 192], shade: [86, 50, 150], light: [255, 232, 242], spot: [160, 80, 180], crest: '#3fe0c5', crestD: '#14806f', fin: ['#a8fbe9', '#3fd8bd'], hg: ['#ffe0ec', '#ff9cc4', '#c06ac8'], cheek: 'rgba(255,90,140,0.42)' },
    night:  { name: 'Midnight', head: [120, 140, 225], mid: [70, 86, 182], tail: [40, 52, 130], shade: [20, 28, 80], light: [170, 196, 255], spot: [110, 246, 255], glow: true, crest: '#8ff7ff', crestD: '#2a8aa8', fin: ['#c4fbff', '#5fd6ee'], hg: ['#a9bbff', '#5a6ed0', '#2a347e'], cheek: 'rgba(160,200,255,0.35)' },
    gold:   { name: 'Golden', head: [255, 242, 156], mid: [255, 206, 64], tail: [222, 150, 30], shade: [168, 100, 14], light: [255, 255, 226], spot: [236, 168, 40], crest: '#ff7a59', crestD: '#a33a20', fin: ['#fff6c8', '#ffd24a'], hg: ['#fffbe0', '#ffe066', '#e0a020'], cheek: 'rgba(255,120,90,0.4)', sparkle: true }
  };
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
    // 2. tangents (pointing head -> tail) + a gentle swimming undulation
    const T = S.time;
    for (let i = 0; i < n; i++) {
      const a = samples[Math.max(0, i - 1)], b = samples[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const p = samples[i]; p.tx = tx; p.ty = ty;
      const ramp = Math.min(1, p.s / 2.2);
      let w = Math.sin(p.s * 1.15 - T * 5.2) * cell * 0.045 * ramp;
      if (S.dead) w += Math.sin(p.s * 2.4 - T * 24) * cell * 0.3 * (S.deadAmp || 0) * Math.min(1, p.s / 1.5 + 0.2);
      p.x += -ty * w; p.y += tx * w;
    }
    // 3. radius: slim neck behind the head, full body, long tapering tail; fish bulges travel down
    const base = cell * 0.45, tl = Math.min(7.5, Math.max(2, total * 0.72));
    for (let i = 0; i < n; i++) {
      const p = samples[i];
      const f = clamp((total - p.s) / tl, 0, 1);
      let r = base * (0.24 + 0.76 * Math.pow(f, 0.6));
      const neck = Math.exp(-Math.pow((p.s - 0.75) / 0.42, 2)); r *= 1 - 0.18 * neck;
      // humps: the back arches out of the lake every ~3 cells, rolling slowly toward the tail
      const hw = p.s > 1.7 && p.s < total - 1.2 ? Math.pow(Math.max(0, Math.sin((p.s - T * 0.55) * 2.0)), 3) * clamp((p.s - 1.7) / 0.8, 0, 1) * clamp((total - 1.2 - p.s) / 1.2, 0, 1) : 0;
      p.hump = S.dead ? 0 : hw; r *= 1 + 0.2 * p.hump;
      p.r0 = r;
      let bump = 0;
      for (let k = 0; k < S.bulges.length; k++) { const d = (p.s - S.bulges[k]) / 0.62; bump += Math.exp(-d * d); }
      p.bump = Math.min(1, bump); r += cell * 0.17 * Math.min(1.1, bump);
      p.r = r;
    }
    const colOf = (p) => { const u = Math.round(clamp(p.s / Math.max(6, total), 0, 1) * 28) / 28; return u < 0.5 ? mixa(P.head, P.mid, u * 2) : mixa(P.mid, P.tail, (u - 0.5) * 2); };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ow = Math.max(2, cell * 0.09);
    // 4a. soft shadow on the lake bed (single paths per width bucket so it never stacks into dots)
    if (!S.noShadow) {
      const sx = cell * 0.12, sy = cell * 0.2, buckets = new Map();
      for (let i = 1; i < n; i++) {
        const a = samples[i - 1], b = samples[i]; if (b.brk) continue;
        const w = Math.round((a.r0 + b.r0) / (base * 0.3)) * base * 0.3;
        let pth = buckets.get(w); if (!pth) { pth = new Path2D(); buckets.set(w, pth); }
        pth.moveTo(a.x + sx, a.y + sy); pth.lineTo(b.x + sx, b.y + sy);
      }
      ctx.strokeStyle = 'rgba(0,26,46,0.24)';
      buckets.forEach((pth, w) => { ctx.lineWidth = w * 1.02; ctx.stroke(pth); });
      const hs = new Path2D();
      for (let i = 1; i < n; i += 2) { const p = samples[i]; if (p.hump > 0.55) { hs.moveTo(p.x + cell * 0.3 + p.r * 0.9, p.y + cell * 0.38); hs.arc(p.x + cell * 0.3, p.y + cell * 0.38, p.r * 0.9, 0, TAU); } }
      ctx.fillStyle = 'rgba(0,26,46,0.06)'; ctx.fill(hs);
    }
    // 4b. flippers (front pair behind the neck, rear pair before the tail) — under the body
    const flips = [];
    const fFront = 1.35, fRear = total - Math.max(1.7, tl * 0.42);
    if (total > 2.4) flips.push({ s: fFront, big: 1, ph: 0 });
    if (fRear > fFront + 1.6) flips.push({ s: fRear, big: 0.8, ph: Math.PI });
    for (const fl of flips) {
      let k = 0; while (k < n - 1 && samples[k].s < fl.s) k++;
      const p = samples[k]; if (p.brk && k > 0) continue;
      for (const sd of [-1, 1]) {
        const nx = -p.ty * sd, ny = p.tx * sd; // outward normal
        const paddle = S.dead ? 0 : Math.sin(T * 6.5 + fl.ph) * 0.42;
        const ang = Math.atan2(ny * 0.86 + p.ty * 0.52, nx * 0.86 + p.tx * 0.52) + sd * paddle * 0.7;
        const L = cell * 0.82 * fl.big, W = cell * 0.36 * fl.big;
        const bx = p.x + nx * p.r0 * 0.55, by = p.y + ny * p.r0 * 0.55;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(ang);
        const shape = () => { ctx.beginPath(); ctx.moveTo(0, -W * 0.5); ctx.quadraticCurveTo(L * 0.55, -W * 1.0, L, -W * 0.05); ctx.quadraticCurveTo(L * 0.62, W * 0.75, 0, W * 0.5); ctx.closePath(); };
        if (!S.noShadow) { ctx.save(); ctx.rotate(-ang); ctx.translate(cell * 0.1, cell * 0.17); ctx.rotate(ang); shape(); ctx.fillStyle = 'rgba(0,26,46,0.22)'; ctx.fill(); ctx.restore(); }
        shape();
        const fg = ctx.createLinearGradient(0, 0, L, 0); fg.addColorStop(0, P.fin[1]); fg.addColorStop(1, P.fin[0]);
        ctx.fillStyle = fg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = ow * 0.85; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = Math.max(1, cell * 0.035);
        ctx.beginPath(); ctx.moveTo(L * 0.18, -W * 0.12); ctx.quadraticCurveTo(L * 0.55, -W * 0.45, L * 0.82, -W * 0.1); ctx.stroke();
        ctx.restore();
      }
    }
    // 4c. outline (segments batched into runs of equal width: far fewer draw calls on long bodies)
    strokeRuns(ctx, samples, n, 0, 0, (a, b) => Math.round((a.r + b.r) + ow * 2), () => OUTLINE);
    for (let i = 0; i < n; i++) { const b = samples[i]; const nextBrk = i === n - 1 || samples[i + 1].brk; if (b.brk && nextBrk) { ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + ow, 0, TAU); ctx.fill(); } }
    // 4d. rounded body: shade (lower right) -> base -> light (upper left), all opaque so coils never stack
    const passes = [[0, 0, 1.0, 'shade'], [-0.1, -0.14, 0.8, 'base'], [-0.2, -0.3, 0.46, 'light']];
    for (const [ox, oy, wk, kind] of passes) {
      strokeRuns(ctx, samples, n, ox, oy, (a, b) => Math.round((a.r + b.r) * wk), (b) => {
        const c0 = colOf(b);
        return rgb(kind === 'shade' ? mixa(c0, P.shade, 0.5) : kind === 'base' ? c0 : mixa(c0, P.light, 0.26 + 0.25 * (b.bump || 0) + 0.3 * (b.hump || 0)));
      });
    }
    for (let i = 0; i < n; i++) { const b = samples[i]; const nextBrk = i === n - 1 || samples[i + 1].brk; if (b.brk && nextBrk) { ctx.fillStyle = rgb(colOf(b)); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); } }
    // 4e. dapples: irregular spots down the flanks (no even bands), one fill for all
    const spots = new Path2D(), glows = P.glow ? new Path2D() : null;
    for (let i = 2; i < n - 1; i++) {
      const p = samples[i], q = samples[i - 1]; if (p.brk) continue;
      const seg = Math.floor(p.s * 1.25); if (seg === Math.floor(q.s * 1.25) || p.s < 0.95 || p.s > total - 0.7) continue;
      const h = (seg * 2654435761) >>> 0, side = (h & 1) ? 1 : -1, offk = 0.4 + ((h >>> 3) % 4) * 0.06, rk = 0.2 + ((h >>> 7) % 4) * 0.05;
      const sx = p.x - p.ty * side * p.r * offk, sy = p.y + p.tx * side * p.r * offk, sr = p.r * rk;
      if (glows) { glows.moveTo(sx + sr * 1.9, sy); glows.arc(sx, sy, sr * 1.9, 0, TAU); }
      const ra = Math.atan2(p.ty, p.tx);
      spots.moveTo(sx + Math.cos(ra) * sr * 1.25, sy + Math.sin(ra) * sr * 1.25); spots.ellipse(sx, sy, sr * 1.25, sr, ra, 0, TAU);
      if ((h >>> 11) % 3 === 0) { const s2 = sr * 0.55, qx = sx + p.tx * sr * 1.7, qy = sy + p.ty * sr * 1.7; spots.moveTo(qx + s2, qy); spots.arc(qx, qy, s2, 0, TAU); }
    }
    if (glows) { ctx.fillStyle = 'rgba(110,246,255,0.22)'; ctx.fill(glows); }
    ctx.fillStyle = P.glow ? rgb(P.spot) : rgb(mixa(P.mid, P.spot, 0.75)).replace('rgb', 'rgba').replace(')', ',0.8)'); ctx.fill(spots);
    // 4f. dorsal crest: leaf-shaped scutes down the spine, alternating sizes, shrinking to the tail (batched)
    const crest = new Path2D(), shine = new Path2D();
    for (let i = 2; i < n - 1; i++) {
      const p = samples[i], q = samples[i - 1]; if (p.brk) continue;
      const seg = Math.floor(p.s * 1.6); if (seg === Math.floor(q.s * 1.6) || p.s < 1.0 || p.s > total - 0.55) continue;
      if (p.hump < 0.1 && p.s > 2.3 && p.s < total - 1.4 && total > 5) continue; // crest rides the humps
      const fade = clamp((total - p.s) / 3.2, 0.35, 1), big = seg % 2 ? 0.78 : 1;
      const sz = cell * 0.13 * big * fade * (1 + 0.25 * (p.bump || 0) + 0.55 * (p.hump || 0));
      const ang = Math.atan2(p.ty, p.tx), wob = S.dead ? 0 : Math.sin(T * 5 - p.s * 1.3) * 0.12;
      const qx = p.x - p.ty * cell * 0.02, qy = p.y + p.tx * cell * 0.02, ra = ang + wob, ca = Math.cos(ra), sa = Math.sin(ra);
      crest.moveTo(qx + ca * sz * 1.15, qy + sa * sz * 1.15); crest.ellipse(qx, qy, sz * 1.15, sz * 0.8, ra, 0, TAU);
      const hx = qx + ca * (-sz * 0.2) - sa * (-sz * 0.28), hy = qy + sa * (-sz * 0.2) + ca * (-sz * 0.28);
      shine.moveTo(hx + ca * sz * 0.45, hy + sa * sz * 0.45); shine.ellipse(hx, hy, sz * 0.45, sz * 0.18, ra, 0, TAU);
    }
    ctx.fillStyle = P.crest; ctx.fill(crest); ctx.strokeStyle = P.crestD; ctx.lineWidth = Math.max(1, cell * 0.04); ctx.stroke(crest);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill(shine);
    // golden skin: sparkles that run along the body
    if (P.sparkle && n > 6) {
      ctx.fillStyle = '#fff';
      for (let k = 0; k < 3; k++) {
        const u = ((T * 0.35 + k / 3) % 1), p = samples[Math.floor(u * (n - 1))], tw = Math.sin(u * Math.PI);
        ctx.globalAlpha = tw * 0.9; star(ctx, p.x - p.ty * p.r * 0.35, p.y + p.tx * p.r * 0.35, cell * 0.14 * tw); ctx.globalAlpha = 1;
      }
    }
    // 4g. tail fluke: two rounded lobes
    if (n > 4) {
      const tp = samples[n - 1], tq = samples[Math.max(0, n - 4)];
      const ang = Math.atan2(tp.y - tq.y, tp.x - tq.x), wag = S.dead ? 0 : Math.sin(T * 7) * 0.32, fs = cell * (0.8 + 0.2 * Math.min(1, total / 12));
      ctx.save(); ctx.translate(tp.x, tp.y); ctx.rotate(ang + wag);
      ctx.beginPath(); ctx.moveTo(-fs * 0.08, 0);
      ctx.quadraticCurveTo(fs * 0.12, -fs * 0.1, fs * 0.36, -fs * 0.38); ctx.quadraticCurveTo(fs * 0.5, -fs * 0.42, fs * 0.5, -fs * 0.3);
      ctx.quadraticCurveTo(fs * 0.44, -fs * 0.08, fs * 0.3, 0);
      ctx.quadraticCurveTo(fs * 0.44, fs * 0.08, fs * 0.5, fs * 0.3); ctx.quadraticCurveTo(fs * 0.5, fs * 0.42, fs * 0.36, fs * 0.38);
      ctx.quadraticCurveTo(fs * 0.12, fs * 0.1, -fs * 0.08, 0); ctx.closePath();
      const tg = ctx.createLinearGradient(0, 0, fs * 0.5, 0); tg.addColorStop(0, P.fin[1]); tg.addColorStop(1, P.fin[0]);
      ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = ow * 0.85; ctx.stroke();
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
    const ang = S.headAngle, c = cell * 1.16, pulse = S.pulse || 0, T = S.time, mood = S.dead ? 'dead' : (S.mood || '');
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
    ctx.fillStyle = P.glow ? 'rgba(110,246,255,0.85)' : rgb(mixa(P.mid, P.spot, 0.8));
    [[-c * 0.22, 0, 0.07], [-c * 0.12, -c * 0.13, 0.045], [-c * 0.12, c * 0.13, 0.045]].forEach(([fx, fy, fr]) => { ctx.beginPath(); ctx.arc(fx, fy, c * fr, 0, TAU); ctx.fill(); });
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

  window.Art = { ASSETS, SKINS, drawIsleTree, drawNightStars, MOODS, drawMood, drawChampBadge, loadAssets, mulberry, buildWaterTile, drawWater, drawGlints, lakePath, buildShore, buildGridLayer, drawFish, drawPerch, drawRock, drawWhirl, drawSailboat, drawPaddler, drawChamp, star, clamp, lerp };
})();
