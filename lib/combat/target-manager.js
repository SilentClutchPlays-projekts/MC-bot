'use strict'

function distanceBetween(a, b) {
  if (!a || !b) return Infinity

  if (typeof a.distanceTo === 'function') {
    return a.distanceTo(b)
  }

  if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) {
    return Infinity
  }

  return Math.hypot(
    a.x - b.x,
    a.y - b.y,
    a.z - b.z
  )
}

function horizontalDistanceBetween(a, b) {
  if (!a || !b || ![a.x, a.z, b.x, b.z].every(Number.isFinite)) {
    return Infinity
  }

  return Math.hypot(a.x - b.x, a.z - b.z)
}

function verticalDistanceBetween(a, b) {
  if (!a || !b || !Number.isFinite(a.y) || !Number.isFinite(b.y)) {
    return Infinity
  }

  return Math.abs(a.y - b.y)
}

function getTeam(bot, username) {
  if (!bot || !bot.teamMap || !username) return null

  if (bot.teamMap instanceof Map) {
    return bot.teamMap.get(username) || null
  }

  return bot.teamMap[username] || null
}

function sameTeam(bot, username) {
  const ownTeam = getTeam(bot, bot.username)
  const otherTeam = getTeam(bot, username)

  if (!ownTeam || !otherTeam) return false
  if (ownTeam === otherTeam) return true

  return Boolean(
    ownTeam.name &&
    otherTeam.name &&
    ownTeam.name === otherTeam.name
  )
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

    // Entity ID -> last position and smoothed velocity.
    this.tracking = new Map()
  }

  isEligible(player) {
    if (!player || !player.entity || !player.username || !player.entity.position) {
      return false
    }

    if (player.username === this.bot.username) return false
    if (player.entity.isValid === false) return false

    if (
      this.bot.game &&
      ['creative', 'spectator'].includes(this.bot.game.gameMode)
    ) {
      return false
    }

    if (player.gamemode === 1 || player.gamemode === 3) {
      return false
    }

    const username = player.username.toLowerCase()

    const protectedNames = new Set(
      [...this.config.hitIgnore, ...this.config.friends]
        .map(name => name.toLowerCase())
    )

    if (protectedNames.has(username)) return false

    if (this.config.targetMode === 'allowlist') {
      const allowed = new Set(
        this.config.allowedTargets.map(name => name.toLowerCase())
      )

      if (!allowed.has(username)) return false
    }

    if (
      this.config.ignoreSameTeam &&
      sameTeam(this.bot, player.username)
    ) {
      return false
    }

    return true
  }

  sampleEntity(entity, now = Date.now()) {
    if (!entity || entity.id == null || !entity.position) return null

    const p = entity.position

    if (![p.x, p.y, p.z].every(Number.isFinite)) {
      return null
    }

    const previous = this.tracking.get(entity.id)

    if (!previous) {
      const first = {
        x: p.x,
        y: p.y,
        z: p.z,
        vx: 0,
        vy: 0,
        vz: 0,
        at: now,
        seenAt: now
      }

      this.tracking.set(entity.id, first)
      return first
    }

    const elapsed = (now - previous.at) / 1000

    let vx = previous.vx
    let vy = previous.vy
    let vz = previous.vz

    if (elapsed >= 0.035 && elapsed <= 1.5) {
      let rawX = (p.x - previous.x) / elapsed
      let rawY = (p.y - previous.y) / elapsed
      let rawZ = (p.z - previous.z) / elapsed

      const speed = Math.hypot(rawX, rawY, rawZ)
      const maxSpeed = this.config.maxTargetSpeed

      // A sudden server teleport should not create an enormous aim lead.
      if (speed > maxSpeed * 1.8) {
        vx = 0
        vy = 0
        vz = 0
      } else {
        if (speed > maxSpeed) {
          const scale = maxSpeed / speed
          rawX *= scale
          rawY *= scale
          rawZ *= scale
        }

        const alpha = this.config.targetVelocitySmoothing

        vx = previous.vx * (1 - alpha) + rawX * alpha
        vy = previous.vy * (1 - alpha) + rawY * alpha
        vz = previous.vz * (1 - alpha) + rawZ * alpha
      }
    } else if (elapsed > 1.5) {
      vx = 0
      vy = 0
      vz = 0
    }

    const updated = {
      x: p.x,
      y: p.y,
      z: p.z,
      vx,
      vy,
      vz,
      at: now,
      seenAt: now
    }

    this.tracking.set(entity.id, updated)
    return updated
  }

  getTracking(entity) {
    if (!entity || entity.id == null) return null

    const data = this.tracking.get(entity.id)
    return data ? { ...data } : null
  }

  getPredictedPosition(entity, leadMs = this.config.targetPredictionMs) {
    const p = entity && entity.position
    if (!p) return null

    const tracking = this.getTracking(entity)
    const lead = Math.max(0, Math.min(0.25, Number(leadMs) / 1000 || 0))

    return {
      x: p.x + (tracking ? tracking.vx * lead : 0),
      y: p.y + (tracking ? tracking.vy * lead : 0),
      z: p.z + (tracking ? tracking.vz * lead : 0)
    }
  }

  score(player, horizontalDistance, verticalDistance) {
    const stickyBonus =
      player.entity.id === this.currentTargetId
        ? this.config.targetSwitchMargin
        : 0

    return horizontalDistance + verticalDistance * 0.35 - stickyBonus
  }

  findBestTarget(force = false) {
    const now = Date.now()

    // Keep the locked target's velocity estimate fresh between full scans.
    if (this.cachedTarget) {
      const currentPlayer = this.bot.players &&
        this.bot.players[this.cachedTarget.username]

      if (
        !currentPlayer ||
        !currentPlayer.entity ||
        currentPlayer.entity.id !== this.cachedTarget.entity.id ||
        !this.isEligible(currentPlayer)
      ) {
        this.cachedTarget = null
        this.currentTargetId = null
        this.currentTargetName = null
      } else {
        this.cachedTarget = currentPlayer
        this.sampleEntity(currentPlayer.entity, now)
      }
    }

    if (
      !force &&
      now - this.lastScanAt < this.config.scanIntervalMs
    ) {
      return this.cachedTarget
    }

    this.lastScanAt = now

    if (!this.bot.entity || !this.bot.players) {
      this.cachedTarget = null
      this.currentTargetId = null
      this.currentTargetName = null
      return null
    }

    const botPosition = this.bot.entity.position

    let bestPlayer = null
    let bestScore = Infinity

    for (const player of Object.values(this.bot.players)) {
      if (!this.isEligible(player)) continue

      this.sampleEntity(player.entity, now)

      const horizontalDistance = horizontalDistanceBetween(
        botPosition,
        player.entity.position
      )

      const verticalDistance = verticalDistanceBetween(
        botPosition,
        player.entity.position
      )

      if (
        !Number.isFinite(horizontalDistance) ||
        !Number.isFinite(verticalDistance)
      ) {
        continue
      }

      if (horizontalDistance > this.config.maxTargetDistance) continue
      if (verticalDistance > this.config.maxTargetVerticalDistance) continue

      const score = this.score(
        player,
        horizontalDistance,
        verticalDistance
      )

      if (score < bestScore) {
        bestPlayer = player
        bestScore = score
      }
    }

    this.cachedTarget = bestPlayer
    this.currentTargetId = bestPlayer ? bestPlayer.entity.id : null
    this.currentTargetName = bestPlayer ? bestPlayer.username : null

    // Remove old entities so the tracking cache cannot grow indefinitely.
    for (const [id, sample] of this.tracking) {
      if (now - sample.seenAt > 30000) {
        this.tracking.delete(id)
      }
    }

    return bestPlayer
  }

  clear() {
    this.currentTargetId = null
    this.currentTargetName = null
    this.cachedTarget = null
    this.lastScanAt = 0
    this.tracking.clear()
  }
}

module.exports = {
  TargetManager,
  distanceBetween,
  horizontalDistanceBetween,
  verticalDistanceBetween,
  sameTeam
}
