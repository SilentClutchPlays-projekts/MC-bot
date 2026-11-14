'use strict'

const DEFAULTS = Object.freeze({
  enabled: true,
  targetMode: 'allowlist',
  allowedTargets: [],
  hitIgnore: [],
  friends: [],
  ignoreSameTeam: true,

  maxTargetDistance: 24,
  maxTargetVerticalDistance: 16,
  targetSwitchMargin: 3.5,
  scanIntervalMs: 100,
  tickIntervalMs: 50,

  attackRange: 3.1,
  minCombatDistance: 1.9,
  chaseRange: 4.5,
  attackCooldownMs: null,
  legacyAttackCooldownMs: 150,
  attackCooldownBufferMs: 25,

  targetPredictionMs: 110,
  targetVelocitySmoothing: 0.45,
  maxTargetSpeed: 10,
  aimEveryMs: 100,
  maxAimAgeMs: 300,
  aimTimeoutMs: 750,
  aimPositionThreshold: 0.3,
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
    allowParkour: true,
    allowSprinting: true,

    followGoalRange: 1.5,
    engageRange: 4.25,
    engageVerticalTolerance: 1.65,

    chaseStallMs: 3000,
    chaseRepathCooldownMs: 1500,
    chaseProgressThreshold: 0.3,

    strafe: true,
    strafeChangeMs: 550,

    tacticalJump: true,
    tacticalJumpIntervalMs: 1300,
    tacticalJumpMinDistance: 2.3,
    tacticalJumpMaxDistance: 3.35,
    tacticalJumpMaxVerticalDistance: 0.8,
    jumpHoldMs: 100,

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
  if (Array.isArray(value)) return value.map(clone)

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    )
  }

  return value
}

function merge(base, overrides) {
  const result = clone(base)

  if (
    !overrides ||
    typeof overrides !== 'object' ||
    Array.isArray(overrides)
  ) {
    return result
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue

    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = merge(result[key], value)
    } else {
      result[key] = clone(value)
    }
  }

  return result
}

function numberInRange(value, fallback, min, max) {
  const number = Number(value)

  if (!Number.isFinite(number)) return fallback

  return Math.max(min, Math.min(max, number))
}

function normalizeCombatConfig(input = {}) {
  const config = merge(DEFAULTS, input)

  for (const key of ['allowedTargets', 'hitIgnore', 'friends']) {
    config[key] = Array.isArray(config[key])
      ? config[key]
        .filter(value => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
      : []
  }

  config.targetMode = config.targetMode === 'all' ? 'all' : 'allowlist'

  config.maxTargetDistance = numberInRange(
    config.maxTargetDistance,
    DEFAULTS.maxTargetDistance,
    4,
    128
  )

  config.maxTargetVerticalDistance = numberInRange(
    config.maxTargetVerticalDistance,
    DEFAULTS.maxTargetVerticalDistance,
    2,
    64
  )

  config.targetSwitchMargin = numberInRange(
    config.targetSwitchMargin,
    DEFAULTS.targetSwitchMargin,
    0,
    20
  )

  config.scanIntervalMs = numberInRange(
    config.scanIntervalMs,
    DEFAULTS.scanIntervalMs,
    50,
    1000
  )

  config.tickIntervalMs = numberInRange(
    config.tickIntervalMs,
    DEFAULTS.tickIntervalMs,
    50,
    250
  )

  config.attackRange = numberInRange(
    config.attackRange,
    DEFAULTS.attackRange,
    1,
    4.5
  )

  config.minCombatDistance = numberInRange(
    config.minCombatDistance,
    DEFAULTS.minCombatDistance,
    0.5,
    config.attackRange
  )

  config.chaseRange = Math.max(
    config.attackRange,
    numberInRange(config.chaseRange, DEFAULTS.chaseRange, 1, 12)
  )

  const attackCooldown = Number(config.attackCooldownMs)

  config.attackCooldownMs =
    Number.isFinite(attackCooldown) && attackCooldown > 0
      ? attackCooldown
      : null

  config.legacyAttackCooldownMs = numberInRange(
    config.legacyAttackCooldownMs,
    DEFAULTS.legacyAttackCooldownMs,
    50,
    1000
  )

  config.attackCooldownBufferMs = numberInRange(
    config.attackCooldownBufferMs,
    DEFAULTS.attackCooldownBufferMs,
    0,
    150
  )

  config.targetPredictionMs = numberInRange(
    config.targetPredictionMs,
    DEFAULTS.targetPredictionMs,
    0,
    250
  )

  config.targetVelocitySmoothing = numberInRange(
    config.targetVelocitySmoothing,
    DEFAULTS.targetVelocitySmoothing,
    0.05,
    1
  )

  config.maxTargetSpeed = numberInRange(
    config.maxTargetSpeed,
    DEFAULTS.maxTargetSpeed,
    1,
    20
  )

  config.aimEveryMs = numberInRange(
    config.aimEveryMs,
    DEFAULTS.aimEveryMs,
    50,
    500
  )

  config.maxAimAgeMs = numberInRange(
    config.maxAimAgeMs,
    DEFAULTS.maxAimAgeMs,
    config.aimEveryMs,
    1500
  )

  config.aimTimeoutMs = numberInRange(
    config.aimTimeoutMs,
    DEFAULTS.aimTimeoutMs,
    250,
    5000
  )

  config.aimPositionThreshold = numberInRange(
    config.aimPositionThreshold,
    DEFAULTS.aimPositionThreshold,
    0.05,
    1.5
  )

  const movement = config.movement

  movement.followGoalRange = numberInRange(
    movement.followGoalRange,
    DEFAULTS.movement.followGoalRange,
    1,
    4
  )

  movement.engageRange = numberInRange(
    movement.engageRange,
    DEFAULTS.movement.engageRange,
    config.attackRange,
    8
  )

  movement.engageVerticalTolerance = numberInRange(
    movement.engageVerticalTolerance,
    DEFAULTS.movement.engageVerticalTolerance,
    0.5,
    4
  )

  movement.chaseStallMs = numberInRange(
    movement.chaseStallMs,
    DEFAULTS.movement.chaseStallMs,
    1000,
    15000
  )

  movement.chaseRepathCooldownMs = numberInRange(
    movement.chaseRepathCooldownMs,
    DEFAULTS.movement.chaseRepathCooldownMs,
    500,
    10000
  )

  movement.chaseProgressThreshold = numberInRange(
    movement.chaseProgressThreshold,
    DEFAULTS.movement.chaseProgressThreshold,
    0.1,
    2
  )

  movement.strafeChangeMs = numberInRange(
    movement.strafeChangeMs,
    DEFAULTS.movement.strafeChangeMs,
    200,
    2000
  )

  movement.tacticalJumpIntervalMs = numberInRange(
    movement.tacticalJumpIntervalMs,
    DEFAULTS.movement.tacticalJumpIntervalMs,
    500,
    5000
  )

  movement.tacticalJumpMinDistance = numberInRange(
    movement.tacticalJumpMinDistance,
    DEFAULTS.movement.tacticalJumpMinDistance,
    1,
    5
  )

  movement.tacticalJumpMaxDistance = numberInRange(
    movement.tacticalJumpMaxDistance,
    DEFAULTS.movement.tacticalJumpMaxDistance,
    movement.tacticalJumpMinDistance,
    7
  )

  movement.tacticalJumpMaxVerticalDistance = numberInRange(
    movement.tacticalJumpMaxVerticalDistance,
    DEFAULTS.movement.tacticalJumpMaxVerticalDistance,
    0.1,
    2
  )

  movement.jumpHoldMs = numberInRange(
    movement.jumpHoldMs,
    DEFAULTS.movement.jumpHoldMs,
    50,
    250
  )

  movement.retreatDistance = numberInRange(
    movement.retreatDistance,
    DEFAULTS.movement.retreatDistance,
    2,
    24
  )

  movement.retreatGoalRefreshMs = numberInRange(
    movement.retreatGoalRefreshMs,
    DEFAULTS.movement.retreatGoalRefreshMs,
    250,
    5000
  )

  movement.strafe = Boolean(movement.strafe)
  movement.tacticalJump = Boolean(movement.tacticalJump)
  movement.allowParkour = Boolean(movement.allowParkour)
  movement.allowSprinting = Boolean(movement.allowSprinting)

  return config
}

module.exports = { DEFAULTS, normalizeCombatConfig }
