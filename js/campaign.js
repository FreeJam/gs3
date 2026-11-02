/**
 * GS3 — Кампания: системы, мета-апгрейды, прогресс в localStorage
 * Глобал: CAMPAIGN
 */
const CAMPAIGN = {
  // ===== 8 систем в 3 главах =====
  systems: [
    // ---- Глава 1: обучающая (easy, 1-2 ИИ) ----
    {
      id: 'sirius', name: 'Сириус', chapter: 1, index: 0,
      difficulty: 'easy', aiCount: 1, planetCount: 9,
      eventRate: 0.5,
      typeWeights: null,
      startDM: 4, startShips: 35,
      flavor: 'Голубая акварель Сириуса ещё не высохла: краски живые, и звёздная пыль плывёт в прозрачной воде. Здесь начинается ваше первое перо.',
      reward: { dust: 30 },
      requires: [],
      modifiers: ['Обучение: только один противник', 'События редки (×0.5)', 'Тёмная материя и способности доступны']
    },
    {
      id: 'vega', name: 'Вега', chapter: 1, index: 1,
      difficulty: 'easy', aiCount: 1, planetCount: 10,
      eventRate: 0.6,
      typeWeights: { terra: 0.52, gasGiant: 0.10, fortress: 0.08, shipyard: 0.10, asteroid: 0.20 },
      startDM: 4, startShips: 35,
      flavor: 'Вега звучит как чистая нота на натянутой бумаге неба — светло-голубая, звенящая, почти прозрачная. Терры здесь круглые и тёплые, как капли воды.',
      reward: { dust: 35 },
      requires: ['sirius'],
      modifiers: ['Много обитаемых миров', 'Верфи встречаются чаще']
    },
    {
      id: 'altair', name: 'Альтаир', chapter: 1, index: 2,
      difficulty: 'easy', aiCount: 2, planetCount: 11,
      eventRate: 0.7,
      typeWeights: null,
      startDM: 4, startShips: 38,
      flavor: 'Две кисти сошлись у Альтаира: его орбита расчерчена быстрыми белыми мазками двух соперничающих флотов. Первая битва на двоих — но краски ещё мягкие.',
      reward: { dust: 45 },
      requires: ['vega'],
      modifiers: ['Два противника сразу', 'Первый вкус настоящей осады']
    },

    // ---- Глава 2: события (medium, 2-3 ИИ) ----
    {
      id: 'pleiades', name: 'Плеяды', chapter: 2, index: 3,
      difficulty: 'medium', aiCount: 2, planetCount: 12,
      eventRate: 1.0,
      typeWeights: { terra: 0.38, gasGiant: 0.14, fortress: 0.12, shipyard: 0.14, asteroid: 0.22 },
      startDM: 4, startShips: 35,
      flavor: 'Семь сестёр-звёзд высыпали на холст горстью лазурных брызг. Кометы гуляют меж ними, оставляя иней на планетах — акварель любит случайность.',
      reward: { dust: 60 },
      requires: ['altair'],
      modifiers: ['Кометы появляются регулярно', 'Верфь-миры ценятся вдвойне']
    },
    {
      id: 'orion', name: 'Туманность Ориона', chapter: 2, index: 4,
      difficulty: 'medium', aiCount: 3, planetCount: 13,
      eventRate: 1.15,
      typeWeights: { terra: 0.30, gasGiant: 0.24, fortress: 0.12, shipyard: 0.10, asteroid: 0.24 },
      startDM: 5, startShips: 35,
      flavor: 'Розово-лиловая туманность растеклась по полувселенной, как пролитая банка акварели. В её волокнах прячутся пиратские базы — ржавые пятна на чистой бумаге.',
      reward: { dust: 70 },
      requires: ['pleiades'],
      modifiers: ['Три противника', 'Пиратские рейды участились', 'Газовые гиганты доминируют']
    },
    {
      id: 'castor', name: 'Кастор', chapter: 2, index: 5,
      difficulty: 'medium', aiCount: 2, planetCount: 12,
      eventRate: 1.2,
      typeWeights: { terra: 0.32, gasGiant: 0.12, fortress: 0.24, shipyard: 0.10, asteroid: 0.22 },
      startDM: 5, startShips: 36,
      flavor: 'Двойная звезда Кастор держит в объятиях пояс крепостей — угловатых, нарисованных твёрдой рукой. Здесь оборона стоит дороже наступления, и мятежи зреют в тени бастионов.',
      reward: { dust: 80 },
      requires: ['orion'],
      modifiers: ['Крепости повсюду (оборона ×2.2)', 'Мятежи случаются чаще']
    },

    // ---- Глава 3: всё сразу (hard, 3-4 ИИ) ----
    {
      id: 'antares', name: 'Антарес', chapter: 3, index: 6,
      difficulty: 'hard', aiCount: 3, planetCount: 14,
      eventRate: 1.35,
      typeWeights: { terra: 0.26, gasGiant: 0.20, fortress: 0.20, shipyard: 0.12, asteroid: 0.22 },
      startDM: 5, startShips: 34,
      flavor: 'Красный сверхгигант Антарес кровоточит в воду алым пигментом — вся система окрашена в тревогу. Три адмирала точат кисти: пощады не будет.',
      reward: { dust: 110 },
      requires: ['castor'],
      modifiers: ['Три опытных адмирала', 'Пираты с самого начала', 'Кометы чаще', 'Полный набор событий']
    },
    {
      id: 'termina', name: 'Сверхновая Термина', chapter: 3, index: 7,
      difficulty: 'hard', aiCount: 3, planetCount: 13,
      eventRate: 1.5,
      typeWeights: { terra: 0.20, gasGiant: 0.16, fortress: 0.22, shipyard: 0.22, asteroid: 0.20 },
      startDM: 6, startShips: 34,
      flavor: 'Здесь когда-то вспыхнула сверхновая, и её белый свет до сих пор сохнет на краях холста. Верфи лепятся к руинам, а мятежи вспыхивают, как искры по сухой бумаге.',
      reward: { dust: 130 },
      requires: ['antares'],
      modifiers: ['Верфи и крепости доминируют', 'Мятежи почти не прекращаются', 'Четыре флота на поле']
    },
    {
      id: 'core', name: 'Ядро Галактики', chapter: 3, index: 8,
      difficulty: 'hard', aiCount: 4, planetCount: 15,
      eventRate: 1.6,
      typeWeights: { terra: 0.24, gasGiant: 0.22, fortress: 0.18, shipyard: 0.16, asteroid: 0.20 },
      startDM: 6, startShips: 32,
      flavor: 'Финальный лист альбома: ядро галактики густо прописано золотом и индиго, свет звезды просвечивает сквозь всю бумагу насквозь. Четыре флота и сама вселенная против вас.',
      reward: { dust: 180 },
      requires: ['termina'],
      modifiers: ['Четыре противника одновременно', 'Все события на максимуме', 'Пираты с самого начала', 'Кометы чаще', 'Победа завершает кампанию']
    }
  ],

  // ===== Мета-апгрейды =====
  upgrades: [
    { id: 'dm_start', name: 'Тёмный резерв', desc: '+1 тёмной материи в начале боя', maxLvl: 3, cost: [40, 80, 140] },
    { id: 'prod', name: 'Казённые доки', desc: '+4% к производству за уровень', maxLvl: 3, cost: [50, 100, 160] },
    { id: 'ships', name: 'Стартовая армада', desc: '+5 стартовых кораблей за уровень', maxLvl: 3, cost: [40, 90, 150] },
    { id: 'discount', name: 'Тёмный брокер', desc: 'Способности дешевле на 1 DM на 2 ур.', maxLvl: 1, cost: [120] }
  ],

  // ===== Прогресс =====
  progress: {
    dust: 0,
    upgrades: {},
    completed: [],
    stats: { wins: 0, losses: 0, bestTime: null }
  },

  load() {
    const saved = Utils.load(CONFIG.STORAGE.PROGRESS, null);
    if (saved && typeof saved === 'object') {
      this.progress = {
        dust: Number(saved.dust) || 0,
        upgrades: saved.upgrades && typeof saved.upgrades === 'object' ? saved.upgrades : {},
        completed: Array.isArray(saved.completed) ? saved.completed : [],
        stats: {
          wins: (saved.stats && Number(saved.stats.wins)) || 0,
          losses: (saved.stats && Number(saved.stats.losses)) || 0,
          bestTime: saved.stats && saved.stats.bestTime != null ? saved.stats.bestTime : null
        }
      };
    }
    return this.progress;
  },

  save() {
    Utils.save(CONFIG.STORAGE.PROGRESS, this.progress);
  },

  getSystem(systemId) {
    return this.systems.find(s => s.id === systemId) || null;
  },

  isCompleted(systemId) {
    return this.progress.completed.includes(systemId);
  },

  isUnlocked(systemId) {
    const sys = this.getSystem(systemId);
    if (!sys) return false;
    return sys.requires.every(req => this.isCompleted(req));
  },

  getUpgradeLevel(id) {
    return Number(this.progress.upgrades[id]) || 0;
  },

  /** Следующая цена апгрейда или null, если максимальный уровень */
  upgradeCost(id) {
    const up = this.upgrades.find(u => u.id === id);
    if (!up) return null;
    const lvl = this.getUpgradeLevel(id);
    return lvl >= up.maxLvl ? null : up.cost[lvl];
  },

  buyUpgrade(id) {
    const cost = this.upgradeCost(id);
    if (cost == null) return false;
    if (this.progress.dust < cost) return false;
    this.progress.dust -= cost;
    this.progress.upgrades[id] = this.getUpgradeLevel(id) + 1;
    this.save();
    return true;
  },

  /**
   * Применить мета-бонусы к старту матча.
   * game.mode === 'campaign' — полный набор бонусов;
   * game.js обязан учесть game._prodMul и game._dmDiscount.
   */
  applyUpgrades(game) {
    if (!game) return;
    const isCampaign = game.mode === CONFIG.GAME_MODES.CAMPAIGN;

    // Стартовая DM: базовое значение системы + уровни апгрейда (в кампании)
    if (isCampaign) {
      game.startDM = (game.startDM || 0) + this.getUpgradeLevel('dm_start');
      game.startShips = (game.startShips || CONFIG.MAP.PLAYER_START_SHIPS) + 5 * this.getUpgradeLevel('ships');
    }

    // Производственный множитель (game.js должен его учесть)
    game._prodMul = 1 + 0.04 * this.getUpgradeLevel('prod');

    // Скидка на способности (game.js должен учесть _dmDiscount при расчёте стоимости)
    game._dmDiscount = isCampaign && this.getUpgradeLevel('discount') > 0 ? 1 : 0;
  },

  /**
   * Завершение системы: +пыль, в completed, stats.wins
   * result: game.result { victory, timeSec, captured, dustEarned, dmSpent }
   */
  completeSystem(systemId, result) {
    const sys = this.getSystem(systemId);
    result = result || {};
    if (sys && result.victory) {
      this.progress.dust += sys.reward.dust;
      result.dustEarned = sys.reward.dust;
      if (!this.isCompleted(systemId)) this.progress.completed.push(systemId);
      this.progress.stats.wins += 1;
      if (this.progress.stats.bestTime == null ||
        (result.timeSec != null && result.timeSec < this.progress.stats.bestTime)) {
        this.progress.stats.bestTime = result.timeSec;
      }
    } else if (sys) {
      this.progress.stats.losses += 1;
      result.dustEarned = 0;
    }
    this.save();
    return result;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CAMPAIGN;
}
