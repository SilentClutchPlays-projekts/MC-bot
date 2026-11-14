'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { weaponScore, armorScore } = require('../../lib/combat/equipment-manager')

test('netherite and diamond weapons outrank lower material tiers', () => {
  const priority = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword']
  assert.ok(weaponScore({ name: 'netherite_sword' }, priority) > weaponScore({ name: 'iron_sword' }, priority))
})

test('armor score recognizes material tiers', () => {
  assert.ok(armorScore({ name: 'netherite_chestplate' }) > armorScore({ name: 'iron_chestplate' }))
})
