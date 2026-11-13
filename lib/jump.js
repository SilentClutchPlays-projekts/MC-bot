// Hüppemoodul: bot hüppab iga 2 sekundi järel / Jump module: the bot jumps every 2 seconds

// Intervall millisekundites (2 sekundit) / Interval in milliseconds (2 seconds)
const INTERVAL_MS = 2000

// Kui kaua hüpet maksimaalselt oodatakse millisekundites / Maximum time to wait for the jump in milliseconds
const MAX_WAIT_MS = 500

// Funktsioon mis ühendab hüppemooduli botiga / Function that attaches the jump module to the bot
function setupJump(bot, config) {
  // Võimaldab config.json failis väärtust üle kirjutada / Allows overriding the value in config.json
  const interval = (config && config.jumpInterval) || INTERVAL_MS

  // Hoiame taimeri viidet ja hüppe olekut / Keep the timer reference and the jump state
  let timer = null
  let wantJump = false
  let jumpExpires = 0

  // Palub ühe hüppe, mille täidab füüsikatsükkel / Requests one jump, which the physics tick performs
  function requestJump() {
    // Kui bot pole maailmas, ei tee midagi / If the bot is not in the world, do nothing
    if (!bot.entity) return

    wantJump = true
    jumpExpires = Date.now() + MAX_WAIT_MS
  }

  // Füüsikatsükkel: vajutab hüppeklahvi kui bot on maas / Physics tick: presses the jump key when the bot is on the ground
  function onPhysicsTick() {
    if (!wantJump || !bot.entity) return

    // Aegus, loobume hüppest / Expired, give up on the jump
    if (Date.now() > jumpExpires) {
      wantJump = false
      bot.setControlState('jump', false)
      return
    }

    if (bot.entity.onGround) {
      // Bot on maas, vajutame hüppeklahvi (see kirjutab üle teekonnaleidja oleku) / Bot is on the ground, press the jump key (this overrides the pathfinder state)
      bot.setControlState('jump', true)
    } else {
      // Bot on õhus, hüpe õnnestus, laseme klahvi lahti / Bot is in the air, the jump worked, release the key
      wantJump = false
      bot.setControlState('jump', false)
    }
  }

  // Käivitab hüppetaimeri / Starts the jump timer
  function startJumping() {
    // Kustutame vana taimeri, et ei tekiks topelt / Clear the old timer so there are no duplicates
    stopJumping()

    timer = setInterval(requestJump, interval)
    console.log(`[Jump] Started jumping every ${interval / 1000} seconds.`)
  }

  // Peatab hüppetaimeri / Stops the jump timer
  function stopJumping() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    wantJump = false
  }

  // Sündmus: igal füüsikatsüklil kontrollime hüpet / Event: check the jump on every physics tick
  bot.on('physicsTick', onPhysicsTick)

  // Sündmus: bot sündis maailma, alustame hüppamist / Event: bot spawned, start jumping
  bot.on('spawn', startJumping)

  // Sündmused: ühendus katkes või visati välja, peatame taimeri / Events: disconnected or kicked, stop the timer
  bot.on('end', stopJumping)
  bot.on('kicked', stopJumping)
}

module.exports = setupJump
