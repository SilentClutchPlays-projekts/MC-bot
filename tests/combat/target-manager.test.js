'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { TargetManager } = require('../../lib/combat/target-manager')
const { normalizeCombatConfig } = require('../../lib/combat/config')

function position(x, y = 64, z = 0) {
  return { x, y, z, distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z) } }
}

function makeBot() {
  return {
    username: 'CombatBot',
    entity: { id: 1, position: position(0) },
    game: { gameMode: 'survival' },
    teamMap: {},
    players: {
      CombatBot: { username: 'CombatBot', entity: { id: 1, position: position(0) }, gamemode: 0 },
      Alice: { username: 'Alice', entity: { id: 2, position: position(5) }, gamemode: 0 },
      Bob: { username: 'Bob', entity: { id: 3, position: position(8) }, gamemode: 0 },
      Creative: { username: 'Creative', entity: { id: 4, position: position(2) }, gamemode: 1 }
    }
  }
}

test('allowlist mode only selects explicitly allowed players', () => {
  const bot = makeBot()
  const config = normalizeCombatConfig({ targetMode: 'allowlist', allowedTargets: ['Bob'] })
  const manager = new TargetManager(bot, config)
  assert.equal(manager.findBestTarget(true).username, 'Bob')
})

test('friends and ignored players are never selected', () => {
  const bot = makeBot()
  const config = normalizeCombatConfig({ targetMode: 'all', friends: ['Alice'], hitIgnore: ['Bob'] })
  const manager = new TargetManager(bot, config)
  assert.equal(manager.findBestTarget(true), null)
})

test('same-team players are excluded when team data exists', () => {
  const bot = makeBot()
  bot.teamMap.CombatBot = { name: 'red' }
  bot.teamMap.Alice = { name: 'red' }
  const config = normalizeCombatConfig({ targetMode: 'all', ignoreSameTeam: true })
  const manager = new TargetManager(bot, config)
  assert.equal(manager.findBestTarget(true).username, 'Bob')
})

test('empty allowlist safely produces no target', () => {
  const manager = new TargetManager(makeBot(), normalizeCombatConfig())
  assert.equal(manager.findBestTarget(true), null)
})
