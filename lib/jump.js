// Hüppemoodul: bot hüppab iga 2 sekundi järel / Jump module: the bot jumps every 2 seconds

// Intervall millisekundites (2 sekundit) / Interval in milliseconds (2 seconds)
const INTERVAL_MS = 2000

// Kui kaua hüppeklahvi all hoitakse millisekundites / How long the jump key is held in milliseconds
const HOLD_MS = 100

// Funktsioon mis ühendab hüppemooduli botiga / Function that attaches the jump module to the bot
function setupJump(bot, config) {
  // Võimaldab config.json failis väärtust üle kirjutada / Allows overriding the value in config.json
  const interval = (config && config.jumpInterval) || INTERVAL_MS

  // Hoiame taimeri viidet, et seda saaks peatada / Keep the timer reference so it can be stopped
  let timer = null

  // Teeb ühe hüppe / Performs a single jump
  function jumpOnce() {
    // Kui bot pole maailmas, ei tee midagi / If the bot is not in the world, do nothing
    if (!bot.entity) return

    // Vajutame hüppeklahvi ja laseme selle varsti lahti / Press the jump key and release it shortly after
    bot.setControlState('jump', true)
    setTimeout(() => {
      bot.setControlState('jump', false)
    }, HOLD_MS)
  }

  // Käivitab hüppetaimeri / Starts the jump timer
  function startJumping() {
    // Kustutame vana taimeri, et ei tekiks topelt / Clear the old timer so there are no duplicates
    stopJumping()

    timer = setInterval(jumpOnce, interval)
    console.log(`[Jump] Started jumping every ${interval / 1000} seconds.`)
  }

  // Peatab hüppetaimeri / Stops the jump timer
  function stopJumping() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // Sündmus: bot sündis maailma, alustame hüppamist / Event: bot spawned, start jumping
  bot.on('spawn', startJumping)

  // Sündmused: ühendus katkes või visati välja, peatame taimeri / Events: disconnected or kicked, stop the timer
  bot.on('end', stopJumping)
  bot.on('kicked', stopJumping)
}

module.exports = setupJump
