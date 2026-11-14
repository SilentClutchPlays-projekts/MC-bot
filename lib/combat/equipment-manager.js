'use strict'

const MATERIAL_SCORE = Object.freeze({
  netherite: 9,
  diamond: 8,
  iron: 6,
  chainmail: 4.5,
  gold: 3.5,
  stone: 3,
  leather: 2,
  wood: 1,
  turtle: 4
})

const ARMOR_SLOTS = Object.freeze([
  { slot: 'head', index: 5, suffix: 'helmet' },
  { slot: 'torso', index: 6, suffix: 'chestplate' },
  { slot: 'legs', index: 7, suffix: 'leggings' },
  { slot: 'feet', index: 8, suffix: 'boots' }
])

function getMaterialScore(name) {
  for (const [material, score] of Object.entries(MATERIAL_SCORE)) {
    if (name.startsWith(`${material}_`) || name === `${material}_helmet`) return score
  }
  return 0
}

function enchantmentBonus(item) {
  if (!item || !Array.isArray(item.enchants)) return 0
  return item.enchants.reduce((total, enchant) => {
    const name = String(enchant.name || '').toLowerCase()
    const level = Number(enchant.level) || 0
    if (['protection', 'fire_protection', 'blast_protection', 'projectile_protection'].includes(name)) return total + level * 0.15
    if (['sharpness', 'smite', 'bane_of_arthropods', 'power'].includes(name)) return total + level * 0.12
    return total
  }, 0)
}

function weaponScore(item, priority = []) {
  if (!item || !item.name) return -Infinity
  const index = priority.indexOf(item.name)
  const rank = index === -1 ? -1 : priority.length - index
  const material = getMaterialScore(item.name)
  const typeBonus = item.name.endsWith('_sword') ? 1.1 : item.name.endsWith('_axe') ? 0.7 : item.name === 'mace' ? 1.2 : 0
  return rank * 2 + material + typeBonus + enchantmentBonus(item)
}

function armorScore(item) {
  if (!item || !item.name) return -Infinity
  return getMaterialScore(item.name) + enchantmentBonus(item)
}

class EquipmentManager {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log
    this.busy = false
    this.lastRefreshAt = 0
    this.lastWeaponName = null
  }

  getItems() {
    return this.bot.inventory && typeof this.bot.inventory.items === 'function'
      ? this.bot.inventory.items()
      : []
  }

  async equipBestWeapon() {
    if (this.busy || !this.bot.entity) return false
    const items = this.getItems()
    const priority = Array.isArray(this.config.weaponPriority) ? this.config.weaponPriority : []
    const candidates = items.filter(item => priority.includes(item.name))
    candidates.sort((a, b) => weaponScore(b, priority) - weaponScore(a, priority))
    const best = candidates[0]
    if (!best) return false
    if (this.bot.heldItem) {
      if (this.bot.heldItem.name === best.name) return true
      // Do not replace a stronger weapon already equipped in the main hand.
      if (weaponScore(this.bot.heldItem, priority) >= weaponScore(best, priority)) return true
    }

    this.busy = true
    try {
      await this.bot.equip(best, 'hand')
      this.lastWeaponName = best.name
      this.log(`[Equipment] Equipped ${best.name}`)
      return true
    } catch (error) {
      this.log(`[Equipment] Weapon equip failed: ${error.message}`)
      return false
    } finally {
      this.busy = false
    }
  }

  async equipBestArmor() {
    if (this.busy || !this.bot.entity) return false
    let changed = false

    this.busy = true
    try {
      for (const armorSlot of ARMOR_SLOTS) {
        const candidates = this.getItems().filter(item => item.name.endsWith(armorSlot.suffix))
        if (!candidates.length) continue

        const current = this.bot.inventory.slots[armorSlot.index] || null
        const best = candidates.reduce((winner, item) => {
          if (!winner || armorScore(item) > armorScore(winner)) return item
          return winner
        }, null)

        if (!best) continue
        if (current && armorScore(current) >= armorScore(best)) continue

        await this.bot.equip(best, armorSlot.slot)
        changed = true
        this.log(`[Equipment] Equipped ${best.name} (${armorSlot.slot})`)
      }
      return changed
    } catch (error) {
      this.log(`[Equipment] Armor equip failed: ${error.message}`)
      return changed
    } finally {
      this.busy = false
    }
  }

  async equipOffhand() {
    if (this.busy || !this.bot.entity || !this.config.autoEquipOffhand) return false
    const priorities = this.config.offhandPriority || []
    const items = this.getItems()

    // Player inventory offhand slot is slot 45 in Mineflayer's standard player window.
    const current = this.bot.inventory.slots[45] || null
    const selectedName = priorities.find(name => (current && current.name === name) || items.some(item => item.name === name))
    if (!selectedName) return false
    if (current && current.name === selectedName) return true
    const best = items.find(item => item.name === selectedName)
    if (!best) return false

    this.busy = true
    try {
      await this.bot.equip(best, 'off-hand')
      this.log(`[Equipment] Equipped ${best.name} (off-hand)`)
      return true
    } catch (error) {
      // Some server/protocol combinations do not expose an offhand slot.
      this.log(`[Equipment] Offhand equip skipped: ${error.message}`)
      return false
    } finally {
      this.busy = false
    }
  }

  async tick() {
    const now = Date.now()
    if (now - this.lastRefreshAt < this.config.refreshMs || this.busy) return
    this.lastRefreshAt = now

    if (this.config.autoEquipArmor) await this.equipBestArmor()
    if (this.config.autoEquipOffhand) await this.equipOffhand()
    // Weapon swaps are performed by the combat controller when it is safe to do so.
  }

  reset() {
    this.busy = false
    this.lastRefreshAt = 0
    this.lastWeaponName = null
  }
}

module.exports = { EquipmentManager, weaponScore, armorScore, getMaterialScore }
