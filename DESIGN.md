# GS3 — Galactic Siege 3: Акварельные звёзды

КОНТРАКТ МЕЖДУ МОДУЛЯМИ. Все агенты обязаны строго следовать этому файлу.
Если нужна функция, которой нет в контракте — добавь её в СВОЙ модуль, не меняя чужие.

## Концепция
Стратегия в духе Galcon: захват планет отправкой флотов. Одиночная игра + кампания.
Визуальный стиль: **рисованная космическая акварель** — мягкие растёкшиеся планеты,
пастельные туманности, бумажная текстура, чернильные линии с лёгким дрожанием (hand-drawn),
органические формы. Никакого неона из GS2. Много анимации: пульсация, дрейф, частицы-кляксы,
волны при захвате, летящие кометы, чернильные брызги.

## Файлы и порядок загрузки (index.html)
```
js/config.js      — константы, типы планет, способности, события, палитра (УЖЕ НАПИСАН)
js/utils.js       — математика, seeded RNG, хранилище, цвет (УЖЕ НАПИСАН)
js/campaign.js    — CAMPAIGN: системы, мета-апгрейды, прогресс в localStorage
js/game.js        — game: состояние, симуляция, ввод, камера, способности, события, HUD
js/ai.js          — AI: противники, умеют способности и реагируют на события
js/renderer.js    — renderer: акварельный canvas-рендер всего
js/menu.js        — menu: экраны меню, карта кампании, брифинг, настройки, помощь
js/main.js        — бутстрап: window.addEventListener('DOMContentLoaded', ...)
index.html        — разметка: #menu (экраны), #gameUI (HUD), #gameCanvas
css/main.css      — все стили (меню + HUD + адаптив)
```
Все скрипты — обычные (не module), грузятся в этом порядке, общаются через глобалы:
`CONFIG`, `Utils`, `CAMPAIGN`, `game`, `AI`, `renderer`, `menu`.

## Глобальные объекты и их API (жёсткий контракт)

### game (пишется в game.js)
Свойства состояния:
```js
game.canvas, game.ctx, game.DPR, game.width, game.height   // canvas в device px
game.state      // CONFIG.GAME_STATES.*
game.mode       // 'skirmish' | 'campaign'
game.system     // текущий объект системы из CAMPAIGN.systems (в кампании) или сгенерированный (skirmish)
game.planets    // [{ id, name, type, x, y, r, owner, ships, shipsDisplay, seed,
                //    shieldUntil, frozenUntil, pulse, captureFlash, angle }]
game.fleets     // [{ id, owner, count, fromId, toId, sx, sy, tx, ty, t, travel, seed, warped }]
game.players    // [{ id, name, color (объект палитры), isAI, ai (AI-профиль|null) }]
game.effects    // [{ type, x, y, vx, vy, life, maxLife, color(hex), size, extra }]
game.events     // активные события: [{ kind:'comet'|'pirateRaid'|'revolt', ... }]
game.comets     // [{ x, y, vx, vy, seed, life }]
game.pirateBases// [{ id, x, y, r, ships, seed, raidTimer }]
game.warps      // [{ aId, bId, until }]
game.dm         // { [ownerId]: число } — тёмная материя каждого игрока
game.time       // секунды с начала матча
game.selectedPlanetId, game.sendPct, game.drag {...}, game.camera {...}  // как в GS2
game.pendingAbility // null | 'strike'|'shield'|'warp' — режим прицеливания способности
game.warpFirst      // null | planetId — первая планета варп-туннеля
game.ended, game.winner, game.result  // result: {victory:bool, timeSec, captured, dustEarned, dmSpent}
```
Методы:
```js
game.init()                       // вызывается один раз из main.js после menu.init? НЕТ:
                                  // main.js вызывает game.init(); game.init() вызывает menu.init()
game.startSkirmish(difficulty)    // 'easy'|'medium'|'hard' — быстрая игра
game.startCampaignSystem(systemId)// старт системы кампании
game.loop()                       // requestAnimationFrame; update(dt) + renderer.render(game)
game.update(dt)                   // симуляция: производство, флоты, события, способности, ИИ, победа
game.generateMap(opts)            // генерация планет по размерам/числу ИИ/типу системы
game.sendFleet(from, to, owner, pctOverride?) // pctOverride для ИИ
game.createFleet(from, to, owner, count)
game.arriveFleet(fleet)           // бой: defMul типа планеты, щит, перекраска
game.useAbility(owner, kind, targetPlanetId, targetPlanetId2?) // тратит DM, запускает эффект
game.affordAbility(owner, kind)   // bool
game.getPlanetAt(x, y)
game.isMyPlanet(planet)
game.getEngagementMode(from, to)  // 'reinforce'|'capture'|'attack'
game.ownerColor(owner)            // объект палитры {hex, core, wash, glow, name}
game.handleKeyDown(e), handlePointerDown/Move/Up(e)
game.setSendPct(p), game.pause(), game.resume(), game.restart(), game.toMenu()
game.endGame(winnerPlayer)        // считает result, dust, показывает #gameOverScreen через menu
game.updateHUD()                  // обновляет DOM-счётчики (см. HUD-контракт)
game.screenToWorldPoint(x,y), worldToScreenPoint(x,y), worldToScreenLength(v)
game.spawnEffect(...)             // эффекты для renderer'а
game.productionRate(planet)       // с учётом типа, верфей рядом, заморозки
```

### AI (ai.js)
```js
AI.create(owner, difficulty, personality)  // объект профиля как в GS2 + поля dmSkill
AI.think(ai, game, dt)                     // вызывается из game.update для каждого ИИ
// ИИ умеет: копить DM, использовать strike/shield (useAbility через game),
// учитывать типы планет (ценность цели), бояться комет/пиратов, давить мятежи.
```

### CAMPAIGN (campaign.js)
```js
CAMPAIGN.systems = [ // 8 систем, 3 главы
  {
    id: 'sirius', name: 'Сириус', chapter: 1, index: 0,
    difficulty: 'easy', aiCount: 1, planetCount: 9,
    eventRate: 0.5,           // множитель частоты событий
    typeWeights: null,        // null = стандартные веса из CONFIG.MAP.TYPE_WEIGHTS
    startDM: 4, startShips: 35,
    flavor: 'Короткое описание системы (1-2 предложения, поэтично, в духе акварели).',
    reward: { dust: 30 },
    requires: [],             // id систем, которые нужно пройти
    modifiers: []             // строки-особенности, напр. ['Пираты появляются чаще']
  }, ...
]
CAMPAIGN.upgrades = [
  { id:'dm_start',  name:'Тёмный резерв',   desc:'+1 тёмной материи в начале боя', maxLvl:3, cost:[40,80,140] },
  { id:'prod',      name:'Акварельные реакторы', desc:'+4% к производству за уровень', maxLvl:3, cost:[50,100,160] },
  { id:'ships',     name:'Стартовая армада', desc:'+5 стартовых кораблей за уровень', maxLvl:3, cost:[40,90,150] },
  { id:'discount',  name:'Тёмный брокер',    desc:'Способности дешевле на 1 DM на 2 ур.', maxLvl:1, cost:[120] }
]
CAMPAIGN.progress // { dust:число, upgrades:{id:lvl}, completed:[systemId], stats:{wins,losses,bestTime} }
CAMPAIGN.load(); CAMPAIGN.save();            // localStorage CONFIG.STORAGE.PROGRESS
CAMPAIGN.isUnlocked(systemId);              // bool
CAMPAIGN.applyUpgrades(game);               // применяет мета-бонусы к старту матча
CAMPAIGN.completeSystem(systemId, result);  // начисляет пыль, пишет прогресс
```

### renderer (renderer.js)
```js
renderer.render(game)   // полный кадр: фон, кометы, варп-туннели, пираты, планеты,
                        // флоты, эффекты, drag-UI, режим прицеливания способности
renderer.resetCache()   // при resize
// Внутри: кэш бумажной текстуры и туманностей (offscreen canvas),
// акварельные планеты по типу (у каждой свой силуэт по planet.seed),
// чернильные подписи, hand-drawn стрелка drag'а, кляксы-эффекты.
// Цвета берёт из game.ownerColor(owner) → {hex, core, wash, glow}
// и Utils.rgba(hex, alpha).
```

### menu (menu.js)
```js
menu.init()                    // привязка кнопок (без inline onclick — всё через addEventListener)
menu.showScreen(id)            // 'mainMenu'|'campaign'|'briefing'|'skirmish'|'settings'|'help'
menu.hide()                    // скрыть #menu
menu.openBriefing(systemId)    // экран брифинга с описанием системы + кнопка «В бой»
menu.showGameOver(game)        // заполнить и показать #gameOverScreen (победа/поражение, статистика, пыль)
menu.updateCampaignMap()       // отрисовать карту кампании (SVG/DOM: узлы систем, связи, замок/звезда)
menu.refreshHUDState()         // синхронизовать состояние кнопок способностей и т.п.
```

## HUD-контракт (DOM id, которые создаёт index.html и трогает game/menu)
```
#gameUI          — контейнер игрового HUD (класс .hidden скрывает)
#systemName      — название системы / «Быстрая битва · сложно»
#dmCounter       — «✦ 4» — тёмная материя игрока
#planetsCounter  — «⬤ 3/9» — планеты игрока / всего
#shipsCounter    — «⛟ 120» — суммарно кораблей игрока
#statusText      — строка событий («Комета приближается!», «Пираты атакуют Верфь-2!»)
#sendPct         — текущий % отправки; .chip[data-pct] — кнопки 25/50/75/100
#pauseBtn #menuBtn #fullscreenBtn
.ability-btn[data-ability="strike"|"shield"|"warp"] — кнопки способностей;
    у каждой: .ability-cost (текст «3»), классы .is-armed (режим прицеливания),
    .is-disabled (не хватает DM)
#abilityHint     — подсказка режима прицеливания («Выберите цель…» / «Выберите вторую планету»)
#pauseMenu       — оверлей паузы: #resumeBtn #restartBtn #toMenuBtn
#gameOverScreen  — оверлей финала: #winnerText #gameStats #replayBtn #toMenuFromEndBtn #continueBtn(в кампании: «Карта кампании»)
#menu            — контейнер экранов меню; .menu-screen[id].active — видимый экран
#campaignMap     — контейнер карты кампании (menu заполняет)
#briefingBody    — контент брифинга
#difficultyChoice— экран skirmish: кнопки .menu-btn[data-difficulty]
```
Игровой ввод: pointer-события на #gameCanvas. Способности: клик по .ability-btn →
game.pendingAbility = kind; следующий клик по планете на canvas применяет
game.useAbility(1, kind, planetId). warp требует два клика по СВОИМ планетам.
Esc — отменить прицеливание/выбор. Клавиши 1/2/3 — strike/shield/warp.

## Формат данных палитры (в config.js — COLORS)
`game.ownerColor(owner)` возвращает:
```js
{ hex:'#6fd6c8', core:'rgba(...)', wash:'rgba(...)', glow:'rgba(...)', name:'Аквамарин' }
```
renderer и эффекты работают через Utils.rgba(hex, a) — всегда от hex.

## Правила симуляции (обязательны)
1. Производство: `ships += dt * CONFIG.GAME.PRODUCTION_BASE * PLANET_TYPES[type].prodMul * sizeFactor * upgradeMul`, sizeFactor = r / BASE_R. Заморозка (frozenUntil) останавливает производство. Кап: CONFIG.GAME.SHIP_CAP.
2. Верфь: каждые SHIPYARD_INTERVAL сек каждая дружественная планета в радиусе supportRange получает +1 корабль.
3. Бой при прибытии: если owner совпал — подкрепление. Иначе `effective = to.ships * defMul(type) * (щит? ×2.5)`. fleet.count > effective → захват, остаток = count - effective. Щит (shieldUntil > time) делает планету неуязвимой: атакующий флот теряет 70% и отступает (ships возвращаются владельцу? НЕТ — сгорают, эффект «отражено»).
4. DM: каждый игрок получает +1 DM за каждые DM_INTERVAL сек владения ≥1 планетой + бонус CONFIG.GAME.DM_CAPTURE_BONUS за захват планеты игрока/пиратов.
5. Комета: раз в EVENTS.comet интервал (делённый на eventRate системы) пролетает через карту по прямой; планеты в радиусе cometRadius от её траектории замораживаются на freezeDuration сек (эффект инея). Комета живёт пока не вылетит за границы.
6. Пираты: база появляется у края карты (нейтрально-враждебная, owner = PIRATES). Раз в raidInterval отправляет флот на самую слабую планету НЕ пиратов. Уничтожение базы (прибытие флота с count > ships базы) даёт владельцу +pirates.reward DM. База не производит корабли, но её ships медленно растут (+1/3сек до cap 60).
7. Мятеж: раз в EVENTS.revolt интервал случайная планета случайного владельца (ships>10) становится нейтральной с 40% гарнизона (эффект чернильной кляксы). В кампании с модификатором может быть отключён eventRate=0.
8. Победа: уничтожены все ИИ (нет планет и баз? — только планет) и пираты игнорируются. Поражение: у игрока 0 планет и 0 флотов.
9. Кампания: после победы — menu.showGameOver → continueBtn → menu.showScreen('campaign').

## Стиль и анимации (renderer)
- Фон: многослойные акварельные размывки (offscreen-кэш) + медленный дрейф слоёв,
  бумажное зерно (кэш), редкие «звёздные» точки-крапинки чернил.
- Планеты: акварельные пятна неправильной формы (по seed): 3-4 наложенных полупрозрачных
  blob'а со смещением + тёмный чернильный контур с дрожанием + белесый блик-бумаги.
  Типы различимы СИЛУЭТОМ: гигант — крупный с полосами и кольцом; крепость — угловатая с бастионами;
  верфь — с орбитальными доками-точками; астероид — мелкий рваный камень; терра — круглая с континентами-кляксами.
- Щит: акварельный пузырь с переливом; заморозка: иней-штриховка; pulse при захвате: волна-пятно.
- Флоты: стайки «птичек»-корабликов (1-3 силуэта по count), чернильный след-размывка; warped — радужный туннель между планетами.
- Способности: strike — падающий луч-мазок с брызгами; shield — расцветающий пузырь; warp — два кольца + дуга-туннель с бегущими точками.
- Комета: мягкое пятно с длинным пастельным хвостом.
- Drag-стрелка: hand-drawn чернильная дуга с дрожащим контуром, цвет по режиму (reinforce/capture/attack).
- Числа кораблей: шрифт Caveat/Nunito, чернильный цвет с белой подложкой-мазком для читаемости.
- Всё дышит: медленные синусоидальные пульсации планет (по seed, разные фазы), дрейф фона.

## UI/CSS (menu + main.css)
- Шрифты Google Fonts: Caveat (заголовки, акценты) + Nunito (текст), кириллица.
- Тёмно-индиговый фон с акварельными разводами (CSS radial-gradient + SVG-шум),
  «бумажные» карточки с рваными краями (border-radius хаотичный: 63% 37% 54% 46% / 55% 48% 52% 45%),
  мягкие тени, чернильные подчёркивания (SVG-мазки).
- Анимации: появление экранов (fade+rise, stagger кнопок), hover — лёгкий поворот/подъём,
  :active scale(0.97), плавающие кляксы на фоне меню, анимированный переливающийся скроллбар
  (пользователь Артур любит нестандартные скроллбары — обязательно!).
- Карта кампании: SVG — системы-узлы (акварельные пятна), линии-связи пунктиром-чернильным,
  пройденные — звезда, доступные — пульсируют, закрытые — серый замок. Клик → брифинг.
- Полная адаптивность (мобильный HUD: способности компактной панелью снизу).
- prefers-reduced-motion: отключить фоновые дрейфы.

## Тестирование
npm-free. Проверка: открыть index.html через http-сервер, прогнать сценарии:
skirmish easy, кампания 1-я система, все 3 способности, каждое событие, победа/поражение,
мобильный viewport, resize. В консоли не должно быть ошибок.
