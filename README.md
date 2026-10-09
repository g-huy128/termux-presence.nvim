# termux-presence.nvim

Neovim Discord Rich Presence, optimized for **Termux / Linux**. Shows the file you're editing, the workspace, elapsed time, and language icons right on your Discord profile.

> Built on the Discord Gateway WebSocket (`wss://gateway.discord.gg/?v=10`) through a single background Node.js process per Neovim session.

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Getting a token and Application ID](#getting-a-token-and-application-id)
- [Installation](#installation)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security warning](#security-warning)
- [Contributing](#contributing)
- [License](#license)

## Features

- Shows the current **filename** (`%f`) and **workspace** (`%w`).
- Automatic language icons by file extension: `py`, `lua`, `css`, `html`, `c`, `js`. Unknown extensions fall back to **Idle**.
- Live updates on buffer switch (`BufEnter`, `BufWinEnter`), debounced by 800ms to avoid spamming the Gateway.
- Optional **Open Repository** button when inside a git repo with an `origin` remote.
- Auto-installs the `ws` dependency via `npm install` on first load.
- Auto-reconnects to the Gateway (up to 10 attempts, backoff `min(1000 * 1.5^n, 30000)`ms) with standard Discord heartbeats.
- Clears presence and cleans up temp files on Neovim exit (`VimLeavePre`).

## Requirements

- Neovim >= 0.8 (uses `vim.json`, `vim.fn.jobstart`, `vim.fn.chansend`, `vim.loop`)
- `node` + `npm` in `PATH` (check: `node -v && npm -v`)
- A Discord account + user token

## Getting a token and Application ID

1. **User token:** open Discord in a browser → F12 → Network tab → filter `/api` → copy the `authorization` header. That is your token.
2. **Application ID:** the plugin already defaults to `1557774262285111366`, no change needed unless you create your own app at the [Discord Developer Portal](https://discord.com/developers/applications).

## Installation

### lazy.nvim (recommended)

```lua
{
  "g-huy128/termux-presence.nvim",
  config = function()
    require("termuxcord").setup({
      token = "your-token",
    })
  end,
}
```

### LazyVim

Create `lua/plugins/termux-presence.lua` in your LazyVim config:

```lua
return {
  "g-huy128/termux-presence.nvim",
  event = "VeryLazy",
  config = function()
    require("termuxcord").setup({
      token = os.getenv("DISCORD_TOKEN"),
    })
  end,
}
```

Then restart Neovim or run `:Lazy sync`. Never hardcode your token in the file — export it first:

```bash
export DISCORD_TOKEN="your-token"
```

### packer.nvim

```lua
use({
  "g-huy128/termux-presence.nvim",
  config = function()
    require("termuxcord").setup({ token = "your-token" })
  end,
})
```

### vim-plug

```vim
Plug 'g-huy128/termux-presence.nvim'
```

```lua
-- in init.lua, after plug#end()
require("termuxcord").setup({ token = "your-token" })
```

On first run, the plugin calls `npm install` inside `lua/termuxcord/` to install `ws` if `node_modules/ws` is missing.

## Configuration

Full configuration with default values:

```lua
require("termuxcord").setup({
  token = "your-token",               -- required, plugin stops with a warning if empty
  title = "Neovim",                   -- activity name (field `name`)
  state = "Working on (%w)",          -- bottom line, supports %f (file) and %w (workspace)
  details = "Editing %f",             -- top line, supports %f and %w
  application_id = "1557774262285111366",
  repo_button_text = "Open Repository",
  show_repo_button = false,           -- true to show the repo button when in git + origin remote exists
  status = "online",                  -- online | idle | dnd | invisible
  images = nil,                       -- custom assets, see below (takes precedence over idle_image/idle_text)
  idle_image = "1558033511355519086",   -- asset id for idle state
  idle_text = "Idle",                 -- text shown when idle
  idle_state = " ",                   -- state line when idle
})
```

### Parameter reference

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `token` | `string` | `nil` | Discord user token. Required. |
| `title` | `string` | `"Neovim"` | Activity name shown on the profile. |
| `state` | `string` | `"Working on (%w)"` | Bottom line. `%f` = filename (`%:t`), `%w` = cwd basename (`:t`). Replaced by `idle_state` when idle. |
| `details` | `string` | `"Editing %f"` | Top line. Same placeholders. Replaced by `"Idle"` when idle. |
| `application_id` | `string` | `"1557774262285111366"` | App that hosts the image assets. |
| `show_repo_button` | `boolean` | `false` | Show the repo button. Only appears when `isGitRepository(cwd)` and `[remote "origin"]` is found in `.git/config`. |
| `repo_button_text` | `string` | `"Open Repository"` | Button label. |
| `status` | `string` | `"online"` | `online`, `idle`, `dnd`, `invisible`. Invalid values fall back to `online`. `idle` sends `afk=true`, `since=now`. |
| `images` | `table` | `nil` | Custom assets: `{ editor = "id", idle = "id", idle_text = "...", languages = { py = "id", ... } }`. |
| `idle_image` | `string` | `"1558033511355519086"` | Fallback when `images.idle` is unset. |
| `idle_text` | `string` | `"Idle"` | Fallback when `images.idle_text` is unset. |
| `idle_state` | `string` | `" "` | State line when the file matches no known language. |

### Custom language icons

```lua
require("termuxcord").setup({
  token = "your-token",
  show_repo_button = true,
  status = "online",
  images = {
    editor = "1558027697798516737", -- small_image
    idle = "1558033511355519086",
    idle_text = "Taking a break",
    languages = {
      py = "1558002783637082112",
      lua = "1558019297312505927",
      -- key = lowercase file extension, value = asset id
    },
  },
})
```

Built-in languages: `py`, `lua`, `css`, `html`, `c`, `js`. Any other extension uses `idle` as `large_image` and `editor` as `small_image` (`small_text = "Neovim"`, `large_text` = idle text or uppercased extension).

### Sample configs

Minimal (just works):

```lua
require("termuxcord").setup({
  token = os.getenv("DISCORD_TOKEN"),
})
```

Termux style with repo button:

```lua
require("termuxcord").setup({
  token = os.getenv("DISCORD_TOKEN"),
  title = "Termux",
  state = "Working on (%w)",
  details = "Editing %f",
  show_repo_button = true,
})
```

Do-not-disturb while coding:

```lua
require("termuxcord").setup({
  token = os.getenv("DISCORD_TOKEN"),
  status = "dnd",
  idle_text = "Taking a break",
  idle_state = "AFK",
})
```

## How it works

```
init.lua (setup)
  → writes temp JSON: stdpath("cache")/termuxcord_<pid>.json
  → jobstart: node rpc.js '<tmp>'
      → rpc.js reads config once, connects to Gateway, sends IDENTIFY (op 2)
      → Gateway replies HELLO (op 10) → heartbeat loop (op 1)
  → BufEnter/BufWinEnter → 800ms debounce → chansend '{"__kind":"update",...}\n'
      → rpc.js reads stdin → sends PRESENCE UPDATE (op 3)
  → VimLeavePre → chansend '{"__kind":"quit"}\n' → clear presence (activities=null) → jobstop
```

- Only **one node process** per session (`M._node_process_id`), reused for every update.
- Each update carries: `token`, `title`, `state`, `details`, `application_id`, `status`, `images`, `idle_*`, `start_timestamp` (ms from `os.time()*1000` at `setup()`), `cwd`, `workspace`, `filename`.
- `rpc.js` deletes the temp file on `process.on('exit')`; `init.lua` also removes it on job `on_exit`.

## Project structure

```
termux-presence.nvim/
├── README.md
├── LICENSE                  # MIT
├── .luarc.json               # disables param-type-mismatch diagnostic
├── .gitignore                # node_modules, *.log, *.lock
└── lua/termuxcord/
    ├── init.lua              # entry point: setup(), config, node jobstart, autocmds
    ├── rpc.js                # gateway client: identify/heartbeat/presence/reconnect/stdin
    ├── utils.js              # isGitRepository(), getGitRootDir(), getGitRemoteUrl()
    ├── package.json          # dependencies: ws ^8.18.0
    └── node_modules/ws/      # auto-installed when missing (not committed)
```

| File | Role |
| ---- | ---- |
| `init.lua` | `M.setup()`, `M._read_config()`, `M._write_temp_config()`, `M._ensure_node()`, `M._push_update()`, `M._schedule_update()`, `install_node_dependencies()` |
| `rpc.js` | `resolveAssets()`, `buildPresence()`, `connect()/onOpen/onClose/onError/onMessage`, `sendIdentify()`, `sendUpdatePresence()`, `clearPresence()`, `stdin` loop |
| `utils.js` | Walks up from `cwd` to find `.git`, parses `url = ...` under `[remote "origin"]` |

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `[termuxcord] No token provided` | No `token` passed to `setup()`. |
| `[termuxcord] Failed to write temp config` | Can't write to `stdpath("cache")`. Check directory permissions. |
| `[D-RPC] No token` (node log) | Temp JSON has no token — recheck your config. |
| `[D-RPC] Cannot update presence: not connected` | Gateway not OPEN (offline / bad token / rate-limited). The auto-reconnect will retry. |
| No images | Wrong `application_id` or wrong custom asset id. |
| No repo button | `show_repo_button=false`, not a git repo, or `.git/config` lacks `[remote "origin"]`. |
| `node: command not found` | Node isn't installed or not in `PATH`. On Termux: `pkg install nodejs`. |

Quick debug:

```vim
:lua print(vim.inspect(require("termuxcord").config))
:lua print(require("termuxcord")._node_process_id)
```

## Security warning

**This plugin uses a user token + Gateway WebSocket, which violates Discord's Terms of Service.** Your account may be suspended or penalized. Never commit your token to git — use an environment variable instead:

```lua
require("termuxcord").setup({ token = os.getenv("DISCORD_TOKEN") })
```

## Contributing

Open issues / PRs at [g-huy128/termux-presence.nvim](https://github.com/g-huy128/termux-presence.nvim). Keep changes scoped, no unrelated reformatting.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2024 Filipe Souza.
