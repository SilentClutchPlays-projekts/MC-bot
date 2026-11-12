// Impordime vajalikud moodulid / Import required modules
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const { Movements, goals: { GoalNear } } = require('mineflayer-pathfinder')
const http = require('http')
const httpProxy = require('http-proxy')

module.exports = function (bot, config) {
  // Ootame, kuni bot on maailma sündinud / Wait until the bot has spawned in the world
  bot.once('spawn', () => {
    // Määrame pordid / Set ports
    const dashboardPort = config.viewerPort || 6767
    const fpPort = 6768
    const fcPort = 6769

    // Seadistame kiire ja sujuva liikumise reeglid / Setup fast and smooth movement rules
    const mcData = require('minecraft-data')(bot.version)
    const defaultMove = new Movements(bot, mcData)
    defaultMove.canDig = false
    defaultMove.allowParkour = true
    defaultMove.allowSprinting = true
    defaultMove.canOpenDoors = true
    defaultMove.maxDropDown = 4
    defaultMove.scaffoldingBlocks = []

    // Hoiame sprintimise sees, kui bot liigub / Keep sprinting enabled while the bot is moving
    bot.on('physicsTick', () => {
      if (bot.pathfinder.isMoving()) {
        bot.setControlState('sprint', true)
      }
    })

    // Käivitame First-Person vaaturi / Start First-Person viewer
    mineflayerViewer(bot, { port: fpPort, firstPerson: true, viewDistance: 4 })
    const fpViewer = bot.viewer

    // Käivitame Freecam vaaturi / Start Freecam viewer
    mineflayerViewer(bot, { port: fcPort, firstPerson: false, viewDistance: 4 })
    const fcViewer = bot.viewer
    // Joonistame roosa teekonnajoone mõlemasse vaatesse / Draw pink path line in both views
    bot.on('path_update', (r) => {
      const path = [bot.entity.position.offset(0, 0.5, 0)]
      for (const node of r.path) {
        path.push({ x: node.x, y: node.y + 0.5, z: node.z })
      }
      if (fpViewer) fpViewer.drawLine('path', path, 0xff00ff)
      if (fcViewer) fcViewer.drawLine('path', path, 0xff00ff)
    })

    // Funktsioon parema hiireklõpsu töötlemiseks / Function to handle right-click movement
    function handleBlockClick(block, face, button) {
      if (button !== 2) return
      const p = block.position.offset(0, 1, 0)
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 0.5))
    }

    // Kuulame klõpse mõlemas vaaturis / Listen for clicks in both viewers
    if (fpViewer) fpViewer.on('blockClicked', handleBlockClick)
    if (fcViewer) fcViewer.on('blockClicked', handleBlockClick)

    // Loome proxy serverid vaaturite jaoks / Create proxy servers for viewers
    const fpProxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${fpPort}`, ws: true })
    const fcProxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${fcPort}`, ws: true })

    fpProxy.on('error', (err) => console.log('[FP Proxy Warning]:', err.message))
    fcProxy.on('error', (err) => console.log('[FC Proxy Warning]:', err.message))

    // Vaikimisi First-Person vaade / Default First-Person view
    let isFirstPerson = true
    // Loome juhtpaneeli HTTP serveri / Create dashboard HTTP server
    const server = http.createServer((req, res) => {
      // Avalehe HTML / Main page HTML
      if (req.url === '/' || req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MC-Bot Control Dashboard</title>
<style>
  body { margin: 0; font-family: Arial, sans-serif; background: #121212; color: white; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  #topbar { background: #1e1e1e; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; z-index: 10; }
  .stats { display: flex; gap: 12px; font-size: 14px; flex-wrap: wrap; }
  .stat-box { background: #2a2a2a; padding: 6px 12px; border-radius: 5px; }
  .controls button { background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 6px; }
  .controls button.active { background: #10b981; }
  .controls button.stop { background: #ef4444; }
  iframe { flex: 1; border: none; width: 100%; height: 100%; background: #000; }
</style>
</head>
<body>
  <div id="topbar">
    <div class="stats">
      <div class="stat-box"><strong>Bot:</strong> <span id="name">...</span></div>
      <div class="stat-box"><strong>XYZ:</strong> <span id="coords">0, 0, 0</span></div>
      <div class="stat-box"><strong>HP:</strong> <span id="health">20</span></div>
      <div class="stat-box"><strong>Food:</strong> <span id="food">20</span></div>
      <div class="stat-box" style="color:#a78bfa;">Right-Click block to move</div>
    </div>
    <div class="controls">
      <button class="stop" onclick="stopBot()">Stop</button>
      <button id="btn-fp" class="active" onclick="setMode(true)">First-Person</button>
      <button id="btn-fc" onclick="setMode(false)">Freecam</button>
    </div>
  </div>
  <iframe id="viewerFrame" src="/viewer"></iframe>
  <script>
    const frame = document.getElementById('viewerFrame');
    async function setMode(fp) {
      document.getElementById('btn-fp').classList.toggle('active', fp);
      document.getElementById('btn-fc').classList.toggle('active', !fp);
      await fetch('/api/mode?fp=' + fp);
      frame.src = '/viewer?t=' + Date.now();
    }
    async function stopBot() {
      await fetch('/api/stop');
    }
    setInterval(async () => {
      try {
        const res = await fetch('/api/status');
        const d = await res.json();
        document.getElementById('name').innerText = d.username;
        document.getElementById('coords').innerText = d.x + ' / ' + d.y + ' / ' + d.z;
        document.getElementById('health').innerText = d.health;
        document.getElementById('food').innerText = d.food;
      } catch (e) {}
    }, 500);
  </script>
</body>
</html>`)
        return
      }

      // Peatab boti liikumise / Stops bot movement
      if (req.url === '/api/stop') {
        bot.pathfinder.setGoal(null)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"stopped":true}')
        return
      }

      // Vahetab kaamerarežiimi / Switches camera mode
      if (req.url.startsWith('/api/mode')) {
        isFirstPerson = req.url.includes('fp=true')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ firstPerson: isFirstPerson }))
        return
      }

      // Tagastab boti hetkeandmed / Returns bot status data
      if (req.url === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const pos = bot.entity ? bot.entity.position : { x: 0, y: 0, z: 0 }
        res.end(JSON.stringify({
          username: bot.username,
          health: Math.round(bot.health || 0),
          food: Math.round(bot.food || 0),
          x: pos.x.toFixed(2),
          y: pos.y.toFixed(2),
          z: pos.z.toFixed(2)
        }))
        return
      }

      // Suunab 3D vaaturi päringud / Routes 3D viewer requests
      if (req.url.startsWith('/viewer')) {
        req.url = req.url.replace('/viewer', '') || '/'
      }
      if (isFirstPerson) fpProxy.web(req, res)
      else fcProxy.web(req, res)
    })

    // Suunab WebSocket ühendused / Routes WebSocket connections
    server.on('upgrade', (req, socket, head) => {
      if (isFirstPerson) fpProxy.ws(req, socket, head)
      else fcProxy.ws(req, socket, head)
    })

    // Käivitame serveri / Start server
    server.listen(dashboardPort, () => {
      console.log(`[Dashboard] Running on port ${dashboardPort}`)
    })
  })
}