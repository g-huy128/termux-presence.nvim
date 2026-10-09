local M = {}

M.config = {
  token = nil,
  title = "Neovim",
  state = "Working on (%w)",
  details = "Editing %f",
  application_id = "1557774262285111366",
  repo_button_text = "Open Repository",
  show_repo_button = false,
  status = "online",
  images = nil,
  idle_image = "1558033511355519086",
  idle_text = "Idle",
  idle_state = " ",
}

M._node_process_id = nil
M._timer = nil

local function plugin_path()
  return debug.getinfo(1, "S").source:sub(2):gsub("init.lua$", "")
end

local function js_path()
  return plugin_path() .. "rpc.js"
end

function M._read_config()
  return {
    token = M.config.token,
    title = M.config.title,
    state = M.config.state,
    details = M.config.details,
    application_id = M.config.application_id,
    repo_button_text = M.config.repo_button_text,
    show_repo_button = M.config.show_repo_button,
    status = M.config.status,
    images = M.config.images,
    idle_image = M.config.idle_image,
    idle_text = M.config.idle_text,
    idle_state = M.config.idle_state,
    start_timestamp = M._start_timestamp,
    cwd = vim.fn.getcwd(),
    workspace = vim.fn.fnamemodify(vim.fn.getcwd(), ":t"),
    filename = vim.fn.expand("%:t"),
  }
end

function M._write_temp_config(cfg)
  local cache = vim.fn.stdpath("cache")
  vim.fn.mkdir(cache, "p")
  local tmp = cache .. "/termuxcord_" .. vim.fn.getpid() .. ".json"
  local fh = io.open(tmp, "w")
  if not fh then return nil end
  fh:write(vim.json.encode(cfg))
  fh:close()
  return tmp
end

-- Start the node gateway client ONCE per Neovim session.
function M._ensure_node()
  if M._node_process_id then return M._node_process_id end

  local cfg = M._read_config()
  local tmp = M._write_temp_config(cfg)
  if not tmp then
    print("[termuxcord] Failed to write temp config.")
    return nil
  end

  local cmd = "node " .. js_path() .. " '" .. tmp .. "'"
  M._node_process_id = vim.fn.jobstart(cmd, {
    on_exit = function()
      M._node_process_id = nil
      pcall(vim.loop.fs_unlink, tmp)
    end,
  })

  return M._node_process_id
end

-- Push a live update (op 3) to the already-running node process.
function M._push_update()
  if not M._node_process_id then
    M._ensure_node()
    return
  end
  local cfg = M._read_config()
  cfg.__kind = "update"
  pcall(vim.fn.chansend, M._node_process_id, vim.json.encode(cfg) .. "\n")
end

function M._schedule_update()
  if not M._timer then
    M._timer = vim.loop.new_timer()
  end
  M._timer:stop()
  M._timer:start(800, 0, vim.schedule_wrap(function()
    M._push_update()
  end))
end

local function install_node_dependencies()
  local dir = plugin_path()
  if vim.fn.isdirectory(dir .. "node_modules/ws") == 1 then
    return
  end
  print("[termuxcord] Installing Node.js dependencies (ws)...")
  vim.fn.jobstart("npm install", {
    cwd = dir,
    on_exit = function(_, code)
      if code == 0 then
        print("[termuxcord] Node.js dependencies installed successfully.")
      else
        print("[termuxcord] Failed to install Node.js dependencies.")
      end
    end,
  })
end

function M.setup(_config)
  M.config = vim.tbl_deep_extend("force", M.config, _config or {})
  M._start_timestamp = os.time() * 1000

  install_node_dependencies()

  if not M.config.token or M.config.token == "" then
    print("[termuxcord] No token provided. Please set 'token' in your config.")
    return
  end

  -- Connect once at startup so the gateway is ready before first file.
  M._ensure_node()

  vim.api.nvim_create_autocmd({ "BufEnter", "BufWinEnter" }, {
    group = vim.api.nvim_create_augroup("Termuxcord", { clear = true }),
    pattern = "*",
    callback = function()
      M._schedule_update()
    end,
  })

  vim.api.nvim_create_autocmd({ "VimLeavePre" }, {
    group = vim.api.nvim_create_augroup("TermuxcordLeave", { clear = true }),
    callback = function()
      if M._timer then
        pcall(function() M._timer:stop() end)
      end
      if M._node_process_id then
        pcall(vim.fn.chansend, M._node_process_id, '{"__kind":"quit"}\n')
        vim.defer_fn(function()
          if M._node_process_id then
            pcall(vim.fn.jobstop, M._node_process_id)
            M._node_process_id = nil
          end
        end, 500)
      end
    end,
  })
end

return M
