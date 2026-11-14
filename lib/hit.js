'use strict'

// Backwards-compatible entry point. bot.js can keep calling setupHit(bot, config).
const { createCombatController } = require('./combat')

module.exports = function setupHit(bot, config = {}) {
  const combatConfig = { ...(config.combat || {}) }
  // Preserve compatibility with any legacy root-level hitIgnore setting.
  if (!combatConfig.hitIgnore && Array.isArray(config.hitIgnore)) {
    combatConfig.hitIgnore = config.hitIgnore
  }
  const controller = createCombatController(bot, combatConfig)
  controller.start()
  return controller
}
