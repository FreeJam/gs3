/**
 * GS3 — Точка входа. Бутстрап игры после загрузки DOM.
 * Контракт: main.js вызывает game.init(); game.init() сам вызывает menu.init() и запускает цикл.
 */
(function () {
  'use strict';

  function boot() {
    if (typeof game === 'undefined' || !game.init) {
      console.error('[GS3] game не загружен');
      return;
    }

    // Настройки из localStorage → класс на body
    try {
      const s = Utils.getSettings();
      if (s && s.reducedMotion) document.body.classList.add('reduced-motion');
    } catch (e) {}

    if (Utils.isTouch()) document.body.classList.add('is-touch');

    // Запуск игры (menu.init() вызывается внутри game.init())
    game.init();

    // Авто-пауза при уходе со вкладки, чтобы матч не «убегал» без игрока
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === CONFIG.GAME_STATES.PLAYING && !game.ended) {
        game.pause();
      }
    });

    // Долгое нажатие на canvas не должно открывать контекстное меню (мобильные)
    const canvas = document.getElementById('gameCanvas');
    if (canvas) {
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      canvas.addEventListener('gesturestart', (e) => e.preventDefault());
    }

    // Блокируем «двойной тап → зум» на игровом поле iOS
    document.addEventListener('dblclick', (e) => {
      if (e.target && e.target.id === 'gameCanvas') e.preventDefault();
    });

    // Диагностика в консоль
    console.log(`%c Галактическая Осада III · v${CONFIG.VERSION} — «Звёздный атлас»`, 'color:#8b6531;font-family:Georgia,serif;font-size:13px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Небольшие публичные помощники для отладки/тестов в консоли
  window.GS3 = {
    startSkirmish: (d = 'easy') => game.startSkirmish(d),
    startSystem: (id) => game.startCampaignSystem(id),
    state: () => ({ state: game.state, planets: game.planets.length, fleets: game.fleets.length, dm: game.dm, time: Math.round(game.time) })
  };
})();
