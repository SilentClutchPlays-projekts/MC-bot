module.exports = function (bot, config) {
  bot.on('messagestr', (message) => {
    const msg = message.toLowerCase()

    if (msg.includes('/register')) {
      console.log('Tuvastati registreerimine. Ootan 1.5s ja registreerin...')
      setTimeout(() => {
        bot.chat(`/register ${config.password} ${config.password}`)
      }, 1500)
    } 
    else if (msg.includes('/login')) {
      console.log('Tuvastati sisselogimine. Ootan 1.5s ja login sisse...')
      setTimeout(() => {
        bot.chat(`/login ${config.password}`)
      }, 1500)
    }
  })
}