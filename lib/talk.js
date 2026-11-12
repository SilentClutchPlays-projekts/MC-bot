// Vestlusmoodul: saadab serverisse sõnumi iga 5 sekundi järel / Talk module: sends a chat message to the server every 5 seconds

// Sõnum mida bot saadab / The message the bot sends
const MESSAGE = 'peakar and clutch on top'

// Intervall millisekundites (5 sekundit) / Interval in milliseconds (5 seconds)
const INTERVAL_MS = 5000

// Funktsioon mis ühendab vestlusmooduli botiga / Function that attaches the talk module to the bot
function setupTalk(bot, config) {
  // Võimaldab config.json failis väärtusi üle kirjutada / Allows overriding values in config.json
  const message = (config && config.talkMessage) || MESSAGE
  const interval = (config && config.talkInterval) || INTERVAL_MS

  // Hoiame taimeri viidet, et seda saaks peatada / Keep the timer reference so it can be stopped
  let timer = null

  // Peatab vestlustaimeri / Stops the talk timer
  function stopTalking() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // Käivitab vestlustaimeri / Starts the talk timer
  function startTalking() {
    // Kustutame vana taimeri, et ei tekiks topelt / Clear the old timer so there are no duplicates
    stopTalking()

    timer = setInterval(() => {
      // Saadame sõnumi serveri vestlusesse / Send the message to the server chat
      bot.chat(message)
    }, interval)

    console.log(`[Talk] Started sending "${message}" every ${interval / 1000} seconds.`)
  }

  // Sündmus: bot sündis maailma, alustame rääkimist / Event: bot spawned, start talking
  bot.on('spawn', startTalking)

  // Sündmused: ühendus katkes või visati välja, peatame taimeri / Events: disconnected or kicked, stop the timer
  bot.on('end', stopTalking)
  bot.on('kicked', stopTalking)
}

module.exports = setupTalk
