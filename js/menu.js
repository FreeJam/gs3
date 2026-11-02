/**
 * GS3 — Меню: экраны, карта кампании, брифинг, настройки, помощь, финал
 * Глобал: menu
 * Все обработчики — через addEventListener, делегирование по data-атрибутам.
 */
const menu = {
  currentSystemId: null,
  _helpBuilt: false,

  // ===== Инициализация =====
  init() {
    CAMPAIGN.load();
    this._applySettingsToUI();

    const menuRoot = document.getElementById('menu');

    // Делегирование по меню: data-nav, data-action, data-difficulty, data-start, data-open-system, data-buy-upgrade
    menuRoot.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        const id = nav.getAttribute('data-nav');
        this.showScreen(id);
        if (id === 'campaign') this.updateCampaignMap();
        if (id === 'help') this._buildHelp();
        return;
      }

      const start = e.target.closest('[data-start]');
      if (start) {
        this._startSystem(start.getAttribute('data-start'));
        return;
      }

      const diff = e.target.closest('[data-difficulty]');
      if (diff) {
        this.hide();
        if (typeof game !== 'undefined' && game.startSkirmish) {
          game.startSkirmish(diff.getAttribute('data-difficulty'));
        }
        return;
      }

      const open = e.target.closest('[data-open-system]');
      if (open) {
        this.openBriefing(open.getAttribute('data-open-system'));
        return;
      }

      const buy = e.target.closest('[data-buy-upgrade]');
      if (buy && !buy.disabled) {
        CAMPAIGN.buyUpgrade(buy.getAttribute('data-buy-upgrade'));
        this.updateCampaignMap();
        return;
      }

      const action = e.target.closest('[data-action]');
      if (action) this._handleAction(action.getAttribute('data-action'));
    });

    // HUD-кнопки
    this._on('pauseBtn', 'click', () => { if (typeof game !== 'undefined') game.pause(); });
    this._on('menuBtn', 'click', () => { if (typeof game !== 'undefined') game.toMenu(); });
    this._on('fullscreenBtn', 'click', () => Utils.toggleFullscreen());
    this._on('menuFullscreenBtn', 'click', () => Utils.toggleFullscreen());

    // Пауза
    this._on('resumeBtn', 'click', () => { if (typeof game !== 'undefined') game.resume(); });
    this._on('restartBtn', 'click', () => { if (typeof game !== 'undefined') game.restart(); });
    this._on('toMenuBtn', 'click', () => { if (typeof game !== 'undefined') game.toMenu(); });

    // Финал
    this._on('replayBtn', 'click', () => { if (typeof game !== 'undefined') game.restart(); });
    this._on('toMenuFromEndBtn', 'click', () => { if (typeof game !== 'undefined') game.toMenu(); });
    this._on('continueBtn', 'click', () => {
      this._hideOverlays();
      if (typeof game !== 'undefined' && game.toMenu) game.toMenu();
      this.showScreen('campaign');
      this.updateCampaignMap();
    });

    // Способности обрабатывает game.js (bindUI → armAbility). Здесь не дублируем,
    // иначе двойная привязка мгновенно гасит выбор способности (toggle-конфликт).

    // Чипы отправки
    document.querySelectorAll('#sendRail .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pct = Number(chip.getAttribute('data-pct')) / 100;
        if (typeof game !== 'undefined' && game.setSendPct) game.setSendPct(pct);
        this._refreshSendChips(pct);
      });
    });

    // Настройки
    const quality = document.getElementById('qualitySelect');
    if (quality) quality.addEventListener('change', () => {
      const s = Utils.getSettings();
      s.quality = quality.value;
      Utils.saveSettings(s);
    });

    const rm = document.getElementById('reducedMotionToggle');
    if (rm) rm.addEventListener('change', () => {
      const s = Utils.getSettings();
      s.reducedMotion = rm.checked;
      Utils.saveSettings(s);
      document.body.classList.toggle('reduced-motion', rm.checked);
    });

    const pt = document.getElementById('particlesToggle');
    if (pt) pt.addEventListener('change', () => {
      const s = Utils.getSettings();
      s.particles = pt.checked;
      Utils.saveSettings(s);
    });

    document.body.classList.toggle('reduced-motion', Utils.getSettings().reducedMotion);
    this.refreshHUDState();
  },

  _on(id, ev, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  },

  _handleAction(action) {
    switch (action) {
      case 'toggleUpgrades': {
        const p = document.getElementById('upgradePanel');
        if (p) p.classList.toggle('hidden');
        break;
      }
      case 'closeUpgrades': {
        const p = document.getElementById('upgradePanel');
        if (p) p.classList.add('hidden');
        break;
      }
      case 'resume': if (typeof game !== 'undefined') game.resume(); break;
      case 'restart': if (typeof game !== 'undefined') game.restart(); break;
      case 'toMenu': if (typeof game !== 'undefined') game.toMenu(); break;
      case 'replay': if (typeof game !== 'undefined') game.restart(); break;
      case 'continue':
        this._hideOverlays();
        if (typeof game !== 'undefined' && game.toMenu) game.toMenu();
        this.showScreen('campaign');
        this.updateCampaignMap();
        break;
    }
  },

  // ===== Экраны =====
  showScreen(id) {
    this._hideOverlays();
    const menuRoot = document.getElementById('menu');
    if (menuRoot) menuRoot.classList.remove('hidden');
    document.querySelectorAll('.menu-screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    if (screen) screen.classList.add('active');

    if (id === 'campaign') this.updateCampaignMap();
    if (id === 'settings') this._applySettingsToUI();
    if (id === 'help') this._buildHelp();
  },

  hide() {
    const menuRoot = document.getElementById('menu');
    if (menuRoot) menuRoot.classList.add('hidden');
    const gameUI = document.getElementById('gameUI');
    if (gameUI) gameUI.classList.remove('hidden');
    this._hideOverlays();
  },

  _hideOverlays() {
    ['pauseMenu', 'gameOverScreen'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  },

  // ===== Кампания: карта =====
  updateCampaignMap() {
    const map = document.getElementById('campaignMap');
    if (!map) return;

    // счётчик пыли
    const dust = document.getElementById('dustAmount');
    if (dust) dust.textContent = String(CAMPAIGN.progress.dust);

    // позиции узлов: гл.1 низ-лево → гл.3 верх-право, зигзагом
    const W = 860, H = 470;
    const positions = {
      sirius:   { x:  85, y: 400 },
      vega:     { x: 210, y: 310 },
      altair:   { x: 330, y: 395 },
      pleiades: { x: 430, y: 280 },
      orion:    { x: 530, y: 370 },
      castor:   { x: 615, y: 250 },
      antares:  { x: 690, y: 335 },
      termina:  { x: 745, y: 195 },
      core:     { x: 800, y:  85 }
    };

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Карта кампании');

    // связи
    for (const sys of CAMPAIGN.systems) {
      for (const req of sys.requires) {
        const a = positions[req], b = positions[sys.id];
        if (!a || !b) continue;
        const path = document.createElementNS(NS, 'path');
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 18;
        path.setAttribute('d', `M ${a.x} ${a.y} Q ${mx} ${my}, ${b.x} ${b.y}`);
        path.setAttribute('class', 'sys-link' + (CAMPAIGN.isCompleted(req) ? ' completed' : ''));
        svg.appendChild(path);
      }
    }

    // метки глав
    const chapters = [
      { n: 'Глава I', x: 190, y: 452 },
      { n: 'Глава II', x: 500, y: 432 },
      { n: 'Глава III', x: 790, y: 150 }
    ];
    for (const ch of chapters) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', ch.x); t.setAttribute('y', ch.y);
      t.setAttribute('class', 'node-chapter');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = ch.n;
      svg.appendChild(t);
    }

    // цвета узлов по главе (атласные пигменты)
    const chapterColors = { 1: '#33538c', 2: '#a97b3e', 3: '#b4402f' };

    // узлы
    for (const sys of CAMPAIGN.systems) {
      const pos = positions[sys.id];
      if (!pos) continue;
      const unlocked = CAMPAIGN.isUnlocked(sys.id);
      const completed = CAMPAIGN.isCompleted(sys.id);
      const state = completed ? 'completed' : unlocked ? 'available' : 'locked';

      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `sys-node ${state}`);
      g.setAttribute('data-open-system', sys.id);
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
      if (state !== 'locked') g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', `${sys.name} — ${state === 'locked' ? 'закрыто' : state === 'completed' ? 'пройдено' : 'доступно'}`);

      const color = state === 'locked' ? '#3a3652' : chapterColors[sys.chapter];

      // акварельный blob: wash + core
      if (state === 'available') {
        const ring = document.createElementNS(NS, 'circle');
        ring.setAttribute('class', 'pulse-ring');
        ring.setAttribute('r', '30');
        g.appendChild(ring);
      }
      const wash = document.createElementNS(NS, 'circle');
      wash.setAttribute('class', 'node-wash');
      wash.setAttribute('r', '34');
      wash.setAttribute('fill', color);
      g.appendChild(wash);

      const core = document.createElementNS(NS, 'circle');
      core.setAttribute('class', 'node-core');
      core.setAttribute('r', '22');
      core.setAttribute('fill', state === 'locked' ? '#2c2846' : Utils.rgba(color, .8));
      g.appendChild(core);

      // замок / звезда / номер
      if (state === 'locked') {
        const lock = document.createElementNS(NS, 'text');
        lock.setAttribute('class', 'node-lock');
        lock.setAttribute('y', '6');
        lock.textContent = '🔒';
        g.appendChild(lock);
      } else {
        const idx = document.createElementNS(NS, 'text');
        idx.setAttribute('class', 'node-lock');
        idx.setAttribute('y', '6');
        idx.setAttribute('fill', state === 'locked' ? '' : 'rgba(20,17,42,.85)');
        idx.style.fontWeight = '900';
        idx.style.fontSize = '15px';
        idx.style.fontFamily = 'Nunito, sans-serif';
        idx.textContent = String(sys.index + 1);
        g.appendChild(idx);
      }

      if (completed) {
        const star = document.createElementNS(NS, 'text');
        star.setAttribute('class', 'node-star');
        star.setAttribute('x', '20');
        star.setAttribute('y', '-20');
        star.textContent = '★';
        g.appendChild(star);
      }

      // подпись
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('class', 'node-label');
      label.setAttribute('y', '56');
      label.textContent = sys.name;
      g.appendChild(label);

      // клавиатура для доступных узлов
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openBriefing(sys.id);
        }
      });

      svg.appendChild(g);
    }

    map.innerHTML = '';
    map.appendChild(svg);

    // панель апгрейдов
    this._renderUpgrades();
  },

  _renderUpgrades() {
    const list = document.getElementById('upgradeList');
    if (!list) return;
    list.innerHTML = '';

    for (const up of CAMPAIGN.upgrades) {
      const lvl = CAMPAIGN.getUpgradeLevel(up.id);
      const cost = CAMPAIGN.upgradeCost(up.id);

      const row = document.createElement('div');
      row.className = 'upgrade-row';

      const info = document.createElement('div');
      info.className = 'upgrade-info';

      const name = document.createElement('div');
      name.className = 'upgrade-name';
      name.textContent = up.name;

      const desc = document.createElement('div');
      desc.className = 'upgrade-desc';
      desc.textContent = up.desc;

      const lvlEl = document.createElement('div');
      lvlEl.className = 'upgrade-lvl';
      lvlEl.textContent = `Уровень ${lvl} / ${up.maxLvl}`;

      info.appendChild(name); info.appendChild(desc); info.appendChild(lvlEl);

      const btn = document.createElement('button');
      btn.className = 'upgrade-buy';
      if (cost == null) {
        btn.classList.add('maxed');
        btn.textContent = 'МАКС';
        btn.disabled = true;
      } else {
        btn.textContent = `✦ ${cost}`;
        btn.setAttribute('data-buy-upgrade', up.id);
        btn.disabled = CAMPAIGN.progress.dust < cost;
      }

      row.appendChild(info);
      row.appendChild(btn);
      list.appendChild(row);
    }
  },

  // ===== Брифинг =====
  openBriefing(systemId) {
    const body = document.getElementById('briefingBody');
    if (!body) return;
    const sys = CAMPAIGN.getSystem(systemId);
    if (!sys) return;

    this.currentSystemId = systemId;
    const unlocked = CAMPAIGN.isUnlocked(systemId);

    if (!unlocked) {
      body.innerHTML = '';
      const locked = document.createElement('div');
      locked.className = 'briefing-locked';
      const glyph = document.createElement('span');
      glyph.className = 'lock-glyph';
      glyph.textContent = '🔒';
      const p = document.createElement('p');
      p.textContent = `Система «${sys.name}» закрыта. Сначала пройдите: ${sys.requires.map(r => (CAMPAIGN.getSystem(r) || {}).name || r).join(', ')}.`;
      locked.appendChild(glyph);
      locked.appendChild(p);
      body.appendChild(locked);
      this.showScreen('briefing');
      return;
    }

    const diffNames = { easy: 'Легко', medium: 'Средне', hard: 'Сложно' };

    body.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'briefing-head';
    const nameEl = document.createElement('h2');
    nameEl.className = 'briefing-name';
    nameEl.textContent = sys.name;
    const chEl = document.createElement('span');
    chEl.className = 'briefing-chapter';
    chEl.textContent = `Глава ${sys.chapter} / 3`;
    head.appendChild(nameEl);
    head.appendChild(chEl);

    const flavor = document.createElement('p');
    flavor.className = 'briefing-flavor';
    flavor.textContent = sys.flavor;

    const mods = document.createElement('ul');
    mods.className = 'briefing-modifiers';
    for (const m of sys.modifiers) {
      const li = document.createElement('li');
      li.className = 'mod-badge';
      li.textContent = m;
      mods.appendChild(li);
    }

    const meta = document.createElement('div');
    meta.className = 'briefing-meta';
    const mk = (label, value, cls) => {
      const span = document.createElement('span');
      span.className = 'meta-item';
      const strong = document.createElement('strong');
      if (cls) strong.className = cls;
      strong.textContent = value;
      span.appendChild(document.createTextNode(label + ' '));
      span.appendChild(strong);
      meta.appendChild(span);
    };
    mk('Сложность:', diffNames[sys.difficulty] || sys.difficulty, `diff-${sys.difficulty}`);
    mk('Противников:', String(sys.aiCount));
    mk('Планет:', String(sys.planetCount));
    mk('Старт:', `✦${sys.startDM} · ⛟${sys.startShips}`);

    const reward = document.createElement('div');
    reward.className = 'briefing-reward';
    reward.textContent = `Награда: ✦ ${sys.reward.dust}`;

    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons';
    buttons.style.display = 'flex';
    const fight = document.createElement('button');
    fight.className = 'menu-btn primary';
    fight.textContent = '⚔ В бой';
    fight.setAttribute('data-start', sys.id);
    const back = document.createElement('button');
    back.className = 'menu-btn back';
    back.textContent = '← К карте';
    back.setAttribute('data-nav', 'campaign');
    buttons.appendChild(fight);
    buttons.appendChild(back);

    body.appendChild(head);
    body.appendChild(flavor);
    body.appendChild(mods);
    body.appendChild(meta);
    body.appendChild(reward);
    body.appendChild(buttons);

    this.showScreen('briefing');
  },

  _startSystem(systemId) {
    const sys = CAMPAIGN.getSystem(systemId);
    if (!sys || !CAMPAIGN.isUnlocked(systemId)) return;
    this.hide();
    if (typeof game !== 'undefined' && game.startCampaignSystem) {
      game.startCampaignSystem(systemId);
    }
  },

  // ===== Финал =====
  showGameOver(g) {
    const winnerText = document.getElementById('winnerText');
    const stats = document.getElementById('gameStats');
    const continueBtn = document.getElementById('continueBtn');
    if (!winnerText || !stats) return;

    const result = (g && g.result) || { victory: false, timeSec: 0, captured: 0, dustEarned: 0, dmSpent: 0 };
    const isCampaign = g && g.mode === CONFIG.GAME_MODES.CAMPAIGN;

    winnerText.textContent = result.victory ? 'Победа!' : 'Поражение';
    winnerText.className = 'overlay-title ' + (result.victory ? 'win' : 'lose');

    stats.innerHTML = '';
    const rows = [
      { label: 'Время', value: Utils.formatTime(result.timeSec || 0), cls: '' },
      { label: 'Захвачено планет', value: String(result.captured || 0), cls: '' },
      { label: '✦ Пыль', value: '+' + (result.dustEarned || 0), cls: 'dust' },
      { label: 'Потрачено DM', value: String(result.dmSpent || 0), cls: '' }
    ];
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'stat-row' + (r.cls ? ' ' + r.cls : '');
      const l = document.createElement('span');
      l.textContent = r.label;
      const v = document.createElement('span');
      v.className = 'stat-value';
      v.textContent = r.value;
      if (r.cls === 'dust' && result.dustEarned > 0) {
        v.classList.add('pop');
        // анимация счётчика пыли
        this._animateDustCounter(v, result.dustEarned);
      }
      row.appendChild(l); row.appendChild(v);
      stats.appendChild(row);
    }

    if (continueBtn) {
      continueBtn.classList.toggle('hidden', !isCampaign);
      continueBtn.textContent = isCampaign && result.victory ? 'Карта кампании →' : 'Карта кампании';
    }

    const overlay = document.getElementById('gameOverScreen');
    if (overlay) overlay.classList.remove('hidden');
  },

  _animateDustCounter(el, target) {
    const dur = 900;
    const t0 = performance.now();
    const step = (t) => {
      const p = Utils.clamp((t - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = '+' + Math.round(target * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  // ===== HUD =====
  refreshHUDState() {
    const inMatch = typeof game !== 'undefined' && game &&
      (game.state === CONFIG.GAME_STATES.PLAYING || game.state === CONFIG.GAME_STATES.PAUSED);

    document.querySelectorAll('.ability-btn').forEach(btn => {
      const kind = btn.getAttribute('data-ability');
      if (!inMatch) {
        btn.classList.remove('is-armed');
        btn.classList.remove('is-disabled');
        return;
      }
      let afford = true;
      if (typeof game.affordAbility === 'function') {
        afford = game.affordAbility(CONFIG.OWNER.YOU, kind);
      }
      btn.classList.toggle('is-disabled', !afford);
      btn.classList.toggle('is-armed', game.pendingAbility === kind);
    });

    const hint = document.getElementById('abilityHint');
    if (hint) {
      if (inMatch && game.pendingAbility) {
        let text = 'Выберите цель…';
        if (game.pendingAbility === 'warp') {
          text = game.warpFirst != null ? 'Выберите вторую планету' : 'Выберите свою планету';
        } else if (game.pendingAbility === 'shield') {
          text = 'Выберите планету для щита';
        } else if (game.pendingAbility === 'strike') {
          text = 'Выберите цель удара';
        }
        hint.textContent = text;
        hint.classList.remove('hidden');
      } else {
        hint.classList.add('hidden');
      }
    }

    // оверлей паузы
    const pauseMenu = document.getElementById('pauseMenu');
    if (pauseMenu) {
      const shouldPause = typeof game !== 'undefined' && game && game.state === CONFIG.GAME_STATES.PAUSED;
      pauseMenu.classList.toggle('hidden', !shouldPause);
    }
  },

  _refreshSendChips(pct) {
    document.querySelectorAll('#sendRail .chip').forEach(c => {
      c.classList.toggle('active', Number(c.getAttribute('data-pct')) / 100 === pct);
    });
    const cur = document.getElementById('sendPct');
    if (cur) cur.textContent = Utils.formatPercent(pct);
  },

  /** game.updateHUD может звать это для синхронизации чипов отправки */
  refreshSendPct(pct) { this._refreshSendChips(pct); },

  // ===== Настройки =====
  _applySettingsToUI() {
    const s = Utils.getSettings();
    const q = document.getElementById('qualitySelect');
    if (q) q.value = s.quality || 'high';
    const rm = document.getElementById('reducedMotionToggle');
    if (rm) rm.checked = !!s.reducedMotion;
    const pt = document.getElementById('particlesToggle');
    if (pt) pt.checked = s.particles !== false;
  },

  // ===== Помощь (контент из CONFIG) =====
  _buildHelp() {
    const body = document.getElementById('helpBody');
    if (!body || this._helpBuilt) return;
    this._helpBuilt = true;

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = '';

    html += `<div class="help-section">
      <h3>Правила</h3>
      <p>Вы — адмирал звездоносного флота. Захватывайте планеты, отправляя корабли <strong>перетаскиванием</strong> от своей планеты к цели (или клик по планете — выделить, клик по цели — отправить).</p>
      <ul>
        <li>Планеты производят корабли; тип планеты влияет на скорость и оборону.</li>
        <li>Если флот прибывает на <strong>свою</strong> планету — это подкрепление; на чужую — бой: атакующих должно быть больше, чем гарнизон × оборона.</li>
        <li>Процент отправки настраивается чипами <strong>25/50/75/100%</strong> внизу справа.</li>
        <li><strong>Тёмная материя (✦)</strong>: +1 за каждые ${CONFIG.GAME.DM_INTERVAL} сек владения планетами и +${CONFIG.GAME.DM_CAPTURE_BONUS} за захват. Тратится на способности.</li>
        <li>Клавиши: <strong>1/2/3</strong> — способности, <strong>Esc</strong> — отмена, <strong>Пробел/P</strong> — пауза.</li>
        <li>Победа — когда у противников не осталось планет. Поражение — когда у вас их нет.</li>
      </ul>
    </div>`;

    html += `<div class="help-section"><h3>Типы планет</h3><table class="help-table">
      <tr><th>Тип</th><th>Производство</th><th>Оборона</th><th>Ценность</th><th>Описание</th></tr>`;
    for (const key of Object.keys(CONFIG.PLANET_TYPES)) {
      const t = CONFIG.PLANET_TYPES[key];
      html += `<tr>
        <td class="type-name">${esc(t.name)}</td>
        <td>×${t.prodMul}</td>
        <td>×${t.defMul}</td>
        <td>${t.value}</td>
        <td>${esc(t.desc)}</td>
      </tr>`;
    }
    html += `</table></div>`;

    html += `<div class="help-section"><h3>Способности</h3><table class="help-table">
      <tr><th>Способность</th><th>Цена</th><th>Клавиша</th><th>Эффект</th></tr>`;
    const glyphs = { strike: '☄', shield: '◯', warp: '∞' };
    for (const key of Object.keys(CONFIG.ABILITIES)) {
      const a = CONFIG.ABILITIES[key];
      html += `<tr>
        <td class="type-name">${glyphs[key] || ''} ${esc(a.name)}</td>
        <td>✦ ${a.cost}</td>
        <td>${a.key}</td>
        <td>${esc(a.desc)}</td>
      </tr>`;
    }
    html += `</table></div>`;

    html += `<div class="help-section">
      <h3>События</h3>
      <ul>
        <li><strong>☄ Комета</strong> — раз в ${CONFIG.EVENTS.comet.intervalMin}–${CONFIG.EVENTS.comet.intervalMax} сек пролетает через систему; планеты у её траектории замерзают на ${CONFIG.EVENTS.comet.freezeDuration} сек (производство встаёт).</li>
        <li><strong>⚓ Пираты</strong> — база у края карты раз в ${CONFIG.EVENTS.pirates.raidInterval} сек атакует самую слабую планету. Уничтожьте базу — получите +${CONFIG.EVENTS.pirates.reward} ✦.</li>
        <li><strong>✒ Мятеж</strong> — раз в ${CONFIG.EVENTS.revolt.intervalMin}–${CONFIG.EVENTS.revolt.intervalMax} сек случайная планета «перекрашивается» в нейтральную, сохраняя ${Math.round(CONFIG.EVENTS.revolt.garrisonKeep * 100)}% гарнизона.</li>
      </ul>
    </div>`;

    html += `<div class="help-section">
      <h3>Кампания</h3>
      <p>Три главы, девять систем — от учебных мазков Сириуса до густого Ядра Галактики. За победы начисляется <strong>звёздная пыль ✦</strong>, которая тратится на мета-апгрейды в «Мастерской красок» на карте кампании.</p>
    </div>`;

    body.innerHTML = html;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = menu;
}
