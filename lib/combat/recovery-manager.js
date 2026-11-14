'use strict'

class RecoveryManager {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log

    this.repathRequested = false
    this.stuckTimes = []
    this.disabledUntil = 0

    this.lastRepathAt = 0
    this.lastStuckEventAt = 0

    this.bound = false
    this.onPathReset = this.onPathReset.bind(this)
  }

  start() {
    if (
      this.bound ||
      !this.config.enabled ||
      !this.bot.pathfinder
    ) {
      return
    }

    this.bound = true
    this.bot.on('path_reset', this.onPathReset)
  }

  onPathReset(reason) {
    if (reason !== 'stuck') return

    const now = Date.now()

    this.repathRequested = true

    // Pathfinder can emit several reset events for one failure. Treat a
    // burst as one stuck incident rather than counting every event.
    if (now - this.lastStuckEventAt < 350) {
      return
    }

    this.lastStuckEventAt = now

    this.stuckTimes = this.stuckTimes.filter(
      time => now - time <= this.config.repeatedStuckWindowMs
    )

    this.stuckTimes.push(now)

    this.log('[Recovery] Pathfinder reported a stuck route; a follow-goal rebuild was queued.')

    if (this.stuckTimes.length >= this.config.repeatedStuckLimit) {
      const shortPause = Math.max(
        1800,
        this.config.stuckCooldownMs * 2
      )

      this.disabledUntil = now + shortPause
      this.stuckTimes = []

      this.log(
        `[Recovery] Repeated stuck routes; pausing combat movement for ${shortPause}ms.`
      )
    }
  }

  isCoolingDown() {
    return Date.now() < this.disabledUntil
  }

  consumeRepathRequest() {
    if (!this.repathRequested) return false

    const now = Date.now()

    if (now - this.lastRepathAt < this.config.stuckCooldownMs) {
      return false
    }

    this.repathRequested = false
    this.lastRepathAt = now

    return true
  }

  reset() {
    this.repathRequested = false
    this.stuckTimes = []
    this.disabledUntil = 0

    this.lastRepathAt = 0
    this.lastStuckEventAt = 0
  }
}

module.exports = { RecoveryManager }
