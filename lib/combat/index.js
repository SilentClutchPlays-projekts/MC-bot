'use strict'

const { normalizeCombatConfig } = require('./config')
const { CombatState, STATES } = require('./combat-state')

const {
  TargetManager,
  distanceBetween,
  horizontalDistanceBetween,
  verticalDistanceBetween
} = require('./target-manager')

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

  const equipment = new EquipmentManager(
    bot,
    {
      ...config.equipment,
      weaponPriority: config.weaponPriority
    },
    log
  )

  const movement = new MovementController(
    bot,
    {
      ...config,
      ...config.movement
    },
    log
  )

  const defense = new DefenseManager(
    bot,
    config.defense,
    equipment,
    movement,
    log
  )

  const combat = new CombatEngine(
    bot,
    config,
    equipment,
    targets,
    log
  )

  const recovery = new RecoveryManager(
    bot,
    config.recovery,
    log
  )

  let running = false
  let physicsListenerBound = false
  let lifecycleListenersBound = false

  let lastTickAt = 0
  let lastEquipmentTick = 0

  let equipmentTaskBusy = false
  let defenseTaskBusy = false

  let activeTargetId = null

  function detachPhysicsListener() {
    if (!physicsListenerBound) return

    bot.removeListener('physicsTick', tick)
    physicsListenerBound = false
  }

  function startLoop() {
    if (!running || physicsListenerBound || !bot.entity) {
      return
    }

    try {
      movement.start()
    } catch (error) {
      log(`[Combat] Could not start movement controller: ${error.message}`)
      return
    }

    targets.clear()
    combat.reset()

    activeTargetId = null
    lastTickAt = 0
    lastEquipmentTick = 0

    state.reset('spawned')

    bot.on('physicsTick', tick)
    physicsListenerBound = true

    log(`[Combat] Controller ready. Target mode: ${config.targetMode}.`)

    if (
      config.targetMode === 'allowlist' &&
      config.allowedTargets.length === 0
    ) {
      log('[Combat] No allowedTargets configured; the bot will not attack anyone yet.')
    }
  }

  function runEquipmentTasks(now, equipWeapon = true) {
    // Inventory operations share the same window. Never equip armor/weapon
    // while the defensive controller is in the middle of eating or healing.
    if (
      equipmentTaskBusy ||
      defenseTaskBusy ||
      defense.busy ||
      equipment.busy ||
      now - lastEquipmentTick < config.equipment.refreshMs
    ) {
      return
    }

    lastEquipmentTick = now
    equipmentTaskBusy = true

    ;(async () => {
      await equipment.tick()

      if (
        equipWeapon &&
        config.equipment.autoEquipWeapon &&
        !defense.busy
      ) {
        await equipment.equipBestWeapon()
      }
    })().catch(error => {
      log(`[Combat] Equipment task failed: ${error.stack || error.message}`)
    }).finally(() => {
      equipmentTaskBusy = false
    })
  }

  function runDefenseTask(target) {
    if (defenseTaskBusy || defense.busy) return

    // Set the lock synchronously so the equipment scheduler cannot start
    // another inventory operation in this same physics tick.
    defenseTaskBusy = true

    Promise.resolve().then(() => defense.tick(target)).then(action => {
      if (action && action !== 'none' && action !== 'busy') {
        state.transition(STATES.DEFEND, action)
        movement.stop()
        combat.clearTarget()
      }
    }).catch(error => {
      log(`[Combat] Defense task failed: ${error.stack || error.message}`)
    }).finally(() => {
      defenseTaskBusy = false
    })
  }

  function tick() {
    if (!running || !bot.entity || !bot.pathfinder) {
      return
    }

    const now = Date.now()

    if (now - lastTickAt < config.tickIntervalMs) {
      return
    }

    lastTickAt = now

    try {
      if (recovery.isCoolingDown()) {
        state.transition(STATES.RECOVER, 'pathfinding cooldown')
        movement.stop()
        combat.clearTarget()
        return
      }

      if (recovery.consumeRepathRequest()) {
        const recoveryTarget = targets.findBestTarget(true)

        if (recoveryTarget) {
          movement.recover(recoveryTarget)
        }
      }

      const target = targets.findBestTarget()

      if (!target) {
        if (activeTargetId !== null) {
          activeTargetId = null
          movement.stop()
          combat.clearTarget()
        }

        state.transition(STATES.IDLE, 'no eligible target')
        defense.lowerShield()

        // Keep the existing automatic food/healing behaviour alive while idle.
        runDefenseTask(null)
        runEquipmentTasks(now, false)

        return
      }

      if (activeTargetId !== target.entity.id) {
        activeTargetId = target.entity.id

        state.transition(
          STATES.ACQUIRE,
          `target ${target.username}`
        )
      }

      runDefenseTask(target)
      runEquipmentTasks(now)

      // Do not fight while the existing defence system is consuming something.
      if (defense.busy) {
        movement.stop()
        combat.clearTarget()
        return
      }

      if (defense.shouldRetreat()) {
        state.transition(
          STATES.RETREAT,
          `health ${bot.health}`
        )

        movement.retreat(target)
        combat.clearTarget()
        return
      }

      defense.lowerShield()

      const distance = distanceBetween(
        bot.entity.position,
        target.entity.position
      )

      const horizontalDistance = horizontalDistanceBetween(
        bot.entity.position,
        target.entity.position
      )

      const verticalDistance = verticalDistanceBetween(
        bot.entity.position,
        target.entity.position
      )

      const engaging =
        horizontalDistance <= config.movement.engageRange &&
        verticalDistance <= config.movement.engageVerticalTolerance

      if (engaging) {
        state.transition(
          STATES.ENGAGE,
          `engaging ${target.username}`
        )
      } else {
        state.transition(
          STATES.CHASE,
          `${distance.toFixed(1)} blocks from ${target.username}`
        )
      }

      movement.chase(target)
      combat.tick(target)
    } catch (error) {
      log(`[Combat] Controller tick failed: ${error.stack || error.message}`)

      state.transition(STATES.RECOVER, 'controller error')

      movement.stop()
      combat.clearTarget()
    }
  }

  function onDeath() {
    detachPhysicsListener()

    activeTargetId = null
    lastEquipmentTick = 0

    state.transition(STATES.RECOVER, 'bot died')

    movement.reset()
    defense.reset()
    combat.reset()
    equipment.reset()
    targets.clear()
    recovery.reset()
  }

  function onDisconnect() {
    stop()
  }

  function bindLifecycleListeners() {
    if (lifecycleListenersBound) return

    bot.on('spawn', startLoop)
    bot.on('death', onDeath)
    bot.on('end', onDisconnect)
    bot.on('kicked', onDisconnect)

    lifecycleListenersBound = true
  }

  function unbindLifecycleListeners() {
    if (!lifecycleListenersBound) return

    bot.removeListener('spawn', startLoop)
    bot.removeListener('death', onDeath)
    bot.removeListener('end', onDisconnect)
    bot.removeListener('kicked', onDisconnect)

    lifecycleListenersBound = false
  }

  function start() {
    if (!config.enabled) {
      log('[Combat] Combat is disabled by config.')
      return controller
    }

    if (running) return controller

    running = true

    recovery.start()
    bindLifecycleListeners()

    if (bot.entity) {
      startLoop()
    }

    return controller
  }

  function stop() {
    running = false

    detachPhysicsListener()
    unbindLifecycleListeners()

    movement.stop()
    defense.reset()
    combat.reset()
    targets.clear()
    recovery.reset()

    activeTargetId = null
    lastTickAt = 0

    state.reset('stopped')

    return controller
  }

  const controller = {
    start,
    stop,
    tick,

    get state() {
      return state.current
    },

    get target() {
      return targets.cachedTarget
    },

    get config() {
      return config
    },

    components: {
      state,
      targets,
      equipment,
      movement,
      defense,
      combat,
      recovery
    }
  }

  return controller
}

module.exports = { createCombatController }
