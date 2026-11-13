// Mobide löögimoodul: bot ründab kõiki lähedal olevaid mobe / Mob hit module: the bot attacks all nearby mobs

// Maksimaalne löögikaugus / Maximum hit reach
const ATTACK_RANGE = 3.2

// Löökide vaheline aeg millisekundites / Time between hits in milliseconds
const ATTACK_COOLDOWN_MS = 650

// Kui tihti tsükkel jookseb millisekundites / How often the loop runs in milliseconds
const TICK_MS = 100

// Entiteedi tüübid mida loetakse mobideks / Entity types that count as mobs
const MOB_TYPES = ['mob', 'hostile', 'passive', 'animal', 'ambient', 'water_creature', 'living']

// Mobid keda ei rünnata kunagi / Mobs that are never attacked
const ALWAYS_IGNORE = ['armor_stand', 'item_frame', 'glow_item_frame', 'painting']

// Funktsioon mis ühendab mobide löögimooduli botiga / Function that attaches the mob hit module to the bot
function setupMobHit(bot, config) {
  // Mobide nimed keda ei rünnata (config.json: "mobIgnore": ["villager"]) / Mob names that are not attacked (config.json: "mobIgnore": ["villager"])
  const ignoreList = ALWAYS_IGNORE.concat((config && config.mobIgnore) || [])

  // Hoiame tsükli taimerit ja viimast lööki / Keep the loop timer and the last attack time
  let timer = null
  let lastAttack = 0

  // Kontrollib kas entiteet on mob / Checks whether the entity is a mob
  function isMob(entity) {
    if (!entity || entity === bot.entity) return false
    if (!MOB_TYPES.includes(entity.type)) return false
    if (entity.name && ignoreList.includes(entity.name)) return false

    // Jätame vahele surnud entiteedid / Skip dead entities
    if (entity.health !== undefined && entity.health !== null && entity.health <= 0) return false

    return true
  }

  // Leiab lähima mobi löögikaugusel / Finds the nearest mob within reach
  function findNearestMob() {
    let best = null
    let bestDistance = Infinity

    for (const entity of Object.values(bot.entities)) {
      if (!isMob(entity)) continue

      const distance = bot.entity.position.distanceTo(entity.position)
      if (distance <= ATTACK_RANGE && distance < bestDistance) {
        best = entity
        bestDistance = distance
      }
    }

    return best
  }

  // Põhitsükkel mis jookseb pidevalt / Main loop that runs continuously
  function tick() {
    // Kui bot pole maailmas, ei tee midagi / If the bot is not in the world, do nothing
    if (!bot.entity) return

    // Ootame kuni eelmisest löögist on piisavalt aega möödas / Wait until enough time has passed since the last hit
    const now = Date.now()
    if (now - lastAttack < ATTACK_COOLDOWN_MS) return

    const mob = findNearestMob()
    if (!mob) return

    lastAttack = now

    // Vaatame mobi poole ja lööme / Look at the mob and hit
    bot.lookAt(mob.position.offset(0, mob.height * 0.9, 0), true)
    bot.attack(mob)
  }

  // Käivitab mobide löögitsükli / Starts the mob hit loop
  function startMobHit() {
    // Kustutame vana taimeri, et ei tekiks topelt / Clear the old timer so there are no duplicates
    stopMobHit()

    timer = setInterval(tick, TICK_MS)
    console.log('[MobHit] Started attacking nearby mobs.')
  }

  // Peatab mobide löögitsükli / Stops the mob hit loop
  function stopMobHit() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // Sündmus: bot sündis maailma, alustame rünnakut / Event: bot spawned, start attacking
  bot.on('spawn', startMobHit)

  // Sündmused: ühendus katkes või visati välja, peatame tsükli / Events: disconnected or kicked, stop the loop
  bot.on('end', stopMobHit)
  bot.on('kicked', stopMobHit)
}

module.exports = setupMobHit
