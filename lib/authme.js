module.exports = function (bot, config) {
  bot.on('messagestr', (message) => {
    const msg = message.toLowerCase()

    // Kui chatis mainitakse /register käsklust
    if (msg.includes('/register')) {
      console.log('Tuvastati registreerimise nõue. Registreerin...')
      bot.chat(`/register ${config.password} ${config.password}`)
    } 
    // Kui chatis mainitakse /login käsklust
    else if (msg.includes('/login')) {
      console.log('Tuvastati sisselogimise nõue. Login sisse...')
      bot.chat(`/login ${config.password}`)
    }
  })
}