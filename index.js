
'use strict';

const mineflayer = require('@wp2508/mineflayer');
const express = require('express');
const config = require('./settings.json');

const app = express();
const PORT = process.env.PORT || 8080;

let bot = null;
let connected = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
const startedAt = Date.now();

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Minecraft AFK Bot</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #0f172a;
          color: #f8fafc;
          max-width: 600px;
          margin: 60px auto;
          padding: 20px;
        }
        .card {
          background: #1e293b;
          padding: 20px;
          border-radius: 12px;
          margin: 15px 0;
        }
        #status { font-weight: bold; }
      </style>
    </head>
    <body>
      <h1>Minecraft AFK Bot</h1>
      <div class="card">
        <p>Status: <span id="status">Loading...</span></p>
        <p>Server: ${config.server.ip}:${config.server.port}</p>
        <p>Username: ${config['bot-account'].username}</p>
        <p>Uptime: <span id="uptime">Loading...</span></p>
        <p>Reconnect attempts: <span id="attempts">0</span></p>
      </div>
      <script>
        async function update() {
          try {
            const response = await fetch('/health');
            const data = await response.json();
            document.getElementById('status').textContent = data.status;
            document.getElementById('uptime').textContent =
              Math.floor(data.uptime / 60) + ' minutes';
            document.getElementById('attempts').textContent =
              data.reconnectAttempts;
          } catch {
            document.getElementById('status').textContent = 'Unavailable';
          }
        }
        update();
        setInterval(update, 5000);
      </script>
    </body>
    </html>
  `);
});

app.get('/health', (req, res) => {
  res.json({
    status: connected ? 'connected' : 'reconnecting',
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    reconnectAttempts
  });
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Web] Dashboard listening on port ${PORT}`);
});

function scheduleReconnect() {
  if (reconnectTimer) return;

  connected = false;
  reconnectAttempts++;

  const delay = Math.min(
    5000 * Math.pow(2, Math.min(reconnectAttempts - 1, 5)),
    120000
  );

  console.log(
    `[Bot] Retrying in ${Math.round(delay / 1000)} seconds ` +
    `(attempt #${reconnectAttempts})`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, delay);
}

function createBot() {
  connected = false;

  const username =
    process.env.BOT_USERNAME ||
    config['bot-account'].username;

  const password =
    process.env.BOT_PASSWORD ||
    config['bot-account'].password ||
    undefined;

  const configuredVersion = config.server.version?.trim();
  const version = configuredVersion || false;

  console.log(
    `[Bot] Connecting to ${config.server.ip}:${config.server.port}`
  );
  console.log(`[Bot] Username: ${username}`);
  console.log(`[Bot] Auth mode: ${config['bot-account'].type || 'offline'}`);
  console.log(`[Bot] Requested version: ${version || 'auto-detect'}`);

  try {
    const currentBot = mineflayer.createBot({
      host: config.server.ip,
      port: Number(config.server.port),
      username,
      password,
      auth: config['bot-account'].type || 'offline',
      version,
      hideErrors: false,
      checkTimeoutInterval: 600000
    });

    bot = currentBot;

    currentBot.on('connect', () => {
      console.log('[Bot] TCP connection established.');
    });

    currentBot.on('login', () => {
      console.log('[Bot] Login packet accepted; waiting for spawn.');
    });

    currentBot.on('spawn', () => {
      if (bot !== currentBot) return;

      connected = true;
      reconnectAttempts = 0;
      console.log(`[Bot] SPAWNED successfully. Version: ${currentBot.version}`);
    });

    currentBot.on('kicked', (reason, loggedIn) => {
      console.error('[Bot] KICKED reason:', JSON.stringify(reason));
      console.error('[Bot] Logged in before kick:', loggedIn);
    });

    currentBot.on('error', error => {
      console.error('[Bot] ERROR:', error.stack || error.message || error);
    });

    currentBot.on('end', reason => {
      console.error('[Bot] END reason:', reason || 'No reason provided');

      if (bot !== currentBot) return;

      connected = false;
      bot = null;
      scheduleReconnect();
    });

  } catch (error) {
    console.error('[Bot] CREATE ERROR:', error.stack || error);
    bot = null;
    scheduleReconnect();
  }
}

process.on('uncaughtException', error => {
  console.error('[Fatal]', error.stack || error);
});

process.on('unhandledRejection', error => {
  console.error('[Unhandled rejection]', error?.stack || error);
});

console.log('======================================');
console.log(' Minecraft AFK Bot');
console.log('======================================');
console.log(`Server: ${config.server.ip}:${config.server.port}`);
console.log(`Username: ${config['bot-account'].username}`);
console.log('======================================');

createBot();
