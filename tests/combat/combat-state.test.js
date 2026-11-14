'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { CombatState, STATES } = require('../../lib/combat/combat-state')

test('combat state transitions and ignores duplicate transitions', () => {
  const messages = []
  const state = new CombatState(message => messages.push(message))
  assert.equal(state.current, STATES.IDLE)
  assert.equal(state.transition(STATES.CHASE, 'target acquired'), true)
  assert.equal(state.current, STATES.CHASE)
  assert.equal(state.transition(STATES.CHASE), false)
  assert.equal(messages.length, 1)
  assert.throws(() => state.transition('BROKEN'), /Unknown combat state/)
})
