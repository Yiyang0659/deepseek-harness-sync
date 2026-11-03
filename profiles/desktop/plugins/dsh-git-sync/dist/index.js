// dsh-git-sync v2 — server plugin
// HTTP routes + server-side scheduler + real-time watcher.
// The scheduler lives inside the DSH web server process, so the daily sync
// keeps working with the browser closed (same contract as v1).

import { watch } from "node:fs";
import {
  createCore, ADAPTER_PRESETS, TRACKED_PATHS, WATCH_IGNORE,
  fmtLocal
} from "./core.js";

const name = "dsh-git-sync";

// ============================================================
// plugin entry
// ============================================================

export function apply(ctx) {
  const core = createCore({});

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

  // ---------------- busy lock ----------------

  let busy = false;

  // ---------------- scheduler (daily sync lives here, browser-independent) --

  const bootedAt = Date.now();
  let bootCatchupDone = false;
  let schedulerTimer = null;
  const RETRY_BACKOFF_MS = 5 * 60 * 1000;   // after a failed run, retry at most every 5 min
  const CATCHUP_GRACE_MS = 2 * 60 * 1000;   // wait 2 min after boot before a catch-up run
  const HOUR_MS = 3600 * 1000;

  async function schedulerTick() {
    try {
      const cfg = core.loadConfig();
      if (!cfg.autoSyncEnabled || busy) return;
      const state = core.getState();
      const doneToday = state.lastRunDate === todayKeySafe();
      const target = parseTimeSafe(cfg.dailyTime);

      // regular trigger: today's target time reached and not yet succeeded
      if (!doneToday && Date.now() >= target.getTime()) {
        // v1 bug fix: retry failed daily syncs (throttled) instead of
        // treating the day as done after one failure
        if (state.lastFailedAt && Date.now() - state.lastFailedAt < RETRY_BACKOFF_MS) return;
        await autoRunSafe("auto");
        return;
      }
      // catch-up trigger: missed by >20h and this process is 2+ min old
      if (
        !bootCatchupDone && cfg.catchUpOnStartup &&
        state.lastRunAt > 0 && state.lastRunDate !== todayKeySafe() &&
        Date.now() - state.lastRunAt > 20 * HOUR_MS &&
        Date.now() - bootedAt >= CATCHUP_GRACE_MS
      ) {
        bootCatchupDone = true;
        await autoRunSafe("auto-catchup");
      }
    } catch { /* never kill the interval */ }
  }

  function startScheduler() {
    if (schedulerTimer) return;
    schedulerTimer = setInterval(schedulerTick, 30000);
    schedulerTimer.unref?.();
  }

  // ---------------- real-time watcher ----------------

  let watchers = [];
  let debounceTimer = null;
  let lastRealtimeAt = 0;
  const REALTIME_MIN_INTERVAL_MS = 60 * 1000;

  function isIgnoredRel(rel) {
    if (!rel) return false;
    const r = String(rel).split("\\").join("/");
    for (const rule of WATCH_IGNORE) {
      if (rule.endsWith("/")) { if (r.startsWith(rule) || r.includes("/" + rule)) return true; }
      else if (rule.startsWith("*")) { if (r.endsWith(rule.slice(1))) return true; }
      else if (r === rule || r.startsWith(rule) || r.includes("/" + rule)) return true;
    }
    return false;
  }

  function onWatchEvent(filename) {
    try {
      const cfg = core.loadConfig();
      if (!cfg.realtime.enabled) return;
      if (isIgnoredRel(filename)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(realtimeTick, Math.max(10, cfg.realtime.debounceSeconds) * 1000);
      debounceTimer.unref?.();
    } catch { /* ignore */ }
  }

  async function realtimeTick() {
    if (busy) return;
    if (Date.now() - lastRealtimeAt < REALTIME_MIN_INTERVAL_MS) return;
    busy = true;
    try {
      const st = await core.computeStatus({});
      if (st.state === "upload" || st.state === "diverged" || st.state === "behind" || st.state === "conflict") {
        lastRealtimeAt = Date.now();
        await autoRunSafe("realtime");
      }
    } catch { /* ignore */ } finally { busy = false; }
  }

  function startWatcher() {
    const cfg = core.loadConfig();
    if (!cfg.realtime.enabled || watchers.length > 0) return;
    try {
      const w = watch(core.dshDir, { recursive: true }, (_event, filename) => onWatchEvent(filename));
      w.unref?.();
      watchers.push(w);
    } catch {
      try {
        // Linux without recursive support: watch top-level entries only
        const w2 = watch(core.dshDir, (_event, filename) => onWatchEvent(filename));
        w2.unref?.();
        watchers.push(w2);
      } catch { /* fs.watch unavailable; daily scheduler still guards */ }
    }
  }

  function stopWatchers() {
    for (const w of watchers) { try { w.close(); } catch {} }
    watchers = [];
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  }

  // ---------------- small helpers ----------------

  function todayKeySafe() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function parseTimeSafe(hhmm) {
    const [h, m] = String(hhmm || "23:00").split(":").map((x) => parseInt(x, 10));
    const t = new Date();
    t.setHours(Number.isFinite(h) ? h : 23, Number.isFinite(m) ? m : 0, 0, 0);
    return t;
  }

  async function autoRunSafe(type) {
    const r = await core.autoRun(type);
    // keep module-level state in sync with the core's log-driven UI
    return r;
  }

  // ---------------- HTTP routes ----------------

  const registerRoutes = (webServer) => {
    const disposers = [];
    const reg = (route) => {
      const d = webServer.register(route);
      if (typeof d === "function") disposers.push(d);
    };

    // 1. GET status — state detection (?force=1 forces a remote fetch)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/status",
      handler: async (req, res) => {
        try {
          const force = /[?&]force=1/.test(req.url || "");
          const status = await core.computeStatus({ force });
          sendJson(res, 200, {
            ...status,
            scheduler: core.schedulerInfo(),
            pollIntervalMs: Math.max(5, core.loadConfig().localScanSeconds) * 1000,
            trackedPaths: TRACKED_PATHS.length
          });
        } catch (err) {
          sendJson(res, 500, { error: String(err.message || err) });
        }
      }
    });

    // 2. POST push — local ➜ GitHub (bridges first, pathspec-safe add)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/push",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const r = await core.pushOp();
          const status = await core.computeStatus({});
          sendJson(res, 200, {
            ok: true,
            message: r.skipped ? r.message : (r.message || "本地配置已成功推送到 GitHub！"),
            committed: r.committed, pushed: r.pushed, skipped: r.skipped,
            bridges: r.bridges, status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 3. POST pull — GitHub ➜ local (conflict self-heal, deps, bridges, config)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/pull",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const r = await core.pullOp();
          const status = await core.computeStatus({});
          sendJson(res, 200, {
            ok: true,
            pluginsUpdated: r.depsChanged,
            configChanged: r.configChanged,
            bridgesRestored: r.bridgesRestored,
            repair: r.repair,
            message: r.skipped ? r.message : (r.message || "配置已成功从 GitHub 同步到本地！"),
            status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 4. GET / POST config — settings read/write (config.json is repo-shared)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/config",
      handler: async (req, res) => {
        try {
          if (req.method === "POST") {
            const raw = await readBody(req);
            let parsed = {};
            try { parsed = JSON.parse(raw || "{}"); } catch { /* keep {} */ }
            const saved = core.saveConfig(parsed);
            // apply realtime toggle immediately
            stopWatchers();
            startWatcher();
            sendJson(res, 200, { ok: true, config: saved });
          } else {
            sendJson(res, 200, { ok: true, config: core.loadConfig() });
          }
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        }
      }
    });

    // 5. POST auto-run — manual dry-run of the daily flow (pull-first, then push)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/auto-run",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const r = await core.autoRun("manual");
          sendJson(res, 200, {
            ok: r.entry.ok,
            message: r.entry.ok ? `试运行完成：${r.entry.detail}` : `试运行失败：${r.entry.detail}`,
            entry: r.entry,
            status: r.status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 6. GET log — recent sync history (machine-local)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/log",
      handler: async (_req, res) => {
        const state = core.getState();
        sendJson(res, 200, { ok: true, log: state.log || [], lastRunDate: state.lastRunDate });
      }
    });

    // 7. POST repair — one-click conflict / stuck-state recovery (v2)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/repair",
      handler: async (_req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const repair = await core.repairGitState();
          const status = await core.computeStatus({ force: true });
          const ok = repair.ok;
          core.appendLog({ ts: Date.now(), type: "repair", ok, pulled: false, pushed: false, depsInstalled: false,
            detail: ok ? (repair.actions.join("；") || "仓库状态正常，无需修复") : repair.actions.join("；") });
          sendJson(res, 200, {
            ok,
            actions: repair.actions,
            message: ok ? (repair.actions.length ? "已自动修复：" + repair.actions.join("；") : "仓库状态正常，无需修复。") : "自动修复未完成，请查看 actions 详情。",
            status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 8. POST bridge-sync — copy tool configs into bridges/ and push (v2)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/bridge-sync",
      handler: async (req, res) => {
        if (busy) return sendJson(res, 409, { ok: false, error: "另一个同步任务正在执行，请稍候" });
        busy = true;
        try {
          const raw = await readBody(req);
          let body = {};
          try { body = JSON.parse(raw || "{}"); } catch { /* keep {} */ }
          const cfg = core.loadConfig();
          const targets = ADAPTER_PRESETS.filter((p) => {
            if (body.id) return p.id === body.id;
            const u = cfg.adapters[p.id];
            return u && u.enabled;
          });
          const results = [];
          for (const preset of targets) {
            const u = cfg.adapters[preset.id];
            results.push({ id: preset.id, ...(await core.bridgeCopyOut(preset, u && u.path)) });
          }
          const r = await core.pushOp({ message: `chore(sync): bridge ${targets.map((t) => t.id).join(", ") || "adapters"} ${fmtLocal(Date.now())}` });
          const status = await core.computeStatus({});
          sendJson(res, 200, {
            ok: true,
            message: `已桥接 ${results.filter((x) => x.copied.length > 0).length} 个工具配置并推送`,
            results, push: r, status
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        } finally { busy = false; }
      }
    });

    // 9. GET adapters — per-tool detection report (v2)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/adapters",
      handler: async (_req, res) => {
        try {
          sendJson(res, 200, { ok: true, adapters: await core.adapterStatus() });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err.message || err) });
        }
      }
    });

    startScheduler();
    startWatcher();

    return () => {
      if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null; }
      stopWatchers();
      for (const d of disposers) { try { d(); } catch { /* ignore */ } }
    };
  };

  ctx.inject(["webServer"], (sub) => {
    const webServer = sub.get("webServer");
    if (!webServer) return;
    return registerRoutes(webServer);
  });
}

export { name };
