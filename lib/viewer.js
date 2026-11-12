// Impordime vajalikud moodulid / Import required modules
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')
const http = require('http')

module.exports = function (bot, config) {
  // Ootame, kuni bot on maailma sündinud / Wait until the bot has spawned in the world
  bot.once('spawn', () => {
    // Määrame vaaturi pordi / Set the viewer port
    const viewerPort = config.viewerPort || 6767
    // Sisemine port 3D vaaturi jaoks / Internal port for the 3D viewer
    const internalViewerPort = viewerPort + 1

    // Käivitame 3D maailma vaaturi sisemisel pordil / Start the 3D world viewer on an internal port
    mineflayerViewer(bot, { port: internalViewerPort, firstPerson: true })

    // Loome peamise juhtpaneeli (Dashboard) pordil 6767 / Create the main dashboard on port 6767
    const server = http.createServer((req, res) => {
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

      // Saadame brauserile juhtpaneeli HTML-liidese / Send the dashboard HTML interface to the browser
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>MC-Bot Control Dashboard</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; background: #121212; color: white; display: flex; flex-direction: column; height: 100vh; }
            #topbar { background: #1e1e1e; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; }
            .stats { display: flex; gap: 20px; font-size: 15px; }
            .stat-box { background: #2a2a2a; padding: 6px 12px; border-radius: 5px; }
            .controls button { background: #3b82f6; color: white; border: none; padding: 8px 14px; border-radius: 5px; cursor: pointer; font-weight: bold; margin-left: 8px; }
            .controls button:hover { background: #2563eb; }
            .controls button.active { background: #10b981; }
            iframe { flex: 1; border: none; width: 100%; height: 100%; }
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
          <iframe id="viewerFrame" src=""></iframe>

          <script>
            // Seadistame 3D vaaturi aadressi / Configure the 3D viewer URL
            const viewerUrl = window.location.protocol + '//' + window.location.hostname + ':${internalViewerPort}'
            const frame = document.getElementById('viewerFrame')
            frame.src = viewerUrl

            // Kaameravaate vahetamine / Switch camera view mode
            function setMode(isFirstPerson) {
              document.getElementById('btn-fp').classList.toggle('active', isFirstPerson)
              document.getElementById('btn-fc').classList.toggle('active', !isFirstPerson)
              frame.src = viewerUrl + '?firstPerson=' + isFirstPerson
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
    })

    // Käivitame juhtpaneeli serveri pordil 6767 / Start the dashboard server on port 6767
    server.listen(viewerPort, () => {
      console.log(\`[Dashboard] Web dashboard is running on port \${viewerPort}\`)
    })
  })
}