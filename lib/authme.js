// Ekspordime AuthMe automaatse sisselogimise mooduli / Export the AuthMe auto-login module
module.exports = function (bot, config) {
  // Kuulame kõiki serveri vestlussõnumeid / Listen to all server chat messages
  bot.on('messagestr', (message) => {
    // Teisendame sõnumi väiketähtedeks / Convert the message to lowercase
    const msg = message.toLowerCase()

    // Kui chatis nõutakse registreerimist / If registration is requested in chat
    if (msg.includes('/register')) {
      console.log('[AuthMe] Register prompt detected. Waiting 1.5s before registering...')
      setTimeout(() => {
        bot.chat(`/register ${config.password} ${config.password}`)
      }, 1500)
    } 
    // Kui chatis nõutakse sisselogimist / If login is requested in chat
    else if (msg.includes('/login')) {
      console.log('[AuthMe] Login prompt detected. Waiting 1.5s before logging in...')
      setTimeout(() => {
        bot.chat(`/login ${config.password}`)
      }, 1500)
    }
  })
}