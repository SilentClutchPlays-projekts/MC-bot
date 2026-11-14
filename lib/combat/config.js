'use strict'

const DEFAULTS = Object.freeze({
  enabled: true,
  // Safety-first: no players are attacked until their names are explicitly listed.
  // Change to "all" only on a server where attacking any non-protected player is intended.
  targetMode: 'allowlist',
  allowedTargets: [],
  hitIgnore: [],
  friends: [],
  ignoreSameTeam: true,
  maxTargetDistance: 24,
  targetSwitchMargin: 3,
  scanIntervalMs: 250,
  tickIntervalMs: 100,

  attackRange: 3.1,
  minCombatDistance: 2.0,
  chaseRange: 4.5,
  // Leave null for automatic weapon/version-aware cooldowns. Set a positive number to override.
  attackCooldownMs: null,
  legacyAttackCooldownMs: 150,
  aimEveryMs: 180,
  requireLineOfSight: true,
  weaponPriority: [
    'netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword',
    'golden_sword', 'wooden_sword', 'netherite_axe', 'diamond_axe',
    'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe',
    'mace', 'trident'
  ],

  movement: {
    canDig: false,
    canOpenDoors: false,
    allowParkour: false,
    allowSprinting: true,
    chaseGoalRefreshMs: 1200,
    strafe: true,
    strafeChangeMs: 650,
    tacticalJump: true,
    tacticalJumpIntervalMs: 1150,
    tacticalJumpMinDistance: 2.1,
    tacticalJumpMaxDistance: 3.4,
    retreatDistance: 8,
    retreatGoalRefreshMs: 1200
  },

  equipment: {
    autoEquipArmor: true,
    autoEquipWeapon: true,
    autoEquipOffhand: true,
    offhandPriority: ['totem_of_undying', 'shield'],
    refreshMs: 2500
  },

  defense: {
    autoEat: true,
    eatAtFood: 16,
    foodItems: [
      'cooked_beef', 'cooked_porkchop', 'golden_carrot', 'cooked_mutton',
      'cooked_chicken', 'cooked_salmon', 'baked_potato', 'bread',
      'cooked_cod', 'rabbit_stew', 'mushroom_stew', 'beetroot_soup'
    ],
    autoHeal: true,
    healAtHealth: 12,
    healItems: ['enchanted_golden_apple', 'golden_apple'],
    autoRetreat: true,
    retreatAtHealth: 6,
    shieldHandling: true,
    shieldRange: 4.5,
    actionCooldownMs: 1800
  },

  recovery: {
    enabled: true,
    stuckCooldownMs: 1200,
    repeatedStuckLimit: 3,
    repeatedStuckWindowMs: 10000
  },

  logging: true
})

function clone(value) {
  if (Array.isArray(value)) return value.slice()
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]))
  }
  return value
}

function merge(base, overrides) {
  const result = clone(base)
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return result

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue
    if (value && typeof value === 'object' && !Array.isArray(value) && result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = merge(result[key], value)
    } else {
      result[key] = clone(value)
    }
  }
  return result
}

function normalizeCombatConfig(input = {}) {
  const config = merge(DEFAULTS, input)
  const listKeys = ['allowedTargets', 'hitIgnore', 'friends']

  for (const key of listKeys) {
    config[key] = Array.isArray(config[key])
      ? config[key].filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean)
      : []
  }

  config.targetMode = config.targetMode === 'all' ? 'all' : 'allowlist'
  config.maxTargetDistance = Math.max(4, Number(config.maxTargetDistance) || DEFAULTS.maxTargetDistance)
  config.attackRange = Math.max(1, Math.min(4.5, Number(config.attackRange) || DEFAULTS.attackRange))
  config.minCombatDistance = Math.max(0.5, Math.min(config.attackRange, Number(config.minCombatDistance) || DEFAULTS.minCombatDistance))
  config.chaseRange = Math.max(config.attackRange, Number(config.chaseRange) || DEFAULTS.chaseRange)
  config.tickIntervalMs = Math.max(50, Number(config.tickIntervalMs) || DEFAULTS.tickIntervalMs)
  config.scanIntervalMs = Math.max(100, Number(config.scanIntervalMs) || DEFAULTS.scanIntervalMs)

  return config
}

module.exports = { DEFAULTS, normalizeCombatConfig }
