/**
 * GS3 — Искусственный интеллект противников.
 * Глобал: AI. Порт логики GS2 с учётом типов планет, способностей (DM) и событий.
 */
const AI = {
  // ============================================================
  // Профили сложности
  // ============================================================
  difficultyProfiles: {
    easy: {
      thinkInterval: { min: 1.9, max: 3.4 },
      aggression: 0.4,
      expansion: 0.82,
      minAttackShips: 24,
      reserveShips: 16,
      safeAttackRatio: 1.35,
      defendThreshold: 0.72,
      sendPctMin: 0.22,
      sendPctMax: 0.56,
      opportunism: 0.38,
      dmSkill: 0.15
    },
    medium: {
      thinkInterval: { min: 1.25, max: 2.15 },
      aggression: 0.56,
      expansion: 0.78,
      minAttackShips: 20,
      reserveShips: 13,
      safeAttackRatio: 1.18,
      defendThreshold: 0.58,
      sendPctMin: 0.28,
      sendPctMax: 0.68,
      opportunism: 0.56,
      dmSkill: 0.45
    },
    hard: {
      thinkInterval: { min: 0.95, max: 1.7 },
      aggression: 0.66,
      expansion: 0.82,
      minAttackShips: 18,
      reserveShips: 11,
      safeAttackRatio: 1.08,
      defendThreshold: 0.5,
      sendPctMin: 0.32,
      sendPctMax: 0.78,
      opportunism: 0.68,
      dmSkill: 0.8
    }
  },

  // ============================================================
  // Характеры
  // ============================================================
  personalityProfiles: {
    cautious: { expandWeight: 1.18, attackWeight: 0.72, defendWeight: 1.35, neutralBias: 1.32, enemyBias: 0.74, prodBias: 0.95, rangeBias: 0.94, reinforceBias: 1.25, riskTolerance: 0.84, burst: 0.82, pace: 1.08 },
    harvester: { expandWeight: 1.5, attackWeight: 0.72, defendWeight: 0.96, neutralBias: 1.72, enemyBias: 0.72, prodBias: 1.08, rangeBias: 0.94, reinforceBias: 0.92, riskTolerance: 0.9, burst: 0.88, pace: 1.02 },
    raider: { expandWeight: 0.84, attackWeight: 1.34, defendWeight: 0.9, neutralBias: 0.78, enemyBias: 1.38, prodBias: 1.02, rangeBias: 1.16, reinforceBias: 0.78, riskTolerance: 1.02, burst: 0.96, pace: 0.92 },
    bastion: { expandWeight: 0.76, attackWeight: 0.78, defendWeight: 1.6, neutralBias: 0.92, enemyBias: 0.9, prodBias: 1.32, rangeBias: 0.88, reinforceBias: 1.52, riskTolerance: 0.86, burst: 0.8, pace: 1.12 },
    sniper: { expandWeight: 0.92, attackWeight: 1.14, defendWeight: 0.9, neutralBias: 0.9, enemyBias: 1.14, prodBias: 1.5, rangeBias: 1.26, reinforceBias: 0.9, riskTolerance: 0.94, burst: 0.88, pace: 0.98 }
  },

  // ============================================================
  // Фабрики
  // ============================================================
  pickPersonalities(difficulty, count) {
    const pools = {
      easy: ['cautious', 'harvester'],
      medium: ['harvester', 'raider', 'bastion', 'sniper'],
      hard: ['raider', 'bastion', 'sniper', 'harvester']
    };
    const source = [...(pools[difficulty] || pools.medium)];
    for (let i = source.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [source[i], source[j]] = [source[j], source[i]];
    }
    const picked = [];
    for (let i = 0; i < count; i++) picked.push(source[i % source.length]);
    return picked;
  },

  create(owner, difficulty = 'medium', personality = 'cautious') {
    const base = this.difficultyProfiles[difficulty] || this.difficultyProfiles.medium;
    const profile = this.personalityProfiles[personality] || this.personalityProfiles.cautious;
    return {
      owner,
      difficulty: this.difficultyProfiles[difficulty] ? difficulty : 'medium',
      personality: this.personalityProfiles[personality] ? personality : 'cautious',
      profile,
      timer: Utils.rand(base.thinkInterval.min * 0.25, base.thinkInterval.max * 0.6),
      attackTimer: 0,
      ...base
    };
  },

  myPlanets(ai, game) { return game.planets.filter((p) => p.owner === ai.owner); },
  enemyPlanets(ai, game) { return game.planets.filter((p) => p.owner !== ai.owner && p.owner !== CONFIG.OWNER.NEUTRAL && p.owner !== CONFIG.PIRATES); },
  neutralPlanets(ai, game) { return game.planets.filter((p) => p.owner === CONFIG.OWNER.NEUTRAL); },

  // ============================================================
  // Мышление
  // ============================================================
  think(ai, game, dt) {
    if (game.ended) return;
    ai.timer -= dt;
    if (ai.timer > 0) return;
    ai.timer = Utils.rand(ai.thinkInterval.min, ai.thinkInterval.max) * ai.profile.pace;

    const mine = this.myPlanets(ai, game);
    if (!mine.length) return;

    // 1) Способности (иногда вместо обычного хода)
    if (this.tryAbilities(ai, game, mine)) return;

    // 2) Обычный ход
    const primary = this.selectStrategy(ai, game, mine);
    for (const s of this.getStrategyChain(ai, primary)) {
      if (this.executeStrategy(s, ai, game, mine)) return;
    }
  },

  getStrategyChain(ai, primary) {
    const byPersonality = {
      cautious: ['defend', 'expand', 'reinforce', 'attack'],
      harvester: ['expand', 'reinforce', 'attack', 'defend'],
      raider: ['attack', 'expand', 'reinforce', 'defend'],
      bastion: ['defend', 'reinforce', 'expand', 'attack'],
      sniper: ['attack', 'expand', 'defend', 'reinforce']
    };
    return [...new Set([primary, ...(byPersonality[ai.personality] || byPersonality.cautious)])];
  },

  executeStrategy(strategy, ai, game, mine) {
    switch (strategy) {
      case 'attack': return this.executeAttack(ai, game, mine);
      case 'expand': return this.executeExpand(ai, game, mine);
      case 'defend': return this.executeDefend(ai, game, mine);
      case 'reinforce': return this.executeReinforce(ai, game, mine);
      default: return false;
    }
  },

  selectStrategy(ai, game, mine) {
    const totalShips = mine.reduce((s, p) => s + p.ships, 0);
    const avg = totalShips / Math.max(1, mine.length);
    const neutrals = this.neutralPlanets(ai, game);
    const enemies = this.enemyPlanets(ai, game);
    const threatened = this.findThreatenedPlanets(ai, game, mine);

    // Пиратская база рядом и слабая — соблазнительная цель (даёт DM)
    const weakPirate = game.pirateBases.find((b) => b.ships < avg * 0.9);

    if (threatened.length > 0 && (ai.personality === 'bastion' || threatened[0].threat > threatened[0].planet.ships * ai.defendThreshold)) {
      return 'defend';
    }
    if (ai.personality === 'harvester' && neutrals.some((p) => p.ships <= avg * 0.95)) {
      return Math.random() < 0.82 ? 'expand' : 'reinforce';
    }
    if (ai.personality === 'raider' && enemies.some((p) => p.ships < avg * 0.72)) {
      return Math.random() < 0.78 ? 'attack' : 'expand';
    }
    if (ai.personality === 'sniper' && enemies.some((p) => this.planetValue(p) > 2 && p.ships < avg * 0.9)) {
      return 'attack';
    }
    if (ai.personality === 'bastion' && mine.some((p) => p.ships < ai.reserveShips)) {
      return 'reinforce';
    }
    if (weakPirate && totalShips > ai.reserveShips * 2 && Math.random() < 0.3) {
      return 'attack';
    }

    const enemyShips = enemies.reduce((s, p) => s + p.ships, 0);
    if (totalShips > enemyShips * ai.safeAttackRatio && Math.random() < ai.aggression) return 'attack';
    if (neutrals.length > 0 && Math.random() < ai.expansion * ai.profile.expandWeight * 0.75) return 'expand';
    if (threatened.length > 0) return 'defend';
    if (Math.random() < ai.profile.reinforceBias * 0.35 + ai.opportunism * 0.2) return 'reinforce';
    return 'attack';
  },

  // ============================================================
  // Способности (тёмная материя)
  // ============================================================
  tryAbilities(ai, game, mine) {
    const skill = ai.dmSkill ?? 0.4;
    if (skill <= 0) return false;
    const dm = game.dm[ai.owner] || 0;

    // Щит на угрожаемую планету с большим гарнизоном
    const threatened = this.findThreatenedPlanets(ai, game, mine);
    if (game.affordAbility(ai.owner, 'shield') && threatened.length) {
      const target = threatened[0].planet;
      const big = mine.sort((a, b) => b.ships - a.ships)[0];
      if (target && game.dm[ai.owner] >= game.abilityCost('shield') && (target === big || target.ships > ai.reserveShips)) {
        if (game.useAbility(ai.owner, 'shield', target.id)) return true;
      }
    }

    // Орбитальный удар по самому сильному врагу, если он опасен
    if (game.affordAbility(ai.owner, 'strike') && Math.random() < skill) {
      const enemies = this.enemyPlanets(ai, game);
      const myTotal = mine.reduce((s, p) => s + p.ships, 0);
      if (enemies.length) {
        const target = enemies.sort((a, b) => (b.ships + this.planetValue(b) * 12) - (a.ships + this.planetValue(a) * 12))[0];
        const worthIt = target.ships > myTotal * 0.35 || target.ships > 40;
        if (worthIt && game.useAbility(ai.owner, 'strike', target.id)) return true;
      }
    }

    // Варп между двумя своими планетами (даёт быстрое подкрепление)
    if (game.affordAbility(ai.owner, 'warp') && mine.length >= 2 && Math.random() < skill * 0.6) {
      const sorted = [...mine].sort((a, b) => b.ships - a.ships);
      const front = sorted.find((p) => this.nearEnemy(p, game, ai) && p.ships > ai.reserveShips);
      const rear = sorted[sorted.length - 1];
      if (front && rear && front.id !== rear.id && dm >= 6) {
        if (game.useAbility(ai.owner, 'warp', front.id, rear.id)) return true;
      }
    }
    return false;
  },

  nearEnemy(p, game, ai) {
    return game.planets.some((q) => q.owner !== ai.owner && q.owner !== CONFIG.OWNER.NEUTRAL &&
      Utils.dist(p.x, p.y, q.x, q.y) < 320);
  },

  // ============================================================
  // Угрозы
  // ============================================================
  findThreatenedPlanets(ai, game, mine) {
    const out = [];
    for (const planet of mine) {
      const incoming = game.fleets.filter((f) => f.toId === planet.id && f.owner !== ai.owner);
      const incomingShips = incoming.reduce((s, f) => s + f.count, 0);
      const nearbyEnemy = game.planets.filter((p) =>
        p.owner !== ai.owner && p.owner !== CONFIG.OWNER.NEUTRAL && p.owner !== CONFIG.PIRATES &&
        Utils.dist(p.x, p.y, planet.x, planet.y) < 300);
      const pirateBase = game.pirateBases.find((b) => Utils.dist(b.x, b.y, planet.x, planet.y) < 320);
      const pressure = nearbyEnemy.reduce((s, p) => s + Math.max(0, p.ships - planet.ships * 0.35), 0);
      const threat = incomingShips + pressure * 0.22 + (pirateBase ? pirateBase.ships * 0.3 : 0);
      if (threat > planet.ships * ai.defendThreshold || (planet.ships < ai.reserveShips * 0.85 && nearbyEnemy.length > 0)) {
        out.push({ planet, threat });
      }
    }
    return out.sort((a, b) => b.threat - a.threat);
  },

  // ============================================================
  // Оценка планет
  // ============================================================
  planetValue(p) {
    const t = CONFIG.PLANET_TYPES[p.type] || CONFIG.PLANET_TYPES.terra;
    return t.value || 1;
  },
  defMul(p) {
    const t = CONFIG.PLANET_TYPES[p.type] || CONFIG.PLANET_TYPES.terra;
    return t.defMul || 1;
  },

  scoreTarget(source, target, ai, game) {
    const distance = Utils.dist(source.x, source.y, target.x, target.y);
    const proximity = 1 / (1 + distance / 480);
    const weakness = 1 / (1 + target.ships * this.defMul(target));
    const value = this.planetValue(target) * ai.profile.prodBias;
    const strengthRatio = (target.ships * this.defMul(target)) / Math.max(1, source.ships - ai.reserveShips * 0.2);
    const isNeutral = target.owner === CONFIG.OWNER.NEUTRAL;
    const bias = isNeutral ? ai.profile.neutralBias : ai.profile.enemyBias;
    const riskPenalty = strengthRatio > ai.safeAttackRatio * ai.profile.riskTolerance ? 0.42 : 1;
    return (value * 0.9 + weakness * 2.55 + proximity * 1.2 * ai.profile.rangeBias) * bias * ai.profile.attackWeight * riskPenalty;
  },

  scoreNeutralPlanet(source, target, ai) {
    const distance = Utils.dist(source.x, source.y, target.x, target.y);
    const proximity = 1 / (1 + distance / 500);
    const weakness = 1 / (1 + target.ships * this.defMul(target));
    const value = this.planetValue(target) * ai.profile.prodBias;
    return (value * 1.1 + weakness * 3.1 + proximity * 1.35 * ai.profile.rangeBias) * ai.profile.expandWeight * ai.profile.neutralBias;
  },

  scoreOwned(source, target, ai) {
    const distance = Utils.dist(source.x, source.y, target.x, target.y);
    const proximity = 1 / (1 + distance / 460);
    const need = 1 / Math.max(1, target.ships + 4);
    const value = this.planetValue(target);
    return (value * 1.2 * ai.profile.prodBias + proximity * 0.95 + need * 42) * ai.profile.reinforceBias;
  },

  // ============================================================
  // Стратегии
  // ============================================================
  executeAttack(ai, game, mine) {
    const sources = mine.filter((p) => p.ships > ai.minAttackShips).sort((a, b) => b.ships - a.ships);
    if (!sources.length) return false;

    // Сначала — слабая пиратская база (награда DM)
    const weakPirate = game.pirateBases.find((b) => b.ships < 26);
    if (weakPirate) {
      const src = sources[0];
      if (src.ships > weakPirate.ships + ai.reserveShips * 0.4) {
        const pct = Utils.clamp((weakPirate.ships + 4) / Math.max(1, src.ships), ai.sendPctMin, Math.min(ai.sendPctMax, 0.7));
        game.sendFleet(src, weakPirate, ai.owner, pct);
        return true;
      }
    }

    for (const source of sources) {
      const targets = game.planets.filter((p) => p.owner !== ai.owner);
      const target = this.selectBestTarget(source, targets, ai, game);
      if (!target) continue;
      const ratio = (target.ships * this.defMul(target)) / Math.max(1, source.ships - ai.reserveShips * 0.25);
      if (ratio > ai.safeAttackRatio * ai.profile.riskTolerance) continue;
      const pct = this.calculateAttackPct(source, target, ai);
      if (pct > 0) { game.sendFleet(source, target, ai.owner, pct); return true; }
    }
    return false;
  },

  executeExpand(ai, game, mine) {
    const sources = mine.filter((p) => p.ships > Math.max(ai.reserveShips + 3, ai.minAttackShips - 4)).sort((a, b) => b.ships - a.ships);
    const neutrals = this.neutralPlanets(ai, game);
    if (!sources.length || !neutrals.length) return false;

    for (const source of sources) {
      const target = neutrals.map((p) => ({ p, score: this.scoreNeutralPlanet(source, p, ai) }))
        .sort((a, b) => b.score - a.score)[0]?.p;
      if (!target) continue;
      if (target.ships * this.defMul(target) > source.ships * 0.88) continue;
      const pct = this.calculateExpandPct(source, target, ai);
      if (pct > 0) { game.sendFleet(source, target, ai.owner, pct); return true; }
    }
    return false;
  },

  executeDefend(ai, game, mine) {
    const threatened = this.findThreatenedPlanets(ai, game, mine);
    if (!threatened.length) return false;
    const target = threatened[0].planet;
    const source = mine
      .filter((p) => p.id !== target.id && p.ships > ai.reserveShips + 2)
      .map((p) => ({ p, score: (p.ships - ai.reserveShips) / Math.max(1, Utils.dist(p.x, p.y, target.x, target.y)) }))
      .sort((a, b) => b.score - a.score)[0]?.p;
    if (!source) return false;
    const pct = this.calculateDefendPct(source, target, threatened[0].threat, ai);
    if (pct <= 0) return false;
    game.sendFleet(source, target, ai.owner, pct);
    return true;
  },

  executeReinforce(ai, game, mine) {
    const source = mine.filter((p) => p.ships > ai.reserveShips + 6).sort((a, b) => b.ships - a.ships)[0];
    if (!source) return false;
    const target = mine.filter((p) => p.id !== source.id)
      .map((p) => ({ p, score: this.scoreOwned(source, p, ai) }))
      .sort((a, b) => b.score - a.score)[0]?.p;
    if (!target) return false;
    const pct = this.calculateReinforcePct(source, target, ai);
    if (pct <= 0) return false;
    game.sendFleet(source, target, ai.owner, pct);
    return true;
  },

  selectBestTarget(source, targets, ai, game) {
    return targets.map((t) => ({ t, score: this.scoreTarget(source, t, ai, game) }))
      .sort((a, b) => b.score - a.score)[0]?.t || null;
  },

  // ============================================================
  // Проценты отправки
  // ============================================================
  calculateAttackPct(source, target, ai) {
    const needed = target.ships * this.defMul(target) + ai.reserveShips * 0.25 + 4;
    const basePct = needed / Math.max(1, source.ships);
    return Utils.clamp(basePct * ai.profile.burst * (0.82 + ai.aggression * 0.35), ai.sendPctMin, ai.sendPctMax);
  },
  calculateExpandPct(source, target, ai) {
    const needed = target.ships * this.defMul(target) + 3;
    const basePct = needed / Math.max(1, source.ships);
    return Utils.clamp(basePct * ai.profile.burst, ai.sendPctMin, Math.min(ai.sendPctMax, 0.64));
  },
  calculateDefendPct(source, target, threat, ai) {
    const needed = Math.max(ai.reserveShips * 0.8, threat - target.ships + ai.reserveShips * 0.6);
    const basePct = needed / Math.max(1, source.ships);
    return Utils.clamp(basePct * ai.profile.reinforceBias, 0.22, Math.min(ai.sendPctMax, 0.72));
  },
  calculateReinforcePct(source, target, ai) {
    const need = Math.max(8, ai.reserveShips - target.ships * 0.18);
    const basePct = need / Math.max(1, source.ships);
    return Utils.clamp(Math.max(basePct, 0.24) * Math.min(ai.profile.reinforceBias, 1.4), 0.22, Math.min(ai.sendPctMax, 0.48));
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AI;
}
