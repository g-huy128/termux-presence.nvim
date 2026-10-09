const fs = require('fs');
const WebSocket = require('ws');

const configPath = process.argv[2];
const data = configPath ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
const { getGitRemoteUrl, isGitRepository } = require('./utils');

const APPLICATION_ID = data.application_id;
const TOKEN = data.token;
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

const IMAGE_ASSETS = {
  editor: '1558027697798516737',
  idle: '1558033511355519086',
  languages: {
    py: '1558002783637082112',
    lua: '1558019297312505927',
    css: '1558019297484480572',
    html: '1558019297308319816',
    c: '1558014255985328128',
    js: '1558021250775777330',
    md: '1558095011705393152',
    json: '1558095011898466344',
    txt: '1558095011957186600'
  },
};

let ws = null;
let seq = null;
let heartbeat = null;
let connected = false;
let reconnectAttempts = 0;
let reconnectTimer = null;

const MAX_RECONNECT = 10;

function resolveAssets(filename) {
  const ext = filename ? filename.split('.').pop().toLowerCase() : null;
  const custom = data.images || {};
  const customLangs = custom.languages || {};
  const editor = custom.editor || IMAGE_ASSETS.editor;
  const langKey = customLangs[ext] !== undefined ? customLangs[ext] : IMAGE_ASSETS.languages[ext];
  if (!langKey) {
    const idleImage = custom.idle || data.idle_image || IMAGE_ASSETS.idle;
    const idleText = custom.idle_text || data.idle_text || 'Idle';
    return {
      idle: true,
      large_image: idleImage || undefined,
      large_text: idleText,
      small_image: editor,
      small_text: 'Neovim',
    };
  }
  return {
    idle: false,
    large_image: langKey,
    large_text: ext.toUpperCase(),
    small_image: editor,
    small_text: 'Neovim',
  };
}

const VALID_STATUSES = ['online', 'idle', 'dnd', 'invisible'];

function buildPresence(config) {
  const { title, filename, workspace, details, state, start_timestamp, cwd } = config;
  const status = VALID_STATUSES.includes(config.status) ? config.status : 'online';
  const isGit = isGitRepository(cwd);
  const { idle, ...assets } = resolveAssets(filename);

  const activity = {
    name: title,
    type: 0,
    details: idle ? 'Idle' : (details || '').replace('%f', filename || '').replace('%w', workspace || ''),
    state: idle ? (config.idle_state || '') : (state || '').replace('%f', filename || '').replace('%w', workspace || ''),
    timestamps: { start: Number(start_timestamp) || Date.now() },
    assets,
    application_id: APPLICATION_ID,
  };

  if (config.show_repo_button && isGit) {
    const url = getGitRemoteUrl(cwd) || '';
    if (url) {
      activity.buttons = [config.repo_button_text || 'Open Repository'];
      activity.metadata = { button_urls: [url] };
    }
  }

  const isIdle = status === 'idle';
  return {
    afk: isIdle,
    since: isIdle ? Date.now() : null,
    status,
    activities: [activity],
  };
}

function clearHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT) return;
  const delay = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(connect, delay);
}

function connect() {
  if (ws && [WebSocket.OPEN, WebSocket.CONNECTING].includes(ws.readyState)) return;

  if (!TOKEN) {
    console.error('[D-RPC] No token');
    return;
  }

  ws = new WebSocket(GATEWAY_URL);
  ws.on('open', onOpen);
  ws.on('close', onClose);
  ws.on('error', onError);
  ws.on('message', onMessage);
}

function onOpen() {
  connected = true;
  reconnectAttempts = 0;
  console.log('[D-RPC] Connected');
}

function onClose() {
  connected = false;
  clearHeartbeat();
  scheduleReconnect();
}

function onError(err) {
  console.error('[D-RPC] Error:', err.message);
}

function onMessage(msg) {
  const payload = JSON.parse(msg);
  if (payload.s !== null) seq = payload.s;

  if (payload.op === 10) {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }
    }, payload.d.heartbeat_interval);
    sendIdentify();
  }
}

function sendIdentify() {
  const presence = buildPresence(data);
  ws.send(JSON.stringify({
    op: 2,
    d: {
      token: TOKEN,
      properties: { os: 'linux', browser: 'Discord Client', device: 'Discord Client' },
      presence,
      compress: false,
      capabilities: 65,
      large_threshold: 100,
    },
  }));
}

function sendUpdatePresence(config) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !connected) return false;
  const presence = buildPresence(config);
  ws.send(JSON.stringify({ op: 3, d: presence }));
  return true;
}

function clearPresence() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 3, d: { since: Date.now(), activities: null, status: 'online', afk: true } }));
    ws.close();
  }
}

// Listen for live updates from stdin (one JSON object per line)
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const update = JSON.parse(line);
      if (update.__kind === 'update') {
        Object.assign(data, update);
        const ok = sendUpdatePresence(data);
        if (!ok) {
          console.error('[D-RPC] Cannot update presence: not connected');
        }
      }
      if (update.__kind === 'quit') {
        clearPresence();
        process.exit(0);
      }
    } catch (e) {
      // ignore malformed lines
    }
  }
});

connect();

process.on('SIGTERM', () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearPresence();
  process.exit(0);
});

process.on('exit', () => {
  try { if (configPath) fs.unlinkSync(configPath); } catch (_) {}
});
