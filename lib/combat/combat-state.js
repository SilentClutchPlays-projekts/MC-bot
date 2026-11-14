'use strict'

const STATES = Object.freeze({
  IDLE: 'IDLE',
  ACQUIRE: 'ACQUIRE',
  CHASE: 'CHASE',
  ENGAGE: 'ENGAGE',
  DEFEND: 'DEFEND',
  RETREAT: 'RETREAT',
  RECOVER: 'RECOVER'
})

class CombatState {
  constructor(log = () => {}) {
    this.current = STATES.IDLE
    this.previous = null
    this.changedAt = Date.now()
    this.log = log
  }

  transition(next, reason = '') {
    if (!Object.values(STATES).includes(next)) {
      throw new Error(`Unknown combat state: ${next}`)
    }
    if (next === this.current) return false

    this.previous = this.current
    this.current = next
    this.changedAt = Date.now()
    this.log(`[Combat] ${this.previous} -> ${next}${reason ? ` (${reason})` : ''}`)
    return true
  }

  reset(reason = 'reset') {
    this.transition(STATES.IDLE, reason)
  }
}

module.exports = { CombatState, STATES }
