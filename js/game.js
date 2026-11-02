/**
 * GS3 — Galactic Siege 3: Акварельные звёзды
 * game.js — ядро игры: состояние, симуляция, ввод, камера, способности, события, HUD.
 *
 * Координатная система:
 *   Мир живёт в МИРОВЫХ px (CSS px). canvas.width/height (game.width/height) — в DEVICE px.
 *   screen(device px) = world * DPR * zoom + cameraOffset
 *   FLEET_SPEED — мировые px/сек (DPR-независимо).
 */
const game = {
  // ---------- Canvas ----------
  canvas: null,
  ctx: null,
  DPR: 1,
  width: 0,     // device px
  height: 0,    // device px
  worldW: 0,    // world px (CSS px) — размер сгенерированной карты
  worldH: 0,

  // ---------- Состояние ----------
  state: CONFIG.GAME_STATES.MENU,
  mode: null,               // 'skirmish' | 'campaign'
  system: null,             // объект системы кампании (или null в skirmish)
  difficulty: 'easy',       // для skirmish
  time: 0,                  // секунды с начала матча

  // ---------- Игровые объекты ----------
  planets: [],
  fleets: [],
  players: [],
  effects: [],
  events: [],               // активные события [{kind:'comet'|'pirateRaid'|'revolt',...}]
  comets: [],
  pirateBases: [],
  warps: [],                // [{aId, bId, until}]
  dm: {},                   // { [ownerId]: число }
  dmTimers: {},             // { [ownerId]: накопленные сек владения }

  // ---------- Мета-апгрейды кампании ----------
  meta: { prodMul: 1, bonusShips: 0, bonusDM: 0, discount: false },

  // ---------- Статистика матча ----------
  stats: { captured: 0, dmSpent: 0 },

  // ---------- Ввод / выбор ----------
  selectedPlanetId: null,
  sendPct: CONFIG.GAME.DEFAULT_SEND_PCT,
  pendingAbility: null,     // null | 'strike' | 'shield' | 'warp'
  warpFirst: null,          // planetId первой точки варпа

  drag: {
    active: false, pointerId: null, fromId: null,
    startX: 0, startY: 0, startScreenX: 0, startScreenY: 0,
    x: 0, y: 0, targetId: null, moved: false
  },

  camera: {
    x: 0, y: 0, zoom: 1,
    velocityX: 0, velocityY: 0,
    panning: false, pointerId: null,
    lastScreenX: 0, lastScreenY: 0, moved: false
  },

  // ---------- Таймеры событий ----------
  eventTimers: { comet: 0, revolt: 0, pirate: 0 },
  eventRate: 1,
  modifiers: [],

  // ---------- Loop ----------
  lastTime: 0,
  animationId: null,
  ended: false,
  winner: null,
  result: null,
  hudTimer: 0,

  // ---------- Уведомления ----------
  statusUntil: 0,

  _nextFleetId: 1,
  _nextPirateId: 1,

  // Имена планет для генерации
  PLANET_NAMES: [
    'Мгла', 'Акварель', 'Тихвин', 'Гримо', 'Лазурь', 'Пепел', 'Вереск',
    'Сияние', 'Глубь', 'Нимб', 'Росстань', 'Фаянс', 'Уголь', 'Зарница',
    'Полынь', 'Кисть', 'Сумрак', 'Радужка', 'Пролог', 'Вуаль', 'Изумруд',
    'Потолок', 'Свеча', 'Гравюра', 'Пастель'
  ],

  // ====================================================================
  // ИНИЦИАЛИЗАЦИЯ
  // ====================================================================

  init() {
    this.canvas = document.getElementById('gameCanvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.bindCanvasEvents();
    }
    this.DPR = Utils.getDPR();
    this.resize();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    document.addEventListener('wheel', (e) => {
      if (this.state === CONFIG.GAME_STATES.PLAYING) {
        this.setSendPct(this.sendPct + (e.deltaY < 0 ? CONFIG.GAME.SEND_STEP : -CONFIG.GAME.SEND_STEP));
      }
    }, { passive: true });

    this.bindUI();

    // По контракту: main.js вызывает game.init(); game.init() вызывает menu.init()
    if (typeof menu !== 'undefined' && menu.init) menu.init();

    this.lastTime = performance.now();
    this.loop();
  },

  /** Привязка HUD-кнопок (идемпотентные действия — безопасно даже при двойной привязке с menu.js) */
  bindUI() {
    document.querySelectorAll('.chip[data-pct]').forEach((btn) => {
      if (btn.dataset.gs3Bound) return;
      btn.dataset.gs3Bound = '1';
      btn.addEventListener('click', () => this.setSendPct(parseFloat(btn.dataset.pct)));
    });
    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.gs3Bound) {
        el.dataset.gs3Bound = '1';
        el.addEventListener('click', fn);
      }
    };
    bind('pauseBtn', () => this.pause());
    bind('menuBtn', () => this.toMenu());
    bind('resumeBtn', () => this.resume());
    bind('restartBtn', () => this.restart());
    bind('toMenuBtn', () => this.toMenu());
    bind('replayBtn', () => this.restart());
    bind('toMenuFromEndBtn', () => this.toMenu());
    bind('continueBtn', () => {
      document.getElementById('gameOverScreen')?.classList.add('hidden');
      if (typeof menu !== 'undefined' && menu.showScreen) menu.showScreen('campaign');
    });

    // Кнопки способностей: АРМИРОВАНИЕ (идемпотентно: клик ставит режим, Esc снимает)
    document.querySelectorAll('.ability-btn[data-ability]').forEach((btn) => {
      if (btn.dataset.gs3Bound) return;
      btn.dataset.gs3Bound = '1';
      btn.addEventListener('click', () => this.armAbility(btn.dataset.ability));
    });

    this.syncChips();
  },

  bindCanvasEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
  },

  resize() {
    if (!this.canvas) return;
    this.DPR = Utils.getDPR();
    const newW = Math.max(1, Math.floor(window.innerWidth * this.DPR));
    const newH = Math.max(1, Math.floor(window.innerHeight * this.DPR));
    this.canvas.width = newW;
    this.canvas.height = newH;
    this.width = newW;
    this.height = newH;
    if (typeof renderer !== 'undefined' && renderer.resetCache) renderer.resetCache();
    this.resetCamera(true);
  },

  // ====================================================================
  // КОНВЕРТАЦИЯ КООРДИНАТ (world CSS px <-> screen device px)
  // ====================================================================

  worldToScreenPoint(x, y) {
    const s = this.DPR * this.camera.zoom;
    return { x: x * s + this.camera.x, y: y * s + this.camera.y };
  },

  screenToWorldPoint(x, y) {
    const s = this.DPR * this.camera.zoom;
    return { x: (x - this.camera.x) / s, y: (y - this.camera.y) / s };
  },

  worldToScreenLength(v) {
    return v * this.DPR * this.camera.zoom;
  },

  // ====================================================================
  // КАМЕРА (pan / inertia / clamp — как в GS2, но в device px с DPR*zoom)
  // ====================================================================

  getWorldBounds() {
    if (!this.planets.length) {
      return { minX: 0, minY: 0, maxX: this.worldW || 1, maxY: this.worldH || 1 };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of this.planets) {
      minX = Math.min(minX, p.x - p.r * 2);
      minY = Math.min(minY, p.y - p.r * 2);
      maxX = Math.max(maxX, p.x + p.r * 2);
      maxY = Math.max(maxY, p.y + p.r * 2);
    }
    return { minX, minY, maxX, maxY };
  },

  resetCamera(fitToScreen = false) {
    const bounds = this.getWorldBounds();
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 28 * this.DPR;
    const shouldFit = fitToScreen || Utils.isMobile();
    const fitZoom = shouldFit
      ? Math.min(1,
          (this.width - padding * 2) / (worldWidth * this.DPR),
          (this.height - padding * 2) / (worldHeight * this.DPR))
      : 1;
    this.camera.zoom = Utils.clamp(fitZoom || 1, 0.4, 1.25);
    this.camera.velocityX = 0;
    this.camera.velocityY = 0;
    this.camera.panning = false;
    this.camera.pointerId = null;
    this.centerCameraOnBounds(bounds);
    this.clampCamera(bounds);
  },

  centerCameraOnBounds(bounds = this.getWorldBounds()) {
    const s = this.DPR * this.camera.zoom;
    const centerX = (bounds.minX + bounds.maxX) * 0.5;
    const centerY = (bounds.minY + bounds.maxY) * 0.5;
    this.camera.x = this.width * 0.5 - centerX * s;
    this.camera.y = this.height * 0.5 - centerY * s;
  },

  clampCamera(bounds = this.getWorldBounds()) {
    const padding = 18 * this.DPR;
    const s = this.DPR * this.camera.zoom;
    const minOffsetX = this.width - padding - bounds.maxX * s;
    const maxOffsetX = padding - bounds.minX * s;
    const minOffsetY = this.height - padding - bounds.maxY * s;
    const maxOffsetY = padding - bounds.minY * s;
    this.camera.x = minOffsetX > maxOffsetX ? (minOffsetX + maxOffsetX) * 0.5 : Utils.clamp(this.camera.x, minOffsetX, maxOffsetX);
    this.camera.y = minOffsetY > maxOffsetY ? (minOffsetY + maxOffsetY) * 0.5 : Utils.clamp(this.camera.y, minOffsetY, maxOffsetY);
  },

  startCameraPan(pointerId, screenX, screenY) {
    this.camera.panning = true;
    this.camera.pointerId = pointerId;
    this.camera.lastScreenX = screenX;
    this.camera.lastScreenY = screenY;
    this.camera.moved = false;
    this.camera.velocityX = 0;
    this.camera.velocityY = 0;
  },

  moveCameraPan(pointerId, screenX, screenY) {
    if (!this.camera.panning || this.camera.pointerId !== pointerId) return;
    const dx = screenX - this.camera.lastScreenX;
    const dy = screenY - this.camera.lastScreenY;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) this.camera.moved = true;
    this.camera.x += dx;
    this.camera.y += dy;
    this.camera.velocityX = dx;
    this.camera.velocityY = dy;
    this.camera.lastScreenX = screenX;
    this.camera.lastScreenY = screenY;
    this.clampCamera();
  },

  endCameraPan(pointerId) {
    if (!this.camera.panning || this.camera.pointerId !== pointerId) return false;
    const moved = this.camera.moved;
    this.camera.panning = false;
    this.camera.pointerId = null;
    this.camera.moved = false;
    return moved;
  },

  updateCamera(dt) {
    if (this.camera.panning) return;
    const frameScale = dt * 60;
    const damping = Math.pow(0.88, frameScale);
    this.camera.x += this.camera.velocityX * frameScale;
    this.camera.y += this.camera.velocityY * frameScale;
    this.camera.velocityX *= damping;
    this.camera.velocityY *= damping;
    if (Math.abs(this.camera.velocityX) < 0.05) this.camera.velocityX = 0;
    if (Math.abs(this.camera.velocityY) < 0.05) this.camera.velocityY = 0;
    this.clampCamera();
  },

  // ====================================================================
  // ВВОД
  // ====================================================================

  handleKeyDown(e) {
    if (this.state === CONFIG.GAME_STATES.PLAYING) {
      switch (e.key) {
        case 'Escape':
          if (this.pendingAbility || this.warpFirst !== null) { this.cancelAbility(); }
          else { this.selectedPlanetId = null; this.cancelDrag(); }
          break;
        case '1': this.armAbility('strike'); break;
        case '2': this.armAbility('shield'); break;
        case '3': this.armAbility('warp'); break;
        case '[': this.setSendPct(this.sendPct - CONFIG.GAME.SEND_STEP); break;
        case ']': this.setSendPct(this.sendPct + CONFIG.GAME.SEND_STEP); break;
        case 'p': case 'P': case 'з': case 'З': this.pause(); break;
      }
    } else if (this.state === CONFIG.GAME_STATES.PAUSED) {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.resume();
    } else if (this.state === CONFIG.GAME_STATES.ENDED) {
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') this.restart();
    }
  },

  handlePointerDown(e) {
    if (this.state !== CONFIG.GAME_STATES.PLAYING || this.ended) return;
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch (err) { /* не валим обработчик */ }
    const screenPos = Utils.getPointerPos(e, this.canvas);
    const pos = this.screenToWorldPoint(screenPos.x, screenPos.y);
    const planet = this.getPlanetAt(pos.x, pos.y);

    // Режим прицеливания способности
    if (this.pendingAbility) {
      if (planet) this.applyAbilityOnPlanet(planet);
      else this.cancelAbility();
      return;
    }

    if (!planet) {
      if (Utils.isTouch() || e.pointerType === 'touch') {
        this.startCameraPan(e.pointerId, screenPos.x, screenPos.y);
      } else {
        this.selectedPlanetId = null;
        this.cancelDrag();
      }
      return;
    }

    if (this.isMyPlanet(planet)) {
      this.selectedPlanetId = planet.id;
      this.drag.active = true;
      this.drag.pointerId = e.pointerId;
      this.drag.fromId = planet.id;
      this.drag.startX = pos.x;
      this.drag.startY = pos.y;
      this.drag.startScreenX = screenPos.x;
      this.drag.startScreenY = screenPos.y;
      this.drag.x = pos.x;
      this.drag.y = pos.y;
      this.drag.targetId = null;
      this.drag.moved = false;
      Utils.vibrate(20);
    } else if (this.selectedPlanetId !== null) {
      const from = this.planets.find((p) => p.id === this.selectedPlanetId);
      if (from && this.isMyPlanet(from)) this.sendFleet(from, planet, CONFIG.OWNER.YOU);
    }
  },

  handlePointerMove(e) {
    const screenPos = Utils.getPointerPos(e, this.canvas);

    if (this.camera.panning && this.camera.pointerId === e.pointerId) {
      this.moveCameraPan(e.pointerId, screenPos.x, screenPos.y);
      return;
    }
    if (!this.drag.active || this.drag.pointerId !== e.pointerId) return;

    const pos = this.screenToWorldPoint(screenPos.x, screenPos.y);
    this.drag.x = pos.x;
    this.drag.y = pos.y;

    if (!this.drag.moved) {
      const d = Utils.dist(this.drag.startScreenX, this.drag.startScreenY, screenPos.x, screenPos.y);
      if (d >= CONFIG.GAME.DRAG_THRESHOLD * this.DPR) this.drag.moved = true;
    }
    if (this.drag.moved) {
      const from = this.planets.find((p) => p.id === this.drag.fromId);
      const target = from ? this.findDragTarget(from, pos.x, pos.y) : null;
      this.drag.targetId = target ? target.id : null;
    }
  },

  handlePointerUp(e) {
    if (this.camera.pointerId === e.pointerId) {
      const moved = this.endCameraPan(e.pointerId);
      if (!moved) { this.selectedPlanetId = null; this.cancelDrag(); }
      return;
    }
    if (this.drag.pointerId !== e.pointerId) return;

    const from = this.planets.find((p) => p.id === this.drag.fromId);
    if (this.drag.moved && from && this.drag.targetId !== null) {
      const to = this.planets.find((p) => p.id === this.drag.targetId);
      if (to) this.sendFleet(from, to, CONFIG.OWNER.YOU);
    }
    this.cancelDrag();
  },

  cancelDrag() {
    this.drag.active = false;
    this.drag.pointerId = null;
    this.drag.fromId = null;
    this.drag.targetId = null;
    this.drag.moved = false;
  },

  isMyPlanet(planet) {
    return !!planet && planet.owner === CONFIG.OWNER.YOU;
  },

  getPlanetAt(x, y) {
    for (let i = this.planets.length - 1; i >= 0; i--) {
      const p = this.planets[i];
      if (Utils.dist(x, y, p.x, p.y) <= p.r * 1.25) return p;
    }
    return null;
  },

  findDragTarget(from, x, y) {
    const direct = this.getPlanetAt(x, y);
    if (direct && direct.id !== from.id) return direct;
    return this.getAimAssistTarget(from, x, y);
  },

  /** Автоприцел по направлению drag (в мировых px) */
  getAimAssistTarget(from, x, y) {
    const dragDx = x - from.x;
    const dragDy = y - from.y;
    const dragLen = Math.hypot(dragDx, dragDy);
    if (dragLen < from.r + 10) return null;

    let bestTarget = null;
    let bestScore = -Infinity;
    for (const planet of this.planets) {
      if (planet.id === from.id) continue;
      const toDx = planet.x - from.x;
      const toDy = planet.y - from.y;
      const targetDist = Math.hypot(toDx, toDy);
      if (targetDist < 1) continue;

      const alignment = (dragDx * toDx + dragDy * toDy) / (dragLen * targetDist);
      if (alignment < CONFIG.GAME.AIM_ASSIST_ALIGNMENT) continue;

      const projection = (dragDx * toDx + dragDy * toDy) / targetDist;
      const minProjection = Math.max(from.r + 10, Math.min(targetDist * CONFIG.GAME.AIM_ASSIST_PROGRESS, 90));
      if (projection < minProjection) continue;

      const lateral = Math.abs(dragDx * toDy - dragDy * toDx) / dragLen;
      if (lateral > planet.r + CONFIG.GAME.AIM_ASSIST_PADDING) continue;

      const stickiness = this.drag.targetId === planet.id ? 18 : 0;
      const score = alignment * 200 + Math.min(projection, targetDist) * 0.12 - lateral * 2.1 - targetDist * 0.05 + stickiness;
      if (score > bestScore) { bestScore = score; bestTarget = planet; }
    }
    return bestTarget;
  },

  getEngagementMode(from, to) {
    if (!from || !to) return null;
    if (to.owner === from.owner) return 'reinforce';
    return to.owner === CONFIG.OWNER.NEUTRAL ? 'capture' : 'attack';
  },

  setSendPct(pct) {
    this.sendPct = Utils.clamp(pct, CONFIG.GAME.SEND_MIN, CONFIG.GAME.SEND_MAX);
    const el = document.getElementById('sendPct');
    if (el) el.textContent = Utils.formatPercent(this.sendPct);
    this.syncChips();
  },

  syncChips() {
    document.querySelectorAll('.chip[data-pct]').forEach((btn) => {
      const p = parseFloat(btn.dataset.pct);
      const isActive = Math.abs(p - this.sendPct) < 0.001;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  },

  // ====================================================================
  // СПОСОБНОСТИ
  // ====================================================================

  armAbility(kind) {
    if (this.state !== CONFIG.GAME_STATES.PLAYING || this.ended) return;
    if (!CONFIG.ABILITIES[kind]) return;
    if (this.pendingAbility === kind) { this.cancelAbility(); return; }
    if (!this.affordAbility(CONFIG.OWNER.YOU, kind)) {
      this.notify('Не хватает тёмной материи');
      return;
    }
    this.pendingAbility = kind;
    this.warpFirst = null;
    this.selectedPlanetId = null;
    this.cancelDrag();
    Utils.vibrate(15);
  },

  cancelAbility() {
    this.pendingAbility = null;
    this.warpFirst = null;
  },

  applyAbilityOnPlanet(planet) {
    const kind = this.pendingAbility;
    if (kind === 'strike') {
      this.useAbility(CONFIG.OWNER.YOU, 'strike', planet.id);
      this.cancelAbility();
    } else if (kind === 'shield') {
      if (!this.isMyPlanet(planet)) { this.notify('Щит ставится только на свои планеты'); return; }
      this.useAbility(CONFIG.OWNER.YOU, 'shield', planet.id);
      this.cancelAbility();
    } else if (kind === 'warp') {
      if (!this.isMyPlanet(planet)) { this.notify('Варп связывает только ваши планеты'); return; }
      if (this.warpFirst === null) {
        this.warpFirst = planet.id;
        this.spawnEffect('ring', planet.x, planet.y, { color: this.ownerColor(CONFIG.OWNER.YOU).hex, size: planet.r + 6, life: 0.8 });
      } else if (this.warpFirst === planet.id) {
        this.warpFirst = null;
      } else {
        this.useAbility(CONFIG.OWNER.YOU, 'warp', this.warpFirst, planet.id);
        this.cancelAbility();
      }
    }
  },

  abilityCost(kind) {
    const base = CONFIG.ABILITIES[kind]?.cost ?? 0;
    return Math.max(1, base - (this.meta.discount ? 1 : 0));
  },

  affordAbility(owner, kind) {
    return (this.dm[owner] || 0) >= this.abilityCost(kind);
  },

  useAbility(owner, kind, targetPlanetId, targetPlanetId2) {
    if (!CONFIG.ABILITIES[kind] || this.ended) return false;
    if (!this.affordAbility(owner, kind)) return false;

    const spend = this.abilityCost(kind);
    this.dm[owner] = (this.dm[owner] || 0) - spend;
    if (owner === CONFIG.OWNER.YOU) this.stats.dmSpent += spend;

    const target = this.planets.find((p) => p.id === targetPlanetId);
    if (!target) { this.dm[owner] += spend; return false; }

    if (kind === 'strike') {
      const before = Math.floor(target.ships);
      target.ships = Math.floor(target.ships * 0.4);
      target.pulse = 1;
      this.spawnExplosion(target.x, target.y, this.ownerColor(target.owner), true);
      this.spawnEffect('splat', target.x, target.y, { color: '#2b2340', size: target.r * 1.6, life: 1.2 });
      if (owner === CONFIG.OWNER.YOU) {
        this.notify(`Орбитальный удар: ${target.name} теряет ${before - Math.floor(target.ships)} кораблей`);
      }
      Utils.vibrate([40, 30, 60]);
      return true;
    }

    if (kind === 'shield') {
      target.shieldUntil = this.time + (CONFIG.ABILITIES.shield.duration || 10);
      this.spawnEffect('wave', target.x, target.y, { color: this.ownerColor(owner).hex, size: target.r, life: 1.0 });
      if (owner === CONFIG.OWNER.YOU) this.notify(`Астральный щит накрывает ${target.name}`);
      return true;
    }

    if (kind === 'warp') {
      const target2 = this.planets.find((p) => p.id === targetPlanetId2);
      if (!target2 || target2.id === target.id) { this.dm[owner] += spend; return false; }
      this.warps.push({ aId: target.id, bId: target2.id, until: this.time + (CONFIG.ABILITIES.warp.duration || 20) });
      this.spawnEffect('ring', target.x, target.y, { color: this.ownerColor(owner).hex, size: target.r + 8, life: 1.0 });
      this.spawnEffect('ring', target2.x, target2.y, { color: this.ownerColor(owner).hex, size: target2.r + 8, life: 1.0 });
      if (owner === CONFIG.OWNER.YOU) this.notify(`Варп-туннель: ${target.name} ↔ ${target2.name}`);
      return true;
    }
    this.dm[owner] += spend;
    return false;
  },

  /** Активен ли варп между двумя планетами */
  warpActive(aId, bId) {
    return this.warps.some((w) => w.until > this.time &&
      ((w.aId === aId && w.bId === bId) || (w.aId === bId && w.bId === aId)));
  },

  // ====================================================================
  // ФЛОТЫ
  // ====================================================================

  sendFleet(from, to, owner, pctOverride) {
    const sender = owner ?? from.owner;
    if (from.owner !== sender) return;
    if (!to || from.id === to.id) return;
    const pct = Utils.clamp(pctOverride ?? this.sendPct, CONFIG.GAME.SEND_MIN, CONFIG.GAME.SEND_MAX);
    const amount = Math.floor(from.ships * pct);
    if (amount <= 0) return;
    from.ships -= amount;
    this.fleets.push(this.createFleet(from, to, sender, amount));
    if (sender === CONFIG.OWNER.YOU) Utils.vibrate(30);
  },

  createFleet(from, to, owner, count) {
    const d = Utils.dist(from.x, from.y, to.x, to.y);
    const warped = this.warpActive(from.id, to.id);
    const travel = warped ? 0.3 : d / CONFIG.GAME.FLEET_SPEED;
    return {
      id: this._nextFleetId++,
      owner, count,
      fromId: from.id, toId: to.id,
      sx: from.x, sy: from.y, tx: to.x, ty: to.y,
      t: 0, travel,
      seed: Utils.nextSeed(),
      warped
    };
  },

  arriveFleet(fleet) {
    const to = this.planets.find((p) => p.id === fleet.toId);
    if (!to) {
      // Возможно, цель — пиратская база
      this.arriveAtPirateBase(fleet);
      return;
    }

    // Подкрепление
    if (to.owner === fleet.owner) {
      to.ships = Math.min(CONFIG.GAME.SHIP_CAP, to.ships + fleet.count);
      this.spawnExplosion(to.x, to.y, this.ownerColor(to.owner), false);
      return;
    }

    // Щит: планета неуязвима, атакующий флот сгорает («отражено»)
    if (to.shieldUntil > this.time) {
      this.spawnEffect('wave', to.x, to.y, { color: '#9fe8ff', size: to.r + 10, life: 1.0 });
      this.spawnExplosion(to.x, to.y, this.ownerColor(fleet.owner), false);
      to.pulse = 0.7;
      if (fleet.owner === CONFIG.OWNER.YOU) this.notify(`Щит ${to.name} отразил атаку — флот сгорел`);
      else if (to.owner === CONFIG.OWNER.YOU) this.notify(`Щит отразил атаку на ${to.name}!`);
      return;
    }

    const type = CONFIG.PLANET_TYPES[to.type] || CONFIG.PLANET_TYPES.terra;
    const defMul = type.defMul || 1;
    const effective = to.ships * defMul;

    if (fleet.count > effective) {
      // Захват
      const prevOwner = to.owner;
      to.owner = fleet.owner;
      to.ships = Math.min(CONFIG.GAME.SHIP_CAP, (fleet.count - effective) / defMul);
      to.pulse = 1;
      to.captureFlash = 1;
      this.spawnExplosion(to.x, to.y, this.ownerColor(fleet.owner), true);
      this.spawnEffect('wave', to.x, to.y, { color: this.ownerColor(fleet.owner).hex, size: to.r, life: 1.2 });

      // DM-бонус за захват чужой/пиратской планеты
      if (prevOwner !== CONFIG.OWNER.NEUTRAL && prevOwner !== fleet.owner) {
        this.dm[fleet.owner] = (this.dm[fleet.owner] || 0) + CONFIG.GAME.DM_CAPTURE_BONUS;
      }
      if (fleet.owner === CONFIG.OWNER.YOU) {
        this.stats.captured++;
        this.dm[CONFIG.OWNER.YOU] = (this.dm[CONFIG.OWNER.YOU] || 0) + CONFIG.GAME.DM_CAPTURE_BONUS;
        this.notify(`${to.name} под вашим флагом!`);
        Utils.vibrate([50, 30, 50]);
      } else if (prevOwner === CONFIG.OWNER.YOU) {
        this.notify(`Враг захватил ${to.name}!`);
      }
    } else {
      // Атака отбита, гарнизон понёс потери
      to.ships = Math.max(0, (effective - fleet.count) / defMul);
      this.spawnExplosion(to.x, to.y, this.ownerColor(fleet.owner), false);
      to.pulse = 0.5;
    }
  },

  arriveAtPirateBase(fleet) {
    const idx = this.pirateBases.findIndex((b) => b.id === fleet.toId);
    if (idx < 0) return;
    const base = this.pirateBases[idx];
    if (fleet.owner === CONFIG.PIRATES) {
      base.ships = Math.min(60, base.ships + fleet.count);
      return;
    }
    if (fleet.count > base.ships) {
      // База уничтожена — награда
      this.pirateBases.splice(idx, 1);
      this.dm[fleet.owner] = (this.dm[fleet.owner] || 0) + (CONFIG.EVENTS.pirates.reward || 3);
      this.spawnExplosion(base.x, base.y, CONFIG.COLORS.PIRATES, true);
      this.spawnEffect('splat', base.x, base.y, { color: CONFIG.COLORS.PIRATES.hex, size: base.r * 2.4, life: 1.5 });
      if (fleet.owner === CONFIG.OWNER.YOU) {
        this.notify(`Пиратская база уничтожена! +${CONFIG.EVENTS.pirates.reward} ✦`);
        Utils.vibrate([60, 40, 60]);
      }
    } else {
      base.ships -= fleet.count;
      this.spawnExplosion(base.x, base.y, this.ownerColor(fleet.owner), false);
    }
  },

  // ====================================================================
  // ЦВЕТА / ЭФФЕКТЫ
  // ====================================================================

  ownerColor(owner) {
    if (owner === CONFIG.PIRATES) return CONFIG.COLORS.PIRATES;
    if (owner === CONFIG.OWNER.NEUTRAL || owner === null || owner === undefined) return CONFIG.COLORS.NEUTRAL;
    const player = this.players.find((p) => p.id === owner);
    return player?.color || CONFIG.COLORS.NEUTRAL;
  },

  /**
   * Универсальный эффект для renderer'а.
   * type: 'ring' | 'spark' | 'splat' | 'wave'; color — hex.
   */
  spawnEffect(type, x, y, opts = {}) {
    this.effects.push({
      type, x, y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life ?? CONFIG.GRAPHICS.EFFECT_LIFE,
      maxLife: opts.life ?? CONFIG.GRAPHICS.EFFECT_LIFE,
      color: opts.color || '#8a8474',
      size: opts.size || 8,
      extra: opts.extra || null
    });
    if (this.effects.length > 300) this.effects.splice(0, this.effects.length - 300);
  },

  spawnExplosion(x, y, color, big) {
    const hex = typeof color === 'string' ? color : (color?.hex || '#8a8474');
    const life = CONFIG.GRAPHICS.EFFECT_LIFE;
    const baseCount = CONFIG.GRAPHICS.EFFECT_PARTICLES || 12;
    const count = big ? baseCount : Math.max(3, Math.round(baseCount / 2));
    this.spawnEffect('ring', x, y, { color: hex, size: big ? 16 : 9, life });
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Utils.rand(22, big ? 95 : 55);
      this.spawnEffect('spark', x, y, {
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        color: hex, size: Utils.rand(1.8, 3.6), life: life * Utils.rand(0.5, 1)
      });
    }
    if (big) this.spawnEffect('splat', x, y, { color: hex, size: Utils.rand(14, 24), life: life * 1.3 });
  },

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= 0.94;
      e.vy *= 0.94;
      e.life -= dt;
      if (e.life <= 0) this.effects.splice(i, 1);
    }
  },

  notify(text) {
    const el = document.getElementById('statusText');
    if (el) el.textContent = text;
    this.statusUntil = performance.now() + 4000;
  },

  updateNotify() {
    if (this.statusUntil && performance.now() > this.statusUntil) {
      this.statusUntil = 0;
      const el = document.getElementById('statusText');
      if (el) el.textContent = '';
    }
  },

  // ====================================================================
  // СТАРТ МАТЧА
  // ====================================================================

  /** Применить мета-апгрейды кампании (через CAMPAIGN.applyUpgrades + нормализация) */
  applyMeta() {
    this.meta = { prodMul: 1, bonusShips: 0, bonusDM: 0, discount: false };
    if (typeof CAMPAIGN === 'undefined') return;
    try {
      if (CAMPAIGN.applyUpgrades) CAMPAIGN.applyUpgrades(this);
    } catch (e) { /* campaign.js ещё не готов — используем фолбэк ниже */ }
    // Если CAMPAIGN.applyUpgrades не заполнил game.meta — посчитать самим из прогресса
    const m = this.meta;
    if (!m || (m.prodMul === 1 && !m.bonusShips && !m.bonusDM && !m.discount)) {
      const up = CAMPAIGN.progress?.upgrades || {};
      this.meta = {
        prodMul: 1 + 0.04 * (up.prod || 0),
        bonusShips: 5 * (up.ships || 0),
        bonusDM: 1 * (up.dm_start || 0),
        discount: (up.discount || 0) >= 1
      };
    }
    if (!this.meta || typeof this.meta.prodMul !== 'number') {
      this.meta = { prodMul: 1, bonusShips: 0, bonusDM: 0, discount: false };
    }
  },

  resetMatchState() {
    this.state = CONFIG.GAME_STATES.PLAYING;
    this.ended = false;
    this.winner = null;
    this.result = null;
    this.time = 0;
    this.planets = [];
    this.fleets = [];
    this.effects = [];
    this.events = [];
    this.comets = [];
    this.pirateBases = [];
    this.warps = [];
    this.dm = {};
    this.dmTimers = {};
    this.stats = { captured: 0, dmSpent: 0 };
    this.selectedPlanetId = null;
    this.pendingAbility = null;
    this.warpFirst = null;
    this._nextFleetId = 1;
    this._nextPirateId = 1;
    this.statusUntil = 0;
    this.hudTimer = 0;
    this.cancelDrag();
    this.camera.velocityX = 0;
    this.camera.velocityY = 0;
  },

  showGameUI() {
    if (typeof menu !== 'undefined' && menu.hide) menu.hide();
    document.getElementById('gameCanvas')?.classList.remove('hidden');
    document.getElementById('gameUI')?.classList.remove('hidden');
    document.getElementById('gameOverScreen')?.classList.add('hidden');
    document.getElementById('pauseMenu')?.classList.add('hidden');
  },

  /**
   * Быстрая игра.
   * difficulty: 'easy' | 'medium' | 'hard'
   */
  startSkirmish(difficulty = 'easy') {
    this.mode = CONFIG.GAME_MODES.SKIRMISH;
    this.difficulty = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'easy';
    this.system = null;
    const aiCount = { easy: 1, medium: 2, hard: 3 }[this.difficulty];
    const planetCount = { easy: 10, medium: 12, hard: 14 }[this.difficulty];

    this.resetMatchState();
    this.applyMeta();
    this.showGameUI();

    this.generateMap({
      aiCount, planetCount,
      eventRate: { easy: 0.7, medium: 1.0, hard: 1.3 }[this.difficulty],
      startDM: CONFIG.GAME.DM_START,
      startShips: CONFIG.MAP.PLAYER_START_SHIPS,
      typeWeights: null,
      modifiers: []
    });

    const sysName = document.getElementById('systemName');
    if (sysName) {
      const diffName = { easy: 'лёгко', medium: 'средне', hard: 'сложно' }[this.difficulty];
      sysName.textContent = `Быстрая битва · ${diffName}`;
    }

    this.resetCamera(true);
    this.lastTime = performance.now();
    this.setSendPct(this.sendPct);
    this.updateHUD();
    this.notify('Система обнаружена. Захватите все планеты!');
  },

  /** Старт системы кампании */
  startCampaignSystem(systemId) {
    if (typeof CAMPAIGN === 'undefined') { this.startSkirmish('easy'); return; }
    const sys = CAMPAIGN.systems?.find((s) => s.id === systemId);
    if (!sys) { this.startSkirmish('easy'); return; }

    this.mode = CONFIG.GAME_MODES.CAMPAIGN;
    this.system = sys;
    this.difficulty = sys.difficulty || 'easy';

    this.resetMatchState();
    this.applyMeta();
    this.showGameUI();

    this.generateMap({
      aiCount: sys.aiCount ?? 1,
      planetCount: sys.planetCount ?? 10,
      eventRate: sys.eventRate ?? 1,
      startDM: sys.startDM ?? CONFIG.GAME.DM_START,
      startShips: sys.startShips ?? CONFIG.MAP.PLAYER_START_SHIPS,
      typeWeights: sys.typeWeights || null,
      modifiers: sys.modifiers || []
    });

    const sysName = document.getElementById('systemName');
    if (sysName) sysName.textContent = sys.name || 'Система';

    this.resetCamera(true);
    this.lastTime = performance.now();
    this.setSendPct(this.sendPct);
    this.updateHUD();
    this.notify(sys.flavor || `${sys.name}: в бой!`);
  },

  // ====================================================================
  // ГЕНЕРАЦИЯ КАРТЫ
  // ====================================================================

  /**
   * opts: { aiCount, planetCount, eventRate, startDM, startShips, typeWeights, modifiers }
   * Координаты — мировые CSS px.
   */
  generateMap(opts = {}) {
    const aiCount = opts.aiCount ?? 1;
    const planetCount = opts.planetCount ?? 10;
    const startDM = opts.startDM ?? CONFIG.GAME.DM_START;
    const startShips = opts.startShips ?? CONFIG.MAP.PLAYER_START_SHIPS;
    const typeWeights = opts.typeWeights || CONFIG.MAP.TYPE_WEIGHTS;
    this.eventRate = Math.max(0, opts.eventRate ?? 1);
    this.modifiers = opts.modifiers || [];

    // Игроки
    this.players = [{ id: CONFIG.OWNER.YOU, name: 'Вы', color: CONFIG.COLORS.YOU, isAI: false, ai: null }];
    for (let i = 0; i < aiCount; i++) {
      const color = CONFIG.PLAYER_PALETTE[i % CONFIG.PLAYER_PALETTE.length];
      let ai = null;
      try {
        if (typeof AI !== 'undefined' && AI.create) {
          ai = AI.create(CONFIG.OWNER.AI + i, this.difficulty, AI.pickPersonalities ? AI.pickPersonalities(this.difficulty, aiCount)[i] : null);
        }
      } catch (e) { ai = null; }
      this.players.push({ id: CONFIG.OWNER.AI + i, name: color.name, color, isAI: true, ai });
    }

    // DM всех игроков
    for (const p of this.players) {
      this.dm[p.id] = startDM;
      this.dmTimers[p.id] = 0;
    }
    this.dm[CONFIG.OWNER.YOU] = (this.dm[CONFIG.OWNER.YOU] || 0) + this.meta.bonusDM;

    // Размер мира (CSS px): не меньше комфортного минимума — на мобиле карта больше экрана, камера панорамирует
    const W = Math.max(1000, Math.round(window.innerWidth));
    const H = Math.max(620, Math.round(window.innerHeight));
    this.worldW = W;
    this.worldH = H;

    const pad = CONFIG.MAP.PADDING;
    this.planets = [];
    this.fleets = [];

    const aiShips = { easy: 30, medium: 33, hard: 36 }[this.difficulty] ?? 32;
    const youShips = Math.min(CONFIG.GAME.SHIP_CAP, startShips + this.meta.bonusShips);

    // Стартовая планета игрока — левый край
    this.planets.push(this.makePlanet({
      x: pad, y: H * 0.5, r: CONFIG.MAP.PLAYER_PLANET_RADIUS,
      owner: CONFIG.OWNER.YOU, ships: youShips, type: 'terra'
    }));

    // Стартовые планеты ИИ — правый край (и верх/низ при aiCount>1)
    const aiPositions = [
      { x: W - pad, y: H * 0.5 },
      { x: W - pad * 1.6, y: pad * 1.2 },
      { x: W - pad * 1.6, y: H - pad * 1.2 }
    ];
    for (let i = 0; i < aiCount; i++) {
      const pos = aiPositions[i % aiPositions.length];
      const jitter = (n) => Utils.rand(-30, 30) * (n % 2 ? 1 : -1);
      this.planets.push(this.makePlanet({
        x: Utils.clamp(pos.x + jitter(i), pad, W - pad),
        y: Utils.clamp(pos.y + jitter(i + 1), pad, H - pad),
        r: CONFIG.MAP.PLAYER_PLANET_RADIUS,
        owner: CONFIG.OWNER.AI + i, ships: aiShips, type: 'terra'
      }));
    }

    // Нейтральные планеты — poisson-подобная расстановка с MIN_DISTANCE
    const neutralCount = Math.max(3, planetCount - this.planets.length);
    let guard = 0;
    for (let i = 0; i < neutralCount && guard < 5000; i++) {
      let placed = false;
      for (let tries = 0; tries < 260; tries++) {
        guard++;
        const type = this.pickPlanetType(typeWeights);
        const typeInfo = CONFIG.PLANET_TYPES[type];
        const r = Utils.clamp(
          Utils.rand(CONFIG.MAP.MIN_PLANET_RADIUS, CONFIG.MAP.MAX_PLANET_RADIUS) * typeInfo.rMul,
          CONFIG.MAP.MIN_PLANET_RADIUS * 0.8, CONFIG.MAP.MAX_PLANET_RADIUS * 1.6
        );
        const x = Utils.rand(pad * 0.6, W - pad * 0.6);
        const y = Utils.rand(pad * 0.6, H - pad * 0.6);
        let ok = true;
        for (const p of this.planets) {
          if (Utils.dist(x, y, p.x, p.y) < r + p.r + CONFIG.MAP.MIN_DISTANCE_BETWEEN) { ok = false; break; }
        }
        if (!ok) continue;
        this.planets.push(this.makePlanet({
          x, y, r, type,
          owner: CONFIG.OWNER.NEUTRAL,
          ships: Math.round(Utils.rand(CONFIG.MAP.NEUTRAL_MIN_SHIPS, CONFIG.MAP.NEUTRAL_MAX_SHIPS))
        }));
        placed = true;
        break;
      }
      if (!placed && guard > 4000) break;
    }

    // Таймеры событий (интервалы делятся на eventRate системы)
    const rate = this.eventRate > 0 ? this.eventRate : 1;
    const modPirate = this.modifierMatch('пират') ? 1.6 : 1;
    const modComet = this.modifierMatch('комет') ? 1.5 : 1;
    this.eventTimers = {
      comet: Utils.rand(CONFIG.EVENTS.comet.intervalMin, CONFIG.EVENTS.comet.intervalMax) / (rate * modComet),
      revolt: this.eventRate > 0 && !this.modifierMatch('без мятежей')
        ? Utils.rand(CONFIG.EVENTS.revolt.intervalMin, CONFIG.EVENTS.revolt.intervalMax) / rate
        : Infinity,
      pirate: CONFIG.EVENTS.pirates.enabled && this.eventRate > 0
        ? Utils.rand(28, 45) / (rate * modPirate)
        : Infinity
    };
  },

  modifierMatch(keyword) {
    return (this.modifiers || []).some((m) => String(m).toLowerCase().includes(keyword));
  },

  makePlanet({ x, y, r, owner, ships, type }) {
    const seed = Utils.nextSeed();
    return {
      id: 'planet_' + this.planets.length + '_' + seed.toString(36),
      name: this.makePlanetName(type),
      type, x, y, r, owner,
      ships,
      shipsDisplay: ships,
      seed,
      shieldUntil: 0,
      frozenUntil: 0,
      pulse: 0,
      captureFlash: 0,
      angle: Utils.seeded(seed)() * Math.PI * 2,
      shipyardTimer: 0
    };
  },

  makePlanetName(type) {
    if (type === 'shipyard') {
      const n = this.planets.filter((p) => p.type === 'shipyard').length + 1;
      return `Верфь-${n}`;
    }
    const used = new Set(this.planets.map((p) => p.name));
    const free = this.PLANET_NAMES.filter((n) => !used.has(n));
    return free.length ? Utils.pick(free) : `Планета-${this.planets.length + 1}`;
  },

  pickPlanetType(weights) {
    const entries = Object.entries(weights || CONFIG.MAP.TYPE_WEIGHTS);
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = Math.random() * total;
    for (const [type, w] of entries) {
      roll -= w;
      if (roll <= 0) return type;
    }
    return entries[entries.length - 1][0];
  },

  // ====================================================================
  // ПРОИЗВОДСТВО / ВЕРФИ
  // ====================================================================

  productionRate(planet) {
    if (planet.frozenUntil > this.time) return 0;
    if (planet.owner === CONFIG.OWNER.NEUTRAL || planet.owner === CONFIG.PIRATES) return 0;
    return Utils.productionRate(planet) * (this.meta.prodMul || 1);
  },

  updateProduction(dt) {
    for (const p of this.planets) {
      const rate = this.productionRate(p);
      if (rate > 0 && p.ships < CONFIG.GAME.SHIP_CAP) {
        p.ships = Math.min(CONFIG.GAME.SHIP_CAP, p.ships + rate * dt);
      }
      // Верфь: каждые SHIPYARD_INTERVAL сек +1 корабль всем дружественным планетам в радиусе
      if (p.type === 'shipyard' && p.owner !== CONFIG.OWNER.NEUTRAL && p.owner !== CONFIG.PIRATES && p.frozenUntil <= this.time) {
        p.shipyardTimer = (p.shipyardTimer || 0) + dt;
        while (p.shipyardTimer >= CONFIG.GAME.SHIPYARD_INTERVAL) {
          p.shipyardTimer -= CONFIG.GAME.SHIPYARD_INTERVAL;
          for (const q of this.planets) {
            if (q.owner === p.owner && Utils.dist(p.x, p.y, q.x, q.y) <= CONFIG.SHIPYARD_RANGE) {
              q.ships = Math.min(CONFIG.GAME.SHIP_CAP, q.ships + 1);
            }
          }
          this.spawnEffect('spark', p.x, p.y, { color: this.ownerColor(p.owner).hex, size: 3, life: 0.7, vx: Utils.rand(-20, 20), vy: Utils.rand(-30, -10) });
        }
      }
      // Плавное число для renderer'а
      const k = Math.min(1, dt * 8);
      p.shipsDisplay += (Math.floor(p.ships) - p.shipsDisplay) * k;
      if (Math.abs(p.shipsDisplay - Math.floor(p.ships)) < 0.5) p.shipsDisplay = Math.floor(p.ships);
      // Затухание визуальных флагов
      p.pulse = Math.max(0, p.pulse - dt * 1.6);
      p.captureFlash = Math.max(0, p.captureFlash - dt * 0.9);
    }
  },

  // ====================================================================
  // DM-ЭКОНОМИКА (п.4)
  // ====================================================================

  updateDM(dt) {
    for (const p of this.players) {
      const owns = this.planets.some((pl) => pl.owner === p.id);
      if (!owns) { this.dmTimers[p.id] = 0; continue; }
      this.dmTimers[p.id] = (this.dmTimers[p.id] || 0) + dt;
      while (this.dmTimers[p.id] >= CONFIG.GAME.DM_INTERVAL) {
        this.dmTimers[p.id] -= CONFIG.GAME.DM_INTERVAL;
        this.dm[p.id] = (this.dm[p.id] || 0) + 1;
        if (p.id === CONFIG.OWNER.YOU) this.spawnEffect('spark', this.worldW * 0.5, this.worldH * 0.1, { color: '#c9a7ff', size: 4, life: 1.0, vy: 20 });
      }
    }
  },

  // ====================================================================
  // СОБЫТИЯ (п.5-7): кометы, пираты, мятежи
  // ====================================================================

  updateEvents(dt) {
    if (this.eventRate <= 0) return;

    // --- Кометы ---
    this.eventTimers.comet -= dt;
    if (this.eventTimers.comet <= 0) {
      this.spawnComet();
      const modComet = this.modifierMatch('комет') ? 1.5 : 1;
      this.eventTimers.comet = Utils.rand(CONFIG.EVENTS.comet.intervalMin, CONFIG.EVENTS.comet.intervalMax) / (this.eventRate * modComet);
    }
    this.updateComets(dt);

    // --- Пираты ---
    if (CONFIG.EVENTS.pirates.enabled) {
      this.eventTimers.pirate -= dt;
      if (this.eventTimers.pirate <= 0) {
        if (this.pirateBases.length < 2) this.spawnPirateBase();
        const modPirate = this.modifierMatch('пират') ? 1.6 : 1;
        this.eventTimers.pirate = Utils.rand(55, 85) / (this.eventRate * modPirate);
      }
      this.updatePirates(dt);
    }

    // --- Мятежи ---
    this.eventTimers.revolt -= dt;
    if (this.eventTimers.revolt <= 0 && this.eventTimers.revolt !== Infinity) {
      this.triggerRevolt();
      this.eventTimers.revolt = Utils.rand(CONFIG.EVENTS.revolt.intervalMin, CONFIG.EVENTS.revolt.intervalMax) / this.eventRate;
    }
    if (this.eventTimers.revolt === Infinity) this.eventTimers.revolt = Infinity;

    // Варп-туннели истекают
    this.warps = this.warps.filter((w) => w.until > this.time);
  },

  spawnComet() {
    const E = CONFIG.EVENTS.comet;
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -60 : this.worldW + 60;
    const y = Utils.rand(this.worldH * 0.15, this.worldH * 0.85);
    const targetY = Utils.rand(this.worldH * 0.15, this.worldH * 0.85);
    const dirX = fromLeft ? 1 : -1;
    const angle = Math.atan2(targetY - y, dirX * this.worldW);
    this.comets.push({
      x, y,
      vx: Math.cos(angle) * E.speed * (fromLeft ? 1 : -1) * (dirX > 0 ? 1 : -1),
      vy: Math.sin(angle) * E.speed,
      seed: Utils.nextSeed(),
      life: 0
    });
    // Нормализуем скорость точно к E.speed
    const c = this.comets[this.comets.length - 1];
    const sp = Math.hypot(c.vx, c.vy) || 1;
    c.vx = (c.vx / sp) * E.speed * dirX;
    c.vy = (c.vy / sp) * E.speed * Math.sign(targetY - y || 1);
    this.events.push({ kind: 'comet', comet: c });
    this.notify('Комета приближается!');
  },

  updateComets(dt) {
    const E = CONFIG.EVENTS.comet;
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life += dt;
      // Заморозка планет у траектории
      for (const p of this.planets) {
        if (Utils.dist(c.x, c.y, p.x, p.y) < E.cometRadius + p.r * 0.5) {
          if (p.frozenUntil <= this.time) {
            this.spawnEffect('splat', p.x, p.y, { color: '#bfe9ff', size: p.r * 1.4, life: 1.4 });
          }
          p.frozenUntil = Math.max(p.frozenUntil, this.time + E.freezeDuration);
        }
      }
      // Хвост-частицы
      if (Math.random() < dt * 14) {
        this.spawnEffect('spark', c.x, c.y, { color: '#cfe6ff', size: Utils.rand(1.5, 3), life: 0.9, vx: -c.vx * 0.05, vy: -c.vy * 0.05 });
      }
      // Вылетела за границы — удалить
      const m = 140;
      if (c.x < -m || c.x > this.worldW + m || c.y < -m || c.y > this.worldH + m) {
        this.comets.splice(i, 1);
        this.events = this.events.filter((ev) => !(ev.kind === 'comet' && ev.comet === c));
      }
    }
  },

  spawnPirateBase() {
    const edge = Math.floor(Math.random() * 4);
    const m = 50;
    let x, y;
    if (edge === 0) { x = Utils.rand(m, this.worldW - m); y = m * 0.6; }
    else if (edge === 1) { x = Utils.rand(m, this.worldW - m); y = this.worldH - m * 0.6; }
    else if (edge === 2) { x = m * 0.6; y = Utils.rand(m, this.worldH - m); }
    else { x = this.worldW - m * 0.6; y = Utils.rand(m, this.worldH - m); }
    const base = {
      id: 'pirate_' + this._nextPirateId++,
      x, y, r: 24,
      ships: CONFIG.EVENTS.pirates.baseShips,
      seed: Utils.nextSeed(),
      raidTimer: CONFIG.EVENTS.pirates.raidInterval / Math.max(0.4, this.eventRate),
      growTimer: 0
    };
    this.pirateBases.push(base);
    this.spawnEffect('splat', x, y, { color: CONFIG.COLORS.PIRATES.hex, size: 30, life: 1.5 });
    this.notify('Пиратская база обнаружена на окраине системы!');
  },

  updatePirates(dt) {
    for (const base of this.pirateBases) {
      // Медленный рост гарнизона: +1/3сек до cap 60
      base.growTimer = (base.growTimer || 0) + dt;
      while (base.growTimer >= 3) {
        base.growTimer -= 3;
        if (base.ships < 60) base.ships += 1;
      }
      // Рейд на самую слабую планету НЕ пиратов
      base.raidTimer -= dt;
      if (base.raidTimer <= 0) {
        base.raidTimer = CONFIG.EVENTS.pirates.raidInterval / Math.max(0.4, this.eventRate);
        const targets = this.planets.filter((p) => p.owner !== CONFIG.PIRATES);
        if (targets.length && base.ships > 12) {
          let weakest = targets[0];
          for (const t of targets) if (t.ships < weakest.ships) weakest = t;
          const count = Math.floor(base.ships * 0.6);
          if (count > 0) {
            base.ships -= count;
            const from = { id: base.id, x: base.x, y: base.y };
            this.fleets.push(this.createFleet(from, weakest, CONFIG.PIRATES, count));
            this.events.push({ kind: 'pirateRaid', baseId: base.id, targetId: weakest.id, until: this.time + 4 });
            this.notify(`Пираты атакуют ${weakest.name}!`);
          }
        }
      }
    }
    // Чистка старых записей событий-рейдов
    this.events = this.events.filter((ev) => ev.kind !== 'pirateRaid' || ev.until > this.time);
  },

  triggerRevolt() {
    const candidates = this.planets.filter((p) =>
      p.owner !== CONFIG.OWNER.NEUTRAL && p.owner !== CONFIG.PIRATES && p.ships > 10);
    if (!candidates.length) return;
    const p = Utils.pick(candidates);
    const prevOwner = p.owner;
    p.owner = CONFIG.OWNER.NEUTRAL;
    p.ships = Math.floor(p.ships * (CONFIG.EVENTS.revolt.garrisonKeep ?? 0.4));
    p.shipsDisplay = p.ships;
    p.pulse = 1;
    this.events.push({ kind: 'revolt', planetId: p.id, until: this.time + 4 });
    this.spawnEffect('splat', p.x, p.y, { color: '#2b2340', size: p.r * 2.2, life: 1.6 });
    this.spawnExplosion(p.x, p.y, this.ownerColor(prevOwner), false);
    this.notify(`Мятеж на ${p.name}! Планета стала нейтральной`);
    if (prevOwner === CONFIG.OWNER.YOU) Utils.vibrate([80, 40, 80]);
  },

  // ====================================================================
  // ИИ
  // ====================================================================

  aiThink(dt) {
    if (typeof AI === 'undefined' || !AI.think) return;
    for (const p of this.players) {
      if (!p.isAI || !p.ai) continue;
      try { AI.think(p.ai, this, dt); } catch (e) { /* не роняем игру из-за ИИ */ }
    }
  },

  // ====================================================================
  // ПОБЕДА / ПОРАЖЕНИЕ (п.8)
  // ====================================================================

  checkEnd() {
    if (this.ended || this.time < 3) return;

    const youHasPlanets = this.planets.some((p) => p.owner === CONFIG.OWNER.YOU);
    const youHasFleets = this.fleets.some((f) => f.owner === CONFIG.OWNER.YOU);
    // Победа — когда все не-нейтральные планеты под вашим флагом
    // (пиратские базы/планеты тоже нужно обезвредить)
    const enemyPlanets = this.planets.some((p) =>
      p.owner !== CONFIG.OWNER.YOU && p.owner !== CONFIG.OWNER.NEUTRAL);

    if (!youHasPlanets && !youHasFleets) {
      const winner = this.players.find((p) => p.isAI) || null;
      this.endGame(winner);
    } else if (!enemyPlanets && youHasPlanets) {
      this.endGame(this.players.find((p) => p.id === CONFIG.OWNER.YOU));
    }
  },

  endGame(winnerPlayer) {
    if (this.ended) return;
    this.ended = true;
    this.winner = winnerPlayer || null;
    this.state = CONFIG.GAME_STATES.ENDED;
    this.cancelDrag();
    this.cancelAbility();

    const victory = !!(winnerPlayer && winnerPlayer.id === CONFIG.OWNER.YOU);
    let dustEarned;
    if (victory) {
      dustEarned = this.mode === CONFIG.GAME_MODES.CAMPAIGN
        ? (this.system?.reward?.dust ?? 30)
        : { easy: 15, medium: 25, hard: 35 }[this.difficulty] ?? 15;
    } else {
      dustEarned = 5;
    }

    this.result = {
      victory,
      timeSec: Math.round(this.time),
      captured: this.stats.captured,
      dustEarned,
      dmSpent: this.stats.dmSpent
    };

    if (victory && this.mode === CONFIG.GAME_MODES.CAMPAIGN && this.system &&
        typeof CAMPAIGN !== 'undefined' && CAMPAIGN.completeSystem) {
      try { CAMPAIGN.completeSystem(this.system.id, this.result); } catch (e) {}
    }

    Utils.vibrate(victory ? [100, 50, 100, 50, 200] : [200, 80, 200]);
    if (typeof menu !== 'undefined' && menu.showGameOver) menu.showGameOver(this);
  },

  // ====================================================================
  // HUD
  // ====================================================================

  updateHUD() {
    const myPlanets = this.planets.filter((p) => p.owner === CONFIG.OWNER.YOU).length;
    const myShips = this.planets.filter((p) => p.owner === CONFIG.OWNER.YOU)
      .reduce((s, p) => s + Math.floor(p.ships), 0) +
      this.fleets.filter((f) => f.owner === CONFIG.OWNER.YOU).reduce((s, f) => s + f.count, 0);

    const dmEl = document.getElementById('dmCounter');
    if (dmEl) dmEl.textContent = `✦ ${Math.floor(this.dm[CONFIG.OWNER.YOU] || 0)}`;
    const plEl = document.getElementById('planetsCounter');
    if (plEl) plEl.textContent = `⬤ ${myPlanets}/${this.planets.length}`;
    const shEl = document.getElementById('shipsCounter');
    if (shEl) shEl.textContent = `⛟ ${myShips}`;

    // Кнопки способностей
    document.querySelectorAll('.ability-btn[data-ability]').forEach((btn) => {
      const kind = btn.dataset.ability;
      const costEl = btn.querySelector('.ability-cost');
      if (costEl) costEl.textContent = String(this.abilityCost(kind));
      btn.classList.toggle('is-armed', this.pendingAbility === kind);
      btn.classList.toggle('is-disabled', !this.affordAbility(CONFIG.OWNER.YOU, kind));
    });

    // Подсказка прицеливания
    const hintEl = document.getElementById('abilityHint');
    if (hintEl) {
      let hint = '';
      if (this.pendingAbility === 'strike') hint = 'Выберите цель для орбитального удара…';
      else if (this.pendingAbility === 'shield') hint = 'Выберите свою планету для щита…';
      else if (this.pendingAbility === 'warp') {
        hint = this.warpFirst === null ? 'Выберите первую планету варпа…' : 'Выберите вторую планету';
      }
      hintEl.textContent = hint;
      hintEl.classList.toggle('hidden', !hint);
      hintEl.classList.toggle('is-visible', !!hint);
    }

    if (typeof menu !== 'undefined' && menu.refreshHUDState) {
      try { menu.refreshHUDState(); } catch (e) {}
    }
  },

  // ====================================================================
  // ПАУЗА / РЕСТАРТ / МЕНЮ
  // ====================================================================

  pause() {
    if (this.state === CONFIG.GAME_STATES.PLAYING) {
      this.state = CONFIG.GAME_STATES.PAUSED;
      document.getElementById('pauseMenu')?.classList.remove('hidden');
    }
  },

  resume() {
    if (this.state === CONFIG.GAME_STATES.PAUSED) {
      this.state = CONFIG.GAME_STATES.PLAYING;
      document.getElementById('pauseMenu')?.classList.add('hidden');
      this.lastTime = performance.now();
    }
  },

  restart() {
    if (this.mode === CONFIG.GAME_MODES.CAMPAIGN && this.system) {
      this.startCampaignSystem(this.system.id);
    } else {
      this.startSkirmish(this.difficulty);
    }
  },

  toMenu() {
    this.state = CONFIG.GAME_STATES.MENU;
    this.mode = null;
    this.selectedPlanetId = null;
    this.cancelDrag();
    this.cancelAbility();
    document.getElementById('gameCanvas')?.classList.add('hidden');
    document.getElementById('gameUI')?.classList.add('hidden');
    document.getElementById('pauseMenu')?.classList.add('hidden');
    document.getElementById('gameOverScreen')?.classList.add('hidden');
    if (typeof menu !== 'undefined' && menu.showScreen) menu.showScreen('mainMenu');
  },

  // ====================================================================
  // ГЛАВНЫЙ ЦИКЛ
  // ====================================================================

  loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    if (this.state === CONFIG.GAME_STATES.PLAYING && !this.ended) {
      this.update(dt);
    } else {
      // На паузе/в меню — только камера с инерцией и эффекты, чтобы картинка жила
      this.updateCamera(dt);
      this.updateEffects(dt);
    }

    if (typeof renderer !== 'undefined' && renderer.render && this.state !== CONFIG.GAME_STATES.MENU) {
      try { renderer.render(this); } catch (e) { console.error(e); }
    }

    this.animationId = requestAnimationFrame(() => this.loop());
  },

  update(dt) {
    this.time += dt;

    this.updateCamera(dt);
    this.updateEffects(dt);
    this.updateProduction(dt);
    this.updateDM(dt);

    // Флоты в полёте
    for (let i = this.fleets.length - 1; i >= 0; i--) {
      const f = this.fleets[i];
      f.t += dt;
      if (f.t >= f.travel) {
        this.arriveFleet(f);
        this.fleets.splice(i, 1);
      }
    }

    this.updateEvents(dt);
    this.aiThink(dt);
    this.checkEnd();
    this.updateNotify();

    // HUD — с лёгким троттлингом
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      this.updateHUD();
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = game;
}
