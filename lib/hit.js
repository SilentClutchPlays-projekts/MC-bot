// Löögimoodul: bot leiab lähima mängija, liigub tema selja taha ja ründab teda / Hit module: bot finds the nearest player, moves behind them and attacks
const { Movements, goals } = require('mineflayer-pathfinder')

// Kui kaugel selja taga bot seisma püüab (plokkides) / How far behind the target the bot tries to stand (in blocks)
const BEHIND_DISTANCE = 1.5

// Kaugus, millest alates bot lõpetab selja taha minemise ja läheb otse sihtmärgi juurde / Distance from which the bot stops circling behind and goes straight to the target
const CLOSE_DISTANCE = 4

// Maksimaalne löögikaugus / Maximum hit reach
const ATTACK_RANGE = 3.2

// Löökide vaheline aeg millisekundites / Time between hits in milliseconds
const ATTACK_COOLDOWN_MS = 650

// Kui tihti tsükkel jookseb millisekundites / How often the loop runs in milliseconds
const TICK_MS = 100

// Kui tihti sihtmärgi asukohta uuendatakse millisekundites / How often the path goal is updated in milliseconds
const GOAL_UPDATE_MS = 400

// Relvade järjekord, parim esimesena / Weapon priority list, best first
const WEAPONS = [
  'netherite_sword',
  'diamond_sword',
  'iron_sword',
  'stone_sword',
  'golden_sword',
  'wooden_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'golden_axe',
  'wooden_axe'
]

// Funktsioon mis ühendab löögimooduli botiga / Function that attaches the hit module to the bot
function setupHit(bot, config) {
  // Mängijate nimed keda ei rünnata (config.json: "hitIgnore": ["nimi"]) / Player names that are not attacked (config.json: "hitIgnore": ["name"])
  const ignoreList = (config && config.hitIgnore) || []

  // Hoiame tsükli taimerit ja olekut / Keep the loop timer and state
  let timer = null
  let lastAttack = 0
  let lastGoalUpdate = 0
  let equipping = false
  let movements = null

  // Leiab lähima rünnatava mängija / Finds the nearest attackable player
  function findTarget() {
    let best = null
    let bestDistance = Infinity

    for (const player of Object.values(bot.players)) {
      // Jätame vahele ennast, nähtamatud ja ignoreeritud mängijad / Skip ourselves, unloaded and ignored players
      if (!player.entity) continue
      if (player.username === bot.username) continue
      if (ignoreList.includes(player.username)) continue

      // Jätame vahele kreatiiv- ja pealtvaatajarežiimi mängijad, neid ei saa tappa / Skip creative and spectator players, they cannot be killed
      if (player.gamemode === 1 || player.gamemode === 3) continue

      const distance = bot.entity.position.distanceTo(player.entity.position)
      if (distance < bestDistance) {
        best = player.entity
        bestDistance = distance
      }
    }

    return best
  }

  // Valib parima relva või jätab käe tühjaks / Picks the best weapon or leaves the hand empty
  async function equipBestWeapon() {
    if (equipping) return
    equipping = true

    try {
      const items = bot.inventory.items()

      // Otsime relva prioriteetide järjekorras / Search for a weapon in priority order
      for (const name of WEAPONS) {
        const weapon = items.find((item) => item.name === name)
        if (weapon) {
          // Kui relv on juba käes, ei tee midagi / If the weapon is already held, do nothing
          if (!bot.heldItem || bot.heldItem.name !== weapon.name) {
            await bot.equip(weapon, 'hand')
          }
          return
        }
      }

      // Relva pole, kasutame paljast kätt / No weapon, use the bare hand
      if (bot.heldItem) {
        await bot.unequip('hand')
      }
    } catch (err) {
      console.log('[Hit] Could not equip weapon:', err.message)
    } finally {
      equipping = false
    }
  }

  // Liigutab boti sihtmärgi selja taha või otse tema juurde / Moves the bot behind the target or straight to them
  function updateGoal(target, distance) {
    const now = Date.now()
    if (now - lastGoalUpdate < GOAL_UPDATE_MS) return
    lastGoalUpdate = now

    // Kui oleme juba lähedal, läheme otse sihtmärgi juurde / If we are already close, go straight to the target
    if (distance <= CLOSE_DISTANCE) {
      const pos = target.position
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1), true)
      return
    }

    // Arvutame punkti sihtmärgi selja taga (vaatesuuna vastas) / Calculate the point behind the target (opposite of facing direction)
    const behind = target.position.offset(
      Math.sin(target.yaw) * BEHIND_DISTANCE,
      0,
      Math.cos(target.yaw) * BEHIND_DISTANCE
    )
    bot.pathfinder.setGoal(new goals.GoalNear(behind.x, behind.y, behind.z, 1), true)
  }

  // Ründab sihtmärki kui see on löögikaugusel / Attacks the target when it is within reach
  function attack(target) {
    const now = Date.now()
    if (now - lastAttack < ATTACK_COOLDOWN_MS) return
    lastAttack = now

    // Vaatame sihtmärgi pea poole ja lööme / Look at the target's head and hit
    bot.lookAt(target.position.offset(0, target.height * 0.9, 0), true)
    bot.attack(target)
  }

  // Põhitsükkel mis jookseb pidevalt / Main loop that runs continuously
  function tick() {
    // Kui bot pole maailmas, ei tee midagi / If the bot is not in the world, do nothing
    if (!bot.entity || !bot.pathfinder) return

    const target = findTarget()

    // Kui sihtmärki pole, peatame liikumise / If there is no target, stop moving
    if (!target) {
      bot.pathfinder.setGoal(null)
      return
    }

    const distance = bot.entity.position.distanceTo(target.position)

    // Valmistame relva ette / Prepare the weapon
    equipBestWeapon()

    // Liigume sihtmärgi poole / Move towards the target
    updateGoal(target, distance)

    // Kui oleme löögikaugusel, ründame / If we are within reach, attack
    if (distance <= ATTACK_RANGE) {
      attack(target)
    }
  }

  // Käivitab löögitsükli / Starts the hit loop
  function startHitting() {
    // Kustutame vana taimeri, et ei tekiks topelt / Clear the old timer so there are no duplicates
    stopHitting()

    // Seadistame liikumisreeglid / Set up the movement rules
    movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)

    timer = setInterval(tick, TICK_MS)
    console.log('[Hit] Started hunting the nearest player.')
  }

  // Peatab löögitsükli / Stops the hit loop
  function stopHitting() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  // Sündmus: bot sündis maailma, alustame jahti / Event: bot spawned, start hunting
  bot.on('spawn', startHitting)

  // Sündmused: ühendus katkes või visati välja, peatame tsükli / Events: disconnected or kicked, stop the loop
  bot.on('end', stopHitting)
  bot.on('kicked', stopHitting)
}

module.exports = setupHit
