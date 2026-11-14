'use strict'

const { Movements, goals } = require('mineflayer-pathfinder')

const {
  horizontalDistanceBetween,
  verticalDistanceBetween
} = require('./target-manager')

const CONTROL_STATES = [
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
  'sneak'
]

class MovementController {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log

    this.movements = null
    this.started = false

    this.currentTargetId = null
    this.activeFollowGoal = null

    this.lastProgressAt = 0
    this.lastProgressDistance = Infinity
    this.lastForcedRepathAt = 0

    this.lastRetreatGoalAt = 0

    this.lastStrafeChangeAt = 0
    this.strafeDirection = 'left'
    this.strafeUntil = 0

    this.lastJumpAt = 0
    this.jumpReleaseAt = 0
    this.jumpHeld = false

    this.manualMode = false
    this.retreating = false
    this.wasStopped = true
  }

  start() {
    if (!this.bot.pathfinder) {
      throw new Error('Pathfinder plugin is not loaded.')
    }

    if (this.started) return

    this.movements = new Movements(this.bot)

    this.movements.canDig = Boolean(this.config.canDig)
    this.movements.canOpenDoors = Boolean(this.config.canOpenDoors)
    this.movements.allowParkour = Boolean(this.config.allowParkour)
    this.movements.allowSprinting = Boolean(this.config.allowSprinting)

    this.movements.allow1by1towers = false
    this.movements.scaffoldingBlocks = []

    this.bot.pathfinder.setMovements(this.movements)

    this.started = true
  }

  setControl(control, value) {
    if (
      !this.bot.entity ||
      typeof this.bot.setControlState !== 'function'
    ) {
      return
    }

    const next = Boolean(value)

    if (
      typeof this.bot.getControlState === 'function' &&
      this.bot.getControlState(control) === next
    ) {
      return
    }

    this.bot.setControlState(control, next)
  }

  clearManualControls() {
    for (const control of CONTROL_STATES) {
      this.setControl(control, false)
    }

    this.jumpHeld = false
    this.jumpReleaseAt = 0
    this.strafeUntil = 0
  }

  clearGoal() {
    if (this.bot.pathfinder && this.bot.pathfinder.goal) {
      this.bot.pathfinder.setGoal(null)
    }

    this.activeFollowGoal = null
  }

  stop() {
    this.clearGoal()

    if (!this.wasStopped || this.manualMode || this.jumpHeld) {
      this.clearManualControls()
    }

    this.currentTargetId = null
    this.manualMode = false
    this.retreating = false
    this.wasStopped = true

    this.lastProgressDistance = Infinity
    this.lastProgressAt = 0
  }

  setFollowGoal(target, force = false) {
    if (!target || !target.entity || !this.bot.pathfinder) return

    const sameGoal =
      this.activeFollowGoal &&
      this.activeFollowGoal.entity === target.entity &&
      this.bot.pathfinder.goal === this.activeFollowGoal

    if (!force && sameGoal) return

    const goal = new goals.GoalFollow(
      target.entity,
      this.config.followGoalRange || 1.5
    )

    // Dynamic mode lets Pathfinder follow the moving entity.
    this.bot.pathfinder.setGoal(goal, true)

    this.activeFollowGoal = goal
    this.lastForcedRepathAt = Date.now()
  }

  chase(target) {
    if (
      !target ||
      !target.entity ||
      !target.entity.position ||
      !this.bot.pathfinder ||
      !this.bot.entity
    ) {
      return
    }

    if (!this.started) this.start()

    const now = Date.now()

    const horizontalDistance = horizontalDistanceBetween(
      this.bot.entity.position,
      target.entity.position
    )

    const verticalDistance = verticalDistanceBetween(
      this.bot.entity.position,
      target.entity.position
    )

    if (
      !Number.isFinite(horizontalDistance) ||
      !Number.isFinite(verticalDistance)
    ) {
      return
    }

    if (this.currentTargetId !== target.entity.id) {
      this.clearGoal()
      this.clearManualControls()

      this.manualMode = false
      this.currentTargetId = target.entity.id

      this.lastProgressAt = now
      this.lastProgressDistance = horizontalDistance
      this.lastForcedRepathAt = 0
    }

    if (this.retreating) {
      this.clearGoal()
      this.retreating = false
    }

    // Stay with Pathfinder until genuinely close to melee range.
    const engageRange =
      Number(this.config.engageRange) ||
      (Number(this.config.attackRange) + 0.25)

    const inMeleeBand =
      horizontalDistance <= engageRange &&
      verticalDistance <= (
        Number(this.config.engageVerticalTolerance) || 1.65
      )

    if (inMeleeBand) {
      if (!this.manualMode) {
        this.clearGoal()
        this.clearManualControls()
        this.manualMode = true
      }

      this.wasStopped = false

      this.fightMovement(horizontalDistance, verticalDistance)
      return
    }

    if (this.manualMode) {
      this.clearManualControls()
    }

    this.manualMode = false
    this.wasStopped = false

    // Keep one dynamic GoalFollow rather than constantly replacing it.
    this.setFollowGoal(target)

    if (
      horizontalDistance <=
      this.lastProgressDistance -
        (this.config.chaseProgressThreshold || 0.3)
    ) {
      this.lastProgressDistance = horizontalDistance
      this.lastProgressAt = now
    } else if (
      !this.bot.pathfinder.isMoving() &&
      horizontalDistance > engageRange + 0.5
    ) {
      const stalledFor = now - (this.lastProgressAt || now)

      const repathCooldown =
        Number(this.config.chaseRepathCooldownMs) || 1500

      const stallLimit =
        Number(this.config.chaseStallMs) || 3000

      if (
        stalledFor >= stallLimit &&
        now - this.lastForcedRepathAt >= repathCooldown
      ) {
        this.log('[Movement] Chase stalled; rebuilding follow goal.')

        this.setFollowGoal(target, true)

        this.lastProgressAt = now
        this.lastProgressDistance = horizontalDistance
      }
    }
  }

  fightMovement(horizontalDistance, verticalDistance) {
    const now = Date.now()

    const attackRange = Number(this.config.attackRange) || 3.1
    const minDistance = Number(this.config.minCombatDistance) || 1.7

    // Maintain a stable fighting distance.
    const tooFar = horizontalDistance > attackRange - 0.1
    const tooClose = horizontalDistance < minDistance

    this.setControl('forward', tooFar)
    this.setControl('back', tooClose)
    this.setControl('sprint', false)
    this.setControl('sneak', false)

    // Optional short sidesteps. Disabled by default.
    if (this.config.strafe && !tooFar && !tooClose) {
      const interval = Number(this.config.strafeChangeMs) || 1000

      if (now - this.lastStrafeChangeAt >= interval) {
        this.strafeDirection =
          this.strafeDirection === 'left' ? 'right' : 'left'

        this.lastStrafeChangeAt = now
        this.strafeUntil = now + 160
      }

      const active = now < this.strafeUntil

      this.setControl(
        'left',
        active && this.strafeDirection === 'left'
      )

      this.setControl(
        'right',
        active && this.strafeDirection === 'right'
      )
    } else {
      this.setControl('left', false)
      this.setControl('right', false)
    }

    if (this.jumpHeld && now >= this.jumpReleaseAt) {
      this.setControl('jump', false)
      this.jumpHeld = false
      this.jumpReleaseAt = 0
    }

    // Jump only to handle a real height difference, never randomly.
    const jumpNeeded =
      verticalDistance > 0.55 &&
      verticalDistance <= 1.25

    const jumpReady =
      now - this.lastJumpAt >= (
        Number(this.config.tacticalJumpIntervalMs) || 1500
      )

    if (
      this.config.tacticalJump &&
      jumpNeeded &&
      jumpReady &&
      !this.jumpHeld &&
      this.bot.entity.onGround
    ) {
      this.setControl('jump', true)

      this.jumpHeld = true
      this.jumpReleaseAt =
        now + (Number(this.config.jumpHoldMs) || 100)

      this.lastJumpAt = now
    }
  }

  retreat(target) {
    if (
      !target ||
      !target.entity ||
      !this.bot.entity ||
      !this.bot.pathfinder
    ) {
      return
    }

    const now = Date.now()

    if (
      now - this.lastRetreatGoalAt <
        (this.config.retreatGoalRefreshMs || 1200) &&
      this.bot.pathfinder.goal
    ) {
      return
    }

    this.clearManualControls()

    this.manualMode = false
    this.retreating = true
    this.wasStopped = false

    const from = this.bot.entity.position
    const to = target.entity.position

    let dx = from.x - to.x
    let dz = from.z - to.z

    const length = Math.hypot(dx, dz) || 1

    dx /= length
    dz /= length

    const distance = this.config.retreatDistance || 8

    const destination = from.offset(
      dx * distance,
      0,
      dz * distance
    )

    this.clearGoal()

    this.bot.pathfinder.setGoal(
      new goals.GoalNear(
        Math.floor(destination.x),
        Math.floor(destination.y),
        Math.floor(destination.z),
        1
      )
    )

    this.lastRetreatGoalAt = now
  }

  recover(target) {
    if (
      !target ||
      !target.entity ||
      !this.bot.entity ||
      !this.bot.pathfinder
    ) {
      return
    }

    this.clearGoal()
    this.clearManualControls()

    this.manualMode = false
    this.retreating = false
    this.currentTargetId = target.entity.id

    this.lastProgressAt = Date.now()

    this.lastProgressDistance = horizontalDistanceBetween(
      this.bot.entity.position,
      target.entity.position
    )

    this.setFollowGoal(target, true)
  }

  reset() {
    this.stop()

    this.started = false
    this.movements = null

    this.lastForcedRepathAt = 0
    this.lastRetreatGoalAt = 0
    this.lastStrafeChangeAt = 0
    this.lastJumpAt = 0
  }
}

module.exports = { MovementController }
