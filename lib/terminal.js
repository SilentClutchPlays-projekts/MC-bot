// Häkkerliku rohelise terminali moodul / Hacker-style green terminal module
const fs = require('fs')

function setupTerminal(bot) {
  // Hoiame viimaseid logiridu mälus / Keep recent log lines in memory
  const logs = []
  const maxLogs = 250

  // Funktsioon logirea lisamiseks / Function to add a log line
  function addLog(type, text) {
    const time = new Date().toISOString().split('T')[1].split('.')[0]
    logs.push({ time, type, text })
    if (logs.length > maxLogs) logs.shift()
  }

  // Püüame kinni konsooli logid, et neid terminalis näidata / Intercept console logs to display in terminal
  const origLog = console.log
  console.log = (...args) => {
    origLog.apply(console, args)
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    addLog('SYS', line)
  }

  // Kuulame mängu chati eraldi / Listen to in-game chat separately
  bot.on('messagestr', (msg) => {
    if (msg && msg.trim().length > 0) {
      addLog('CHAT', msg)
    }
  })

  // HTTP päringute haldur terminali API ja vaate jaoks / HTTP request handler for terminal API and view
  function handleRequest(req, res) {
    // Tagastab logid JSON kujul / Returns logs as JSON
    if (req.url === '/api/terminal/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(logs))
      return true
    }

    // Võtab vastu käskluse või chati sõnumi / Receives a command or chat message
    if (req.url === '/api/terminal/exec' && req.method === 'POST') {
      let body = ''
      req.on('data', chunk => { body += chunk.toString() })
      req.on('end', () => {
        try {
          const { cmd } = JSON.parse(body)
          const clean = (cmd || '').trim()
          if (clean) {
            addLog('CMD', `root@mc-bot:~# ${clean}`)
            if (clean === 'clear') {
              logs.length = 0
              addLog('SYS', 'Terminal buffer cleared.')
            } else if (clean === 'help') {
              addLog('SYS', 'Available local commands: help, clear, status, stop | Any other text or /command is sent directly to Minecraft server.')
            } else if (clean === 'status') {
              const p = bot.entity ? bot.entity.position : { x: 0, y: 0, z: 0 }
              addLog('SYS', `USER: ${bot.username} | HP: ${Math.round(bot.health || 0)} | FOOD: ${Math.round(bot.food || 0)} | XYZ: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`)
            } else if (clean === 'stop') {
              if (bot.pathfinder) bot.pathfinder.setGoal(null)
              addLog('SYS', 'Pathfinder movement halted.')
            } else {
              bot.chat(clean)
            }
          }
        } catch (e) {}
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      })
      return true
    }
    // Tagastab häkkerliku terminali HTML lehe / Returns the hacker terminal HTML page
    if (req.url === '/terminal-view') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #020802; color: #00ff41; font-family: 'Courier New', Courier, monospace; height: 100vh; display: flex; flex-direction: column; overflow: hidden; text-shadow: 0 0 6px rgba(0, 255, 65, 0.6); }
  canvas#matrix { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; opacity: 0.14; pointer-events: none; }
  .scanlines { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.35) 50%); background-size: 100% 4px; z-index: 2; pointer-events: none; }
  #header { z-index: 3; padding: 10px 18px; border-bottom: 1px solid #00ff41; background: rgba(0, 20, 0, 0.85); display: flex; justify-content: space-between; font-size: 13px; letter-spacing: 1px; }
  #output { z-index: 3; flex: 1; overflow-y: auto; padding: 15px 18px; font-size: 14px; line-height: 1.45; }
  .line { margin-bottom: 4px; word-break: break-word; }
  .time { color: #008f11; margin-right: 8px; }
  .tag-CHAT { color: #55ff55; font-weight: bold; }
  .tag-CMD { color: #aaffaa; background: rgba(0, 255, 65, 0.12); padding: 1px 4px; }
  .tag-SYS { color: #00cc33; }
  #input-bar { z-index: 3; display: flex; align-items: center; padding: 12px 18px; border-top: 1px solid #00ff41; background: rgba(0, 15, 0, 0.95); }
  .prompt { color: #00ff41; font-weight: bold; margin-right: 10px; white-space: nowrap; }
  input { flex: 1; background: transparent; border: none; color: #00ff41; font-family: 'Courier New', Courier, monospace; font-size: 15px; outline: none; text-shadow: 0 0 6px rgba(0, 255, 65, 0.7); }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-track { background: #010501; }
  ::-webkit-scrollbar-thumb { background: #008f11; }
</style>
</head>
<body>
  <canvas id="matrix"></canvas>
  <div class="scanlines"></div>
  <div id="header">
    <span>[ SECURE SHELL // MC-BOT MAINFRAME v2.4 ]</span>
    <span>TYPE 'help' FOR COMMANDS | LIVE STREAMING</span>
  </div>
  <div id="output"></div>
  <form id="input-bar" onsubmit="sendCmd(event)">
    <span class="prompt">root@mc-bot:~#</span>
    <input type="text" id="cmdInput" placeholder="Enter chat message, /command, or 'help'..." autocomplete="off" autofocus />
  </form>
  <script>
    // Matrix langeva koodi taust / Matrix falling code background
    const c = document.getElementById('matrix');
    const ctx = c.getContext('2d');
    c.width = window.innerWidth; c.height = window.innerHeight;
    const chars = '01ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&@*';
    const drops = Array(Math.floor(c.width / 16)).fill(1);
    setInterval(() => {
      ctx.fillStyle = 'rgba(2, 8, 2, 0.08)';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = '14px monospace';
      drops.forEach((y, i) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 16, y * 16);
        if (y * 16 > c.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    }, 50);

    // Logide reaalajas laadimine / Real-time log fetching
    const out = document.getElementById('output');
    let lastLen = 0;
    async function fetchLogs() {
      try {
        const res = await fetch('/api/terminal/logs');
        const data = await res.json();
        if (data.length !== lastLen) {
          const atBottom = out.scrollHeight - out.scrollTop <= out.clientHeight + 50;
          out.innerHTML = data.map(l => '<div class="line"><span class="time">[' + l.time + ']</span><span class="tag-' + l.type + '">[' + l.type + '] ' + l.text.replace(/</g, '&lt;') + '</span></div>').join('');
          lastLen = data.length;
          if (atBottom) out.scrollTop = out.scrollHeight;
        }
      } catch (e) {}
    }
    setInterval(fetchLogs, 400);
    fetchLogs();

    // Käskluse saatmine / Send command
    async function sendCmd(e) {
      e.preventDefault();
      const inp = document.getElementById('cmdInput');
      const val = inp.value;
      if (!val.trim()) return;
      inp.value = '';
      await fetch('/api/terminal/exec', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: val }) });
      fetchLogs();
    }
  </script>
</body>
</html>`)
      return true
    }

    return false
  }

  return { handleRequest }
}

module.exports = setupTerminal