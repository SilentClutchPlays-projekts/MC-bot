'use strict'

const { distanceBetween } = require('./target-manager')

function getProtocolVersion(bot) {
  const version = String(bot.version || '')
  const match = version.match(/(?:^|\D)(\d+)\.(\d+)/)
  if (!match) return null
  return { major: Number(match[1]), minor: Number(match[2]) }
}

function cooldownFor(bot, config, heldItem) {
  if (Number.isFinite(config.attackCooldownMs) && config.attackCooldownMs > 0) return config.attackCooldownMs
  const version = getProtocolVersion(bot)
  if (version && (version.major < 1 || (version.major === 1 && version.minor < 9))) return config.legacyAttackCooldownMs

  const name = heldItem && heldItem.name ? heldItem.name : ''
  if (name === 'mace') return 1600
  if (name.endsWith('_axe')) {
    return name.startsWith('netherite_') || name.startsWith('diamond_') ? 1000 : 1250
  }
  if (name === 'trident') return 900
  if (name.endsWith('_sword')) return 625
  return 500
}

class CombatEngine {
  constructor(bot, config, equipment, log = () => {}) {
    this.bot = bot
    this.config = config
    this.equipment = equipment
    this.log = log
    this.lastAttackAt = 0
    this.lastAimAt = 0
    this.actionBusy = false
    this.lastTargetId = null
    this.lastAimedTargetId = null
  }

  async tick(target, distance) {
    if (!target || !target.entity || !this.bot.entity || this.actionBusy) return false

    const targetId = target.entity.id
    const now = Date.now()
    const cooldown = cooldownFor(this.bot, this.config, this.bot.heldItem)
    const attackReady = now - this.lastAttackAt >= cooldown
    const aimDue = now - this.lastAimAt >= this.config.aimEveryMs
    const targetChanged = this.lastAimedTargetId !== targetId

    // Aim before checking obstruction and before sending the attack packet.
    if (aimDue || targetChanged || attackReady) {
      try {
        await this.bot.lookAt(target.entity.position.offset(0, (target.entity.height || 1.8) * 0.85, 0), true)
        this.lastAimAt = Date.now()
        this.lastAimedTargetId = targetId
      } catch (error) {
        this.log(`[Combat] Aim update failed: ${error.message}`)
        return false
      }
    }

    if (!this.isSameTargetValid(target)) return false
    const currentDistance = distanceBetween(this.bot.entity.position, target.entity.position)
    if (currentDistance > this.config.attackRange || currentDistance < 0.1) return false

    if (this.config.requireLineOfSight && typeof this.bot.blockAtCursor === 'function') {
      const blockingBlock = this.bot.blockAtCursor(this.config.attackRange)
      if (blockingBlock && blockingBlock.position) {
        const blockDistance = distanceBetween(this.bot.entity.position, blockingBlock.position)
        if (Number.isFinite(blockDistance) && blockDistance + 0.35 < currentDistance) return false
      }
    }

    if (!attackReady) return false

    this.actionBusy = true
    try {
      // Recheck after asynchronous aiming: a player can leave or unload during the await.
      if (!this.isSameTargetValid(target)) return false
      const finalDistance = distanceBetween(this.bot.entity.position, target.entity.position)
      if (finalDistance > this.config.attackRange || finalDistance < 0.1) return false
      this.bot.attack(target.entity)
      this.lastAttackAt = Date.now()
      this.lastTargetId = targetId
      return true
    } catch (error) {
      this.log(`[Combat] Attack failed: ${error.message}`)
      return false
    } finally {
      this.actionBusy = false
    }
  }

  isSameTargetValid(target) {
    return Boolean(
      this.bot.entity &&
      target && target.entity &&
      this.bot.players &&
      this.bot.players[target.username] &&
      this.bot.players[target.username].entity &&
      this.bot.players[target.username].entity.id === target.entity.id
    )
  }

  reset() {
    this.lastAttackAt = 0
    this.lastAimAt = 0
    this.actionBusy = false
    this.lastTargetId = null
    this.lastAimedTargetId = null
  }
}

module.exports = { CombatEngine, cooldownFor, getProtocolVersion }
