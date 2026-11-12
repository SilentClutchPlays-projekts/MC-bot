// Impordime vajalikud moodulid / Import required modules
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const http = require('http')
const httpProxy = require('http-proxy')

module.exports = function (bot, config) {
  // Ootame, kuni bot on maailma sündinud / Wait until the bot has spawned in the world
  bot.once('spawn', () => {
    // Peamine avalik port / Main public port
    const dashboardPort = config.viewerPort || 6767
    // Eraldi sisemised pordid First-Person ja Freecam vaadete jaoks / Separate internal ports for First-Person and Freecam views
    const fpPort = 6768
    const fcPort = 6769

    // Käivitame First-Person vaaturi / Start the First-Person viewer
    mineflayerViewer(bot, { 
      port: fpPort, 
      firstPerson: true,
      viewDistance: 4 
    })

    // Käivitame Freecam (vaba kaamera) vaaturi / Start the Freecam (free camera) viewer
    mineflayerViewer(bot, { 
      port: fcPort, 
      firstPerson: false,
      viewDistance: 4 
    })

    // Loome kaks proxy serverit kahe vaate jaoks / Create two proxy servers for the two views
    const fpProxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${fpPort}`, ws: true })
    const fcProxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${fcPort}`, ws: true })

    // Väldime proxy vigade tõttu boti kokkujooksmist / Prevent bot crashes on proxy errors
    fpProxy.on('error', (err) => console.log('[FP Proxy Warning]:', err.message))
    fcProxy.on('error', (err) => console.log('[FC Proxy Warning]:', err.message))

    // Salvestame aktiivse kaamerarežiimi (vaikimisi First-Person) / Store active camera mode (default First-Person)
    let isFirstPerson = true

    // Loome peamise veebiserveri pordil 6767 / Create the main web server on port 6767
    const server = http.createServer((req, res) => {
      // Kui küsitakse juhtpaneeli avalehte / If the main dashboard page is requested
      if (req.url === '/' || req.url === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>MC-Bot Fast Dashboard</title>
            <style>
              body { margin: 0; font-family: Arial, sans-serif; background: #121212; color: white; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
              #topbar { background: #1e1e1e; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; z-index: 10; }
              .stats { display: flex; gap: 15px; font-size: 14px; flex-wrap: wrap; }
              .stat-box { background: #2a2a2a; padding: 6px 12px; border-radius: 5px; }
              .controls button { background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 8px; }
              .controls button:hover { background: #2563eb; }
              .controls button.active { background: #10b981; }
              iframe { flex: 1; border: none; width: 100%; height: 100%; background: #000; }
            </style>
          </head>
          <body>
            <div id="topbar">
              <div class="stats">
                <div class="stat-box"><strong>Bot:</strong> <span id="name">Loading...</span></div>
                <div class="stat-box"><strong>XYZ:</strong> <span id="coords">0, 0, 0</span></div>
                <div class="stat-box"><strong>Health:</strong> <span id="health">20</span></div>
                <div class="stat-box"><strong>Food:</strong> <span id="food">20</span></div>
              </div>
              <div class="controls">
                <span>Camera Mode:</span>
                <button id="btn-fp" class="active" onclick="setMode(true)">First-Person</button>
                <button id="btn-fc" onclick="setMode(false)">Freecam (Fly)</button>
              </div>
            </div>
            <iframe id="viewerFrame" src="/viewer"></iframe>

            <script>
              const frame = document.getElementById('viewerFrame')

              // Kaameravaate vahetamine serveri API kaudu / Switch camera view mode via server API
              async function setMode(fp) {
                document.getElementById('btn-fp').classList.toggle('active', fp)
                document.getElementById('btn-fc').classList.toggle('active', !fp)
                await fetch('/api/mode?fp=' + fp)
                // Laeme vaaturi raami uuesti uue režiimiga / Reload the viewer frame with the new mode
                frame.src = '/viewer?t=' + Date.now()
              }

              // Uuendame koordinaate iga 500ms järel / Update coordinates every 500ms
              setInterval(async () => {
                try {
                  const res = await fetch('/api/status')
                  const data = await res.json()
                  document.getElementById('name').innerText = data.username
                  document.getElementById('coords').innerText = data.x + ' / ' + data.y + ' / ' + data.z
                  document.getElementById('health').innerText = data.health
                  document.getElementById('food').innerText = data.food
                } catch (e) {}
              }, 500)
            </script>
          </body>
          </html>
        `)
        return
      }

      // API kaamerarežiimi muutmiseks / API to switch camera mode
      if (req.url.startsWith('/api/mode')) {
        isFirstPerson = req.url.includes('fp=true')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ firstPerson: isFirstPerson }))
        return
      }

      // Kui küsitakse boti hetkeandmeid (koordinaadid jne) / If bot status data (coordinates, etc.) is requested
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

      // Puhastame /viewer eesliite / Clean the /viewer prefix
      if (req.url.startsWith('/viewer')) {
        req.url = req.url.replace('/viewer', '') || '/'
      }

      // Suuname päringu vastavalt aktiivsele kaamerarežiimile / Route request based on active camera mode
      if (isFirstPerson) {
        fpProxy.web(req, res)
      } else {
        fcProxy.web(req, res)
      }
    })

    // Suuname reaalaja WebSocket ühendused õigesse vaaturisse / Route real-time WebSocket connections to the active viewer
    server.on('upgrade', (req, socket, head) => {
      if (isFirstPerson) {
        fpProxy.ws(req, socket, head)
      } else {
        fcProxy.ws(req, socket, head)
      }
    })

    // Käivitame serveri pordil 6767 / Start the server on port 6767
    server.listen(dashboardPort, () => {
      console.log(`[Dashboard] Fast unified dashboard running on port ${dashboardPort}`)
    })
  })
}