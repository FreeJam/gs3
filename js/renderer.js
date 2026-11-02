/**
 * GS3 — renderer.js «Звёздный атлас»
 * Гравюрный canvas-рендер: лист старинного атласа неба — пергамент, чернильная
 * штриховка-гравюра, латунные кольца и розы ветров, медальоны владений,
 * чернильные кораблики с парусами.
 *
 * Контракт: DESIGN.md + «renderer». Мировые (CSS px) → экран ТОЛЬКО через
 * game.worldToScreenPoint / game.worldToScreenLength.
 */
const renderer = {

  // ---------- кэши ----------
  _bgBase: null,
  _bgArt1: null,
  _bgArt2: null,
  _bgW: 0,
  _bgH: 0,
  _bgDPR: 0,
  _stars: null,
  _cursor: { x: -9999, y: -9999 },
  _cursorCanvas: null,
  _t: 0,
  _lastFrameTime: 0,

  // =====================================================================
  //  ПУБЛИЧНОЕ API
  // =====================================================================

  resetCache() {
    this._bgBase = null;
    this._bgArt1 = null;
    this._bgArt2 = null;
    this._bgW = 0;
    this._bgH = 0;
    this._bgDPR = 0;
    this._stars = null;
  },

  render(game) {
    const ctx = game && game.ctx;
    if (!ctx || !game.canvas) return;

    const dt = this._lastFrameTime ? Math.min(0.05, (performance.now() - this._lastFrameTime) / 1000) : 0.016;
    this._lastFrameTime = performance.now();
    this._t += dt;
    const t = this._t;

    this._ensureCursorTracking(game);
    this._ensureBackground(game);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, game.width, game.height);

    this.drawBackground(game, t);
    this.drawStars(game, t);

    if (game.state === CONFIG.GAME_STATES.MENU) return;
    if (!game.planets) return;

    this.drawWarps(game, t);
    this.drawComets(game, t);
    this.drawPirateBases(game, t);
    this.drawFleets(game, t);
    this.drawPlanets(game, t);
    this.drawEffects(game, t);
    this.drawDragUI(game, t);
    this.drawAbilityTargeting(game, t);
  },

  _reducedMotion() {
    try {
      const s = Utils.getSettings();
      return !!(s && s.reducedMotion) ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  },

  // =====================================================================
  //  ФОН: пергамент + чернильная графика + виньетка (offscreen-кэш)
  // =====================================================================

  _ensureBackground(game) {
    if (this._bgBase && this._bgW === game.width && this._bgH === game.height && this._bgDPR === game.DPR) return;
    this._buildBackground(game);
  },

  _makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  },

  _buildBackground(game) {
    const W = game.width, H = game.height;
    const rnd = Utils.seeded(0xABCDEF01);

    // --- лист: тёплый пергамент с неравномерным старением ---
    const base = this._makeCanvas(W, H);
    const b = base.getContext('2d');
    const g = b.createLinearGradient(0, 0, W * 0.25, H);
    g.addColorStop(0, '#f6efdd');
    g.addColorStop(0.45, '#f1e7cf');
    g.addColorStop(0.75, '#eaddc0');
    g.addColorStop(1, '#e6d5b4');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);

    // разводы/прожилки старой бумаги
    const stains = Math.round((W * H) / 90000) + 6;
    for (let i = 0; i < stains; i++) {
      const cx = rnd() * W, cy = rnd() * H;
      const rr = Math.max(W, H) * (0.09 + rnd() * 0.13);
      const tint = rnd() < 0.5 ? 'rgba(214,188,140,0.10)' : 'rgba(255,246,224,0.14)';
      const sg = b.createRadialGradient(cx, cy, 0, cx, cy, rr);
      sg.addColorStop(0, tint);
      sg.addColorStop(1, tint.replace(/[\d.]+\)$/, '0)'));
      b.fillStyle = sg;
      b.beginPath();
      b.ellipse(cx, cy, rr, rr * (0.6 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2);
      b.fill();
    }

    // волокна/крапинки пергамента
    const fiber = Math.round(2400 * Utils.clamp((W * H) / (1280 * 720), 0.6, 2));
    for (let i = 0; i < fiber; i++) {
      const x = rnd() * W, y = rnd() * H;
      const a = 0.02 + rnd() * 0.05;
      b.fillStyle = rnd() < 0.7 ? `rgba(110,90,60,${a})` : `rgba(255,250,235,${a})`;
      b.fillRect(x, y, rnd() < 0.85 ? 1 : 2, 1);
    }

    // виньетка состаренных краёв
    const vig = b.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.34, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
    vig.addColorStop(0, 'rgba(120,90,50,0)');
    vig.addColorStop(1, 'rgba(120,90,50,0.20)');
    b.fillStyle = vig;
    b.fillRect(0, 0, W, H);

    // двойная латунная рамка атласа + ромбики в углах
    const m1 = 14 * game.DPR, m2 = 20 * game.DPR;
    b.strokeStyle = 'rgba(139,101,49,0.85)';
    b.lineWidth = 2 * game.DPR;
    b.strokeRect(m1, m1, W - m1 * 2, H - m1 * 2);
    b.strokeStyle = 'rgba(139,101,49,0.45)';
    b.lineWidth = 1 * game.DPR;
    b.strokeRect(m2, m2, W - m2 * 2, H - m2 * 2);
    b.fillStyle = 'rgba(139,101,49,0.8)';
    for (const [cx, cy] of [[m2, m2], [W - m2, m2], [m2, H - m2], [W - m2, H - m2]]) {
      const d = 4 * game.DPR;
      b.beginPath();
      b.moveTo(cx, cy - d); b.lineTo(cx + d, cy); b.lineTo(cx, cy + d); b.lineTo(cx - d, cy);
      b.closePath(); b.fill();
    }

    this._bgBase = base;

    // --- два слоя чернильной навигационной графики (параллакс) ---
    const art1 = this._makeCanvas(W, H);
    this._paintAtlasArt(art1.getContext('2d'), W, H, game.DPR, Utils.seeded(0x0A71A51));
    const art2 = this._makeCanvas(W, H);
    this._paintAtlasArt(art2.getContext('2d'), W, H, game.DPR, Utils.seeded(0x0B42C0DE));
    this._bgArt1 = art1;
    this._bgArt2 = art2;
    this._bgW = W;
    this._bgH = H;
    this._bgDPR = game.DPR;

    // живые звёзды-точки
    const count = (CONFIG.GRAPHICS && CONFIG.GRAPHICS.STAR_COUNT) || 90;
    const srnd = Utils.seeded(0x57A45);
    this._stars = [];
    for (let i = 0; i < count; i++) {
      this._stars.push({
        x: srnd() * W,
        y: srnd() * H,
        r: (0.5 + srnd() * 1.0) * game.DPR,
        phase: srnd() * Math.PI * 2,
        speed: 0.4 + srnd() * 1.6,
        base: 0.25 + srnd() * 0.5,
        gold: srnd() > 0.72
      });
    }
  },

  /** Слой: розы ветров, навигационные круги, звёздочки-астериски. */
  _paintAtlasArt(ctx, W, H, DPR, rnd) {
    // мягкие чернильные пятна
    const tints = ['#c8a35a', '#9d6a4a', '#5a6f95', '#7d5a70'];
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.15 + rnd() * 0.7), cy = H * (0.15 + rnd() * 0.7);
      const rr = Math.max(W, H) * (0.18 + rnd() * 0.16);
      const hex = tints[Math.floor(rnd() * tints.length)];
      const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      sg.addColorStop(0, Utils.rgba(hex, 0.07 + rnd() * 0.045));
      sg.addColorStop(0.6, Utils.rgba(hex, 0.03));
      sg.addColorStop(1, Utils.rgba(hex, 0));
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * (0.7 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // роза ветров
    const rcx = W * (0.18 + rnd() * 0.64), rcy = H * (0.22 + rnd() * 0.55);
    const R = Math.min(W, H) * (0.14 + rnd() * 0.09);
    ctx.save();
    ctx.translate(rcx, rcy);
    ctx.strokeStyle = 'rgba(110,86,52,0.34)';
    ctx.lineWidth = 1 * DPR;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.33 + k * 0.26), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const long = i % 4 === 0;
      const rr1 = R * (long ? 0.30 : 0.55), rr2 = R * (long ? 1 : 0.82);
      ctx.strokeStyle = long ? 'rgba(139,101,49,0.55)' : 'rgba(110,86,52,0.28)';
      ctx.lineWidth = (long ? 1.3 : 1) * DPR;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * rr1, Math.sin(a) * rr1);
      ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2);
      ctx.stroke();
      if (long) {
        const w = R * 0.05;
        ctx.fillStyle = 'rgba(139,101,49,0.5)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.lineTo(Math.cos(a + 0.5) * R * 0.72 + Math.cos(a + 0.25) * w, Math.sin(a + 0.5) * R * 0.72 + Math.sin(a + 0.25) * w);
        ctx.lineTo(Math.cos(a) * R * 0.72, Math.sin(a) * R * 0.72);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(110,86,52,0.55)';
    ctx.font = `${Math.round(11 * DPR)}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('С', 0, -R * 1.16);
    ctx.fillText('Ю', 0, R * 1.16);
    ctx.fillText('В', R * 1.16, 0);
    ctx.fillText('З', -R * 1.16, 0);
    ctx.restore();

    // звёздочки-астериски (гравюра)
    const sn = 14 + Math.floor(rnd() * 10);
    ctx.strokeStyle = 'rgba(90,70,44,0.4)';
    ctx.lineWidth = 1 * DPR;
    for (let i = 0; i < sn; i++) {
      const sx = 40 * DPR + rnd() * (W - 80 * DPR);
      const sy = 40 * DPR + rnd() * (H - 80 * DPR);
      const sr = (3 + rnd() * 5) * DPR;
      const k = 3 + Math.floor(rnd() * 3);
      ctx.beginPath();
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI + rnd() * 0.2;
        ctx.moveTo(sx - Math.cos(a) * sr, sy - Math.sin(a) * sr);
        ctx.lineTo(sx + Math.cos(a) * sr, sy + Math.sin(a) * sr);
      }
      ctx.stroke();
    }
  },

  drawBackground(game, t) {
    const ctx = game.ctx;
    if (!this._bgBase) return;
    const rm = this._reducedMotion();

    ctx.drawImage(this._bgBase, 0, 0);
    const d1 = rm ? 0 : Math.sin(t * 0.03) * 6 * game.DPR;
    const d1y = rm ? 0 : Math.cos(t * 0.021) * 4 * game.DPR;
    const d2 = rm ? 0 : Math.sin(t * 0.017 + 2.1) * 10 * game.DPR;
    const d2y = rm ? 0 : Math.cos(t * 0.013 + 1.3) * 7 * game.DPR;
    ctx.globalAlpha = 0.85;
    if (this._bgArt1) ctx.drawImage(this._bgArt1, d1, d1y);
    if (this._bgArt2) ctx.drawImage(this._bgArt2, d2, d2y);
    ctx.globalAlpha = 1;
  },

  drawStars(game, t) {
    if (!this._stars) return;
    const ctx = game.ctx;
    const rm = this._reducedMotion();
    ctx.save();
    for (const s of this._stars) {
      const tw = rm ? 1 : 0.6 + 0.4 * Math.sin(t * s.speed + s.phase);
      const gold = s.gold;
      ctx.globalAlpha = s.base * tw * (gold ? 0.95 : 0.7);
      ctx.fillStyle = gold ? '#9a6b25' : '#5f4c33';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (gold && s.r > 1.3 * game.DPR) {
        const k = s.r * 3.2;
        ctx.globalAlpha *= 0.5;
        ctx.strokeStyle = 'rgba(139,101,49,0.8)';
        ctx.lineWidth = game.DPR;
        ctx.beginPath();
        ctx.moveTo(s.x - k, s.y); ctx.lineTo(s.x - k * 0.3, s.y);
        ctx.moveTo(s.x + k * 0.3, s.y); ctx.lineTo(s.x + k, s.y);
        ctx.moveTo(s.x, s.y - k); ctx.lineTo(s.x, s.y - k * 0.3);
        ctx.moveTo(s.x, s.y + k * 0.3); ctx.lineTo(s.x, s.y + k);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  // =====================================================================
  //  ХЕЛПЕРЫ ФОРМ
  // =====================================================================

  _ownerHex(game, owner) {
    if (owner === CONFIG.PIRATES) return CONFIG.COLORS.PIRATES.hex;
    if (owner === CONFIG.OWNER.NEUTRAL || owner === undefined || owner === null) return CONFIG.COLORS.NEUTRAL.hex;
    if (game && typeof game.ownerColor === 'function') {
      const c = game.ownerColor(owner);
      if (c && c.hex) return c.hex;
    }
    return CONFIG.COLORS.NEUTRAL.hex;
  },

  /** Точки неправильного круга единичного радиуса. */
  _blobPoints(rnd, n, noise) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.35;
      const rad = 1 + (rnd() - 0.5) * 2 * noise;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, a, rad, phase: rnd() * Math.PI * 2 });
    }
    return pts;
  },

  _traceBlob(ctx, pts, wobble, gap) {
    const n = pts.length;
    const frac = gap > 0 ? Math.max(2, Math.round(n * (1 - gap))) : n;
    const P = (i) => {
      const p = pts[((i % n) + n) % n];
      let k = 1;
      if (wobble) k = 1 + wobble(p, i);
      return { x: p.x * k, y: p.y * k };
    };
    ctx.beginPath();
    let prev = P(0);
    let cur = P(1);
    ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2);
    for (let i = 1; i < frac; i++) {
      cur = P(i);
      const nxt = P(i + 1);
      ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2);
      prev = cur;
    }
    if (gap > 0) return;
    ctx.closePath();
  },

  _fillBlob(ctx, pts, fill, wobble) {
    this._traceBlob(ctx, pts, wobble, 0);
    ctx.fillStyle = fill;
    ctx.fill();
  },

  _blobPath(ctx, pts, R, ox, oy, wobble, gap, scale) {
    const k = R * (scale || 1);
    ctx.save();
    ctx.translate(ox || 0, oy || 0);
    ctx.scale(k, k);
    this._traceBlob(ctx, pts, wobble, gap || 0);
    ctx.restore();
  },

  roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  },

  // =====================================================================
  //  ПЛАНЕТЫ: гравированные медальоны владений
  // =====================================================================

  _planetVisual(p) {
    if (p._blobVis && p._blobVis.seed === p.seed) return p._blobVis;
    const rnd = Utils.seeded((p.seed ^ 0x9E3779B9) >>> 0);
    const type = p.type || 'terra';

    const n = type === 'fortress' ? 6 : type === 'asteroid' ? 7 : 8 + Math.floor(rnd() * 5);
    const noise = type === 'fortress' ? 0.24 : type === 'asteroid' ? 0.34 : 0.13;

    const layers = [];
    for (let i = 0; i < 3; i++) {
      const ang = rnd() * Math.PI * 2;
      const off = 0.08 + rnd() * 0.10;
      layers.push({
        pts: this._blobPoints(rnd, n + (i % 2), noise * (0.8 + rnd() * 0.5)),
        ox: Math.cos(ang) * off,
        oy: Math.sin(ang) * off,
        scale: 0.9 + rnd() * 0.14,
        alpha: 0.10 + rnd() * 0.10
      });
    }

    const outline = this._blobPoints(rnd, n, noise);

    const vis = {
      seed: p.seed,
      type,
      layers,
      outline,
      gapStart: rnd() * Math.PI * 2,
      phase: rnd() * Math.PI * 2,
      wobbleAmp: 1 + rnd() * 0.5,
      bastions: [],
      continents: [],
      cityDots: [],
      bands: [],
      dockPhase: rnd() * Math.PI * 2
    };

    if (type === 'fortress') {
      const bn = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < bn; i++) {
        vis.bastions.push({ a: (i / bn) * Math.PI * 2 + rnd() * 0.6, w: 0.22 + rnd() * 0.1, h: 0.30 + rnd() * 0.14 });
      }
    }
    if (type === 'terra') {
      const cn = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < cn; i++) {
        vis.continents.push({
          pts: this._blobPoints(rnd, 6, 0.25),
          ox: (rnd() - 0.5) * 0.9, oy: (rnd() - 0.5) * 0.9,
          scale: 0.22 + rnd() * 0.2
        });
      }
      const cd = 3 + Math.floor(rnd() * 3);
      for (let i = 0; i < cd; i++) {
        vis.cityDots.push({ a: rnd() * Math.PI * 2, d: 0.25 + rnd() * 0.55, s: 0.05 + rnd() * 0.05 });
      }
    }
    if (type === 'gasGiant') {
      const bn = 2 + Math.floor(rnd() * 2);
      for (let i = 0; i < bn; i++) {
        vis.bands.push({ y: -0.45 + (i + 0.5) * (0.9 / bn) + (rnd() - 0.5) * 0.12, w: 0.10 + rnd() * 0.07, bend: (rnd() - 0.5) * 0.25 });
      }
      vis.ringTilt = -0.32 - rnd() * 0.2;
      vis.ringRx = 1.55 + rnd() * 0.2;
      vis.ringRy = 0.38 + rnd() * 0.12;
    }
    if (type === 'shipyard') {
      vis.docks = 3;
    }

    p._blobVis = vis;
    return vis;
  },

  drawPlanets(game, t) {
    const ctx = game.ctx;
    for (const p of game.planets) {
      const isSelected = p.id === game.selectedPlanetId;
      let targetMode = null;
      if (game.drag && game.drag.active && game.drag.targetId !== null && p.id === game.drag.targetId) {
        const from = game.planets.find(pp => pp.id === game.drag.fromId);
        if (from && typeof game.getEngagementMode === 'function') targetMode = game.getEngagementMode(from, p);
      }
      this.drawPlanet(ctx, p, game, t, isSelected, targetMode);
    }
  },

  drawPlanet(ctx, p, game, t, isSelected, targetMode) {
    const vis = this._planetVisual(p);
    const s = game.worldToScreenPoint(p.x, p.y);
    const hex = this._ownerHex(game, p.owner);
    const ink = '#2d2418';
    const DPR = game.DPR;

    let scale = 1 + 0.012 * Math.sin(t * 1.7 + vis.phase);
    if (p.pulse > 0) scale += p.pulse * 0.10;
    const r = game.worldToScreenLength(p.r) * scale;
    if (r <= 0.5) return;
    const rm = this._reducedMotion();
    const wobAmp = rm ? 0 : vis.wobbleAmp / Math.max(r, 1);
    const wobble = (pt, i) => wobAmp * Math.sin(t * 0.35 * Math.PI * 2 + pt.phase * 7 + i * 1.7 + vis.phase);

    ctx.save();
    ctx.translate(s.x, s.y);

    // мягкая подложка-«возня» (смещённые ляды)
    for (const L of vis.layers) {
      this._blobPath(ctx, L.pts, r, L.ox * r, L.oy * r, wobble, 0, L.scale);
      ctx.fillStyle = Utils.rgba(hex, L.alpha);
      ctx.fill();
    }

    // корпус медальона: светлый градиент фракции с тёмным ободом
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0);
    const body = ctx.createRadialGradient(-r * 0.25, -r * 0.35, r * 0.05, 0, 0, r);
    body.addColorStop(0, Utils.rgba(Utils.shade(hex, 0.55), 0.95));
    body.addColorStop(0.62, Utils.rgba(hex, 0.88));
    body.addColorStop(0.95, Utils.rgba(Utils.shade(hex, -0.16), 0.95));
    body.addColorStop(1, Utils.rgba(Utils.shade(hex, -0.34), 0.97));
    ctx.fillStyle = body;
    ctx.fill();

    // внутренности по типу (клип)
    ctx.save();
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0);
    ctx.clip();

    if (vis.type === 'gasGiant') {
      for (const bnd of vis.bands) {
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = Math.max(1, r * bnd.w);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 1.1, r * bnd.y);
        ctx.quadraticCurveTo(0, r * (bnd.y + bnd.bend), r * 1.1, r * bnd.y);
        ctx.stroke();
        ctx.strokeStyle = Utils.rgba(Utils.shade(hex, -0.3), 0.35);
        ctx.lineWidth = Math.max(1, r * bnd.w * 0.42);
        ctx.beginPath();
        ctx.moveTo(-r * 1.1, r * (bnd.y + bnd.w * 0.2));
        ctx.quadraticCurveTo(0, r * (bnd.y + bnd.bend + bnd.w * 0.2), r * 1.1, r * (bnd.y + bnd.w * 0.2));
        ctx.stroke();
      }
    }
    if (vis.type === 'terra') {
      for (const c of vis.continents) {
        ctx.save();
        ctx.translate(c.ox * r * 0.55, c.oy * r * 0.55);
        ctx.scale(c.scale * r, c.scale * r);
        this._fillBlob(ctx, c.pts, Utils.rgba(Utils.shade(hex, -0.28), 0.5));
        ctx.restore();
      }
      for (const cd of vis.cityDots) {
        const cx = Math.cos(cd.a) * cd.d * r, cy = Math.sin(cd.a) * cd.d * r;
        ctx.fillStyle = 'rgba(255,248,225,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.2, r * cd.s * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(45,36,24,0.55)';
        ctx.lineWidth = 0.8 * DPR;
        ctx.stroke();
      }
    }
    if (vis.type === 'asteroid') {
      ctx.strokeStyle = 'rgba(45,36,24,0.22)';
      ctx.lineWidth = Math.max(1, 1.2 * DPR);
      const ar = Utils.seeded((p.seed ^ 0x0A17) >>> 0 || 3);
      for (let i = 0; i < 8; i++) {
        const yy = (ar() - 0.5) * 1.7 * r;
        const x0 = (ar() - 0.5) * 1.2 * r;
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x0 + (0.3 + ar() * 0.6) * r, yy + 0.2 * r);
        ctx.stroke();
      }
    }

    // штриховка-тень справа-снизу (гравюра)
    {
      const hrnd = Utils.seeded((p.seed ^ 0x4A0) >>> 0);
      ctx.save();
      ctx.rotate(0.7);
      ctx.strokeStyle = 'rgba(45,36,24,0.16)';
      ctx.lineWidth = Math.max(0.8, 1.0 * DPR);
      const lines = Math.round(r * 0.42);
      for (let i = 0; i < lines; i++) {
        const d = r * 0.15 + (i / lines) * r * 0.95;
        const half = Math.sqrt(Math.max(0, r * r * 0.92 - d * d)) * 0.85;
        ctx.globalAlpha = hrnd() * 0.5 + 0.25;
        ctx.beginPath();
        ctx.moveTo(-half, d);
        ctx.lineTo(half * 0.3, d);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // жёсткий клин света сверху-слева (гравюрный блик)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,252,240,0.65)';
    ctx.lineWidth = Math.max(1.4, 2.2 * DPR);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a0 = -Math.PI * 0.82 + i * 0.13;
      const rr = r * (0.94 - i * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a0 + 0.6);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore(); // un-clip

    // чернильный контур с разрывом
    ctx.save();
    ctx.rotate(vis.gapStart);
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1.6, 2.1 * DPR);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0.13);
    ctx.stroke();
    ctx.restore();

    // латунное кольцо + пунктирная окружность
    ctx.strokeStyle = 'rgba(139,101,49,0.75)';
    ctx.lineWidth = Math.max(1, 1.5 * DPR);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(139,101,49,0.30)';
    ctx.lineWidth = 1 * DPR;
    ctx.setLineDash([3 * DPR, 4 * DPR]);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // маркеры типов снаружи
    if (vis.type === 'gasGiant') {
      ctx.save();
      ctx.rotate(vis.ringTilt);
      ctx.strokeStyle = 'rgba(139,101,49,0.9)';
      ctx.lineWidth = Math.max(1.4, 1.8 * DPR);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * vis.ringRx, r * vis.ringRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(45,36,24,0.5)';
      ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (vis.ringRx - 0.09), r * Math.max(0.2, vis.ringRy - 0.06), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (vis.type === 'fortress') {
      for (const b of vis.bastions) {
        const bx = Math.cos(b.a) * r * 0.98, by = Math.sin(b.a) * r * 0.98;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(b.a + Math.PI / 2);
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
        ctx.lineWidth = 1.4 * DPR;
        ctx.beginPath();
        ctx.moveTo(-r * b.w * 0.5, 0);
        ctx.lineTo(0, -r * b.h);
        ctx.lineTo(r * b.w * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = 'rgba(139,101,49,0.95)';
        ctx.beginPath();
        ctx.arc(Math.cos(b.a) * (r * 0.98 + r * b.h * 0.9), Math.sin(b.a) * (r * 0.98 + r * b.h * 0.9), Math.max(1.4, 2.2 * DPR), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (vis.type === 'shipyard') {
      const spin = rm ? vis.dockPhase : t * 0.35 + vis.dockPhase;
      ctx.save();
      ctx.setLineDash([3 * DPR, 4 * DPR]);
      ctx.strokeStyle = 'rgba(139,101,49,0.6)';
      ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        const dx = Math.cos(a) * r * 1.45, dy = Math.sin(a) * r * 1.45;
        const sz = Math.max(2.4, r * 0.12);
        ctx.strokeStyle = 'rgba(139,101,49,0.8)';
        ctx.lineWidth = 1 * DPR;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.17, Math.sin(a) * r * 1.17);
        ctx.lineTo(dx, dy);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillRect(dx - sz / 2, dy - sz / 2, sz, sz);
        ctx.fillStyle = 'rgba(255,240,205,0.8)';
        ctx.fillRect(dx - sz / 6, dy - sz / 2, sz / 2, sz / 2);
      }
      ctx.restore();
    }

    // сканирующий сектор по латунному кольцу
    if (!rm) {
      const a0 = t * 0.8 + vis.phase;
      ctx.save();
      ctx.strokeStyle = Utils.rgba(hex, 0.75);
      ctx.lineWidth = Math.max(1.2, 1.7 * DPR);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.16, a0, a0 + 0.55);
      ctx.stroke();
      ctx.restore();
    }

    // заморозка
    if (p.frozenUntil && p.frozenUntil > game.time) {
      ctx.fillStyle = 'rgba(200,225,240,0.35)';
      this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0);
      ctx.fill();
      const fr = Utils.seeded((p.seed ^ 0xF0E) >>> 0);
      ctx.strokeStyle = 'rgba(110,140,175,0.85)';
      ctx.lineWidth = 1.1 * DPR;
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const fx = (fr() - 0.5) * 1.5 * r, fy = (fr() - 0.5) * 1.5 * r;
        const sz = r * (0.07 + fr() * 0.07);
        ctx.beginPath();
        ctx.moveTo(fx - sz, fy); ctx.lineTo(fx + sz, fy);
        ctx.moveTo(fx, fy - sz); ctx.lineTo(fx, fy + sz);
        ctx.stroke();
      }
    }

    // щит: латунный купол
    if (p.shieldUntil && p.shieldUntil > game.time) {
      const aPulse = 0.5 + 0.25 * Math.sin(t * 3 + vis.phase);
      ctx.save();
      ctx.strokeStyle = `rgba(139,101,49,${aPulse})`;
      ctx.lineWidth = 2.2 * DPR;
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0, 1.22);
      ctx.stroke();
      ctx.setLineDash([4 * DPR, 3.5 * DPR]);
      ctx.strokeStyle = `rgba(45,36,24,${aPulse * 0.7})`;
      ctx.lineWidth = 1.2 * DPR;
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0, 1.36);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(139,101,49,${aPulse * 0.45})`;
      ctx.lineWidth = 1 * DPR;
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI / 6 + (rm ? 0 : t * 0.3);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.18, Math.sin(a) * r * 1.18);
        ctx.lineTo(Math.cos(a) * r * 1.46, Math.sin(a) * r * 1.46);
        ctx.stroke();
      }
      ctx.restore();
    }

    // захват: расходящееся кольцо
    if (p.captureFlash > 0) {
      const cf = Utils.clamp(p.captureFlash, 0, 1);
      const rr = r * (1.05 + (1 - cf) * 2.0);
      ctx.strokeStyle = `rgba(45,36,24,${cf * 0.5})`;
      ctx.lineWidth = Math.max(1, 3.2 * cf * DPR);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(139,101,49,${cf * 0.6})`;
      ctx.lineWidth = Math.max(1, 2 * cf * DPR);
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.84, 0, Math.PI * 2);
      ctx.stroke();
    }

    // выделение / цель
    if (isSelected || targetMode) {
      const tone = targetMode ? this._targetTone(targetMode) : '#b4402f';
      const pulse = 0.62 + 0.3 * Math.sin(t * 4.6);
      ctx.strokeStyle = Utils.rgba(tone, pulse);
      ctx.lineWidth = 2 * DPR;
      ctx.setLineDash([6 * DPR, 5 * DPR]);
      ctx.lineDashOffset = rm ? 0 : -t * 30 * DPR;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const tk = r * 0.26, tp = r * 1.62;
      ctx.strokeStyle = Utils.rgba(tone, 0.9);
      ctx.lineWidth = 1.6 * DPR;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * tp, sy * tp - sy * tk);
        ctx.lineTo(sx * tp, sy * tp);
        ctx.lineTo(sx * tp - sx * tk, sy * tp);
        ctx.stroke();
      }
    }

    ctx.restore(); // translate

    this._drawShipCount(ctx, p, game, s.x, s.y, r, hex, t);
  },

  _targetTone(mode) {
    if (mode === 'reinforce') return '#476f4e';
    if (mode === 'attack') return '#b4402f';
    return '#a97b3e'; // capture
  },

  /** Медальон с числом кораблей + глиф типа. */
  _drawShipCount(ctx, p, game, sx, sy, r, hex, t) {
    const ships = Math.round(p.shipsDisplay != null ? p.shipsDisplay : (p.ships || 0));
    const DPR = game.DPR;
    const zoomK = Utils.clamp(game.camera ? game.camera.zoom : 1, 0.55, 1.5);
    const fs = Math.max(13 * DPR * zoomK, r * 0.48);
    const text = String(ships);
    const font = `${fs}px "IBM Plex Mono", Consolas, monospace`;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const ly = sy - r * 1.86;
    const mw = Math.max(tw + fs * 1.5, fs * 2.6);
    const mh = fs * 1.5;

    ctx.fillStyle = '#f6eedd';
    this.roundRectPath(ctx, sx - mw / 2, ly - mh / 2, mw, mh, mh * 0.42);
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,36,24,0.85)';
    ctx.lineWidth = 1.3 * DPR;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(139,101,49,0.85)';
    ctx.lineWidth = 1 * DPR;
    this.roundRectPath(ctx, sx - mw / 2 + 2.6 * DPR, ly - mh / 2 + 2.6 * DPR, mw - 5.2 * DPR, mh - 5.2 * DPR, mh * 0.34);
    ctx.stroke();

    const glyphs = { gasGiant: '◍', fortress: '⛨', shipyard: '⚒', asteroid: '✦', terra: '●' };
    const glyph = glyphs[p.type] || '●';
    ctx.fillStyle = '#8b6531';
    ctx.font = `${fs * 0.78}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(glyph, sx - mw / 2 + fs * 0.72, ly + 0.5 * DPR);

    ctx.font = font;
    ctx.fillStyle = '#2d2418';
    ctx.fillText(text, sx + fs * 0.2, ly + 0.5 * DPR);
    ctx.restore();
  },

  // =====================================================================
  //  ФЛОТЫ: чернильные кораблики с парусами + пунктирный след
  // =====================================================================

  drawFleets(game, t) {
    if (!game.fleets) return;
    const ctx = game.ctx;
    for (const f of game.fleets) this._drawFleet(ctx, f, game, t);
  },

  _drawFleet(ctx, f, game, t) {
    const travel = Math.max(0.0001, f.travel || 1);
    const prog = Utils.clamp((f.t || 0) / travel, 0, 1);
    const wx = Utils.lerp(f.sx, f.tx, prog);
    const wy = Utils.lerp(f.sy, f.ty, prog);
    const s = game.worldToScreenPoint(wx, wy);
    const hex = this._ownerHex(game, f.owner);
    const angle = Math.atan2(f.ty - f.sy, f.tx - f.sx);
    const DPR = game.DPR;
    const size = game.worldToScreenLength(4 + ((f.seed || 0) % 3));
    const rm = this._reducedMotion();
    const ink = '#2d2418';

    // пунктирный след (прожжённый курс)
    const trailProg = Math.max(0, prog - 0.14);
    const tsx = Utils.lerp(f.sx, f.tx, trailProg), tsy = Utils.lerp(f.sy, f.ty, trailProg);
    const ts = game.worldToScreenPoint(tsx, tsy);
    if (Math.hypot(s.x - ts.x, s.y - ts.y) > 3) {
      ctx.save();
      ctx.setLineDash([2 * DPR, 3.4 * DPR]);
      ctx.strokeStyle = 'rgba(45,36,24,0.5)';
      ctx.lineWidth = Math.max(1, 1.4 * DPR);
      ctx.beginPath();
      ctx.moveTo(ts.x, ts.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.restore();
    }

    // звёздный мост: латунный бегущий пунктир
    if (f.warped) {
      const w0 = game.worldToScreenPoint(f.sx, f.sy);
      ctx.save();
      ctx.strokeStyle = 'rgba(139,101,49,0.9)';
      ctx.lineWidth = 2.2 * DPR;
      ctx.setLineDash([7 * DPR, 5 * DPR]);
      ctx.lineDashOffset = rm ? 0 : -t * 46 * DPR;
      ctx.beginPath();
      ctx.moveTo(w0.x, w0.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // стайка корабликов (1-3)
    const n = f.count >= 30 ? 3 : f.count >= 10 ? 2 : 1;
    const rnd = Utils.seeded(((f.seed || 1) ^ 0x1234) >>> 0);
    for (let i = 0; i < n; i++) {
      const off = i === 0 ? 0 : (rnd() - 0.5) * size * 3.2;
      const along = i === 0 ? 0 : (rnd() - 0.5) * size * 2.6;
      const px = s.x + Math.cos(angle) * along - Math.sin(angle) * off;
      const py = s.y + Math.sin(angle) * along + Math.cos(angle) * off;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      // корпус-полумесяц
      ctx.fillStyle = Utils.rgba(hex, 0.95);
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(0.9, 1.1 * DPR);
      ctx.beginPath();
      ctx.moveTo(size * 1.05, 0);
      ctx.quadraticCurveTo(0, size * 0.62, -size * 0.95, size * 0.14);
      ctx.quadraticCurveTo(0, size * 0.34, size * 0.55, 0);
      ctx.quadraticCurveTo(0, -size * 0.34, -size * 0.72, -size * 0.12);
      ctx.quadraticCurveTo(0, -size * 0.62, size * 1.05, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // паруса
      ctx.fillStyle = 'rgba(250,243,225,0.95)';
      ctx.beginPath();
      ctx.moveTo(size * 0.25, 0);
      ctx.lineTo(-size * 0.1, -size * 1.25);
      ctx.lineTo(size * 0.62, -size * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-size * 0.3, -size * 0.05);
      ctx.lineTo(-size * 0.55, -size * 0.95);
      ctx.lineTo(-size * 0.82, -size * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // флагшток + вымпел
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(-size * 0.2, 0);
      ctx.lineTo(-size * 0.2, -size * 1.45);
      ctx.stroke();
      const wave = rm ? 0.85 : 0.85 + 0.15 * Math.sin(t * 6 + (f.seed || 0));
      ctx.fillStyle = Utils.rgba(hex, 0.9);
      ctx.beginPath();
      ctx.moveTo(-size * 0.2, -size * 1.45);
      ctx.lineTo(-size * 0.2 - size * wave, -size * 1.32);
      ctx.lineTo(-size * 0.2, -size * 1.06);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  },

  // =====================================================================
  //  ЗВЁЗДНЫЕ МОСТЫ
  // =====================================================================

  drawWarps(game, t) {
    if (!game.warps || !game.warps.length) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    const rm = this._reducedMotion();
    for (const w of game.warps) {
      const a = game.planets.find(p => p.id === w.aId);
      const b = game.planets.find(p => p.id === w.bId);
      if (!a || !b) continue;
      const sa = game.worldToScreenPoint(a.x, a.y);
      const sb = game.worldToScreenPoint(b.x, b.y);

      let baseAlpha = 0.9;
      const remain = (w.until || 0) - game.time;
      if (remain < 3) baseAlpha = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(t * 10));

      ctx.save();
      ctx.strokeStyle = `rgba(139,101,49,${baseAlpha})`;
      ctx.lineWidth = 2 * DPR;
      ctx.setLineDash([9 * DPR, 6 * DPR]);
      ctx.lineDashOffset = rm ? 0 : t * 26 * DPR;
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const dx = sb.x - sa.x, dy = sb.y - sa.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const ticks = Math.max(4, Math.round(len / (26 * DPR)));
      ctx.strokeStyle = `rgba(45,36,24,${baseAlpha * 0.8})`;
      ctx.lineWidth = 1.2 * DPR;
      for (let i = 1; i < ticks; i++) {
        const k = i / ticks;
        const px = sa.x + dx * k, py = sa.y + dy * k;
        ctx.beginPath();
        ctx.moveTo(px - nx * 5 * DPR, py - ny * 5 * DPR);
        ctx.lineTo(px + nx * 5 * DPR, py + ny * 5 * DPR);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(139,101,49,${baseAlpha * 0.8})`;
      ctx.lineWidth = 1.4 * DPR;
      for (const q of [sa, sb]) {
        ctx.beginPath();
        ctx.arc(q.x, q.y, 9 * DPR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },

  // =====================================================================
  //  ПИРАТСКИЕ ЛАГЕРЯ
  // =====================================================================

  drawPirateBases(game, t) {
    if (!game.pirateBases || !game.pirateBases.length) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    const ink = '#2d2418';
    const hex = CONFIG.COLORS.PIRATES.hex;

    for (const pb of game.pirateBases) {
      if (!pb._blobVis || pb._blobVis.seed !== pb.seed) {
        const rnd = Utils.seeded((pb.seed ^ 0xBEEF) >>> 0);
        pb._blobVis = {
          seed: pb.seed,
          outline: this._blobPoints(rnd, 7, 0.3),
          phase: rnd() * Math.PI * 2
        };
      }
      const vis = pb._blobVis;
      const s = game.worldToScreenPoint(pb.x, pb.y);
      const r = game.worldToScreenLength(pb.r) * (1 + 0.015 * Math.sin(t * 1.6 + vis.phase));
      if (r <= 0.5) continue;

      ctx.save();
      ctx.translate(s.x, s.y);

      // тёмный деревянный стан
      const pg = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
      pg.addColorStop(0, 'rgba(60,42,28,.95)');
      pg.addColorStop(0.75, 'rgba(96,66,42,.92)');
      pg.addColorStop(1, 'rgba(64,44,28,.98)');
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0);
      ctx.fillStyle = pg;
      ctx.fill();

      // палатки-штрихи
      ctx.save();
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0);
      ctx.clip();
      ctx.strokeStyle = 'rgba(240,230,210,0.28)';
      ctx.lineWidth = 2.2 * DPR;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r + i * r * 0.5, r);
        ctx.lineTo(-r + i * r * 0.5 + r * 0.7, -r);
        ctx.stroke();
      }
      ctx.restore();

      // контур
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.2, 1.9 * DPR);
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0.1);
      ctx.stroke();

      // флажок
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.98);
      ctx.lineTo(0, -r * 1.75);
      ctx.stroke();
      const wave = this._reducedMotion() ? 0.5 : 0.5 + 0.3 * Math.sin(t * 5 + vis.phase);
      ctx.fillStyle = '#8a3a2a';
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.75);
      ctx.lineTo(r * (0.4 + wave * 0.2), -r * 1.6);
      ctx.lineTo(0, -r * 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = ink;
      ctx.lineWidth = 0.9 * DPR;
      ctx.stroke();

      ctx.restore();

      // медальон числа
      const fs = Math.max(12 * DPR, r * 0.42);
      ctx.save();
      ctx.font = `${fs}px "IBM Plex Mono", Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = String(Math.round(pb.ships || 0));
      const tw = ctx.measureText(text).width;
      const ly = s.y + r * 1.4;
      const mw = Math.max(tw + fs * 1.6, fs * 2.6);
      ctx.fillStyle = '#f6eedd';
      this.roundRectPath(ctx, s.x - mw / 2, ly - fs * 0.75, mw, fs * 1.5, fs * 0.63);
      ctx.fill();
      ctx.strokeStyle = 'rgba(45,36,24,0.85)';
      ctx.lineWidth = 1.2 * DPR;
      ctx.stroke();
      ctx.fillStyle = '#6b4a35';
      ctx.font = `${fs * 0.72}px "IBM Plex Mono", monospace`;
      ctx.fillText('☠', s.x - mw / 2 + fs * 0.62, ly);
      ctx.fillStyle = '#2d2418';
      ctx.font = `${fs}px "IBM Plex Mono", monospace`;
      ctx.fillText(text, s.x + tw * 0.08, ly);
      ctx.restore();
    }
  },

  // =====================================================================
  //  КОМЕТЫ: латунные предвестники
  // =====================================================================

  drawComets(game, t) {
    if (!game.comets || !game.comets.length) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    for (const c of game.comets) {
      const s = game.worldToScreenPoint(c.x, c.y);
      const vlen = Math.hypot(c.vx, c.vy) || 1;
      const dx = -c.vx / vlen, dy = -c.vy / vlen;
      const rnd = Utils.seeded(((c.seed ^ 0xC0FFEE) & 0xFFFFFF) >>> 0 || 7);
      const head = game.worldToScreenLength(12);
      const twinkle = 0.85 + 0.15 * Math.sin(t * 6 + (c.seed % 7));

      // навигационная дуга хвоста
      ctx.save();
      ctx.strokeStyle = 'rgba(90,70,44,0.5)';
      ctx.lineWidth = 1.3 * DPR;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(
        s.x + dx * game.worldToScreenLength(28), s.y + dy * game.worldToScreenLength(28) + 4 * DPR,
        s.x + dx * game.worldToScreenLength(58), s.y + dy * game.worldToScreenLength(58)
      );
      ctx.stroke();

      const tailColors = ['#e7c98a', '#c8a35a', '#9a7a4a'];
      for (let i = 3; i >= 1; i--) {
        const tx = s.x + dx * game.worldToScreenLength(i * 20) * (0.85 + rnd() * 0.3);
        const ty = s.y + dy * game.worldToScreenLength(i * 20) * (0.85 + rnd() * 0.3);
        const tr = head * (1.05 - i * 0.2) * (0.8 + 0.3 * Math.sin(t * 3 + i + c.seed));
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, Math.max(1, tr));
        g.addColorStop(0, Utils.rgba(tailColors[i - 1], 0.34 * twinkle * (1 - i * 0.14)));
        g.addColorStop(1, Utils.rgba(tailColors[i - 1], 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1, tr), 0, Math.PI * 2);
        ctx.fill();
      }

      // золотая звезда-голова
      const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, head * 1.5);
      hg.addColorStop(0, `rgba(255,240,200,${0.95 * twinkle})`);
      hg.addColorStop(0.45, `rgba(212,160,80,${0.5 * twinkle})`);
      hg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(s.x, s.y, head * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(45,36,24,${0.8 * twinkle})`;
      ctx.lineWidth = 1.4 * DPR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, head * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  // =====================================================================
  //  ЭФФЕКТЫ (ring / spark / splat / wave)
  // =====================================================================

  drawEffects(game, t) {
    if (!game.effects || !game.effects.length) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    for (const e of game.effects) {
      const maxLife = e.maxLife || 1;
      const k = Utils.clamp(e.life / maxLife, 0, 1);
      const s = game.worldToScreenPoint(e.x, e.y);
      const size = game.worldToScreenLength(e.size || 8);
      const hex = (e.color && e.color.startsWith && e.color.startsWith('#')) ? e.color : CONFIG.COLORS.NEUTRAL.hex;
      const rm = this._reducedMotion();

      if (e.type === 'ring') {
        const rr = size * (0.6 + (1 - k) * 3.2);
        ctx.strokeStyle = `rgba(45,36,24,${k * 0.6})`;
        ctx.lineWidth = Math.max(1, 2.6 * k * DPR);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(139,101,49,${k * 0.8})`;
        ctx.lineWidth = Math.max(1, 1.4 * k * DPR);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + (rm ? 0 : t * 0.6);
          ctx.beginPath();
          ctx.moveTo(s.x + Math.cos(a) * rr * 0.82, s.y + Math.sin(a) * rr * 0.82);
          ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
          ctx.stroke();
        }
      } else if (e.type === 'spark') {
        const rr = Math.max(1.2, size * 0.32 * (0.4 + k * 0.9));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(((e.vx || 0) >= 0 ? 1 : -1) * t * 3);
        ctx.fillStyle = Utils.rgba(hex, k * 0.85);
        ctx.fillRect(-rr, -rr * 0.7, rr * 2, rr * 1.4);
        ctx.restore();
      } else if (e.type === 'splat') {
        if (!e._splatSeed) e._splatSeed = Utils.nextSeed();
        const rnd = Utils.seeded(e._splatSeed);
        const grow = Utils.easeOutCubic(1 - k);
        const alpha = Math.min(1, k * 2.4) * 0.5;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + rnd() * 1.2;
          const d = grow * size * (0.4 + rnd() * 0.7);
          const rr = Math.max(1, size * (0.18 + grow * 0.28) * (0.6 + rnd() * 0.6));
          ctx.fillStyle = i < 2 ? `rgba(45,36,24,${alpha})` : Utils.rgba(hex, alpha * 0.85);
          ctx.beginPath();
          ctx.ellipse(s.x + Math.cos(ang) * d, s.y + Math.sin(ang) * d, rr, rr * (0.7 + rnd() * 0.45), ang, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.type === 'wave') {
        const rr = size * (0.8 + (1 - k) * 4.6);
        ctx.strokeStyle = `rgba(45,36,24,${k * 0.42})`;
        ctx.lineWidth = Math.max(1, 2.2 * k * DPR);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([4 * DPR, 5 * DPR]);
        ctx.strokeStyle = `rgba(139,101,49,${k * 0.55})`;
        ctx.lineWidth = 1.2 * DPR;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },

  // =====================================================================
  //  DRAG-UI
  // =====================================================================

  drawDragUI(game, t) {
    const drag = game.drag;
    if (!drag || !drag.active) return;
    const from = game.planets.find(p => p.id === drag.fromId);
    if (!from) return;
    const ctx = game.ctx;
    const DPR = game.DPR;

    const target = drag.targetId != null ? game.planets.find(p => p.id === drag.targetId) : null;
    const mode = target && typeof game.getEngagementMode === 'function'
      ? game.getEngagementMode(from, target)
      : (target ? 'capture' : null);
    const hex = mode ? this._targetTone(mode) : '#a97b3e';
    const ink = '#2d2418';

    const s0 = game.worldToScreenPoint(from.x, from.y);
    const ex = drag.x != null ? drag.x : this._cursor.x;
    const ey = drag.y != null ? drag.y : this._cursor.y;
    const dx = ex - s0.x, dy = ey - s0.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4 * DPR) return;
    const ux = dx / dist, uy = dy / dist;

    const r0 = game.worldToScreenLength(from.r);
    const S = { x: s0.x + ux * r0 * 0.95, y: s0.y + uy * r0 * 0.95 };
    let E = { x: ex, y: ey };
    if (target) {
      const st = game.worldToScreenPoint(target.x, target.y);
      const rt = game.worldToScreenLength(target.r);
      const d2 = Math.hypot(ex - st.x, ey - st.y) || 1;
      E = { x: st.x + ((ex - st.x) / d2) * rt * 1.15, y: st.y + ((ey - st.y) / d2) * rt * 1.15 };
    }

    const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2;
    const segD = Math.hypot(E.x - S.x, E.y - S.y);
    const nx = -(E.y - S.y) / (segD || 1), ny = (E.x - S.x) / (segD || 1);
    const sag = segD * 0.10;
    const C = { x: mx + nx * sag, y: my + ny * sag };

    const quad = (u) => ({
      x: (1 - u) * (1 - u) * S.x + 2 * (1 - u) * u * C.x + u * u * E.x,
      y: (1 - u) * (1 - u) * S.y + 2 * (1 - u) * u * C.y + u * u * E.y
    });

    const rm = this._reducedMotion();
    ctx.save();
    ctx.strokeStyle = Utils.rgba(ink, 0.75);
    ctx.lineWidth = 2.2 * DPR;
    ctx.lineCap = 'round';
    const steps = 24;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const q = quad(u);
      const wob = rm ? 0 : Math.sin(u * 15 + t * 5) * 1.2 * DPR * Math.sin(u * Math.PI);
      const px = q.x + nx * wob, py = q.y + ny * wob;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const q1 = quad(0.92);
    const headA = Math.atan2(E.y - q1.y, E.x - q1.x);
    const hl = 13 * DPR;
    ctx.fillStyle = Utils.rgba(ink, 0.9);
    ctx.beginPath();
    ctx.moveTo(E.x, E.y);
    ctx.lineTo(E.x - Math.cos(headA - 0.42) * hl, E.y - Math.sin(headA - 0.42) * hl);
    ctx.lineTo(E.x - Math.cos(headA + 0.42) * hl, E.y - Math.sin(headA + 0.42) * hl);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(139,101,49,0.85)';
    ctx.lineWidth = 1.4 * DPR;
    ctx.beginPath();
    ctx.arc(S.x, S.y, 5 * DPR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = Utils.rgba(hex, 0.9);
    ctx.beginPath();
    ctx.arc(S.x, S.y, 2.4 * DPR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ярлык-медальон
    const modeNames = { reinforce: 'Подмога', capture: 'Высадка', attack: 'Штурм' };
    const pct = Math.round(Utils.clamp(game.sendPct != null ? game.sendPct : CONFIG.GAME.DEFAULT_SEND_PCT, 0, 1) * 100);
    const label = `${modeNames[mode] || 'Поход'} · ${pct}%`;
    const fs = Math.max(13, 14 * DPR);
    ctx.save();
    ctx.font = `${fs}px "IBM Plex Mono", Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lx = E.x + 15 * DPR, ly = E.y - 17 * DPR;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#f6eedd';
    this.roundRectPath(ctx, lx - fs * 0.4, ly - fs * 0.9, tw + fs * 0.9, fs * 1.8, fs * 0.3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,36,24,0.8)';
    ctx.lineWidth = 1.1 * DPR;
    ctx.stroke();
    ctx.fillStyle = Utils.rgba(hex, 0.95);
    ctx.fillRect(lx - fs * 0.16, ly - fs * 0.62, 3 * DPR, fs * 1.24);
    ctx.fillStyle = '#2d2418';
    ctx.fillText(label, lx + fs * 0.22, ly + 0.5 * DPR);
    ctx.restore();
  },

  // =====================================================================
  //  ПРИЦЕЛИВАНИЕ СПОСОБНОСТЕЙ
  // =====================================================================

  drawAbilityTargeting(game, t) {
    const kind = game.pendingAbility;
    if (!kind) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    const tones = { strike: '#b4402f', shield: '#8b6531', warp: '#33538c' };
    const hex = tones[kind] || '#a97b3e';
    const pulse = 0.55 + 0.4 * Math.sin(t * 4);
    const rm = this._reducedMotion();
    const ink = '#2d2418';

    const ok = (p) => kind === 'strike' ? true : (typeof game.isMyPlanet === 'function' ? game.isMyPlanet(p) : p.owner === CONFIG.OWNER.YOU);

    for (const p of game.planets) {
      if (!ok(p)) continue;
      if (kind === 'warp' && game.warpFirst === p.id) continue;
      const s = game.worldToScreenPoint(p.x, p.y);
      const r = game.worldToScreenLength(p.r);
      ctx.save();
      ctx.setLineDash([5 * DPR, 4.5 * DPR]);
      ctx.lineDashOffset = rm ? 0 : -t * 26 * DPR;
      ctx.strokeStyle = Utils.rgba(hex, 0.55 + 0.4 * Math.abs(pulse - 0.5));
      ctx.lineWidth = 1.8 * DPR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 1.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const tk = r * 0.22, tp = r * 1.82;
      ctx.strokeStyle = Utils.rgba(hex, 0.85);
      ctx.lineWidth = 1.3 * DPR;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * tp, sy * tp - sy * tk);
        ctx.lineTo(sx * tp, sy * tp);
        ctx.lineTo(sx * tp - sx * tk, sy * tp);
        ctx.stroke();
      }
      ctx.restore();
    }

    // strike подсвечивает и пиратские лагеря
    if (kind === 'strike' && game.pirateBases) {
      for (const pb of game.pirateBases) {
        const s = game.worldToScreenPoint(pb.x, pb.y);
        const r = game.worldToScreenLength(pb.r);
        ctx.save();
        ctx.setLineDash([5 * DPR, 4.5 * DPR]);
        ctx.lineDashOffset = rm ? 0 : -t * 26 * DPR;
        ctx.strokeStyle = Utils.rgba(hex, 0.55 + 0.4 * Math.abs(pulse - 0.5));
        ctx.lineWidth = 1.8 * DPR;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r * 1.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // курсор: гравюрный прицел
    const cur = this._cursor;
    if (cur.x > -1000) {
      if (kind === 'warp' && game.warpFirst != null) {
        const p1 = game.planets.find(p => p.id === game.warpFirst);
        if (p1) {
          const s1 = game.worldToScreenPoint(p1.x, p1.y);
          ctx.save();
          ctx.setLineDash([7 * DPR, 6 * DPR]);
          ctx.lineDashOffset = rm ? 0 : -t * 40 * DPR;
          ctx.strokeStyle = 'rgba(51,83,140,0.8)';
          ctx.lineWidth = 2 * DPR;
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(cur.x, cur.y);
          ctx.stroke();
          ctx.restore();
        }
      }
      const cs = (9 + 2 * pulse) * DPR;
      ctx.save();
      ctx.strokeStyle = Utils.rgba(ink, 0.9);
      ctx.lineWidth = 1.8 * DPR;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cur.x - cs, cur.y); ctx.lineTo(cur.x - cs * 0.35, cur.y);
      ctx.moveTo(cur.x + cs * 0.35, cur.y); ctx.lineTo(cur.x + cs, cur.y);
      ctx.moveTo(cur.x, cur.y - cs); ctx.lineTo(cur.x, cur.y - cs * 0.35);
      ctx.moveTo(cur.x, cur.y + cs * 0.35); ctx.lineTo(cur.x, cur.y + cs);
      ctx.stroke();
      ctx.strokeStyle = Utils.rgba(hex, 0.9);
      ctx.lineWidth = 1.2 * DPR;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, cs * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  // =====================================================================
  //  ОТСЛЕЖИВАНИЕ КУРСОРА
  // =====================================================================

  _ensureCursorTracking(game) {
    if (this._cursorCanvas === game.canvas || !game.canvas || !game.canvas.addEventListener) return;
    this._cursorCanvas = game.canvas;
    const upd = (e) => {
      try {
        const pos = Utils.getPointerPos(e, game.canvas);
        this._cursor.x = pos.x;
        this._cursor.y = pos.y;
      } catch (err) { /* ignore */ }
    };
    game.canvas.addEventListener('pointermove', upd);
    game.canvas.addEventListener('pointerdown', upd);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = renderer;
}
