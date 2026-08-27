import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const execFileAsync = promisify(execFile);
const DSH_DIR = resolve(process.env.DSH_HOME || resolve(homedir(), ".dsh"));
const PROFILES_WEB_DIR = resolve(DSH_DIR, "profiles", "web");
const DATA_DIR = resolve(DSH_DIR, "git-sync");
const CONFIG_FILE = resolve(DATA_DIR, "config.json"); // 入库：两台电脑共享同一节奏
const STATE_FILE = resolve(DATA_DIR, "state.json");   // 机器本地：上次运行时间与日志

const LOG_LIMIT = 20;
const HOUR_MS = 3600 * 1000;

// ---------------- 默认配置 ----------------
const DEFAULT_CONFIG = {
  localScanSeconds: 10,       // 客户端本地状态扫描频率（秒）
  remoteFetchMinutes: 5,      // 远程 git fetch 巡检频率（分钟）
  autoSyncEnabled: false,     // 每日自动同步开关
  dailyTime: "23:00",         // 自动同步时刻
  pullFirst: true,            // 先拉取再推送
  catchUpOnStartup: true      // 错过计划时开机补跑
};

// ---------------- 小工具 ----------------
function runGit(args, cwd = DSH_DIR, timeout = 10000) {
  return execFileAsync("git", args, {
    cwd,
    timeout,
    encoding: "utf8",
    windowsHide: true
  }).then(
    ({ stdout, stderr }) => ({ ok: true, stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() }),
    (err) => ({ ok: false, error: err.message, stderr: String(err.stderr || "").trim(), stdout: String(err.stdout || "").trim() })
  );
}

function ensureDataDir() {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function readJson(file, fallback) {
  try {
    if (!existsSync(file)) return fallback;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  ensureDataDir();
  try {
    writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
  } catch {}
}

let configCache = null;
function loadConfig() {
  if (!configCache) {
    const stored = readJson(CONFIG_FILE, {});
    // 首次运行时把默认配置落盘（入库同步给另一台电脑）
    if (!existsSync(CONFIG_FILE)) writeJson(CONFIG_FILE, DEFAULT_CONFIG);
    configCache = { ...DEFAULT_CONFIG, ...stored };
  }
  return configCache;
}

function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG };
  const num = (v, lo, hi, dft) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dft;
  };
  cfg.localScanSeconds = num(input?.localScanSeconds, 5, 300, DEFAULT_CONFIG.localScanSeconds);
  cfg.remoteFetchMinutes = num(input?.remoteFetchMinutes, 1, 60, DEFAULT_CONFIG.remoteFetchMinutes);
  cfg.autoSyncEnabled = !!input?.autoSyncEnabled;
  const t = typeof input?.dailyTime === "string" ? input.dailyTime : "";
  cfg.dailyTime = /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? (t.length === 4 ? "0" + t : t) : DEFAULT_CONFIG.dailyTime;
  cfg.pullFirst = !!input?.pullFirst;
  cfg.catchUpOnStartup = !!input?.catchUpOnStartup;
  return cfg;
}

function saveConfig(next) {
  configCache = sanitizeConfig(next);
  writeJson(CONFIG_FILE, configCache);
  return configCache;
}

let state = readJson(STATE_FILE, { lastRunDate: "", lastRunAt: 0, log: [] });
function persistState() {
  writeJson(STATE_FILE, state);
}

function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseDailyTime(hhmm) {
  const [h, m] = String(hhmm || "23:00").split(":").map((x) => parseInt(x, 10));
  const t = new Date();
  t.setHours(Number.isFinite(h) ? h : 23, Number.isFinite(m) ? m : 0, 0, 0);
  return t;
}

function fmtLocal(iso) {
  try { return new Date(iso).toLocaleString("zh-CN", { hour12: false }); } catch { return iso; }
}

// ---------------- Git 操作层 ----------------
let lastFetchTime = 0;
let busy = false;

async function fetchRemote(branch, force = false) {
  const cfg = loadConfig();
  const intervalMs = Math.max(1, cfg.remoteFetchMinutes) * 60 * 1000;
  const now = Date.now();
  if (!force && now - lastFetchTime < intervalMs) return;
  lastFetchTime = now;
  await runGit(["fetch", "origin", branch], DSH_DIR, 15000);
}

function collectDirtyFiles(stdout) {
  const files = [];
  if (!stdout) return files;
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (t) files.push(t.replace(/^[MADRCU?! ]+\s+/, ""));
  }
  return files;
}

async function computeStatus(opts = {}) {
  const force = !!opts.force;
  const isRepo = existsSync(resolve(DSH_DIR, ".git"));
  const base = {
    isRepo, remote: null, branch: "main",
    ahead: 0, behind: 0, dirty: false, dirtyFiles: [],
    state: "no-repo", synced: false, error: null, lastChecked: Date.now()
  };
  if (!isRepo) {
    base.error = "本地尚未初始化 Git 仓库";
    return base;
  }

  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.ok ? branchRes.stdout : "main";
  const remoteRes = await runGit(["remote", "get-url", "origin"]);
  const remote = remoteRes.ok ? remoteRes.stdout : null;

  const statusRes = await runGit(["status", "--porcelain"]);
  const dirtyFiles = statusRes.ok ? collectDirtyFiles(statusRes.stdout) : [];
  const dirty = dirtyFiles.length > 0;

  Object.assign(base, { branch, remote, dirty, dirtyFiles });

  if (!remote) {
    base.state = "no-remote";
    base.error = "未配置 GitHub 远程仓库 (origin)";
    return base;
  }

  await fetchRemote(branch, force);

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
  return base;
}

function schedulerInfo(statusState) {
  const cfg = loadConfig();
  if (!cfg.autoSyncEnabled) return null;
  const target = parseDailyTime(cfg.dailyTime);
  const doneToday = state.lastRunDate === todayKey();
  const missed = !doneToday && Date.now() >= target.getTime();
  return {
    enabled: true,
    dailyTime: cfg.dailyTime,
    pullFirst: cfg.pullFirst,
    lastRunDate: state.lastRunDate,
    lastRunText: state.lastRunAt ? fmtLocal(new Date(state.lastRunAt).toISOString()) : "从未运行",
    nextRunText: doneToday ? "今日已完成 ✓" : missed ? "等待执行中…" : `今天 ${cfg.dailyTime}`
  };
}

const TRACKED_PATHS = [
  "settings.yaml", ".gitignore", "README.md",
  ".credentials.yaml.example",
  "profiles/web/package.json", "profiles/web/cordis.yml", "profiles/web/cordis.patch.yml",
  "profiles/web/pnpm-workspace.yaml", "profiles/web/pnpm-lock.yaml", "profiles/web/plugins/",
  "skills/", "git-sync/config.json", "sync*", "restore*", "restart.bat"
];

async function pushOp() {
  await runGit(["add", ...TRACKED_PATHS]);
  const st = await runGit(["status", "--porcelain"]);
  let committed = false;
  const stamp = new Date().toLocaleString("zh-CN", { hour12: false });
  if (st.ok && st.stdout) {
    const c = await runGit(["commit", "-m", `chore(sync): manual push ${stamp}`]);
    committed = c.ok;
  }
  const cnt = await runGit(["rev-list", "--count", `origin/main..HEAD`]).catch(() => null);
  const aheadBeforePush = cnt && cnt.ok ? parseInt(cnt.stdout, 10) || 0 : 0;
  if (!committed && aheadBeforePush === 0) {
    return { committed, pushed: false, skipped: true, message: "本地没有需要上传的变更，已是最新。" };
  }
  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.ok ? branchRes.stdout : "main";
  const pushRes = await runGit(["push", "origin", branch], DSH_DIR, 30000);
  if (!pushRes.ok) throw new Error(pushRes.stderr || pushRes.error || "Git push 失败，请检查网络或远程权限");
  return { committed, pushed: true, skipped: false };
}

async function pullOp() {
  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.ok ? branchRes.stdout : "main";

  const pkgPath = resolve(PROFILES_WEB_DIR, "package.json");
  const lockPath = resolve(PROFILES_WEB_DIR, "pnpm-lock.yaml");
  const snap = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
  const beforePkg = snap(pkgPath);
  const beforeLock = snap(lockPath);

  const pullRes = await runGit(["pull", "--rebase", "--autostash", "origin", branch], DSH_DIR, 60000);
  if (!pullRes.ok) throw new Error(pullRes.stderr || pullRes.error || "Git pull 失败（可能存在冲突）");

  const depsChanged = snap(pkgPath) !== beforePkg || snap(lockPath) !== beforeLock;
  if (depsChanged) {
    // Windows 下 .cmd 需经 cmd.exe 启动
    try {
      await execFileAsync("cmd.exe", ["/c", "pnpm", "install"], { cwd: PROFILES_WEB_DIR, timeout: 180000, windowsHide: true });
    } catch {
      try { await execFileAsync("cmd.exe", ["/c", "npm", "install"], { cwd: PROFILES_WEB_DIR, timeout: 180000, windowsHide: true }); } catch {}
    }
  }
  return { depsChanged };
}

function appendLog(entry) {
  state.log = [{ ...entry }, ...(state.log || [])].slice(0, LOG_LIMIT);
  persistState();
}

async function autoRun(type = "auto") {
  if (busy) return { busy: true };
  busy = true;
  const entry = { ts: Date.now(), type, ok: false, pulled: false, pushed: false, depsInstalled: false, detail: "" };
  try {
    const st0 = await computeStatus({});
    if (!st0.isRepo || !st0.remote) throw new Error(st0.error || "仓库或远程未就绪");

    const cfg = loadConfig();
    if (cfg.pullFirst) {
      const p = await pullOp();
      entry.pulled = p.depsChanged || st0.behind > 0;
      entry.depsInstalled = p.depsChanged;
    }
    const res = await pushOp();
    entry.pushed = res.pushed;
    entry.detail = [
      entry.pulled ? "已拉取云端更新" : null,
      res.skipped ? "无新变更可推送" : res.pushed ? "已推送到 GitHub" : null,
      entry.depsInstalled ? "插件依赖已自动安装" : null
    ].filter(Boolean).join("；") || "已是最新，无需操作";
    entry.ok = true;
  } catch (err) {
    entry.detail = String(err.message || err);
  } finally {
    busy = false;
  }
  state.lastRunDate = todayKey();
  state.lastRunAt = Date.now();
  appendLog(entry);
  return { entry, status: await computeStatus({}) };
}

// ---------------- 调度器（服务端进程内，浏览器关闭仍生效）----------------
const bootedAt = Date.now();
let bootCatchupDone = false;
let schedulerTimer = null;

function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(async () => {
    try {
      const cfg = loadConfig();
      if (!cfg.autoSyncEnabled || busy) return;
      const doneToday = state.lastRunDate === todayKey();
      const target = parseDailyTime(cfg.dailyTime);

      // 常规触发：到达今天目标时刻且今天没跑过（覆盖睡眠唤醒、服务中途重启）
      if (!doneToday && Date.now() >= target.getTime()) {
        await autoRun("auto");
        return;
      }
      // 补偿触发：错过超过 20 小时且本进程启动满 2 分钟后补跑一次
      if (
        !bootCatchupDone && cfg.catchUpOnStartup &&
        state.lastRunAt > 0 && state.lastRunDate !== todayKey() &&
        Date.now() - state.lastRunAt > 20 * HOUR_MS &&
        Date.now() - bootedAt >= 2 * 60 * 1000
      ) {
        bootCatchupDone = true;
        await autoRun("auto-catchup");
      }
    } catch {}
  }, 30000);
  schedulerTimer.unref?.();
}

// ---------------- HTTP 插件注册 ----------------
export function apply(ctx) {
  const readBody = (req) => new Promise((done) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => done(data));
    req.on("error", () => done(data));
  });
  const sendJson = (res, code, body) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(body));
  };

  const registerRoutes = (webServer) => {
    const disposers = [];
    const reg = (route) => {
      const d = webServer.register(route);
      if (typeof d === "function") disposers.push(d);
    };

    // 1. GET status —— 四态检测（内部按配置节流 fetch；?force=1 强制刷新）
    reg({
      kind: "exact",
      path: "/plugins/git-sync/status",
      handler: async (req, res) => {
        try {
          const url = req.url || "";
          const force = /[?&]force=1/.test(url);
          const status = await computeStatus({ force });
          sendJson(res, 200, {
            ...status,
            scheduler: schedulerInfo(status.state),
            pollIntervalMs: Math.max(5, loadConfig().localScanSeconds) * 1000
          });
        } catch (err) {
          sendJson(res, 500, { error: err.message });
        }
      }
    });

    // 2. POST push —— 本地 ➜ GitHub
    reg({
      kind: "exact",
      path: "/plugins/git-sync/push",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const r = await pushOp();
          const status = await computeStatus({});
          sendJson(res, 200, { ok: true, message: r.skipped ? r.message : "本地配置已成功推送到 GitHub！", ...r, status });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 3. POST pull —— GitHub ➜ 本地（变更时自动安装插件依赖）
    reg({
      kind: "exact",
      path: "/plugins/git-sync/pull",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const r = await pullOp();
          const status = await computeStatus({});
          sendJson(res, 200, {
            ok: true,
            pluginsUpdated: r.depsChanged,
            message: r.depsChanged ? "配置与新插件依赖已成功拉取并安装！" : "配置已成功从 GitHub 同步到本地！",
            status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 4. GET / POST config —— 设置读写
    reg({
      kind: "exact",
      path: "/plugins/git-sync/config",
      handler: async (req, res) => {
        try {
          if (req.method === "POST") {
            const raw = await readBody(req);
            let parsed = {};
            try { parsed = JSON.parse(raw || "{}"); } catch {}
            const saved = saveConfig(parsed);
            sendJson(res, 200, { ok: true, config: saved });
          } else {
            sendJson(res, 200, { ok: true, config: loadConfig() });
          }
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      }
    });

    // 5. POST auto-run —— 手动试运行每日流程（先拉后推）
    reg({
      kind: "exact",
      path: "/plugins/git-sync/auto-run",
      handler: async (_req, res) => {
        try {
          const r = await autoRun("manual");
          if (r.busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
          sendJson(res, 200, {
            ok: r.entry.ok,
            message: r.entry.ok ? `试运行完成：${r.entry.detail}` : `试运行失败：${r.entry.detail}`,
            entry: r.entry,
            status: r.status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      }
    });

    // 6. GET log —— 最近同步记录
    reg({
      kind: "exact",
      path: "/plugins/git-sync/log",
      handler: async (_req, res) => {
        sendJson(res, 200, { ok: true, log: state.log || [], lastRunDate: state.lastRunDate });
      }
    });

    startScheduler();

    return () => {
      if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
      for (const d of disposers) { try { d(); } catch {} }
    };
  };

  ctx.inject(["webServer"], (sub) => {
    const webServer = sub.get("webServer");
    if (!webServer) return;
    return registerRoutes(webServer);
  });
}
