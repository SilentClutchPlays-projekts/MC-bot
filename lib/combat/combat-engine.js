'use strict'

const { distanceBetween } = require('./target-manager')

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
  const version = String(bot.version || '')
  const match = version.match(/(?:^|\D)(\d+)\.(\d+)/)

  if (!match) return null

  return {
    major: Number(match[1]),
    minor: Number(match[2])
  }
}

function cooldownFor(bot, config, heldItem) {
  if (
    Number.isFinite(config.attackCooldownMs) &&
    config.attackCooldownMs > 0
  ) {
    return config.attackCooldownMs
  }

  const version = getProtocolVersion(bot)

  if (
    version &&
    (version.major < 1 || (version.major === 1 && version.minor < 9))
  ) {
    return config.legacyAttackCooldownMs
  }

  const name = heldItem && heldItem.name ? heldItem.name : ''

  if (name === 'mace') {
    return 1600 + config.attackCooldownBufferMs
  }

  if (name === 'trident') {
    return 900 + config.attackCooldownBufferMs
  }

  // Vanilla-style cooldown estimates for regular swords and axes.
  // Unknown items use the player's normal base attack speed.
  const speed = ATTACK_SPEEDS[name] || 4.0
  const ticks = Math.max(1, Math.floor(20 / speed))

  return ticks * 50 + config.attackCooldownBufferMs
}

function pointDistance(a, b) {
  if (!a || !b) return Infinity

  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
    a.z - b.z
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
    this.lastAimRequestAt = 0
    this.lastAimSettledAt = 0

    this.aimTargetId = null
    this.aimingTargetId = null
    this.aimPoint = null

    this.aimInFlight = false
    this.aimTimer = null
    this.aimGeneration = 0
  }

  getAimPoint(target) {
    const base =
      this.targets &&
      typeof this.targets.getPredictedPosition === 'function'
        ? this.targets.getPredictedPosition(
          target.entity,
          this.config.targetPredictionMs
        )
        : target.entity.position

    if (!base) return null

    const height = Number(target.entity.height) || 1.8

    return {
      x: base.x,
      y: base.y + height * 0.72,
      z: base.z
    }
  }

  invalidateAim() {
    this.aimGeneration += 1

    if (this.aimTimer) {
      clearTimeout(this.aimTimer)
    }

    this.aimTimer = null
    this.aimInFlight = false
    this.aimingTargetId = null
    this.aimTargetId = null
    this.aimPoint = null
    this.lastAimSettledAt = 0
  }

  requestAim(target, point, now) {
    if (!this.bot || typeof this.bot.lookAt !== 'function') {
      return false
    }

    const generation = ++this.aimGeneration
    const targetId = target.entity.id

    this.aimInFlight = true
    this.aimingTargetId = targetId
    this.lastAimRequestAt = now

    this.aimTimer = setTimeout(() => {
      if (generation !== this.aimGeneration) return

      this.aimGeneration += 1
      this.aimTimer = null
      this.aimInFlight = false
      this.aimingTargetId = null
      this.aimTargetId = null
      this.aimPoint = null
      this.lastAimSettledAt = 0

      this.log('[Combat] Aim operation timed out; the next tick will retry.')
    }, this.config.aimTimeoutMs)

    try {
      // Do not await lookAt here. The combat loop must keep running even if
      // Mineflayer takes too long to finish a head rotation.
      Promise.resolve(this.bot.lookAt(point, true)).then(() => {
        if (generation !== this.aimGeneration) return

        if (this.aimTimer) {
          clearTimeout(this.aimTimer)
        }

        this.aimTimer = null
        this.aimInFlight = false
        this.aimingTargetId = null
        this.aimTargetId = targetId
        this.aimPoint = { ...point }
        this.lastAimSettledAt = Date.now()
      }).catch(error => {
        if (generation !== this.aimGeneration) return

        if (this.aimTimer) {
          clearTimeout(this.aimTimer)
        }

        this.aimTimer = null
        this.aimInFlight = false
        this.aimingTargetId = null
        this.aimTargetId = null
        this.aimPoint = null
        this.lastAimSettledAt = 0

        this.log(`[Combat] Aim update failed: ${error.message}`)
      })
    } catch (error) {
      if (this.aimTimer) {
        clearTimeout(this.aimTimer)
      }

      this.aimTimer = null
      this.aimInFlight = false
      this.aimingTargetId = null
      this.aimTargetId = null

      this.log(`[Combat] Aim update failed: ${error.message}`)
      return false
    }

    return true
  }

  isSameTargetValid(target) {
    if (
      !this.bot.entity ||
      !target ||
      !target.entity ||
      !target.username ||
      target.entity.isValid === false
    ) {
      return false
    }

    const current = this.bot.players &&
      this.bot.players[target.username]

    return Boolean(
      current &&
      current.entity &&
      current.entity.id === target.entity.id
    )
  }

  hasLineOfSight(aimPoint) {
    if (
      !this.config.requireLineOfSight ||
      typeof this.bot.blockAtCursor !== 'function'
    ) {
      return true
    }

    const block = this.bot.blockAtCursor(this.config.attackRange + 0.5)

    if (!block || !block.position || !this.bot.entity) {
      return true
    }

    const eye = this.bot.entity.position.offset(
      0,
      (Number(this.bot.entity.height) || 1.62) * 0.9,
      0
    )

    const blockCenter = block.position.offset(0.5, 0.5, 0.5)

    const blockDistance = distanceBetween(eye, blockCenter)
    const aimDistance = distanceBetween(eye, aimPoint)

    if (!Number.isFinite(blockDistance) || !Number.isFinite(aimDistance)) {
      return true
    }

    return blockDistance + 0.35 >= aimDistance
  }

  tick(target) {
    if (!this.bot.entity || !target || !target.entity) {
      return false
    }

    // Avoid sending an attack while the hand is being changed.
    if (this.equipment && this.equipment.busy) {
      return false
    }

    if (!this.isSameTargetValid(target)) {
      this.clearTarget()
      return false
    }

    const now = Date.now()
    const targetId = target.entity.id

    const distance = distanceBetween(
      this.bot.entity.position,
      target.entity.position
    )

    if (!Number.isFinite(distance) || distance < 0.1) {
      return false
    }

    const engageRange = Math.max(
      this.config.attackRange + 0.5,
      this.config.movement && this.config.movement.engageRange
        ? this.config.movement.engageRange
        : this.config.chaseRange
    )

    // Let Pathfinder handle travel when the target is distant. Don't fight
    // its navigation by continuously rotating the bot toward a far target.
    if (distance > engageRange + 0.3) {
      if (this.aimTargetId !== null || this.aimInFlight) {
        this.invalidateAim()
      }

      return false
    }

    // Discard an aim operation if the target changed while it was pending.
    if (this.aimInFlight && this.aimingTargetId !== targetId) {
      this.invalidateAim()
    }

    const aimPoint = this.getAimPoint(target)
    if (!aimPoint) return false

    const aimAge = now - this.lastAimSettledAt

    const aimMoved =
      !this.aimPoint ||
      pointDistance(this.aimPoint, aimPoint) >= this.config.aimPositionThreshold

    const aimStale =
      !this.aimTargetId ||
      this.aimTargetId !== targetId ||
      aimAge > this.config.aimEveryMs ||
      aimAge > this.config.maxAimAgeMs

    if (this.aimInFlight) return false

    if (aimMoved || aimStale) {
      this.requestAim(target, aimPoint, now)
      return false
    }

    if (distance > this.config.attackRange) {
      return false
    }

    const cooldown = cooldownFor(
      this.bot,
      this.config,
      this.bot.heldItem
    )

    if (now - this.lastAttackAt < cooldown) {
      return false
    }

    // Recheck everything just before the attack packet is sent.
    if (!this.isSameTargetValid(target)) return false

    const finalDistance = distanceBetween(
      this.bot.entity.position,
      target.entity.position
    )

    if (
      !Number.isFinite(finalDistance) ||
      finalDistance > this.config.attackRange ||
      finalDistance < 0.1
    ) {
      return false
    }

    const latestAimPoint = this.getAimPoint(target)

    if (
      !latestAimPoint ||
      pointDistance(this.aimPoint, latestAimPoint) >= this.config.aimPositionThreshold
    ) {
      this.requestAim(target, latestAimPoint || aimPoint, now)
      return false
    }

    if (!this.hasLineOfSight(latestAimPoint)) {
      return false
    }

    try {
      this.bot.attack(target.entity)
      this.lastAttackAt = now
      return true
    } catch (error) {
      this.log(`[Combat] Attack failed: ${error.message}`)
      return false
    }
  }

  clearTarget() {
    if (this.aimTargetId === null && !this.aimInFlight) {
      return
    }

    this.invalidateAim()
  }

  reset() {
    this.invalidateAim()
    this.lastAttackAt = 0
    this.lastAimRequestAt = 0
  }
}

module.exports = {
  CombatEngine,
  cooldownFor,
  getProtocolVersion,
  ATTACK_SPEEDS
}
