'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeCombatConfig } = require('../../lib/combat/config')
const { cooldownFor, getProtocolVersion } = require('../../lib/combat/combat-engine')

test('combat defaults to an empty allowlist', () => {
  const config = normalizeCombatConfig()
  assert.equal(config.targetMode, 'allowlist')
  assert.deepEqual(config.allowedTargets, [])
})

test('version-aware cooldown distinguishes legacy and modern protocol versions', () => {
  assert.deepEqual(getProtocolVersion({ version: '1.8.9' }), { major: 1, minor: 8 })
  assert.deepEqual(getProtocolVersion({ version: '1.21.4' }), { major: 1, minor: 21 })
  const config = normalizeCombatConfig()
  assert.equal(cooldownFor({ version: '1.8.9' }, config, { name: 'iron_sword' }), config.legacyAttackCooldownMs)
  assert.equal(cooldownFor({ version: '1.21.4' }, config, { name: 'iron_axe' }), 1250)
  assert.equal(cooldownFor({ version: '1.21.4' }, config, { name: 'diamond_axe' }), 1000)
  assert.equal(cooldownFor({ version: '1.21.4' }, config, { name: 'iron_sword' }), 625)
})
