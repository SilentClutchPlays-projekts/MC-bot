'use strict'

class DefenseManager {
  constructor(bot, config, equipment, movement, log = () => {}) {
    this.bot = bot
    this.config = config
    this.equipment = equipment
    this.movement = movement
    this.log = log
    this.busy = false
    this.lastActionAt = 0
    this.shieldRaised = false
  }

  getItem(names) {
    if (!this.bot.inventory || typeof this.bot.inventory.items !== 'function') return null
    const items = this.bot.inventory.items()
    for (const name of names || []) {
      const item = items.find(candidate => candidate.name === name)
      if (item) return item
    }
    return null
  }

  async useConsumable(names, label) {
    if (this.busy || !this.bot.entity) return false
    const item = this.getItem(names)
    if (!item) return false

    this.busy = true
    this.lastActionAt = Date.now()
    try {
      await this.bot.equip(item, 'hand')
      await this.bot.consume()
      // Restore a weapon after eating so the next combat tick is not unarmed.
      if (this.equipment && typeof this.equipment.equipBestWeapon === 'function') {
        await this.equipment.equipBestWeapon()
      }
      this.log(`[Defense] Used ${label}: ${item.name}`)
      return true
    } catch (error) {
      this.log(`[Defense] Could not use ${item.name}: ${error.message}`)
      return false
    } finally {
      this.busy = false
    }
  }

  async tick(target) {
    if (!this.bot.entity || this.busy) return 'busy'
    const now = Date.now()
    if (now - this.lastActionAt < this.config.actionCooldownMs) return 'none'

    if (this.config.autoHeal && this.bot.health <= this.config.healAtHealth) {
      const healed = await this.useConsumable(this.config.healItems, 'healing item')
      if (healed) return 'healing'
    }

    if (this.config.autoEat && this.bot.food <= this.config.eatAtFood) {
      const ate = await this.useConsumable(this.config.foodItems, 'food')
      if (ate) return 'eating'
    }

    const targetDistance = target && target.entity && this.bot.entity
      ? this.bot.entity.position.distanceTo(target.entity.position)
      : Infinity
    if (this.config.shieldHandling && target && target.entity && this.bot.health <= this.config.retreatAtHealth && targetDistance <= this.config.shieldRange) {
      const offhand = this.bot.inventory && this.bot.inventory.slots ? this.bot.inventory.slots[45] : null
      if (offhand && offhand.name === 'shield' && !this.shieldRaised) {
        try {
          this.bot.activateItem(true)
          this.shieldRaised = true
          this.log('[Defense] Raised shield')
          return 'shielding'
        } catch (error) {
          this.log(`[Defense] Shield activation failed: ${error.message}`)
        }
      }
    }

    return 'none'
  }

  shouldRetreat() {
    return Boolean(this.config.autoRetreat && this.bot.entity && this.bot.health <= this.config.retreatAtHealth)
  }

  lowerShield() {
    if (!this.shieldRaised) return
    try {
      this.bot.deactivateItem()
    } catch (error) {
      this.log(`[Defense] Shield release failed: ${error.message}`)
    }
    this.shieldRaised = false
  }

  reset() {
    this.lowerShield()
    this.busy = false
    this.lastActionAt = 0
  }
}

module.exports = { DefenseManager }
