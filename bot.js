'use strict'

// Existing bot connection and non-combat modules are preserved.
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const config = require('./config.json')
const setupAuthMe = require('./lib/authme')
const setupViewer = require('./lib/viewer')
const setupTalk = require('./lib/talk')
const setupHit = require('./lib/hit')

function startBot() {
  console.log(`[System] Connecting to ${config.host}:${config.port}...`)

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version || false
  })

  bot.loadPlugin(pathfinder)

  setupAuthMe(bot, config)
  setupViewer(bot, config)
  setupTalk(bot, config)
  setupHit(bot, config)

  // Jumping is now coordinated by the combat movement controller.
  // Do not start the old independent setupJump loop here.

  bot.on('login', () => {
    console.log('[System] Bot logged into the server network.')
  })

  bot.on('spawn', () => {
    console.log(`[System] ${config.username} has spawned in the world!`)
  })

  bot.on('messagestr', msg => {
    console.log('[CHAT]:', msg)
  })

  bot.on('kicked', reason => {
    console.log('[Warning] Bot was kicked! Reason:', reason)
  })

  bot.on('error', err => {
    console.log('[Error] Connection error occurred:', err)
  })

  bot.on('end', reason => {
    console.log('[System] Disconnected from server. Reason:', reason)
    console.log('[System] Reconnecting in 5 seconds...')
    setTimeout(startBot, 5000)
  })
}

startBot()
