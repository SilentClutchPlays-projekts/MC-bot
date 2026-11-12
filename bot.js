const mineflayer = require('mineflayer')
const config = require('./config.json')
const setupAuthMe = require('./lib/authme')

function startBot() {
  console.log(`Alustan ühendamist serveriga ${config.host}:${config.port}...`)

  const bot = mineflayer.createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    version: config.version || false
  })

  setupAuthMe(bot, config)

  bot.on('login', () => {
    console.log('Bot ühendus serveri võrku.')
  })

  bot.on('spawn', () => {
    console.log(`${config.username} on edukalt maailmas!`)
  })

  bot.on('messagestr', (msg) => {
    console.log('[CHAT]:', msg)
  })

  bot.on('kicked', (reason) => {
    console.log('Bot visati serverist välja! Põhjus:', reason)
  })

  bot.on('error', (err) => {
    console.log('Tekkis ühenduse viga:', err)
  })

  bot.on('end', (reason) => {
    console.log('Ühendus serveriga katkes. Põhjus:', reason)
    console.log('Proovin 5 sekundi pärast uuesti ühenduda...')
    setTimeout(startBot, 5000)
  })
}

startBot()