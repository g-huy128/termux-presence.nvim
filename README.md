# termux-presence.nvim

Neovim Discord Rich Presence, optimized for Termux. Shows what you're editing, your workspace, language icons, and elapsed time directly on your Discord profile.

Built on the Discord Gateway WebSocket (`wss://gateway.discord.gg/?v=10`) via a single background Node.js process per Neovim session.

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

- Shows the current **filename** (`%f`) and **workspace** (`%w`) in your Discord activity.
- Automatic language icons by file extension. Built-in languages: `py`, `lua`, `luau`, `css`, `html`, `c`, `js`, `md`, `json`, `txt`, `sh`, `bat`, `bash`, `ts`, `tsx`, `jsx`, `rb`, `yaml`, `yml`, `cpp`, `cs`, `rs`, `ml`, `mli`, `swift`, `R`, `kt`, `kts`, `go`, `java`, `wasm`, `php`, `scss`, `sass`, `scala`, `sol`, `v`, `vue`, `nut`, `svelte`, `toml`, `vala`, `nu`, `pl`, `rkt`, `less`, `m`, `nim`, `gml`, `gleam`, `hs`, `hx`, `jl`, `dart`, `db`, `d`, `ex`, `exs`, `elm`, `erl`, `fnl`, `f90`, `fs`, `asm`, `zig`, `clj`.
- Unknown extensions fall back to **Idle** state with the editor icon.
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
2. **Application ID:** the plugin defaults to `1557774262285111366`, no change needed unless you create your own app at the [Discord Developer Portal](https://discord.com/developers/applications).

## Installation

### lazy.nvim

```lua
{
  "g-huy128/termux-presence.nvim",
  config = function()
    require("termux-presence").setup({
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
    require("termux-presence").setup({
      token = os.getenv("DISCORD_TOKEN"),
    })
  end,
}
```

Then restart Neovim or run `:Lazy sync`. Never hardcode your token — export it first:

```bash
export DISCORD_TOKEN="your-token"
```

### packer.nvim

```lua
use({
  "g-huy128/termux-presence.nvim",
  config = function()
    require("termux-presence").setup({ token = "your-token" })
  end,
})
```

### vim-plug

```vim
Plug 'g-huy128/termux-presence.nvim'
```

```lua
-- in init.lua, after plug#end()
require("termux-presence").setup({ token = "your-token" })
```

On first run, the plugin calls `npm install` inside `lua/termux-presence/` to install `ws` if `node_modules/ws` is missing.

## Configuration

```lua
require("termux-presence").setup({
  token = "your-token",
  title = "Neovim",
  state = "Workspace %w",
  details = "Editing %f",
  application_id = "1557774262285111366",
  repo_button_text = "Open Repository",
  show_repo_button = false,
  status = "online",
  images = nil,
  idle_image = "1558428733793108059",
  idle_text = "Idle",
  idle_state = " ",
})
```

### Parameter reference

| Key | Type | Default | Description |
| --- | ---- | ------- | ----------- |
| `token` | `string` | `nil` | Discord user token. Required. |
| `title` | `string` | `"Neovim"` | Activity name shown on the profile. |
| `state` | `string` | `"Workspace %w"` | Bottom line. `%f` = filename (`%:t`), `%w` = cwd basename (`:t`). Replaced by `idle_state` when idle. |
| `details` | `string` | `"Editing %f"` | Top line. Same placeholders. Replaced by `"Idle"` when idle. |
| `application_id` | `string` | `"1557774262285111366"` | App that hosts the image assets. |
| `show_repo_button` | `boolean` | `false` | Show the repo button when in a git repo with an `origin` remote. |
| `repo_button_text` | `string` | `"Open Repository"` | Button label. |
| `status` | `string` | `"online"` | `online`, `idle`, `dnd`, `invisible`. Invalid values fall back to `online`. `idle` sends `afk=true`, `since=now`. |
| `images` | `table` | `nil` | Custom assets, see [Custom language icons](#custom-language-icons). Takes precedence over `idle_image`/`idle_text`. |
| `idle_image` | `string` | `"1558428733793108059"` | Fallback asset id when `images.idle` is unset. |
| `idle_text` | `string` | `"Idle"` | Text shown when idle. |
| `idle_state` | `string` | `" "` | State line when idle. |

### Custom language icons

```lua
require("termux-presence").setup({
  token = "your-token",
  show_repo_button = true,
  status = "online",
  images = {
    editor = "1558027697798516737",
    idle = "1558428733793108059",
    idle_text = "Taking a break",
    languages = {
      py = "1558427155808124989",
      lua = "1558404931420028928",
    },
  },
})
```

The `images` table:

| Key | Type | Description |
| --- | ---- | ----------- |
| `editor` | `string` | `small_image` asset id shown on all activities. |
| `idle` | `string` | `large_image` asset id for unknown file types. |
| `idle_text` | `string` | `large_text` for unknown file types. |
| `languages` | `table` | Map of lowercase file extension to asset id. |

### Sample configs

**Minimal (just works):**

```lua
require("termux-presence").setup({
  token = os.getenv("DISCORD_TOKEN"),
})
```

**Termux style with repo button:**

```lua
require("termux-presence").setup({
  token = os.getenv("DISCORD_TOKEN"),
  title = "Termux",
  state = "Workspace %w",
  details = "Editing %f",
  show_repo_button = true,
})
```

**Do-not-disturb while coding:**

```lua
require("termux-presence").setup({
  token = os.getenv("DISCORD_TOKEN"),
  status = "dnd",
  idle_text = "Taking a break",
  idle_state = "AFK",
})
```

## How it works

```
init.lua (setup)
  → writes temp JSON: stdpath("cache")/termux-presence_<pid>.json
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
├── LICENSE
├── .luarc.json
├── .gitignore
└── lua/termux-presence/
    ├── init.lua
    ├── rpc.js
    ├── utils.js
    ├── package.json
    ├── package-lock.json
    └── node_modules/        # auto-installed when missing (not committed)
```

| File | Role |
| ---- | ---- |
| `init.lua` | Entry point: `M.setup()`, config management, node jobstart, autocmds |
| `rpc.js` | Gateway client: identify/heartbeat/presence/reconnect/stdin loop |
| `utils.js` | Git repository and remote URL helpers |
| `package.json` | Dependencies: `ws ^8.18.0` |

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| `[termux-presence] No token provided` | No `token` passed to `setup()`. |
| `[termux-presence] Failed to write temp config` | Can't write to `stdpath("cache")`. Check directory permissions. |
| `[D-RPC] No token` (node log) | Temp JSON has no token — recheck your config. |
| `[D-RPC] Cannot update presence: not connected` | Gateway not OPEN (offline / bad token / rate-limited). The auto-reconnect will retry. |
| No images | Wrong `application_id` or wrong custom asset id. |
| No repo button | `show_repo_button=false`, not a git repo, or `.git/config` lacks `[remote "origin"]`. |
| `node: command not found` | Node isn't installed or not in `PATH`. On Termux: `pkg install nodejs`. |

Quick debug:

```vim
:lua print(vim.inspect(require("termux-presence").config))
:lua print(require("termux-presence")._node_process_id)
```

## Security warning

**This plugin uses a user token + Gateway WebSocket, which violates Discord's Terms of Service.** Your account may be suspended or penalized. Never commit your token to git — use an environment variable instead:

```lua
require("termux-presence").setup({ token = os.getenv("DISCORD_TOKEN") })
```

## Contributing

Open issues / PRs at [g-huy128/termux-presence.nvim](https://github.com/g-huy128/termux-presence.nvim). Keep changes scoped, no unrelated reformatting.

## License

MIT — see [LICENSE](LICENSE).
