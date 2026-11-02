/**
 * GS3 — Galactic Siege 3: Акварельные звёзды
 * Конфигурация игры
 */
const CONFIG = {
  VERSION: '3.0.0',

  GAME: {
    FLEET_SPEED: 130,          // мировые px/сек (DPR-независимо: мир живёт в CSS px)
    SEND_MIN: 0.05,
    SEND_MAX: 1.00,
    SEND_STEP: 0.05,
    DEFAULT_SEND_PCT: 0.5,
    DPR_MAX: 2,
    PRODUCTION_BASE: 0.55,     // кораблей/сек для планеты базового радиуса
    SHIP_CAP: 400,
    DRAG_THRESHOLD: 6,
    AIM_ASSIST_ALIGNMENT: 0.76,
    AIM_ASSIST_PADDING: 26,
    AIM_ASSIST_PROGRESS: 0.18,
    DM_INTERVAL: 14,           // сек владения ≥1 планетой за +1 DM
    DM_CAPTURE_BONUS: 1,       // DM за захват чужой планеты
    DM_START: 4,
    SHIPYARD_INTERVAL: 4.5     // сек между выдачами верфи
  },

  OWNER: { NEUTRAL: 0, YOU: 1, AI: 2 }, // в skirmish: AI2..AI4 = owner 3,4
  PIRATES: -1, // owner пиратских баз

  GAME_STATES: { MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', ENDED: 'ended' },
  GAME_MODES: { SKIRMISH: 'skirmish', CAMPAIGN: 'campaign' },

  // Акварельная палитра игроков. hex — основной; renderer строит wash/glow через Utils.rgba
  // Палитра «Звёздный атлас»: чернила на пергаменте.
  COLORS: {
    NEUTRAL: { hex: '#8a8474', core: 'rgba(138,132,116,.85)', wash: 'rgba(138,132,116,.25)', glow: 'rgba(138,132,116,.3)', name: 'Сепия' },
    YOU:     { hex: '#33538c', core: 'rgba(51,83,140,.9)',    wash: 'rgba(51,83,140,.24)',  glow: 'rgba(51,83,140,.42)',   name: 'Ляпис' },
    PIRATES: { hex: '#6b4a35', core: 'rgba(107,74,53,.9)',    wash: 'rgba(107,74,53,.24)',  glow: 'rgba(107,74,53,.4)',    name: 'Умбра' }
  },

  PLAYER_PALETTE: [
    { name: 'Киноварь', hex: '#b4402f', core: 'rgba(180,64,47,.92)',  wash: 'rgba(180,64,47,.22)',  glow: 'rgba(180,64,47,.4)' },
    { name: 'Папоротник', hex: '#476f4e', core: 'rgba(71,111,78,.92)', wash: 'rgba(71,111,78,.22)',  glow: 'rgba(71,111,78,.4)' },
    { name: 'Баклажан', hex: '#6d4474', core: 'rgba(109,68,116,.92)',  wash: 'rgba(109,68,116,.22)', glow: 'rgba(109,68,116,.4)' },
    { name: 'Охра',     hex: '#a97b3e', core: 'rgba(169,123,62,.92)',  wash: 'rgba(169,123,62,.22)', glow: 'rgba(169,123,62,.4)' }
  ],

  // Типы планет
  PLANET_TYPES: {
    terra:    { name: 'Терра',      prodMul: 1.00, defMul: 1.0, rMul: 1.00, value: 1,  desc: 'Обычный обитаемый мир. Стабильное производство.' },
    gasGiant: { name: 'Гигант',     prodMul: 1.55, defMul: 0.9, rMul: 1.55, value: 2,  desc: 'Огромный газовый гигант. Много кораблей, сложнее оборонять.' },
    fortress: { name: 'Крепость',   prodMul: 0.75, defMul: 2.2, rMul: 0.95, value: 2,  desc: 'Укреплённый мир. Оборона ×2.2, но мало производит.' },
    shipyard: { name: 'Верфь',      prodMul: 1.10, defMul: 1.0, rMul: 1.05, value: 3,  desc: 'Каждые 4.5 сек даёт +1 корабль каждой вашей планете рядом.' },
    asteroid: { name: 'Астероид',   prodMul: 0.55, defMul: 0.8, rMul: 0.70, value: 1,  desc: 'Маленькая добыча. Дёшево захватить, почти не производит.' }
  },
  SHIPYARD_RANGE: 260, // мировые px поддержки верфи

  // Веса типов при генерации карты
  MAP: {
    PADDING: 90,
    BASE_R: 26,
    MIN_PLANET_RADIUS: 15,
    MAX_PLANET_RADIUS: 46,
    MIN_DISTANCE_BETWEEN: 80,
    PLAYER_PLANET_RADIUS: 28,
    PLAYER_START_SHIPS: 35,
    NEUTRAL_MIN_SHIPS: 12,
    NEUTRAL_MAX_SHIPS: 45,
    NEUTRAL_COUNT_BASE: 10,
    TYPE_WEIGHTS: { terra: 0.44, gasGiant: 0.12, fortress: 0.14, shipyard: 0.10, asteroid: 0.20 }
  },

  // Способности (стоимость в тёмной материи DM)
  ABILITIES: {
    strike: { name: 'Орбитальный залп', cost: 3, desc: 'Залп тяжёлых орудий срезает 60% гарнизона любой планеты.', key: '1' },
    shield: { name: 'Астральный щит',  cost: 2, desc: 'Планета под куполом 10 сек: атаки отражаются, оборона ×2.5.', key: '2', duration: 10 },
    warp:   { name: 'Звёздный мост',     cost: 4, desc: 'Связывает две ваши планеты на 20 сек: флоты летят мгновенно.', key: '3', duration: 20 }
  },

  // События
  EVENTS: {
    comet: { intervalMin: 55, intervalMax: 90, cometRadius: 70, freezeDuration: 8, speed: 90 },
    pirates: { enabled: true, raidInterval: 24, baseShips: 30, reward: 3 },
    revolt: { intervalMin: 75, intervalMax: 130, garrisonKeep: 0.4 }
  },

  GRAPHICS: {
    STAR_COUNT: 90,
    BLOB_LAYERS: 4,
    EFFECT_PARTICLES: 12,
    EFFECT_LIFE: 1.1
  },

  AI: {
    THINK_INTERVAL_MIN: 0.8,
    THINK_INTERVAL_MAX: 1.6,
    MIN_SHIPS_TO_ATTACK: 18,
    ATTACK_BUFFER: 6,
    SEND_PCT_MIN: 0.35,
    SEND_PCT_MAX: 0.85,
    DM_USE_THRESHOLD: { easy: 6, medium: 5, hard: 4 } // при каком запасе DM ИИ начинает тратить
  },

  MOBILE: {
    DOUBLE_TAP_DELAY: 300
  },

  STORAGE: {
    SETTINGS: 'gs3_settings',
    PROGRESS: 'gs3_progress'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
