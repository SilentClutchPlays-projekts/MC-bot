'use strict'

function distanceBetween(a, b) {
  if (!a || !b || typeof a.distanceTo !== 'function') return Infinity
  return a.distanceTo(b)
}

function getTeam(bot, username) {
  if (!bot || !bot.teamMap || !username) return null
  if (bot.teamMap instanceof Map) return bot.teamMap.get(username) || null
  return bot.teamMap[username] || null
}

function sameTeam(bot, username) {
  const ownTeam = getTeam(bot, bot.username)
  const otherTeam = getTeam(bot, username)
  if (!ownTeam || !otherTeam) return false
  if (ownTeam === otherTeam) return true
  return Boolean(ownTeam.name && otherTeam.name && ownTeam.name === otherTeam.name)
}

class TargetManager {
  constructor(bot, config, log = () => {}) {
    this.bot = bot
    this.config = config
    this.log = log
    this.currentTargetId = null
    this.currentTargetName = null
    this.lastScanAt = 0
    this.cachedTarget = null
  }

  isEligible(player) {
    if (!player || !player.entity || !player.username) return false
    if (player.username === this.bot.username) return false
    if (this.bot.game && (this.bot.game.gameMode === 'creative' || this.bot.game.gameMode === 'spectator')) return false
    if (player.gamemode === 1 || player.gamemode === 3) return false

    const protectedNames = new Set([
      ...this.config.hitIgnore,
      ...this.config.friends
    ].map(name => name.toLowerCase()))
    if (protectedNames.has(player.username.toLowerCase())) return false

    if (this.config.targetMode === 'allowlist') {
      const allowed = new Set(this.config.allowedTargets.map(name => name.toLowerCase()))
      if (!allowed.has(player.username.toLowerCase())) return false
    }

    if (this.config.ignoreSameTeam && sameTeam(this.bot, player.username)) return false
    return true
  }

  score(player, distance) {
    // Lower is better. A small stickiness bonus prevents target flickering.
    const stickyBonus = player.entity.id === this.currentTargetId ? this.config.targetSwitchMargin : 0
    return distance - stickyBonus
  }

  findBestTarget(force = false) {
    const now = Date.now()
    if (!force && now - this.lastScanAt < this.config.scanIntervalMs) return this.cachedTarget
    this.lastScanAt = now

    if (!this.bot.entity || !this.bot.players) {
      this.cachedTarget = null
      return null
    }

    let best = null
    let bestScore = Infinity

    for (const player of Object.values(this.bot.players)) {
      if (!this.isEligible(player)) continue
      const distance = distanceBetween(this.bot.entity.position, player.entity.position)
      if (!Number.isFinite(distance) || distance > this.config.maxTargetDistance) continue

      const score = this.score(player, distance)
      if (score < bestScore) {
        best = player
        bestScore = score
      }
    }

    if (best) {
      this.currentTargetId = best.entity.id
      this.currentTargetName = best.username
    } else {
      this.currentTargetId = null
      this.currentTargetName = null
    }

    this.cachedTarget = best
    return best
  }

  clear() {
    this.currentTargetId = null
    this.currentTargetName = null
    this.cachedTarget = null
    this.lastScanAt = 0
  }
}

module.exports = { TargetManager, distanceBetween, sameTeam }
