/**
 * GS3 — Утилиты: математика, seeded RNG, цвет, хранилище, ввод
 */
const Utils = {
  // ---------- Математика ----------
  clamp(v, min, max) { return v < min ? min : v > max ? max : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); },
  rand(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(this.rand(min, max + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  // ---------- Seeded RNG (mulberry32) — детерминированные силуэты планет ----------
  seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  nextSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; },

  // ---------- Цвет ----------
  /** hex '#rrggbb' + alpha → 'rgba(r,g,b,a)' */
  rgba(hex, alpha) {
    if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  },
  /** Смешать два hex-цвета, t=0 → a, t=1 → b */
  mixHex(a, b, t) {
    const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
    const r = Math.round(((na >> 16) & 255) * (1 - t) + ((nb >> 16) & 255) * t);
    const g = Math.round(((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t);
    const bl = Math.round((na & 255) * (1 - t) + (nb & 255) * t);
    return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
  },
  /** Более светлый/тёмный оттенок hex */
  shade(hex, amount) {
    return amount >= 0 ? this.mixHex(hex, '#ffffff', amount) : this.mixHex(hex, '#1a1530', -amount);
  },

  // ---------- Формат ----------
  formatNumber(n) { return String(Math.floor(n)); },
  formatPercent(p) { return Math.round(p * 100) + '%'; },
  formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  // ---------- Производство планеты ----------
  productionRate(planet) {
    const type = CONFIG.PLANET_TYPES[planet.type] || CONFIG.PLANET_TYPES.terra;
    const sizeFactor = planet.r / CONFIG.MAP.BASE_R;
    return CONFIG.GAME.PRODUCTION_BASE * type.prodMul * sizeFactor;
  },

  // ---------- Экран ----------
  getDPR() { return Math.min(window.devicePixelRatio || 1, CONFIG.GAME.DPR_MAX); },
  isTouch() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; },
  isMobile() { return this.isTouch() && Math.min(window.innerWidth, window.innerHeight) < 760; },

  getPointerPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.GAME.DPR_MAX);
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  },

  // ---------- Хранилище ----------
  load(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  },

  // ---------- Настройки ----------
  getSettings() {
    return this.load(CONFIG.STORAGE.SETTINGS, {
      particles: true,
      quality: 'high',
      reducedMotion: false
    });
  },
  saveSettings(s) { this.save(CONFIG.STORAGE.SETTINGS, s); },

  // ---------- Вибрация ----------
  vibrate(pattern) {
    if (navigator.vibrate && !this.getSettings().reducedMotion) {
      try { navigator.vibrate(pattern); } catch (e) {}
    }
  },

  // ---------- Fullscreen ----------
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  },

  // ---------- Easing ----------
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeOutBack(t) { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },

  /** Случайный "рваный" border-radius для бумажных карточек (CSS-строка) */
  raggedRadius(seed) {
    const rnd = this.seeded(seed);
    const v = () => Math.round(40 + rnd() * 30);
    return `${v()}% ${v()}% ${v()}% ${v()}% / ${v()}% ${v()}% ${v()}% ${v()}%`;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}
