'use strict'

const ATTACK_SPEEDS = Object.freeze({
  wooden_sword: 1.6,
  golden_sword: 1.6,
  stone_sword: 1.6,
  iron_sword: 1.6,
  diamond_sword: 1.6,
  netherite_sword: 1.6,
  wooden_axe: 0.8,
  stone_axe: 0.8,
  iron_axe: 0.9,
  golden_axe: 1.0,
  diamond_axe: 1.0,
  netherite_axe: 1.0
})

function getProtocolVersion(bot) {
  const match = String(bot.version || '').match(/(?:^|\D)(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

function cooldownFor(bot, config, heldItem) {
  if (Number.isFinite(config.attackCooldownMs) && config.attackCooldownMs > 0) {
    return config.attackCooldownMs
  }

  const version = getProtocolVersion(bot)

  if (version && (version.major < 1 || (version.major === 1 && version.minor < 9))) {
    return config.legacyAttackCooldownMs || 150
  }

  const name = heldItem && heldItem.name ? heldItem.name : ''

  if (name === 'mace') return 1600 + (config.attackCooldownBufferMs || 0)
  if (name === 'trident') return 900 + (config.attackCooldownBufferMs || 0)

  const speed = ATTACK_SPEEDS[name] || 4.0

  return Math.ceil(1000 / speed) + (config.attackCooldownBufferMs || 0)
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

// Measures distance from the bot's eyes to the nearest point on
// the target's hitbox, instead of comparing feet-to-feet positions.
function distanceToTargetHitbox(bot, target) {
  if (!bot.entity || !bot.entity.position || !target || !target.position) {
    return Infinity
  }

  const eyeHeight = Math.min(
    1.62,
    (Number(bot.entity.height) || 1.8) * 0.9
  )

  const eye = {
    x: bot.entity.position.x,
    y: bot.entity.position.y + eyeHeight,
    z: bot.entity.position.z
  }

  const width = Number(target.width) || 0.6
  const height = Number(target.height) || 1.8
  const halfWidth = width / 2
  const p = target.position

  const nearestX = clamp(eye.x, p.x - halfWidth, p.x + halfWidth)
  const nearestY = clamp(eye.y, p.y, p.y + height)
  const nearestZ = clamp(eye.z, p.z - halfWidth, p.z + halfWidth)

  return Math.hypot(
    eye.x - nearestX,
    eye.y - nearestY,
    eye.z - nearestZ
  )
}

class CombatEngine {
  constructor(bot, config, equipment, targets, log = () => {}) {
    this.bot = bot
    this.config = config
    this.equipment = equipment
    this.targets = targets
    this.log = log

    this.lastAttackAt = 0
    this.attackInFlight = false
    this.attackGeneration = 0
    this.attackTimer = null
    this.pendingTargetId = null
  }

  isSameTargetValid(target) {
    if (!this.bot.entity || !target || !target.entity || !target.username) {
      return false
    }

    if (target.entity.isValid === false) return false

    const current = this.bot.players && this.bot.players[target.username]

    return Boolean(
      current &&
      current.entity &&
      current.entity.id === target.entity.id
    )
  }

  getAimPoint(target) {
    const entity = target && target.entity

    if (!entity || !entity.position) return null

    const height = Number(entity.height) || 1.8

    // Aim at the torso instead of above the player's head.
    // Do not extrapolate a moving player's position.
    return typeof entity.position.offset === 'function'
      ? entity.position.offset(0, height * 0.55, 0)
      : {
          x: entity.position.x,
          y: entity.position.y + height * 0.55,
          z: entity.position.z
        }
  }

  canAttackNow(target, now = Date.now()) {
    if (!this.isSameTargetValid(target)) return false
    if (this.equipment && this.equipment.busy) return false

    const reach = distanceToTargetHitbox(this.bot, target.entity)

    if (!Number.isFinite(reach) || reach > this.config.attackRange) {
      return false
    }

    const cooldown = cooldownFor(
      this.bot,
      this.config,
      this.bot.heldItem
    )

    return now - this.lastAttackAt >= cooldown
  }

  tick(target) {
    if (!target || !target.entity) return false

    if (this.attackInFlight) {
      if (this.pendingTargetId !== target.entity.id) {
        this.clearTarget()
      } else {
        return false
      }
    }

    if (
      !this.bot.entity ||
      typeof this.bot.lookAt !== 'function' ||
      typeof this.bot.attack !== 'function'
    ) {
      return false
    }

    const now = Date.now()

    if (!this.canAttackNow(target, now)) return false

    const point = this.getAimPoint(target)

    if (!point) return false

    const generation = ++this.attackGeneration
    const targetId = target.entity.id

    this.attackInFlight = true
    this.pendingTargetId = targetId

    // Force rotation to settle immediately, then re-check the target
    // and reach before sending the attack packet.
    let lookPromise

    try {
      lookPromise = this.bot.lookAt(point, true)
    } catch (error) {
      this.attackInFlight = false
      this.pendingTargetId = null

      this.log(`[Combat] lookAt failed: ${error.message}`)
      return false
    }

    const timeoutMs = Math.max(
      500,
      Number(this.config.aimTimeoutMs) || 1200
    )

    this.attackTimer = setTimeout(() => {
      if (generation !== this.attackGeneration) return

      this.attackGeneration += 1
      this.attackTimer = null
      this.attackInFlight = false
      this.pendingTargetId = null

      this.log('[Combat] Aim timed out; released attack lock.')
    }, timeoutMs)

    Promise.resolve(lookPromise).then(() => {
      if (generation !== this.attackGeneration) return

      if (
        !this.isSameTargetValid(target) ||
        target.entity.id !== targetId
      ) {
        return
      }

      if (this.equipment && this.equipment.busy) return

      const latestReach = distanceToTargetHitbox(
        this.bot,
        target.entity
      )

      if (
        !Number.isFinite(latestReach) ||
        latestReach > this.config.attackRange
      ) {
        return
      }

      const attackNow = Date.now()

      const cooldown = cooldownFor(
        this.bot,
        this.config,
        this.bot.heldItem
      )

      if (attackNow - this.lastAttackAt < cooldown) return

      this.bot.attack(target.entity, true)

      this.lastAttackAt = attackNow

      this.log(
        `[Combat] Swing -> ${target.username} (${latestReach.toFixed(2)} blocks to hitbox)`
      )
    }).catch(error => {
      if (generation === this.attackGeneration) {
        this.log(`[Combat] Aim/attack failed: ${error.message}`)
      }
    }).finally(() => {
      if (generation !== this.attackGeneration) return

      if (this.attackTimer) clearTimeout(this.attackTimer)

      this.attackTimer = null
      this.attackInFlight = false
      this.pendingTargetId = null
    })

    return true
  }

  clearTarget() {
    this.attackGeneration += 1

    if (this.attackTimer) clearTimeout(this.attackTimer)

    this.attackTimer = null
    this.attackInFlight = false
    this.pendingTargetId = null
  }

  reset() {
    this.clearTarget()
    this.lastAttackAt = 0
  }
}

module.exports = {
  CombatEngine,
  cooldownFor,
  getProtocolVersion,
  distanceToTargetHitbox,
  ATTACK_SPEEDS
}
