'use strict'

class RecoveryManager {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log
    this.repathRequested = false
    this.recoverUntil = 0
    this.stuckTimes = []
    this.disabledUntil = 0
    this.bound = false
  }

  start() {
    if (this.bound || !this.config.enabled || !this.bot.pathfinder) return
    this.bound = true
    this.bot.on('path_reset', reason => {
      if (reason !== 'stuck') return
      const now = Date.now()
      this.stuckTimes = this.stuckTimes.filter(time => now - time <= this.config.repeatedStuckWindowMs)
      this.stuckTimes.push(now)
      this.repathRequested = true
      this.recoverUntil = now + this.config.stuckCooldownMs
      this.log('[Recovery] Pathfinder reported a stuck path; requesting a new route.')

      if (this.stuckTimes.length >= this.config.repeatedStuckLimit) {
        this.disabledUntil = now + this.config.repeatedStuckWindowMs
        this.log('[Recovery] Repeated stuck paths detected; pausing chase briefly.')
        this.stuckTimes = []
      }
    })
  }

  isCoolingDown() {
    return Date.now() < this.disabledUntil
  }

  consumeRepathRequest() {
    const requested = this.repathRequested
    this.repathRequested = false
    return requested
  }

  reset() {
    this.repathRequested = false
    this.recoverUntil = 0
    this.stuckTimes = []
    this.disabledUntil = 0
  }
}

module.exports = { RecoveryManager }
