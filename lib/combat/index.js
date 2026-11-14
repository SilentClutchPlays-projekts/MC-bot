'use strict'

const { normalizeCombatConfig } = require('./config')
const { CombatState, STATES } = require('./combat-state')
const { TargetManager, distanceBetween } = require('./target-manager')
const { EquipmentManager } = require('./equipment-manager')
const { CombatEngine } = require('./combat-engine')
const { MovementController } = require('./movement-controller')
const { DefenseManager } = require('./defense-manager')
const { RecoveryManager } = require('./recovery-manager')

function createCombatController(bot, inputConfig = {}) {
  const config = normalizeCombatConfig(inputConfig)
  const log = message => {
    if (config.logging) console.log(message)
  }

  const state = new CombatState(log)
  const targets = new TargetManager(bot, config, log)
  const equipment = new EquipmentManager(bot, { ...config.equipment, weaponPriority: config.weaponPriority }, log)
  const movement = new MovementController(bot, config.movement, log)
  const defense = new DefenseManager(bot, config.defense, equipment, movement, log)
  const combat = new CombatEngine(bot, config, equipment, log)
  const recovery = new RecoveryManager(bot, config.recovery, log)

  let interval = null
  let running = false
  let ticking = false
  let activeTargetId = null
  let lastEquipmentTick = 0
  let lastWeaponTick = 0

  async function tick() {
    if (!running || ticking || !bot.entity || !bot.pathfinder) return
    ticking = true

    try {
      if (recovery.consumeRepathRequest()) {
        const target = targets.findBestTarget(true)
        if (target) movement.recover(target)
      }

      if (recovery.isCoolingDown()) {
        state.transition(STATES.RECOVER, 'pathfinding cooldown')
        movement.stop()
        return
      }

      const now = Date.now()
      if (now - lastEquipmentTick >= config.equipment.refreshMs) {
        lastEquipmentTick = now
        await equipment.tick()
      }

      const target = targets.findBestTarget()
      if (!target) {
        activeTargetId = null
        state.transition(STATES.IDLE, 'no eligible target')
        movement.stop()
        defense.lowerShield()
        return
      }

      if (activeTargetId !== target.entity.id) {
        activeTargetId = target.entity.id
        state.transition(STATES.ACQUIRE, `target ${target.username}`)
      }
      const distance = distanceBetween(bot.entity.position, target.entity.position)

      const defenseAction = await defense.tick(target)
      if (defenseAction !== 'none' && defenseAction !== 'busy') {
        state.transition(STATES.DEFEND, defenseAction)
        movement.stop()
        return
      }

      if (defense.shouldRetreat()) {
        state.transition(STATES.RETREAT, `health ${bot.health}`)
        movement.retreat(target)
        return
      }

      defense.lowerShield()

      if (config.equipment.autoEquipWeapon && now - lastWeaponTick >= config.equipment.refreshMs) {
        lastWeaponTick = now
        await equipment.equipBestWeapon()
      }

      if (distance > config.chaseRange) {
        state.transition(STATES.CHASE, `${distance.toFixed(1)} blocks from ${target.username}`)
      } else {
        state.transition(STATES.ENGAGE, `engaging ${target.username}`)
      }

      movement.chase(target, distance)
      await combat.tick(target, distance)
    } catch (error) {
      log(`[Combat] Controller tick failed: ${error.stack || error.message}`)
      state.transition(STATES.RECOVER, 'controller error')
      movement.stop()
    } finally {
      ticking = false
    }
  }

  function onDeath() {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
    activeTargetId = null
    lastEquipmentTick = 0
    lastWeaponTick = 0
    state.transition(STATES.RECOVER, 'bot died')
    movement.stop()
    defense.reset()
    combat.reset()
    equipment.reset()
    targets.clear()
  }

  function start() {
    if (!config.enabled) {
      log('[Combat] Combat is disabled by config.')
      return controller
    }
    if (running) return controller
    running = true
    recovery.start()

    const startLoop = () => {
      if (!running || interval) return
      try {
        movement.start()
      } catch (error) {
        running = false
        log(`[Combat] Could not start movement controller: ${error.message}`)
        return
      }

      targets.clear()
      activeTargetId = null
      lastEquipmentTick = 0
      lastWeaponTick = 0
      state.reset('spawned')
      log(`[Combat] Controller ready. Target mode: ${config.targetMode}.`)
      if (config.targetMode === 'allowlist' && config.allowedTargets.length === 0) {
        log('[Combat] No allowedTargets configured; the bot will not attack anyone yet.')
      }
      interval = setInterval(tick, config.tickIntervalMs)
    }

    bot.on('spawn', startLoop)
    bot.on('death', onDeath)
    bot.on('end', () => controller.stop())
    bot.on('kicked', () => controller.stop())

    if (bot.entity) startLoop()
    return controller
  }

  function stop() {
    running = false
    if (interval) {
      clearInterval(interval)
      interval = null
    }
    movement.stop()
    defense.reset()
    combat.reset()
    targets.clear()
    activeTargetId = null
    state.reset('stopped')
    return controller
  }

  const controller = {
    start,
    stop,
    tick,
    get state() { return state.current },
    get target() { return targets.cachedTarget },
    get config() { return config },
    components: { state, targets, equipment, movement, defense, combat, recovery }
  }

  return controller
}

module.exports = { createCombatController }
