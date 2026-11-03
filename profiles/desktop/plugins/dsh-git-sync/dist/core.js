// dsh-git-sync v2 — core layer
// Pure helpers + git operation layer + AI-tool config adapters (bridges).
// No HTTP, no scheduler here: dist/index.js wires those onto this core.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, join, relative, dirname, sep } from "node:path";
import { homedir, platform } from "node:os";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync, rmSync,
  readdirSync, statSync, copyFileSync
} from "node:fs";
import { createHash } from "node:crypto";

const execFileAsync = promisify(execFile);

// ============================================================
// 1. Constants & defaults
// ============================================================

export const LOG_LIMIT = 20;
export const HOUR_MS = 3600 * 1000;
export const VERSION = 2;

export const DEFAULT_CONFIG = {
  version: VERSION,
  localScanSeconds: 10,       // header badge polling frequency (seconds)
  remoteFetchMinutes: 5,      // remote `git fetch` cadence (minutes)
  autoSyncEnabled: false,     // daily scheduled sync switch
  dailyTime: "23:00",         // daily sync time
  pullFirst: true,            // pull before push
  catchUpOnStartup: true,     // catch up when boot after a missed schedule
  realtime: {
    enabled: true,            // watch the config repo & sync on change
    debounceSeconds: 30       // settle time after the last change
  },
  adapters: {}                // per-tool overrides: { [id]: { enabled, path } }
};

// Ignore rules the plugin must always find in .gitignore (self-healed on
// push): they keep machine-local state and secrets out of the sync repo.
export const REQUIRED_IGNORES = [
  ".credentials.yaml", ".env",
  "git-sync/state.json",
  "sessions/", "storages/", "attachments/", "agy-accounts/",
  "node_modules/"
];

// Repo-relative paths the plugin owns (pathspec-safe add; may contain globs)
export const TRACKED_PATHS = [
  "settings.yaml", ".gitignore", "README.md",
  ".credentials.yaml.example",
  "profiles/web/package.json", "profiles/web/cordis.yml", "profiles/web/cordis.patch.yml",
  "profiles/web/pnpm-workspace.yaml", "profiles/web/pnpm-lock.yaml", "profiles/web/plugins/",
  "skills/", "git-sync/config.json", "bridges/",
  "sync*", "restore*", "restart-with-proxy.sh", "restart.bat"
];

// Never let the watcher fire on these (repo-relative prefixes / patterns)
export const WATCH_IGNORE = [
  "sessions/", "storages/", "attachments/", "agy-accounts/",
  "agy-link/media/", "agy-link/sessions.json", "profiles/web/node_modules/",
  "node_modules/", ".git/", "git-sync/state.json", "backup-", ".DS_Store",
  "*.log", "*.tmp", "llm-deepseek/"
];

// ============================================================
// 2. AI-tool config adapters
// ============================================================
// Each adapter describes where a well-known AI harness stores its user
// configuration on each OS, and which files are worth syncing. Enabled
// adapters are "bridged" into the sync repo under `bridges/<id>/…`:
//   copy-out  (before a push)  tool dir  ->  bridges/<id>/
//   copy-in   (after a pull)   bridges/<id>/  ->  tool dir
// The user's own overrides come from config.adapters[id].path.

export function vscodeUserDir(os = platform(), env = process.env) {
  if (os === "darwin") return join(env.HOME || homedir(), "Library", "Application Support", "Code", "User");
  if (os === "win32") return join(env.APPDATA || join(homedir(), "AppData", "Roaming"), "Code", "User");
  return join(env.HOME || homedir(), ".config", "Code", "User");
}

function home(os = platform(), env = process.env) {
  if (os === "win32" && env.USERPROFILE) return env.USERPROFILE;
  return env.HOME || homedir();
}

export const ADAPTER_PRESETS = [
  {
    id: "opencode",
    name: "OpenCode",
    emoji: "⌘",
    docs: "https://opencode.ai/docs/config/",
    // Path resolution per OS: first existing candidate wins at scan time.
    roots: (h = home()) => [
      join(h, ".config", "opencode"),
      join(h, ".opencode")
    ],
    include: ["opencode.json", "opencode.jsonc", "agent/**", "command/**", "theme/**", "plugin/**"],
    note: "同步 opencode.json、agent/、command/、theme/、plugin/"
  },
  {
    id: "goose",
    name: "goose",
    emoji: "🪿",
    docs: "https://block.github.io/goose/docs/getting-started/configuration/",
    roots: (h = home()) => [
      join(h, ".config", "goose"),
      join(h, ".goose")
    ],
    include: ["config.yaml", "recipes/**"],
    note: "同步 config.yaml 与 recipes/"
  },
  {
    id: "continue",
    name: "Continue",
    emoji: "⏩",
    docs: "https://docs.continue.dev/",
    roots: (h = home()) => [join(h, ".continue")],
    include: ["config.yaml", "config.json", "rules/**", "prompts/**", "blocks/**"],
    note: "同步 config.yaml/json、rules/、prompts/、blocks/"
  },
  {
    id: "cline",
    name: "Cline",
    emoji: "🤖",
    docs: "https://docs.cline.bot/",
    roots: (h = home(), os = platform()) => [join(vscodeUserDir(os, { HOME: h, APPDATA: process.env.APPDATA }), "globalStorage", "saoudrizwan.claude-dev", "settings")],
    include: ["**/*.json"],
    note: "同步 VS Code globalStorage 中 Cline 的 settings/*.json（含 API 供应商配置）"
  },
  {
    id: "roo-code",
    name: "Roo Code",
    emoji: "🦘",
    docs: "https://docs.roocode.com/",
    roots: (h = home(), os = platform()) => [join(vscodeUserDir(os, { HOME: h, APPDATA: process.env.APPDATA }), "globalStorage", "rooveterinaryinc.roo-cline", "settings")],
    include: ["**/*.json"],
    note: "同步 VS Code globalStorage 中 Roo Code 的 settings/*.json"
  },
  {
    id: "kilo-code",
    name: "Kilo Code",
    emoji: "🪁",
    docs: "https://kilocode.ai/docs",
    roots: (h = home(), os = platform()) => [join(vscodeUserDir(os, { HOME: h, APPDATA: process.env.APPDATA }), "globalStorage", "kilocode.kilo-code", "settings")],
    include: ["**/*.json"],
    note: "同步 VS Code globalStorage 中 Kilo Code 的 settings/*.json"
  },
  {
    id: "agent-zero",
    name: "Agent Zero",
    emoji: "🧊",
    docs: "https://github.com/frdel/agent-zero",
    roots: (h = home(), env = process.env) => [
      env.AGENT_ZERO_HOME && join(env.AGENT_ZERO_HOME),
      join(h, "agent-zero"),
      join(h, "a0")
    ].filter(Boolean),
    include: ["settings.json", "models.yaml", "prompts/**", ".env.example"],
    note: "同步 settings.json、models.yaml、prompts/（路径可用 AGENT_ZERO_HOME 指定）"
  }
];

export const ADAPTER_IDS = ADAPTER_PRESETS.map((a) => a.id);

/** Resolve the adapter's live root on this machine (preset candidates + user override). */
export function resolveAdapterRoot(preset, overridePath) {
  const candidates = [];
  if (overridePath && String(overridePath).trim()) {
    candidates.push(expandTilde(String(overridePath).trim()));
  }
  for (const c of preset.roots()) candidates.push(c);
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

export function expandTilde(p) {
  const h = home();
  if (p === "~") return h;
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(h, p.slice(2));
  return p;
}

// --- tiny glob (supports **, *, ? in slash segments) ---

export function globToRegExp(pattern) {
  const segs = String(pattern).split("/");
  let rx = "";
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (seg === "**") {
      rx += last ? ".*" : "(?:.*/)?";
    } else {
      let s = "";
      for (const ch of seg) {
        if (ch === "*") s += "[^/]*";
        else if (ch === "?") s += "[^/]";
        else s += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      }
      rx += s;
      if (!last) rx += "/";
    }
  }
  return new RegExp("^" + rx + "$");
}

export function matchAny(rel, patterns) {
  return patterns.some((p) => globToRegExp(p).test(rel));
}

const GENERIC_EXCLUDES = ["node_modules/**", ".git/**", "**/.DS_Store", "**/*.log", "**/*.tmp"];

/** Walk a root dir, return relative paths of files matching include & not excluded. */
export function collectAdapterFiles(root, include, excludes = []) {
  const out = [];
  const excluded = [...GENERIC_EXCLUDES, ...excludes];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join("/");
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        walk(abs);
      } else if (e.isFile()) {
        if (matchAny(rel, excluded)) continue;
        if (matchAny(rel, include)) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

// ============================================================
// 3. Pure helpers
// ============================================================

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDailyTime(hhmm) {
  const [h, m] = String(hhmm || "23:00").split(":").map((x) => parseInt(x, 10));
  const t = new Date();
  t.setHours(Number.isFinite(h) ? h : 23, Number.isFinite(m) ? m : 0, 0, 0);
  return t;
}

export function fmtLocal(isoOrMs) {
  try { return new Date(isoOrMs).toLocaleString("zh-CN", { hour12: false }); } catch { return String(isoOrMs); }
}

/** Extract file paths from `git status --porcelain` output. */
export function collectDirtyFiles(stdout) {
  const files = [];
  if (!stdout) return files;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (t) files.push(t.replace(/^[MADRCU?! ]+\s+/, ""));
  }
  return files;
}

/** Lines whose index/worktree state marks an unresolved merge conflict. */
export function findConflictFiles(stdout) {
  if (!stdout) return [];
  const re = /^(UU|AA|DD|AU|UA|DU|UD)\s+/;
  return stdout.split("\n").filter((l) => re.test(l)).map((l) => l.slice(3).trim());
}

/** Classify a git error: is it a transient network problem worth retrying? */
export function isNetworkError(text) {
  if (!text) return false;
  return /SSL|Could not resolve host|Connection (refused|reset|closed)|timed?\s?out|RPC failed|ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|unable to access/i.test(text);
}

export function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG, adapters: {} };
  const num = (v, lo, hi, dft) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dft;
  };
  cfg.localScanSeconds = num(input?.localScanSeconds, 5, 300, DEFAULT_CONFIG.localScanSeconds);
  cfg.remoteFetchMinutes = num(input?.remoteFetchMinutes, 1, 60, DEFAULT_CONFIG.remoteFetchMinutes);
  cfg.autoSyncEnabled = !!input?.autoSyncEnabled;
  const t = typeof input?.dailyTime === "string" ? input.dailyTime : "";
  cfg.dailyTime = /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? (t.length === 4 ? "0" + t : t) : DEFAULT_CONFIG.dailyTime;
  // boolean-coalesce so partial payloads never flip true-defaults to false
  cfg.pullFirst = typeof input?.pullFirst === "boolean" ? input.pullFirst : DEFAULT_CONFIG.pullFirst;
  cfg.catchUpOnStartup = typeof input?.catchUpOnStartup === "boolean" ? input.catchUpOnStartup : DEFAULT_CONFIG.catchUpOnStartup;

  // v2 realtime block (defaults keep it on)
  const rt = input?.realtime && typeof input.realtime === "object" ? input.realtime : {};
  cfg.realtime = {
    enabled: typeof rt.enabled === "boolean" ? rt.enabled : DEFAULT_CONFIG.realtime.enabled,
    debounceSeconds: num(rt.debounceSeconds, 10, 600, DEFAULT_CONFIG.realtime.debounceSeconds)
  };

  // adapters: only known ids, { enabled, path }
  const src = input?.adapters && typeof input.adapters === "object" ? input.adapters : {};
  for (const id of ADAPTER_IDS) {
    const a = src[id] && typeof src[id] === "object" ? src[id] : {};
    cfg.adapters[id] = {
      enabled: a.enabled === true,
      path: typeof a.path === "string" ? a.path : ""
    };
  }
  return cfg;
}

export function sha1(text) {
  return createHash("sha1").update(String(text)).digest("hex");
}

// ============================================================
// 4. Core factory (bound to concrete directories; injectable for tests)
// ============================================================

export function createCore(opts = {}) {
  const dshDir = resolve(opts.dshDir || process.env.DSH_HOME || resolve(homedir(), ".dsh"));
  const profilesWebDir = resolve(dshDir, "profiles", "web");
  const dataDir = resolve(opts.dataDir || resolve(dshDir, "git-sync"));
  const CONFIG_FILE = resolve(dataDir, "config.json");
  const STATE_FILE = resolve(dataDir, "state.json");
  const BRIDGES_DIR = resolve(dshDir, "bridges");

  // ---------------- config (repo-shared) ----------------

  let configCache = null;

  function readJson(file, fallback) {
    try {
      if (!existsSync(file)) return fallback;
      return JSON.parse(readFileSync(file, "utf8"));
    } catch { return fallback; }
  }
  function writeJson(file, obj) {
    try { mkdirSync(dirname(file), { recursive: true }); } catch {}
    try { writeFileSync(file, JSON.stringify(obj, null, 2), "utf8"); } catch {}
  }

  function loadConfig() {
    if (!configCache) {
      const stored = readJson(CONFIG_FILE, {});
      if (!existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, DEFAULT_CONFIG);
      configCache = sanitizeConfig({ ...stored });
      // v1 → v2 migration: never downgrade persisted values
      if (!stored.version) writeJson(CONFIG_FILE, configCache);
    }
    return configCache;
  }

  function invalidateConfigCache() { configCache = null; }

  function saveConfig(next) {
    configCache = sanitizeConfig(next || {});
    writeJson(CONFIG_FILE, configCache);
    return configCache;
  }

  // ---------------- state (machine-local) ----------------

  let state = Object.assign({ lastRunDate: "", lastRunAt: 0, lastFailedAt: 0, log: [] }, readJson(STATE_FILE, {}));
  if (!Array.isArray(state.log)) state.log = [];
  function persistState() { writeJson(STATE_FILE, state); }

  function appendLog(entry) {
    state.log = [{ ...entry }, ...(state.log || [])].slice(0, LOG_LIMIT);
    persistState();
  }

  // ---------------- git layer ----------------

  async function runGit(args, { cwd = dshDir, timeout = 15000, retries = 0 } = {}) {
    let attempt = 0;
    for (;;) {
      try {
        const { stdout, stderr } = await execFileAsync("git", args, {
          cwd, timeout, encoding: "utf8", windowsHide: true, maxBuffer: 10 * 1024 * 1024
        });
        return { ok: true, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() };
      } catch (err) {
        const stderr = String(err.stderr || "");
        const text = `${err.message}\n${stderr}`;
        // transient network failures are retried with linear backoff
        if (attempt < retries && isNetworkError(text)) {
          attempt++;
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        return { ok: false, error: err.message, stderr: stderr.trim(), stdout: String(err.stdout || "").trim(), code: err.code };
      }
    }
  }

  const repoExists = () => existsSync(resolve(dshDir, ".git"));

  function unmergedFiles() {
    return runGit(["ls-files", "-u"]).then((r) =>
      r.ok && r.stdout
        ? [...new Set(r.stdout.split("\n").map((l) => l.split("\t")[1] || "").filter(Boolean))]
        : []
    );
  }

  const rebaseInProgress = () =>
    existsSync(resolve(dshDir, ".git", "rebase-merge")) || existsSync(resolve(dshDir, ".git", "rebase-apply"));
  const mergeInProgress = () => existsSync(resolve(dshDir, ".git", "MERGE_HEAD"));

  /**
   * Self-heal a stuck git state (the #1 cause of "Pulling is not possible
   * because you have unmerged files" repeating forever):
   *  1. an interrupted `pull --rebase`  -> git rebase --abort
   *  2. an interrupted merge            -> git merge --abort
   *  3. orphaned conflict stages        -> git reset (keeps working tree)
   * Returns the list of repair actions applied.
   */
  async function repairGitState() {
    const actions = [];
    if (rebaseInProgress()) {
      let r = await runGit(["rebase", "--abort"]);
      if (!r.ok) r = await runGit(["rebase", "--quit"]);
      actions.push(r.ok ? "中止卡死的 rebase（rebase --abort）" : "rebase 清理失败: " + (r.stderr || r.error));
      if (!r.ok) return { actions, ok: false };
    }
    if (mergeInProgress()) {
      const r = await runGit(["merge", "--abort"]);
      actions.push(r.ok ? "中止未完成的合并（merge --abort）" : "merge 清理失败: " + (r.stderr || r.error));
      if (!r.ok) return { actions, ok: false };
    }
    const unmerged = await unmergedFiles();
    if (unmerged.length > 0) {
      const r = await runGit(["reset"]); // mixed: clears conflict stages, keeps working tree
      actions.push(r.ok
        ? `清理孤立冲突标记（git reset，工作区内容已保留: ${unmerged.slice(0, 3).join(", ")}${unmerged.length > 3 ? " 等" : ""}）`
        : "reset 失败: " + (r.stderr || r.error));
      if (!r.ok) return { actions, ok: false };
    }
    return { actions, ok: true };
  }

  // ---------------- pathspec-safe add ----------------

  /** Expand TRACKED_PATHS entries to paths that actually exist here
   *  (v1 hard-failed `git add sync*` on machines without those files). */
  function expandPathspecs(paths) {
    const out = [];
    let top;
    try { top = readdirSync(dshDir); } catch { top = []; }
    for (const p of paths) {
      if (p.includes("*")) {
        const dir = p.includes("/") ? resolve(dshDir, dirname(p)) : dshDir;
        const base = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
        const prefix = p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
        let entries;
        try { entries = readdirSync(dir); } catch { continue; }
        const rx = new RegExp("^" + base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
        for (const e of entries) if (rx.test(e)) out.push(prefix + e);
      } else if (existsSync(resolve(dshDir, p))) {
        out.push(p);
      }
    }
    return [...new Set(out)];
  }

  // ---------------- status ----------------

  let lastFetchTime = 0;

  async function fetchRemote(branch, force = false) {
    const cfg = loadConfig();
    const intervalMs = Math.max(1, cfg.remoteFetchMinutes) * 60 * 1000;
    const now = Date.now();
    if (!force && now - lastFetchTime < intervalMs) return { ok: true, skipped: true };
    lastFetchTime = now;
    const r = await runGit(["fetch", "origin", branch], { timeout: 30000, retries: 2 });
    if (!r.ok) lastFetchTime = 0; // allow an early retry on the next poll
    return r;
  }

  async function adapterStatus() {
    const cfg = loadConfig();
    return ADAPTER_PRESETS.map((preset) => {
      const user = cfg.adapters[preset.id] || { enabled: false, path: "" };
      const root = resolveAdapterRoot(preset, user.path);
      let files = [];
      if (root && user.enabled) {
        try { files = collectAdapterFiles(root, preset.include); } catch { files = []; }
      }
      return {
        id: preset.id, name: preset.name, emoji: preset.emoji,
        docs: preset.docs, note: preset.note,
        enabled: user.enabled === true,
        path: root || resolveAdapterRoot(preset, "") || "",
        found: !!root,
        files: files.length,
        bridge: resolve(BRIDGES_DIR, preset.id)
      };
    });
  }

  /** Dirty check limited to SYNCABLE paths: machine-local noise
   *  (state.json, .credentials.yaml, sessions/…) can never produce the
   *  "there is something to upload" false positive again. */
  async function syncableStatus() {
    const specs = expandPathspecs(TRACKED_PATHS);
    if (specs.length === 0) return { ok: true, stdout: "" };
    return runGit(["status", "--porcelain", "--", ...specs]);
  }

  /** Append any missing required ignore rules to .gitignore (idempotent). */
  async function ensureIgnoreRules() {
    const gi = resolve(dshDir, ".gitignore");
    let text = "";
    try { text = readFileSync(gi, "utf8"); } catch { /* new file below */ }
    const missing = REQUIRED_IGNORES.filter((rule) => !text.split("\n").some((l) => l.trim() === rule));
    if (missing.length === 0) return [];
    try {
      const sep = text && !text.endsWith("\n") ? "\n" : "";
      writeFileSync(gi, text + sep + "# added by dsh-git-sync (machine-local state & secrets)\n" + missing.join("\n") + "\n", "utf8");
    } catch { return []; }
    return missing;
  }

  async function computeStatus(opts = {}) {
    const force = !!opts.force;
    const base = {
      isRepo: repoExists(), remote: null, branch: "main",
      ahead: 0, behind: 0, dirty: false, dirtyFiles: [],
      conflict: false, conflictFiles: [],
      state: "no-repo", synced: false, error: null, lastChecked: Date.now(),
      platform: platform()
    };
    if (!base.isRepo) {
      base.error = "本地尚未初始化 Git 仓库";
      return base;
    }

    const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchRes.ok ? branchRes.stdout : "main";
    const remoteRes = await runGit(["remote", "get-url", "origin"]);
    const remote = remoteRes.ok ? remoteRes.stdout : null;

    const statusRes = await syncableStatus();
    const dirtyFiles = statusRes.ok ? collectDirtyFiles(statusRes.stdout) : [];
    const conflictFiles = statusRes.ok ? findConflictFiles(statusRes.stdout) : [];
    const dirty = dirtyFiles.length > 0;
    Object.assign(base, { branch, remote, dirty, dirtyFiles, conflict: conflictFiles.length > 0, conflictFiles });

    if (conflictFiles.length > 0) {
      base.state = "conflict";
      base.error = "存在未解决的合并冲突，可点击「一键修复」自动恢复";
      return base;
    }
    if (rebaseInProgress() || mergeInProgress()) {
      base.state = "conflict";
      base.error = "上一次 pull 的 rebase/merge 未完成，可点击「一键修复」自动恢复";
      return base;
    }
    if (!remote) {
      base.state = "no-remote";
      base.error = "未配置 GitHub 远程仓库 (origin)";
      return base;
    }

    const fetchRes = await fetchRemote(branch, force);
    base.fetchError = fetchRes && fetchRes.ok ? null : ((fetchRes && (fetchRes.stderr || fetchRes.error)) || "fetch 失败");

    const countRes = await runGit(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
    let ahead = 0, behind = 0;
    if (countRes.ok && countRes.stdout) {
      const parts = countRes.stdout.split(/\s+/);
      if (parts.length >= 2) {
        ahead = parseInt(parts[0], 10) || 0;
        behind = parseInt(parts[1], 10) || 0;
      }
    }
    Object.assign(base, { ahead, behind });

    if (ahead > 0 && behind > 0) base.state = "diverged";
    else if (behind > 0) base.state = "behind";
    else if (dirty || ahead > 0) base.state = "upload";
    else base.state = "synced";

    base.synced = base.state === "synced";
    base.lastFetchAt = lastFetchTime;
    base.adapters = await adapterStatus();
    base.realtime = loadConfig().realtime;
    return base;
  }

  // ---------------- bridges (multi-tool config sync) ----------------

  function bridgeDirFor(id) { return resolve(BRIDGES_DIR, id); }

  /** copy tool config -> bridges/<id>/ ; returns copied relative files */
  async function bridgeCopyOut(preset, overridePath) {
    const root = resolveAdapterRoot(preset, overridePath);
    if (!root) return { copied: [], skipped: "not-found" };
    const files = collectAdapterFiles(root, preset.include);
    const copied = [];
    for (const rel of files) {
      const src = join(root, rel);
      const dst = join(bridgeDirFor(preset.id), rel);
      try {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        copied.push(join(preset.id, rel));
      } catch { /* single-file failure is non-fatal */ }
    }
    return { copied, skipped: null };
  }

  /** bridges/<id>/ -> tool config ; returns restored relative files.
   *  onlyRels: optional list of repo-relative bridge files ("opencode/opencode.json")
   *  to restore — used after a pull so only files the pull actually changed are
   *  written back, never clobbering newer edits inside the tool directory. */
  async function bridgeCopyIn(preset, overridePath, onlyRels = null) {
    const bdir = bridgeDirFor(preset.id);
    if (!existsSync(bdir)) return { restored: [], skipped: "empty" };
    const root = resolveAdapterRoot(preset, overridePath);
    if (!root) return { restored: [], skipped: "not-found" };
    const prefix = preset.id + "/";
    let rels = collectAdapterFiles(bdir, ["**/*"]);
    if (onlyRels) {
      const wanted = new Set(onlyRels.filter((r) => r.startsWith(prefix)).map((r) => r.slice(prefix.length)));
      rels = rels.filter((r) => wanted.has(r));
    }
    const restored = [];
    for (const rel of rels) {
      const src = join(bdir, rel);
      const dst = join(root, rel);
      try {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
        restored.push(join(preset.id, rel));
      } catch { /* non-fatal */ }
    }
    return { restored, skipped: null };
  }

  function bridgeChanged() {
    if (!existsSync(BRIDGES_DIR)) return [];
    return collectAdapterFiles(BRIDGES_DIR, ["**/*"]);
  }

  /** content hashes of every bridged file, keyed by repo-relative path */
  function bridgeHashes() {
    const map = {};
    if (!existsSync(BRIDGES_DIR)) return map;
    for (const rel of collectAdapterFiles(BRIDGES_DIR, ["**/*"])) {
      try { map[rel] = sha1(readFileSync(resolve(BRIDGES_DIR, rel), "utf8")); } catch { map[rel] = "?"; }
    }
    return map;
  }

  // ---------------- operations ----------------

  async function pushOp({ message } = {}) {
    const cfg = loadConfig();
    // 1) bridge enabled adapters into the repo
    const bridgeResults = [];
    for (const preset of ADAPTER_PRESETS) {
      const user = cfg.adapters[preset.id];
      if (user && user.enabled) bridgeResults.push({ id: preset.id, ...(await bridgeCopyOut(preset, user.path)) });
    }
    // 2) self-heal .gitignore, then stage what exists (pathspec-safe; empty
    //    specs are skipped — v1 hard-failed `git add sync*` when the files
    //    were absent on a machine)
    const addedIgnores = await ensureIgnoreRules();
    const specs = expandPathspecs(TRACKED_PATHS);
    if (specs.length > 0) await runGit(["add", "--", ...specs]);
    const st = await runGit(["status", "--porcelain", "--", ...(specs.length ? specs : ["."])]);
    let committed = false;
    if (st.ok && st.stdout) {
      const stamp = fmtLocal(Date.now());
      const c = await runGit(["commit", "-m", message || `chore(sync): config update ${stamp}`]);
      committed = c.ok;
      if (!c.ok && !/nothing to commit/.test(c.stderr || "")) {
        throw new Error("git commit 失败: " + (c.stderr || c.error));
      }
    }
    // 3) push if there is anything ahead
    const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchRes.ok ? branchRes.stdout : "main";
    const pushRes = await runGit(["push", "origin", branch], { timeout: 60000, retries: 2 });
    if (!pushRes.ok) {
      if (/Everything up-to-date|up to date/i.test(pushRes.stderr || "")) {
        return { committed, pushed: false, skipped: true, message: "本地没有需要上传的变更，已是最新。", bridges: bridgeResults };
      }
      throw new Error("git push 失败: " + (pushRes.stderr || pushRes.error || "请检查网络或远程权限"));
    }
    return {
      committed, pushed: true, skipped: false,
      message: committed ? "本地配置已提交并推送到 GitHub！" : "本地提交已推送到 GitHub！",
      bridges: bridgeResults
    };
  }

  async function installDeps() {
    const cwd = profilesWebDir;
    const isWin = platform() === "win32";
    const tryPnpm = isWin
      ? () => execFileAsync("cmd.exe", ["/c", "pnpm", "install"], { cwd, timeout: 300000, windowsHide: true })
      : () => execFileAsync("sh", ["-lc", "pnpm install"], { cwd, timeout: 300000 });
    const tryNpm = isWin
      ? () => execFileAsync("cmd.exe", ["/c", "npm", "install"], { cwd, timeout: 300000, windowsHide: true })
      : () => execFileAsync("sh", ["-lc", "npm install"], { cwd, timeout: 300000 });
    try { await tryPnpm(); return "pnpm"; }
    catch { try { await tryNpm(); return "npm"; } catch { return null; } }
  }

  async function pullOp() {
    const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchRes.ok ? branchRes.stdout : "main";

    // remember what we are about to change, to react after the pull
    const snap = (p) => { try { return existsSync(p) ? sha1(readFileSync(p, "utf8")) : ""; } catch { return ""; } };
    const beforePkg = snap(resolve(profilesWebDir, "package.json"));
    const beforeLock = snap(resolve(profilesWebDir, "pnpm-lock.yaml"));
    const beforeCfg = snap(CONFIG_FILE);
    const beforeHashes = bridgeHashes();

    // self-heal BEFORE pulling (v1 died forever on this)
    const repair = await repairGitState();

    await runGit(["fetch", "origin", branch], { timeout: 30000, retries: 2 });
    const cnt = await runGit(["rev-list", "--count", `HEAD..origin/${branch}`]);
    const behind = cnt.ok ? parseInt(cnt.stdout, 10) || 0 : 0;
    if (behind === 0) {
      return { pulled: false, behind: 0, depsChanged: false, configChanged: false, bridgesRestored: [], repair, skipped: true, message: "云端没有新提交，本地已是最新。" };
    }

    const pullRes = await runGit(["pull", "--rebase", "--autostash", "origin", branch], { timeout: 120000, retries: 2 });
    if (!pullRes.ok) {
      // a failed rebase leaves the repo stuck: heal immediately and explain
      const heal = await repairGitState();
      const conflictHint = /CONFLICT|conflict/i.test(pullRes.stderr || "") ? "（云端与本地改了同一文件，已自动恢复到安全状态；请先在本地提交你的修改后重试）" : "";
      throw new Error("git pull 失败: " + (pullRes.stderr || pullRes.error) + conflictHint + (heal.actions.length ? "；已自动执行: " + heal.actions.join("；") : ""));
    }

    const depsChanged = snap(resolve(profilesWebDir, "package.json")) !== beforePkg || snap(resolve(profilesWebDir, "pnpm-lock.yaml")) !== beforeLock;
    let installer = null;
    if (depsChanged) installer = await installDeps();

    const configChanged = snap(CONFIG_FILE) !== beforeCfg;
    if (configChanged) invalidateConfigCache();

    // copy ONLY the bridge files this pull actually changed back into each
    // enabled tool (never clobber newer edits inside the tool directory)
    const cfg = loadConfig();
    const bridgesRestored = [];
    const afterHashes = bridgeHashes();
    const changedBridgeRels = Object.keys(afterHashes).filter((rel) => beforeHashes[rel] !== afterHashes[rel]);
    if (changedBridgeRels.length > 0) {
      for (const preset of ADAPTER_PRESETS) {
        const user = cfg.adapters[preset.id];
        if (user && user.enabled) {
          const r = await bridgeCopyIn(preset, user.path, changedBridgeRels);
          if (r.restored.length) bridgesRestored.push(preset.id);
        }
      }
    }

    return {
      pulled: true, behind, depsChanged, installer, configChanged, bridgesRestored,
      repair, skipped: false,
      message: [
        `已拉取云端 ${behind} 个提交`,
        depsChanged ? "插件依赖已自动安装" : null,
        configChanged ? "同步设置已更新" : null,
        bridgesRestored.length ? `已写回适配器: ${bridgesRestored.join(", ")}` : null
      ].filter(Boolean).join("；")
    };
  }

  async function autoRun(type = "auto") {
    const entry = { ts: Date.now(), type, ok: false, pulled: false, pushed: false, depsInstalled: false, detail: "" };
    try {
      const st0 = await computeStatus({});
      if (st0.state === "conflict") {
        const repair = await repairGitState();
        if (repair.actions.length === 0) throw new Error("存在未解决的冲突且无法自动恢复，请手动处理: " + (st0.conflictFiles || []).join(", "));
      }
      const cfg = loadConfig();
      if (cfg.pullFirst) {
        const p = await pullOp();
        entry.pulled = !p.skipped;
        entry.depsInstalled = !!p.installer;
        if (p.skipped) entry.detail = p.message;
      }
      const res = await pushOp();
      entry.pushed = !!res.pushed;
      entry.detail = [
        entry.pulled ? "已拉取云端更新" : null,
        res.skipped ? "无新变更可推送" : res.pushed ? "已推送到 GitHub" : null,
        entry.depsInstalled ? "插件依赖已自动安装" : null,
        (res.bridges && res.bridges.length) ? `适配器已桥接 ${res.bridges.length} 个工具` : null
      ].filter(Boolean).join("；") || "已是最新，无需操作";
      entry.ok = true;
    } catch (err) {
      entry.detail = String(err.message || err);
      state.lastFailedAt = Date.now();
    }
    // v1 bug fix: a FAILED run must not mark the day as done — the
    // scheduler now retries until the daily sync actually succeeds.
    if (entry.ok) {
      state.lastRunDate = todayKey();
      state.lastRunAt = Date.now();
      state.lastFailedAt = 0;
    }
    appendLog(entry);
    return { entry, status: await computeStatus({}) };
  }

  // ---------------- scheduler info ----------------

  function schedulerInfo() {
    const cfg = loadConfig();
    if (!cfg.autoSyncEnabled) return null;
    const doneToday = state.lastRunDate === todayKey();
    const target = parseDailyTime(cfg.dailyTime);
    const missed = !doneToday && Date.now() >= target.getTime();
    return {
      enabled: true,
      dailyTime: cfg.dailyTime,
      pullFirst: cfg.pullFirst,
      lastRunDate: state.lastRunDate,
      lastRunText: state.lastRunAt ? fmtLocal(state.lastRunAt) : "从未运行",
      nextRunText: doneToday ? "今日已完成 ✓" : missed ? "等待执行中…" : `今天 ${cfg.dailyTime}`
    };
  }

  return {
    // dirs & files
    dshDir, profilesWebDir, dataDir, CONFIG_FILE, STATE_FILE, BRIDGES_DIR,
    // config/state
    loadConfig, saveConfig, invalidateConfigCache, getState: () => state,
    // git
    runGit, repoExists, repairGitState, unmergedFiles, rebaseInProgress, mergeInProgress,
    fetchRemote, computeStatus, expandPathspecs, syncableStatus, ensureIgnoreRules,
    // bridges
    bridgeCopyOut, bridgeCopyIn, bridgeChanged, adapterStatus,
    // ops
    pushOp, pullOp, autoRun, installDeps,
    schedulerInfo, appendLog, persistState
  };
}
