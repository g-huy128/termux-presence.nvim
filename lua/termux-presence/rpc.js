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
  idle: '1558428733793108059',
  languages: {
    py: '1558427155808124989',
    lua: '1558404931420028928',
    luau: '1558432651298340924',
    css: '1558019297484480572',
    html: '1558019297308319816',
    c: '1558430202575585340',
    js: '1558425527990231120',
    md: '1558431698071593061',
    json: '1558431170813755412',
    txt: '1558432470205206568',
    sh: '1558433817046417478',
    bash: '1558433817046417478',
    bat: '1558433817046417478',
    ts: '1558436813540954212',
    tsx: '1558437339812859956',
    jsx: '1558437339812859956',
    rb: '1558437737466691686',
    yaml: '1558438182679216178',
    yml: '1558438182679216178',
    cpp: '1558438976598048829',
    cs: '1558438976879067146',
    rs: '1558443121543749692',
    ml: '1558443500532400208',
    mli: '1558443500532400208',
    swift: '1558443867441856523',
    R: '1558444838255464529',
    kt: '1558445242309677106',
    kts: '1558445242309677106',
    go: '1558445587442049036',
    java: '1558445865855746179',
    wasm: '1558446275051921458',
    php: '1558446940390432868',
    scss: '1558447423901139027',
    sass: '1558447423901139027',
    scala: '1558447761123446784',
    sol: '1558448368714387546',
    v: '1558448693173166161',
    vue: '1558448964603355217',
    nut: '1558449456167526400',
    svelte: '1558449795151167559',
    toml: '1558450434551586876',
    vala: '1558450845350236210',
    nu: '1558451176650055840',
    pl: '1558451757062033418',
    rkt: '1558452170108444682',
    less: '1558452577174032516',
    m: '1558453340239691836',
    nim: '1558454080089759884',
    gml: '1558454623424086096',
    gleam: '1558455161754488892',
    hs: '1558455998887235715',
    hx: '1558456280438538320',
    jl: '1558456829615407168',
    dart: '1558457170507604108',
    db: '1558457401290784818',
    d: '1558457694577500292',
    ex: '1558458045598539806',
    exs: '1558458045598539806',
    elm: '1558458417302216754',
    erl: '1558458742264045588',
    fnl: '1558459144179023894',
    f90: '1558459698083004486',
    fs: '1558459956842332160',
    asm: '1558460410204786809',
    zig: '1558460706301419540',
    clj: '1558461635432030218'
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
