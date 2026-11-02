/**
 * GS3 — renderer.js
 * Акварельный canvas-рендер: бумажный фон с туманностями, растёкшиеся планеты,
 * чернильные линии с дрожанием, стайки флотов-«птичек», варп-туннели, кометы,
 * пиратские базы, кляксы-эффекты, hand-drawn drag-UI и прицеливание способностей.
 *
 * Контракт: DESIGN.md раздел «Стиль и анимации» + «renderer».
 * Мировые координаты (CSS px) → экран ТОЛЬКО через game.worldToScreenPoint /
 * game.worldToScreenLength (они уже учитывают DPR, zoom и смещение камеры).
 */
const renderer = {

  // ---------- внутреннее состояние кэшей ----------
  _bgBase: null,        // offscreen: градиент + зерно + виньетка
  _bgNeb1: null,        // offscreen: слой туманностей 1 (розовый + лаванда)
  _bgNeb2: null,        // offscreen: слой туманностей 2 (мята + амбра)
  _bgW: 0,
  _bgH: 0,
  _bgDPR: 0,
  _stars: null,         // живые мерцающие звёзды-крапинки (экранные координаты)
  _cursor: { x: -9999, y: -9999 },   // последняя позиция указателя (device px)
  _cursorCanvas: null,
  _t: 0,                // накопленное время анимаций (сек)

  // =====================================================================
  //  ПУБЛИЧНОЕ API
  // =====================================================================

  /** Сброс кэшей фона (вызывать при resize / смене DPR). */
  resetCache() {
    this._bgBase = null;
    this._bgNeb1 = null;
    this._bgNeb2 = null;
    this._bgW = 0;
    this._bgH = 0;
    this._bgDPR = 0;
    this._stars = null;
  },

  /** Полный кадр. Порядок строго по контракту. */
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

    // 1. Фон: кэш + медленный параллакс-дрейф двух слоёв туманностей
    this.drawBackground(game, t);

    // 2. Живые звёзды-крапинки поверх фона
    this.drawStars(game, t);

    // Меню: DOM поверх canvas, но живой фон оставляем — и возвращаемся
    if (game.state === CONFIG.GAME_STATES.MENU) return;
    if (!game.planets) return;

    this.drawWarps(game, t);          // 3. варп-туннели
    this.drawComets(game, t);         // 4. кометы
    this.drawPirateBases(game, t);    // 5. пиратские базы
    this.drawFleets(game, t);         // 6. флоты
    this.drawPlanets(game, t);        // 7. планеты
    this.drawEffects(game, t);        // 8. эффекты
    this.drawDragUI(game, t);         // 9. drag-стрелка
    this.drawAbilityTargeting(game, t); // 10. прицеливание способности
  },

  // =====================================================================
  //  ФОН: offscreen-кэш (градиент + туманности + зерно + виньетка)
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
    const rnd = Utils.seeded(0x5EED1234);

    // --- базовый слой: глубокий индиго-ночной градиент + зерно + виньетка ---
    const base = this._makeCanvas(W, H);
    const b = base.getContext('2d');
    const grad = b.createLinearGradient(0, 0, W * 0.35, H);
    grad.addColorStop(0, '#141225');
    grad.addColorStop(0.5, '#1d1a36');
    grad.addColorStop(1, '#251f3f');
    b.fillStyle = grad;
    b.fillRect(0, 0, W, H);

    // бумажное зерно: ~4000 полупрозрачных точек 1px
    const grain = Math.round(4000 * Utils.clamp((W * H) / (1280 * 720), 0.6, 2.2));
    for (let i = 0; i < grain; i++) {
      const x = rnd() * W, y = rnd() * H;
      const a = 0.015 + rnd() * 0.055;
      b.fillStyle = rnd() < 0.5 ? `rgba(255,252,245,${a})` : `rgba(120,115,160,${a * 1.2})`;
      b.fillRect(x, y, 1, 1);
    }

    // лёгкая виньетка
    const vig = b.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.35, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    vig.addColorStop(0, 'rgba(10,8,22,0)');
    vig.addColorStop(1, 'rgba(10,8,22,0.42)');
    b.fillStyle = vig;
    b.fillRect(0, 0, W, H);

    // --- два слоя туманностей (для параллакс-дрейфа) ---
    const neb1 = this._makeCanvas(W, H);
    this._paintNebulae(neb1.getContext('2d'), W, H, ['#e8879a', '#7d8ce0'], Utils.seeded(0xA11CE));
    const neb2 = this._makeCanvas(W, H);
    this._paintNebulae(neb2.getContext('2d'), W, H, ['#6fd6c8', '#e2b25f'], Utils.seeded(0xB0B));

    this._bgBase = base;
    this._bgNeb1 = neb1;
    this._bgNeb2 = neb2;
    this._bgW = W;
    this._bgH = H;
    this._bgDPR = game.DPR;

    // --- живые звёзды-крапинки (экранные координаты, пересоздаём при resize) ---
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
        base: 0.25 + srnd() * 0.55
      });
    }
  },

  /** Одна «акварельная размывка» = 5-8 наложенных radial-blob'ов, очень прозрачных. */
  _paintNebulae(ctx, W, H, colors, rnd) {
    for (const hex of colors) {
      const blobs = 5 + Math.floor(rnd() * 4);
      const cx = W * (0.15 + rnd() * 0.7);
      const cy = H * (0.15 + rnd() * 0.7);
      const spread = Math.max(W, H) * (0.16 + rnd() * 0.16);
      for (let i = 0; i < blobs; i++) {
        const bx = cx + (rnd() - 0.5) * 2 * spread;
        const by = cy + (rnd() - 0.5) * 2 * spread;
        const br = spread * (0.45 + rnd() * 0.8);
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, Utils.rgba(hex, 0.13 + rnd() * 0.08));
        g.addColorStop(0.55, Utils.rgba(hex, 0.06));
        g.addColorStop(1, Utils.rgba(hex, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  drawBackground(game, t) {
    const ctx = game.ctx;
    if (!this._bgBase) return;
    const rm = this._reducedMotion();

    ctx.drawImage(this._bgBase, 0, 0);

    // ОЧЕНЬ медленный дрейф двух слоёв туманностей (parallax по sin(t))
    const d1 = rm ? 0 : Math.sin(t * 0.03) * 7 * game.DPR;
    const d1y = rm ? 0 : Math.cos(t * 0.021) * 5 * game.DPR;
    const d2 = rm ? 0 : Math.sin(t * 0.017 + 2.1) * 12 * game.DPR;
    const d2y = rm ? 0 : Math.cos(t * 0.013 + 1.3) * 8 * game.DPR;
    ctx.globalAlpha = 0.9;
    if (this._bgNeb1) ctx.drawImage(this._bgNeb1, d1, d1y);
    if (this._bgNeb2) ctx.drawImage(this._bgNeb2, d2, d2y);
    ctx.globalAlpha = 1;
  },

  drawStars(game, t) {
    if (!this._stars) return;
    const ctx = game.ctx;
    const rm = this._reducedMotion();
    ctx.save();
    for (const s of this._stars) {
      const tw = rm ? 1 : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      ctx.globalAlpha = s.base * tw;
      ctx.fillStyle = '#f4efe6';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  _reducedMotion() {
    try {
      const s = Utils.getSettings();
      return !!(s && s.reducedMotion) ||
        (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  },

  // =====================================================================
  //  ОБЩИЕ АКВАРЕЛЬНЫЕ ХЕЛПЕРЫ
  // =====================================================================

  /** hex цвета владельца (объект палитры из game.ownerColor или фолбэк). */
  _ownerHex(game, owner) {
    if (owner === CONFIG.PIRATES) return CONFIG.COLORS.PIRATES.hex;
    if (owner === CONFIG.OWNER.NEUTRAL || owner === undefined || owner === null) return CONFIG.COLORS.NEUTRAL.hex;
    if (game && typeof game.ownerColor === 'function') {
      const c = game.ownerColor(owner);
      if (c && c.hex) return c.hex;
      if (typeof c === 'string' && c.startsWith('#')) return c;
    }
    return CONFIG.COLORS.NEUTRAL.hex;
  },

  /** Случайные точки неправильного круга единичного радиуса (world-unit). */
  _blobPoints(rnd, n, noise) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.35;
      const rad = 1 + (rnd() - 0.5) * 2 * noise;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, a, rad, phase: rnd() * Math.PI * 2 });
    }
    return pts;
  },

  /**
   * Гладкий blob-путь через quadraticCurveTo по средним точкам.
   * pts — в локальных единицах; wobble(pts[i], i) → добавка к радиусу (опц.).
   * gap — доля контура, которую НЕ замыкаем (рисованность).
   */
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
    if (gap > 0) return; // открытый контур — не замыкаем
    ctx.closePath();
  },

  /** Заполнить blob (замкнутый) цветом. */
  _fillBlob(ctx, pts, fill, wobble) {
    this._traceBlob(ctx, pts, wobble, 0);
    ctx.fillStyle = fill;
    ctx.fill();
  },

  /**
   * Построить путь blob'а в ЭКРАННЫХ координатах заданного радиуса R.
   * pts — в единичных координатах (r≈1). Путь «запекается» в device-пространстве,
   * поэтому после вызова можно fill()/stroke() с обычными lineWidth.
   */
  _blobPath(ctx, pts, R, ox, oy, wobble, gap, scale) {
    const k = R * (scale || 1);
    ctx.save();
    ctx.translate(ox || 0, oy || 0);
    ctx.scale(k, k);
    this._traceBlob(ctx, pts, wobble, gap || 0);
    ctx.restore();
  },

  /** Белёсый бумажный блик сверху-слева (единичные координаты → масштаб r). */
  _paperHighlight(ctx, r) {
    const hx = -r * 0.34, hy = -r * 0.38, hr = r * 0.52;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    g.addColorStop(0, 'rgba(255,253,247,0.34)');
    g.addColorStop(0.6, 'rgba(255,253,247,0.12)');
    g.addColorStop(1, 'rgba(255,253,247,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr, hr * 0.78, -0.6, 0, Math.PI * 2);
    ctx.fill();
  },

  // =====================================================================
  //  ПЛАНЕТЫ
  // =====================================================================

  /**
   * Кэш силуэта планеты (в планетарных единицах, r=1) — per-planet по seed.
   * Пересчитывается только если сменился seed (пути не зависят от zoom:
   * рисуем через save/translate/scale/restore).
   */
  _planetVisual(p) {
    if (p._blobVis && p._blobVis.seed === p.seed) return p._blobVis;
    const rnd = Utils.seeded((p.seed ^ 0x9E3779B9) >>> 0);
    const type = p.type || 'terra';

    const n = type === 'fortress' ? 6 : type === 'asteroid' ? 7 : 8 + Math.floor(rnd() * 5); // 8-12
    const noise = type === 'fortress' ? 0.22 : type === 'asteroid' ? 0.32 : 0.16;

    // 3-4 wash-слоя со смещением центра на 10-20% r — растёкшаяся краска
    const layerCount = (CONFIG.GRAPHICS && CONFIG.GRAPHICS.BLOB_LAYERS) || 4;
    const layers = [];
    for (let i = 0; i < layerCount; i++) {
      const ang = rnd() * Math.PI * 2;
      const off = 0.12 + rnd() * 0.14;
      layers.push({
        pts: this._blobPoints(rnd, n + (i % 2), noise * (0.8 + rnd() * 0.5)),
        ox: Math.cos(ang) * off,
        oy: Math.sin(ang) * off,
        scale: 0.92 + rnd() * 0.12,
        alpha: 0.30 + rnd() * 0.30 // .30-.60 — насыщеннее, чтобы краска «держалась»
      });
    }

    // контурная «чернильная» линия
    const outline = this._blobPoints(rnd, n, noise);
    const inkWidth = 1.5 + rnd(); // 1.5-2.5

    const vis = {
      seed: p.seed,
      type,
      layers,
      outline,
      inkWidth,
      gapStart: rnd() * Math.PI * 2,               // где разрыв контура
      phase: rnd() * Math.PI * 2,
      wobbleAmp: (1 + rnd() * 0.5),               // 1-1.5 px дрожания
      bastions: [],                               // fortress
      continents: [],                             // terra
      bands: [],                                  // gasGiant
      dockPhase: rnd() * Math.PI * 2              // shipyard
    };

    if (type === 'fortress') {
      const bn = 3 + Math.floor(rnd() * 2); // 3-4 бастиона
      for (let i = 0; i < bn; i++) {
        vis.bastions.push({ a: (i / bn) * Math.PI * 2 + rnd() * 0.6, w: 0.22 + rnd() * 0.1, h: 0.28 + rnd() * 0.14 });
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
    }
    if (type === 'gasGiant') {
      const bn = 2 + Math.floor(rnd() * 2); // 2-3 полосы
      for (let i = 0; i < bn; i++) {
        vis.bands.push({ y: -0.45 + (i + 0.5) * (0.9 / bn) + (rnd() - 0.5) * 0.12, w: 0.09 + rnd() * 0.07, bend: (rnd() - 0.5) * 0.25 });
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
    const ink = Utils.shade(hex, -0.35);

    // дыхание + capture-pulse
    let scale = 1 + 0.02 * Math.sin(t * 2 + vis.phase);
    if (p.pulse > 0) scale += p.pulse * 0.12;
    const r = game.worldToScreenLength(p.r) * scale;
    if (r <= 0.5) return;
    const rm = this._reducedMotion();

    // дрожание контура: шум по seed + time*0.3, амплитуда 1-1.5px
    const wobAmp = rm ? 0 : vis.wobbleAmp / Math.max(r, 1);
    const wobble = (pt, i) => wobAmp * Math.sin(t * 0.3 * Math.PI * 2 + pt.phase * 7 + i * 1.7 + vis.phase);

    ctx.save();
    ctx.translate(s.x, s.y);

    // --- мягкое растекание пигмента за края (bleed, без filter:blur — быстро) ---
    ctx.save();
    const bleed = ctx.createRadialGradient(0, 0, r * 0.52, 0, 0, r * 1.5);
    bleed.addColorStop(0, Utils.rgba(hex, 0.26));
    bleed.addColorStop(0.55, Utils.rgba(hex, 0.12));
    bleed.addColorStop(1, Utils.rgba(hex, 0));
    ctx.fillStyle = bleed;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- акварельные wash-слои ---
    for (const L of vis.layers) {
      this._blobPath(ctx, L.pts, r, L.ox * r, L.oy * r, wobble, 0, L.scale);
      ctx.fillStyle = Utils.rgba(hex, L.alpha);
      ctx.fill();
    }

    // --- мокрый край: сгущение пигмента у кромки (pooling) ---
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0, 0.88);
    ctx.strokeStyle = Utils.rgba(Utils.shade(hex, -0.25), 0.5);
    ctx.lineWidth = Math.max(2, r * 0.20);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // --- внутренности по типу ---
    ctx.save();
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0);
    ctx.clip();

    // грануляция пигмента (зернистость акварели)
    {
      const gr = Utils.seeded((p.seed ^ 0x517A1E) >>> 0);
      const gn = Math.round(18 + r * 0.18);
      const spec = Utils.rgba(Utils.shade(hex, -0.38), 1);
      for (let i = 0; i < gn; i++) {
        const a = gr() * Math.PI * 2, d = Math.sqrt(gr()) * 0.95;
        ctx.globalAlpha = 0.05 + gr() * 0.13;
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d * r, Math.sin(a) * d * r, Math.max(0.6, r * (0.02 + gr() * 0.05)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    if (vis.type === 'gasGiant') {
      // горизонтальные полосы-мазки
      for (const bnd of vis.bands) {
        ctx.strokeStyle = Utils.rgba(Utils.mixHex(hex, '#fff6e8', 0.45), 0.32);
        ctx.lineWidth = Math.max(1, r * bnd.w);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 1.1, r * bnd.y);
        ctx.quadraticCurveTo(0, r * (bnd.y + bnd.bend), r * 1.1, r * bnd.y);
        ctx.stroke();
      }
    }
    if (vis.type === 'terra') {
      // континенты-кляксы
      for (const c of vis.continents) {
        ctx.save();
        ctx.translate(c.ox * r * 0.55, c.oy * r * 0.55);
        ctx.scale(c.scale * r, c.scale * r);
        this._fillBlob(ctx, c.pts, Utils.rgba(Utils.shade(hex, -0.3), 0.28));
        ctx.restore();
      }
    }
    if (vis.type === 'asteroid') {
      // серая каменная тонировка
      ctx.fillStyle = 'rgba(150,148,160,0.22)';
      ctx.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 3);
    }
    // белёсый бумажный блик сверху-слева
    this._paperHighlight(ctx, r);
    ctx.restore(); // un-clip

    // --- газовый гигант: тонкое наклонное кольцо поверх ---
    if (vis.type === 'gasGiant') {
      ctx.save();
      ctx.rotate(vis.ringTilt);
      ctx.strokeStyle = Utils.rgba(Utils.shade(hex, 0.25), 0.55);
      ctx.lineWidth = Math.max(1, 1.6 * game.DPR);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * vis.ringRx, r * vis.ringRy, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- крепость: бастионы-треугольники по контуру ---
    if (vis.type === 'fortress') {
      ctx.fillStyle = Utils.rgba(ink, 0.6);
      for (const b of vis.bastions) {
        const bx = Math.cos(b.a) * r * 0.98, by = Math.sin(b.a) * r * 0.98;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(b.a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(-r * b.w * 0.5, 0);
        ctx.lineTo(0, -r * b.h);
        ctx.lineTo(r * b.w * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // --- чернильный контур: НЕ замкнут (gap 15%), с дрожанием ---
    ctx.save();
    ctx.rotate(vis.gapStart);
    ctx.strokeStyle = ink;
    ctx.lineWidth = vis.inkWidth * game.DPR;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this._blobPath(ctx, vis.outline, r, 0, 0, wobble, 0.15);
    ctx.stroke();
    ctx.restore();

    // --- верфь: 3 орбитальные точки-дока, медленно вращаются ---
    if (vis.type === 'shipyard') {
      const spin = rm ? vis.dockPhase : t * 0.4 + vis.dockPhase;
      for (let i = 0; i < 3; i++) {
        const a = spin + (i / 3) * Math.PI * 2;
        const dx = Math.cos(a) * r * 1.55, dy = Math.sin(a) * r * 1.55;
        ctx.fillStyle = Utils.rgba(ink, 0.85);
        ctx.beginPath();
        ctx.arc(dx, dy, Math.max(1.2, r * 0.1), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = Utils.rgba(ink, 0.3);
        ctx.lineWidth = 1 * game.DPR;
        ctx.beginPath();
        ctx.moveTo(dx * 0.82, dy * 0.82);
        ctx.lineTo(dx, dy);
        ctx.stroke();
      }
    }

    // --- состояние: заморозка (иней) ---
    if (p.frozenUntil && p.frozenUntil > game.time) {
      ctx.fillStyle = 'rgba(170,225,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      const fr = Utils.seeded((p.seed ^ 0xF0E) >>> 0);
      ctx.strokeStyle = 'rgba(235,248,255,0.75)';
      ctx.lineWidth = 1.1 * game.DPR;
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

    // --- состояние: щит — переливающийся пузырь ---
    if (p.shieldUntil && p.shieldUntil > game.time) {
      const hue = (t * 45) % 360;
      const aPulse = 0.32 + 0.18 * Math.sin(t * 3 + vis.phase);
      ctx.save();
      ctx.shadowColor = `hsla(${hue},70%,72%,0.6)`;
      ctx.shadowBlur = 12 * game.DPR;
      ctx.strokeStyle = `hsla(${hue},72%,76%,${aPulse})`;
      ctx.lineWidth = 2.2 * game.DPR;
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0, 1.18);
      ctx.stroke();
      ctx.strokeStyle = `hsla(${(hue + 55) % 360},72%,80%,${aPulse * 0.7})`;
      ctx.lineWidth = 1.3 * game.DPR;
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0, 1.3);
      ctx.stroke();
      ctx.restore();
    }

    // --- captureFlash: расходящаяся волна-кольцо цвета нового владельца ---
    if (p.captureFlash > 0) {
      const cf = Utils.clamp(p.captureFlash, 0, 1);
      const rr = r * (1.1 + (1 - cf) * 2.2);
      ctx.strokeStyle = Utils.rgba(hex, cf * 0.65);
      ctx.lineWidth = Math.max(1, 3.5 * cf * game.DPR);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = Utils.rgba(Utils.shade(hex, 0.3), cf * 0.3);
      ctx.lineWidth = Math.max(1, 1.5 * cf * game.DPR);
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.75, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- выделение / цель drag'а ---
    if (isSelected || targetMode) {
      const tone = targetMode ? this._targetTone(targetMode) : '#f4efe6';
      ctx.strokeStyle = Utils.rgba(tone, 0.55 + 0.25 * Math.sin(t * 5));
      ctx.lineWidth = 1.6 * game.DPR;
      ctx.setLineDash([5 * game.DPR, 6 * game.DPR]);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.32, t * 0.6, t * 0.6 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore(); // translate

    // --- число кораблей + иконка типа (экранные координаты, без scale) ---
    this._drawShipCount(ctx, p, game, s.x, s.y, r, hex, t);
  },

  _targetTone(mode) {
    if (mode === 'reinforce') return '#6fd6c8';
    if (mode === 'attack') return '#e8637d';
    return '#e2b25f'; // capture
  },

  /** Число кораблей: Caveat, чернильный цвет, белая акварельная подложка-мазок. */
  _drawShipCount(ctx, p, game, sx, sy, r, hex, t) {
    const ships = Math.round(p.shipsDisplay != null ? p.shipsDisplay : (p.ships || 0));
    const DPR = game.DPR;
    const zoomK = Utils.clamp(game.camera ? game.camera.zoom : 1, 0.55, 1.5);
    const fs = Math.max(14 * DPR * zoomK, r * 0.55);
    const text = String(ships);

    ctx.save();
    ctx.font = `${fs}px Caveat, Nunito, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;

    const ly = sy + r * 0.08;

    // без белой «плашки»: число — чернильные цифры с тонким светлым ореолом (часть планеты)

    // иконка типа планеты над числом
    const glyphs = { gasGiant: '◍', fortress: '⛨', shipyard: '⚒', asteroid: '✦', terra: '●' };
    const glyph = glyphs[p.type] || '●';
    ctx.fillStyle = Utils.rgba(Utils.shade(hex, -0.2), 0.9);
    ctx.font = `${fs * 0.62}px Caveat, Nunito, cursive`;
    ctx.fillText(glyph, sx, sy - r * 0.62 - fs * 0.32);

    // число — чернильный тёмный с тёплой «бумажной» обводкой (читается на любом фоне)
    ctx.font = `${fs}px Caveat, Nunito, cursive`;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, fs * 0.16);
    ctx.strokeStyle = 'rgba(255,251,242,0.85)';
    ctx.strokeText(text, sx, ly);
    ctx.fillStyle = '#241f3a';
    ctx.fillText(text, sx, ly);
    ctx.restore();
  },

  // =====================================================================
  //  ФЛОТЫ: стайки «птичек» + чернильный след + warped-радуга
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
    const size = game.worldToScreenLength(4 + ((f.seed || 0) % 3)); // 4-6 world px
    const rm = this._reducedMotion();

    // --- чернильный след: gradient trail длиной ~0.1 прогресса ---
    const trailProg = Math.max(0, prog - 0.1);
    const tsx = Utils.lerp(f.sx, f.tx, trailProg), tsy = Utils.lerp(f.sy, f.ty, trailProg);
    const ts = game.worldToScreenPoint(tsx, tsy);
    if (Math.hypot(s.x - ts.x, s.y - ts.y) > 2) {
      const g = ctx.createLinearGradient(ts.x, ts.y, s.x, s.y);
      g.addColorStop(0, Utils.rgba(hex, 0));
      g.addColorStop(1, Utils.rgba(hex, 0.35));
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, 2.4 * DPR);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ts.x, ts.y);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }

    // --- warped: радужный пунктир от старта до позиции ---
    if (f.warped) {
      const w0 = game.worldToScreenPoint(f.sx, f.sy);
      ctx.save();
      ctx.setLineDash([6 * DPR, 9 * DPR]);
      ctx.lineDashOffset = rm ? 0 : -t * 40 * DPR;
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const hue = (t * 120 + i * (360 / segs)) % 360;
        ctx.strokeStyle = `hsla(${hue},75%,72%,0.75)`;
        ctx.lineWidth = (2.2 - i * 0.2) * DPR;
        ctx.beginPath();
        const a1 = i / segs, a2 = (i + 1) / segs;
        ctx.moveTo(Utils.lerp(w0.x, s.x, a1), Utils.lerp(w0.y, s.y, a1));
        ctx.lineTo(Utils.lerp(w0.x, s.x, a2), Utils.lerp(w0.y, s.y, a2));
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- стайка: 1-3 силуэта «птичка» вдоль направления, разброс по seed ---
    const n = f.count >= 30 ? 3 : f.count >= 10 ? 2 : 1;
    const rnd = Utils.seeded(((f.seed || 1) ^ 0x1234) >>> 0);
    ctx.save();
    ctx.shadowColor = Utils.rgba(hex, 0.8);
    ctx.shadowBlur = 6 * DPR;
    ctx.strokeStyle = Utils.shade(hex, -0.15);
    ctx.lineWidth = Math.max(1, 1.5 * DPR);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const off = i === 0 ? 0 : (rnd() - 0.5) * size * 2.6;
      const along = i === 0 ? 0 : (rnd() - 0.5) * size * 2.2;
      const px = s.x + Math.cos(angle) * along - Math.sin(angle) * off;
      const py = s.y + Math.sin(angle) * along + Math.cos(angle) * off;
      const flap = rm ? 0.35 : 0.28 + 0.16 * Math.sin(t * 7 + (f.seed || 0) + i * 2.1);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.beginPath();
      // две дуги-крыла
      ctx.moveTo(-size * 0.8, size * flap * 1.6);
      ctx.quadraticCurveTo(-size * 0.15, -size * flap * 1.4, size * 0.5, 0);
      ctx.moveTo(-size * 0.8, -size * flap * 1.6);
      ctx.quadraticCurveTo(-size * 0.15, size * flap * 1.4, size * 0.5, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  // =====================================================================
  //  ВАРП-ТУННЕЛИ
  // =====================================================================

  drawWarps(game, t) {
    if (!game.warps || !game.warps.length) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    for (const w of game.warps) {
      const a = game.planets.find(p => p.id === w.aId);
      const b = game.planets.find(p => p.id === w.bId);
      if (!a || !b) continue;
      const sa = game.worldToScreenPoint(a.x, a.y);
      const sb = game.worldToScreenPoint(b.x, b.y);

      // мигание последние 3 сек
      let alpha = 0.75;
      const remain = (w.until || 0) - game.time;
      if (remain < 3) alpha = 0.15 + 0.6 * (0.5 + 0.5 * Math.sin(t * 11));

      // контрольная точка — перпендикулярно середине
      const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
      const dx = sb.x - sa.x, dy = sb.y - sa.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * len * 0.12, cy = my + (dx / len) * len * 0.12;

      const quad = (u) => ({
        x: (1 - u) * (1 - u) * sa.x + 2 * (1 - u) * u * cx + u * u * sb.x,
        y: (1 - u) * (1 - u) * sa.y + 2 * (1 - u) * u * cy + u * u * sb.y
      });

      // двойная линия мята ↔ лаванда
      const nx = -dy / len, ny = dx / len;
      const off = 1.8 * DPR;
      ctx.lineCap = 'round';
      ctx.lineWidth = 2 * DPR;
      ctx.strokeStyle = Utils.rgba('#6fd6c8', alpha * 0.8);
      this._strokeQuad(ctx, sa, { x: cx + nx * off, y: cy + ny * off }, sb);
      ctx.strokeStyle = Utils.rgba('#7d8ce0', alpha * 0.8);
      this._strokeQuad(ctx, sa, { x: cx - nx * off, y: cy - ny * off }, sb);

      // бегущие точки (6 штук, фаза от time)
      const dots = 6;
      for (let i = 0; i < dots; i++) {
        const u = ((i / dots) + t * 0.14) % 1;
        const q = quad(u);
        const hue = (t * 60 + i * 40) % 360;
        ctx.fillStyle = `hsla(${hue},70%,78%,${alpha})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2.4 * DPR * (0.7 + 0.3 * Math.sin(t * 4 + i)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  _strokeQuad(ctx, a, c, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
    ctx.stroke();
  },

  // =====================================================================
  //  ПИРАТСКИЕ БАЗЫ
  // =====================================================================

  drawPirateBases(game, t) {
    if (!game.pirateBases || !game.pirateBases.length) return;
    const ctx = game.ctx;
    const hex = CONFIG.COLORS.PIRATES.hex;
    const ink = Utils.shade(hex, -0.35);
    for (const pb of game.pirateBases) {
      if (!pb._blobVis || pb._blobVis.seed !== pb.seed) {
        const rnd = Utils.seeded((pb.seed ^ 0xBEEF) >>> 0);
        pb._blobVis = {
          seed: pb.seed,
          layers: [0, 1, 2].map(() => {
            const ang = rnd() * Math.PI * 2, off = 0.1 + rnd() * 0.1;
            return {
              pts: this._blobPoints(rnd, 7, 0.26),
              ox: Math.cos(ang) * off, oy: Math.sin(ang) * off,
              scale: 0.9 + rnd() * 0.14, alpha: 0.2 + rnd() * 0.18
            };
          }),
          outline: this._blobPoints(rnd, 7, 0.26),
          inkWidth: 1.6 + rnd() * 0.8,
          phase: rnd() * Math.PI * 2
        };
      }
      const vis = pb._blobVis;
      const s = game.worldToScreenPoint(pb.x, pb.y);
      const r = game.worldToScreenLength(pb.r) * (1 + 0.015 * Math.sin(t * 1.6 + vis.phase));
      if (r <= 0.5) continue;

      ctx.save();
      ctx.translate(s.x, s.y);
      for (const L of vis.layers) {
        this._blobPath(ctx, L.pts, r, L.ox * r, L.oy * r, null, 0, L.scale);
        ctx.fillStyle = Utils.rgba(hex, L.alpha);
        ctx.fill();
      }
      // ржавые пятна
      ctx.fillStyle = 'rgba(90,55,35,0.18)';
      ctx.beginPath();
      ctx.arc(r * 0.2, -r * 0.15, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      this._paperHighlight(ctx, r);
      // рваный чернильный контур
      ctx.strokeStyle = ink;
      ctx.lineWidth = vis.inkWidth * game.DPR;
      ctx.lineCap = 'round';
      this._blobPath(ctx, vis.outline, r, 0, 0, null, 0.15);
      ctx.stroke();
      ctx.restore();

      // черепоподобный значок + число кораблей
      const fs = Math.max(11 * game.DPR, r * 0.5);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#efe6dc';
      ctx.font = `${r * 0.85}px Caveat, Nunito, cursive`;
      ctx.fillText('☠', s.x, s.y - r * 0.1);
      const text = String(Math.round(pb.ships || 0));
      ctx.font = `${fs}px Caveat, Nunito, cursive`;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(255,252,246,0.45)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + r * 1.35, tw * 0.6, fs * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#241f3a';
      ctx.fillText(text, s.x, s.y + r * 1.35);
      ctx.restore();
    }
  },

  // =====================================================================
  //  КОМЕТЫ
  // =====================================================================

  drawComets(game, t) {
    if (!game.comets || !game.comets.length) return;
    const ctx = game.ctx;
    for (const c of game.comets) {
      const s = game.worldToScreenPoint(c.x, c.y);
      const vlen = Math.hypot(c.vx, c.vy) || 1;
      const dx = -c.vx / vlen, dy = -c.vy / vlen; // хвост против движения
      const rnd = Utils.seeded(((c.seed ^ 0xC0FFEE) & 0xFFFFFF) >>> 0 || 7);
      const head = game.worldToScreenLength(13);
      const twinkle = 0.82 + 0.18 * Math.sin(t * 6 + (c.seed % 7));

      // пастельный хвост: 4 уменьшающихся blob'а
      const tailColors = ['#9fd8ff', '#7d8ce0', '#e8879a', '#e2b25f'];
      for (let i = 3; i >= 1; i--) {
        const tx = s.x + dx * game.worldToScreenLength(i * 22) * (0.8 + rnd() * 0.4);
        const ty = s.y + dy * game.worldToScreenLength(i * 22) * (0.8 + rnd() * 0.4);
        const tr = head * (1.1 - i * 0.2) * (0.8 + 0.4 * Math.sin(t * 3 + i + c.seed));
        const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, Math.max(1, tr));
        g.addColorStop(0, Utils.rgba(tailColors[i % 4], 0.3 * twinkle * (1 - i * 0.18)));
        g.addColorStop(1, Utils.rgba(tailColors[i % 4], 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1, tr), 0, Math.PI * 2);
        ctx.fill();
      }

      // мягкое пятно-голова
      const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, head * 1.6);
      hg.addColorStop(0, `rgba(245,250,255,${0.85 * twinkle})`);
      hg.addColorStop(0.4, Utils.rgba('#9fd8ff', 0.4 * twinkle));
      hg.addColorStop(1, 'rgba(159,216,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(s.x, s.y, head * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // =====================================================================
  //  ЭФФЕКТЫ (ring / spark / splat / wave)
  // =====================================================================

  drawEffects(game, t) {
    if (!game.effects || !game.effects.length) return;
    const ctx = game.ctx;
    for (const e of game.effects) {
      const maxLife = e.maxLife || 1;
      const k = Utils.clamp(e.life / maxLife, 0, 1); // 1 → только что родился
      const s = game.worldToScreenPoint(e.x, e.y);
      const size = game.worldToScreenLength(e.size || 8);
      const hex = (e.color && e.color.startsWith && e.color.startsWith('#')) ? e.color : CONFIG.COLORS.NEUTRAL.hex;
      const DPR = game.DPR;

      if (e.type === 'ring') {
        // расходящееся акварельное кольцо
        const rr = size * (0.6 + (1 - k) * 3.4);
        ctx.strokeStyle = Utils.rgba(hex, k * 0.6);
        ctx.lineWidth = Math.max(1, 3 * k * DPR);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = Utils.rgba(Utils.shade(hex, 0.3), k * 0.25);
        ctx.lineWidth = Math.max(1, 1.4 * k * DPR);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === 'spark') {
        // капля-клякса с торможением (позицию обновляет game.update)
        const rr = Math.max(1, size * 0.32 * (0.4 + k * 0.8));
        const vlen = Math.hypot(e.vx || 0, e.vy || 0);
        ctx.save();
        ctx.translate(s.x, s.y);
        if (vlen > 1) ctx.rotate(Math.atan2(e.vy, e.vx));
        ctx.fillStyle = Utils.rgba(hex, k * 0.85);
        ctx.beginPath();
        ctx.ellipse(0, 0, rr * (1 + Math.min(1.2, vlen * 0.02)), rr, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (e.type === 'splat') {
        // растёкшееся пятно: 3 blob'а, растёт и застывает, потом fade
        if (!e._splatSeed) e._splatSeed = Utils.nextSeed();
        const rnd = Utils.seeded(e._splatSeed);
        const grow = Utils.easeOutCubic(1 - k);
        const alpha = Math.min(1, k * 2.2) * 0.6;
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI * 2 + rnd() * 1.5;
          const d = grow * size * (0.5 + rnd() * 0.7);
          const rr = Math.max(1, size * (0.35 + grow * 0.55) * (0.7 + rnd() * 0.5));
          const bx = s.x + Math.cos(ang) * d, by = s.y + Math.sin(ang) * d;
          ctx.fillStyle = Utils.rgba(i === 1 ? Utils.shade(hex, -0.2) : hex, alpha * (0.7 + rnd() * 0.3));
          ctx.beginPath();
          ctx.ellipse(bx, by, rr, rr * (0.75 + rnd() * 0.4), ang, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (e.type === 'wave') {
        // волна захвата — широкая акварельная волна
        const rr = size * (0.8 + (1 - k) * 5);
        const g = ctx.createRadialGradient(s.x, s.y, rr * 0.6, s.x, s.y, rr);
        g.addColorStop(0, Utils.rgba(hex, 0));
        g.addColorStop(0.8, Utils.rgba(hex, k * 0.16));
        g.addColorStop(1, Utils.rgba(hex, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = Utils.rgba(hex, k * 0.5);
        ctx.lineWidth = Math.max(1, 2.4 * k * DPR);
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  },

  // =====================================================================
  //  DRAG-UI: hand-drawn чернильная дуга + подпись
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
    const hex = mode ? this._targetTone(mode) : '#e2b25f';

    const s0 = game.worldToScreenPoint(from.x, from.y);
    const ex = drag.x != null ? drag.x : this._cursor.x;
    const ey = drag.y != null ? drag.y : this._cursor.y;
    const dx = ex - s0.x, dy = ey - s0.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 4 * DPR) return;
    const ux = dx / dist, uy = dy / dist;

    // старт от края планеты, конец — у цели/курсора
    const r0 = game.worldToScreenLength(from.r);
    const S = { x: s0.x + ux * r0 * 0.9, y: s0.y + uy * r0 * 0.9 };
    let E = { x: ex, y: ey };
    if (target) {
      const st = game.worldToScreenPoint(target.x, target.y);
      const rt = game.worldToScreenLength(target.r);
      const d2 = Math.hypot(ex - st.x, ey - st.y) || 1;
      E = { x: st.x + ((ex - st.x) / d2) * rt * 1.15, y: st.y + ((ey - st.y) / d2) * rt * 1.15 };
    }

    // контрольная точка: провисание 8% перпендикулярно
    const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2;
    const segD = Math.hypot(E.x - S.x, E.y - S.y);
    const nx = -(E.y - S.y) / (segD || 1), ny = (E.x - S.x) / (segD || 1);
    const sag = segD * 0.08;
    const C = { x: mx + nx * sag, y: my + ny * sag };

    const quad = (u) => ({
      x: (1 - u) * (1 - u) * S.x + 2 * (1 - u) * u * C.x + u * u * E.x,
      y: (1 - u) * (1 - u) * S.y + 2 * (1 - u) * u * C.y + u * u * E.y
    });

    // дрожащая чернильная дуга (полилайн с шумом по time)
    const rm = this._reducedMotion();
    const steps = 26;
    ctx.save();
    ctx.strokeStyle = hex;
    ctx.lineWidth = 2.2 * DPR;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const q = quad(u);
      const wob = rm ? 0 : Math.sin(u * 17 + t * 6) * 1.1 * DPR * Math.sin(u * Math.PI);
      const px = q.x + nx * wob * (1 - u) * 0.6 + nx * wob;
      const py = q.y + ny * wob * (1 - u) * 0.6 + ny * wob;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // головка — рисованная стрелка (два штриха)
    const q1 = quad(0.94);
    const headA = Math.atan2(E.y - q1.y, E.x - q1.x);
    const hl = 13 * DPR;
    ctx.lineWidth = 2.4 * DPR;
    ctx.beginPath();
    ctx.moveTo(E.x - Math.cos(headA - 0.42) * hl, E.y - Math.sin(headA - 0.42) * hl);
    ctx.lineTo(E.x, E.y);
    ctx.lineTo(E.x - Math.cos(headA + 0.42) * hl, E.y - Math.sin(headA + 0.42) * hl);
    ctx.stroke();
    ctx.restore();

    // плавающая подпись «Захват · 50%» шрифтом Caveat рядом с курсором
    const modeNames = { reinforce: 'Подкрепление', capture: 'Захват', attack: 'Атака' };
    const pct = Math.round(Utils.clamp(game.sendPct != null ? game.sendPct : CONFIG.GAME.DEFAULT_SEND_PCT, 0, 1) * 100);
    const label = `${modeNames[mode] || 'Отправить'} · ${pct}%`;
    const fs = Math.max(15, 17 * DPR);
    ctx.save();
    ctx.font = `${fs}px Caveat, Nunito, cursive`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lx = E.x + 16 * DPR, ly = E.y - 18 * DPR;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(255,252,246,0.6)';
    ctx.beginPath();
    ctx.ellipse(lx + tw * 0.5, ly, tw * 0.62, fs * 0.72, -0.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241f3a';
    ctx.fillText(label, lx, ly);
    ctx.restore();
  },

  // =====================================================================
  //  ПРИЦЕЛИВАНИЕ СПОСОБНОСТИ
  // =====================================================================

  drawAbilityTargeting(game, t) {
    const kind = game.pendingAbility;
    if (!kind) return;
    const ctx = game.ctx;
    const DPR = game.DPR;
    const tones = { strike: '#e8879a', shield: '#6fd6c8', warp: '#7d8ce0' };
    const hex = tones[kind] || '#e2b25f';
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.5);

    // подходящие цели: strike — ЛЮБЫЕ планеты (+ пираты), shield/warp — свои
    const ok = (p) => kind === 'strike' ? true : (typeof game.isMyPlanet === 'function' ? game.isMyPlanet(p) : p.owner === CONFIG.OWNER.YOU);

    for (const p of game.planets) {
      if (!ok(p)) continue;
      const s = game.worldToScreenPoint(p.x, p.y);
      const rr = game.worldToScreenLength(p.r) * (1.3 + 0.12 * pulse);
      ctx.save();
      ctx.strokeStyle = Utils.rgba(hex, 0.35 + 0.4 * pulse);
      ctx.lineWidth = (1.6 + pulse) * DPR;
      ctx.setLineDash([7 * DPR, 5 * DPR]);
      ctx.lineDashOffset = -t * 18 * DPR;
      ctx.beginPath();
      ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // strike подсвечивает и пиратские базы
    if (kind === 'strike' && game.pirateBases) {
      for (const pb of game.pirateBases) {
        const s = game.worldToScreenPoint(pb.x, pb.y);
        const rr = game.worldToScreenLength(pb.r) * (1.3 + 0.12 * pulse);
        ctx.save();
        ctx.strokeStyle = Utils.rgba(hex, 0.35 + 0.4 * pulse);
        ctx.lineWidth = (1.6 + pulse) * DPR;
        ctx.setLineDash([7 * DPR, 5 * DPR]);
        ctx.lineDashOffset = -t * 18 * DPR;
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    const cur = this._cursor;
    if (cur.x > -1000) {
      // warpFirst: радужный пунктир от первой планеты к курсору
      if (kind === 'warp' && game.warpFirst != null) {
        const p1 = game.planets.find(p => p.id === game.warpFirst);
        if (p1) {
          const s1 = game.worldToScreenPoint(p1.x, p1.y);
          ctx.save();
          ctx.setLineDash([6 * DPR, 8 * DPR]);
          ctx.lineDashOffset = -t * 36 * DPR;
          const segs = 6;
          for (let i = 0; i < segs; i++) {
            const hue = (t * 130 + i * (360 / segs)) % 360;
            ctx.strokeStyle = `hsla(${hue},75%,72%,0.8)`;
            ctx.lineWidth = 2 * DPR;
            ctx.beginPath();
            const a1 = i / segs, a2 = (i + 1) / segs;
            ctx.moveTo(Utils.lerp(s1.x, cur.x, a1), Utils.lerp(s1.y, cur.y, a1));
            ctx.lineTo(Utils.lerp(s1.x, cur.x, a2), Utils.lerp(s1.y, cur.y, a2));
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // курсорный маркер — крестик-мазок
      const cs = (9 + 2 * pulse) * DPR;
      ctx.save();
      ctx.strokeStyle = Utils.rgba(hex, 0.85);
      ctx.lineWidth = 2.2 * DPR;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cur.x - cs, cur.y);
      ctx.quadraticCurveTo(cur.x, cur.y - cs * 0.2, cur.x + cs, cur.y);
      ctx.moveTo(cur.x, cur.y - cs);
      ctx.quadraticCurveTo(cur.x + cs * 0.2, cur.y, cur.x, cur.y + cs);
      ctx.stroke();
      ctx.restore();
    }
  },

  // =====================================================================
  //  ОТСЛЕЖИВАНИЕ КУСОРА (нужно для маркера способности; не трогает чужие файлы)
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
