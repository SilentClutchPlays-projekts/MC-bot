const mineflayer = require('mineflayer')
const config = require('./config.json')
const setupAuthMe = require('./lib/authme')

const bot = mineflayer.createBot({
  host: config.host,
  port: config.port,
  username: config.username,
  version: "1.21.11"
})

// Käivitame AuthMe loogika
setupAuthMe(bot, config)

bot.on('spawn', () => {
  console.log(`${config.username} on edukalt serveris!`)
})

bot.on('kicked', (reason) => console.log('Välja visatud:', reason))
bot.on('error', (err) => console.log('Viga:', err))
