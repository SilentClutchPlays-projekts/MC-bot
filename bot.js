// Impordime vajalikud teegid ja moodulid / Import required libraries and modules
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const config = require('./config.json')
const setupAuthMe = require('./lib/authme')
const setupViewer = require('./lib/viewer')

// Peamine funktsioon boti käivitamiseks / Main function to start the bot
function startBot() {
  console.log(`[System] Connecting to ${config.host}:${config.port}...`)

  // Loome uue Mineflayeri boti instantsi / Create a new Mineflayer bot instance
  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version || false
  })

  // Laeme teekonna leidmise plugina / Load the pathfinder plugin
  bot.loadPlugin(pathfinder)

  // Käivitame lisamoodulid / Initialize additional modules
  setupAuthMe(bot, config)
  setupViewer(bot, config)

  // Sündmus: bot ühendus võrku / Event: bot connected to the network
  bot.on('login', () => {
    console.log('[System] Bot logged into the server network.')
  })

  // Sündmus: bot sündis maailma / Event: bot spawned into the world
  bot.on('spawn', () => {
    console.log(`[System] ${config.username} has spawned in the world!`)
  })

  // Sündmus: serveri vestlussõnum / Event: server chat message
  bot.on('messagestr', (msg) => {
    console.log('[CHAT]:', msg)
  })

  // Sündmus: bot visati serverist välja / Event: bot was kicked from the server
  bot.on('kicked', (reason) => {
    console.log('[Warning] Bot was kicked! Reason:', reason)
  })

  // Sündmus: ühenduse viga / Event: connection error
  bot.on('error', (err) => {
    console.log('[Error] Connection error occurred:', err)
  })

  // Sündmus: ühendus katkes, proovime uuesti / Event: disconnected, attempting reconnect
  bot.on('end', (reason) => {
    console.log('[System] Disconnected from server. Reason:', reason)
    console.log('[System] Reconnecting in 5 seconds...')
    setTimeout(startBot, 5000)
  })
}

// Käivitame boti / Start the bot
startBot()