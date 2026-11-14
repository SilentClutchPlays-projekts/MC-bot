'use strict'

const { Movements, goals } = require('mineflayer-pathfinder')

const {
  distanceBetween,
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
    if (!this.bot.entity || typeof this.bot.setControlState !== 'function') {
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

    // Dynamic mode lets Pathfinder update the route as the entity moves.
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
    const targetChanged = this.currentTargetId !== target.entity.id

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

    if (targetChanged) {
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

    const inEngageBand =
      horizontalDistance <= this.config.engageRange &&
      verticalDistance <= this.config.engageVerticalTolerance

    if (inEngageBand) {
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

    // GoalFollow tracks a moving entity by itself. Do not recreate it
    // constantly; repeated replacements interrupt otherwise healthy paths.
    this.setFollowGoal(target)

    // Rebuild a route only after a real stall and a cooldown.
    if (
      horizontalDistance <=
      this.lastProgressDistance - this.config.chaseProgressThreshold
    ) {
      this.lastProgressDistance = horizontalDistance
      this.lastProgressAt = now
    } else if (
      !this.bot.pathfinder.isMoving?.() &&
      horizontalDistance > this.config.engageRange + 0.5
    ) {
      const stalledFor = now - (this.lastProgressAt || now)
      const repathReady =
        now - this.lastForcedRepathAt >= this.config.chaseRepathCooldownMs

      if (
        stalledFor >= this.config.chaseStallMs &&
        repathReady
      ) {
        this.log('[Movement] Chase made no progress; rebuilding the follow goal.')

        this.setFollowGoal(target, true)
        this.lastProgressAt = now
        this.lastProgressDistance = horizontalDistance
      }
    }
  }

  fightMovement(horizontalDistance, verticalDistance) {
    const now = Date.now()

    const tooClose = horizontalDistance < this.config.minCombatDistance
    const tooFar = horizontalDistance > this.config.attackRange - 0.25

    if (
      this.config.strafe &&
      now - this.lastStrafeChangeAt >= this.config.strafeChangeMs
    ) {
      this.strafeDirection =
        this.strafeDirection === 'left' ? 'right' : 'left'

      this.lastStrafeChangeAt = now
    }

    this.setControl('forward', tooFar)
    this.setControl('back', tooClose)

    this.setControl(
      'left',
      Boolean(
        this.config.strafe &&
        !tooClose &&
        this.strafeDirection === 'left'
      )
    )

    this.setControl(
      'right',
      Boolean(
        this.config.strafe &&
        !tooClose &&
        this.strafeDirection === 'right'
      )
    )

    this.setControl(
      'sprint',
      Boolean(this.config.allowSprinting && tooFar && !tooClose)
    )

    if (this.jumpHeld && now >= this.jumpReleaseAt) {
      this.setControl('jump', false)
      this.jumpHeld = false
      this.jumpReleaseAt = 0
    }

    const jumpDistanceOk =
      horizontalDistance >= this.config.tacticalJumpMinDistance &&
      horizontalDistance <= this.config.tacticalJumpMaxDistance

    const jumpHeightOk =
      verticalDistance <= this.config.tacticalJumpMaxVerticalDistance

    const jumpReady =
      now - this.lastJumpAt >= this.config.tacticalJumpIntervalMs

    if (
      this.config.tacticalJump &&
      jumpDistanceOk &&
      jumpHeightOk &&
      jumpReady &&
      !this.jumpHeld &&
      this.bot.entity &&
      this.bot.entity.onGround
    ) {
      this.setControl('jump', true)

      this.jumpHeld = true
      this.jumpReleaseAt = now + this.config.jumpHoldMs
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
      now - this.lastRetreatGoalAt < this.config.retreatGoalRefreshMs &&
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

    const destination = from.offset(
      dx * this.config.retreatDistance,
      0,
      dz * this.config.retreatDistance
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
