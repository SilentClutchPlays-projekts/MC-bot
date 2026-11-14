
'use strict'

const { Movements, goals } = require('mineflayer-pathfinder')

const {
  distanceBetween,
  horizontalDistanceBetween,
  verticalDistanceBetween
} = require('./target-manager')

class MovementController {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log
    this.movements = null
    this.currentTargetId = null
    this.lastGoalAt = 0
    this.lastRetreatGoalAt = 0
    this.lastStrafeChangeAt = 0
    this.strafeDirection = 'left'
    this.lastJumpAt = 0
    this.jumpReleaseTimer = null
    this.manualMode = false
    this.retreating = false
    this.wasStopped = true
  }

  start() {
    if (!this.bot.pathfinder) {
      throw new Error(
        'Pathfinder plugin is not loaded.'
      )
    }

    this.movements = new Movements(this.bot)

    this.movements.canDig = Boolean(this.config.canDig)
    this.movements.canOpenDoors = Boolean(this.config.canOpenDoors)
    this.movements.allowParkour = Boolean(this.config.allowParkour)
    this.movements.allowSprinting = Boolean(this.config.allowSprinting)

    this.movements.allow1by1towers = false
    this.movements.scaffoldingBlocks = []

    this.bot.pathfinder.setMovements(this.movements)
  }

  setControl(control, value) {
    if (!this.bot.entity) return
    if (typeof this.bot.setControlState !== 'function') return

    this.bot.setControlState(control, Boolean(value))
  }

  clearManualControls() {
    for (const control of [
      'forward',
      'back',
      'left',
      'right',
      'jump',
      'sprint',
      'sneak'
    ]) {
      this.setControl(control, false)
    }

    if (this.jumpReleaseTimer) {
      clearTimeout(this.jumpReleaseTimer)
      this.jumpReleaseTimer = null
    }
  }

  stop() {
    if (this.bot.pathfinder && this.bot.pathfinder.goal) {
      this.bot.pathfinder.setGoal(null)
    }

    if (!this.wasStopped || this.manualMode) {
      this.clearManualControls()
    }

    this.currentTargetId = null
    this.manualMode = false
    this.retreating = false
    this.wasStopped = true
  }

  chase(target, distance) {
    if (
      !target ||
      !target.entity ||
      !this.bot.pathfinder ||
      !this.bot.entity
    ) return

    const now = Date.now()

    if (this.retreating) {
      if (this.bot.pathfinder.goal) {
        this.bot.pathfinder.setGoal(null)
      }

      this.retreating = false
      this.lastGoalAt = 0
    }

    const botPosition = this.bot.entity.position
    const targetPosition = target.entity.position

    const horizontalDistance = horizontalDistanceBetween(
      botPosition,
      targetPosition
    )

    const verticalDistance = verticalDistanceBetween(
      botPosition,
      targetPosition
    )

    if (
      !Number.isFinite(horizontalDistance) ||
      !Number.isFinite(verticalDistance)
    ) return

    const engageVerticalTolerance =
      this.config.engageVerticalTolerance || 1.25

    const closeEnough =
      horizontalDistance <= this.config.chaseRange &&
      verticalDistance <= engageVerticalTolerance

    const targetChanged =
      this.currentTargetId !== target.entity.id

    // Only use manual combat movement when the bot is
    // horizontally AND vertically close to the target.
    if (closeEnough) {
      if (!this.manualMode) {
        this.bot.pathfinder.setGoal(null)
        this.clearManualControls()
        this.manualMode = true
      }

      this.currentTargetId = target.entity.id
      this.wasStopped = false

      this.fightMovement(distance)
      return
    }

    // Otherwise, continue pathfinding toward the player.
    if (this.manualMode) {
      this.clearManualControls()
    }

    this.manualMode = false
    this.wasStopped = false

    const refreshDue =
      now - this.lastGoalAt >= this.config.chaseGoalRefreshMs

    if (
      targetChanged ||
      refreshDue ||
      !this.bot.pathfinder.goal
    ) {
      const followRange = this.config.followGoalRange || 1

      if (typeof goals.GoalFollow === 'function') {
        this.bot.pathfinder.setGoal(
          new goals.GoalFollow(target.entity, followRange),
          true
        )
      } else {
        const p = targetPosition

        this.bot.pathfinder.setGoal(
          new goals.GoalNear(
            Math.floor(p.x),
            Math.floor(p.y),
            Math.floor(p.z),
            followRange
          ),
          true
        )
      }

      this.lastGoalAt = now
    }

    this.currentTargetId = target.entity.id
  }

  fightMovement(distance) {
    const now = Date.now()

    if (
      this.config.strafe &&
      now - this.lastStrafeChangeAt >= this.config.strafeChangeMs
    ) {
      this.strafeDirection =
        this.strafeDirection === 'left' ? 'right' : 'left'

      this.lastStrafeChangeAt = now
    }

    const tooClose = distance < this.config.minCombatDistance
    const tooFar = distance > this.config.attackRange - 0.15

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
      Boolean(this.config.allowSprinting && tooFar)
    )

    const jumpDue =
      now - this.lastJumpAt >= this.config.tacticalJumpIntervalMs

    const jumpDistanceOk =
      distance >= this.config.tacticalJumpMinDistance &&
      distance <= this.config.tacticalJumpMaxDistance

    if (
      this.config.tacticalJump &&
      jumpDue &&
      jumpDistanceOk &&
      this.bot.entity &&
      this.bot.entity.onGround &&
      !this.jumpReleaseTimer
    ) {
      this.setControl('jump', true)
      this.lastJumpAt = now

      this.jumpReleaseTimer = setTimeout(() => {
        this.setControl('jump', false)
        this.jumpReleaseTimer = null
      }, 120)
    }
  }

  retreat(target) {
    if (
      !target ||
      !target.entity ||
      !this.bot.entity ||
      !this.bot.pathfinder
    ) return

    const now = Date.now()

    if (
      now - this.lastRetreatGoalAt <
        this.config.retreatGoalRefreshMs &&
      this.bot.pathfinder.goal
    ) return

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
    ) return

    this.bot.pathfinder.setGoal(null)
    this.currentTargetId = null
    this.lastGoalAt = 0
    this.manualMode = false
    this.retreating = false

    this.chase(
      target,
      distanceBetween(
        this.bot.entity.position,
        target.entity.position
      )
    )
  }

  reset() {
    this.stop()
    this.lastGoalAt = 0
    this.lastRetreatGoalAt = 0
    this.lastStrafeChangeAt = 0
    this.lastJumpAt = 0
  }
}

module.exports = { MovementController }
