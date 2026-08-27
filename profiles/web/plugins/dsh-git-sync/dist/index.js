import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";

const execFileAsync = promisify(execFile);
const DSH_DIR = resolve(process.env.DSH_HOME || resolve(homedir(), ".dsh"));
const PROFILES_WEB_DIR = resolve(DSH_DIR, "profiles", "web");

async function runGit(args, cwd = DSH_DIR, timeout = 10000) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout,
      encoding: "utf8",
      windowsHide: true
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { ok: false, error: err.message, stderr: (err.stderr || "").trim(), stdout: (err.stdout || "").trim() };
  }
}

let lastStatusCache = null;
let lastFetchTime = 0;

async function checkGitStatus() {
  const isRepo = existsSync(resolve(DSH_DIR, ".git"));
  if (!isRepo) {
    return {
      isRepo: false,
      synced: false,
      remote: null,
      branch: null,
      ahead: 0,
      behind: 0,
      dirty: false,
      dirtyFiles: [],
      error: "本地尚未初始化 Git 仓库"
    };
  }

  // 1. Get current branch
  const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchRes.ok ? branchRes.stdout : "main";

  // 2. Get remote url
  const remoteRes = await runGit(["remote", "get-url", "origin"]);
  const remote = remoteRes.ok ? remoteRes.stdout : null;

  // 3. Check dirty files in tracked configs
  const statusRes = await runGit(["status", "--porcelain"]);
  const dirtyFiles = [];
  let dirty = false;
  if (statusRes.ok && statusRes.stdout) {
    const lines = statusRes.stdout.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const file = trimmed.replace(/^[MADRCU?! ]+\s+/, "");
      // Filter out ignored / unimportant stuff
      if (
        file.includes("settings.yaml") ||
        file.includes("package.json") ||
        file.includes("cordis") ||
        file.startsWith("skills") ||
        file.startsWith("plugins") ||
        file.includes(".credentials.yaml.example") ||
        file.includes("README") ||
        file.includes("sync") ||
        file.includes("restore")
      ) {
        dirty = true;
        dirtyFiles.push(file);
      }
    }
  }

  if (!remote) {
    return {
      isRepo: true,
      synced: false,
      remote: null,
      branch,
      ahead: 0,
      behind: 0,
      dirty,
      dirtyFiles,
      message: "未配置 GitHub 远程仓库 (origin)"
    };
  }

  // 4. Fetch remote status (cached every 15s to avoid rate limiting / lag)
  const now = Date.now();
  if (now - lastFetchTime > 15000) {
    lastFetchTime = now;
    await runGit(["fetch", "origin", branch], DSH_DIR, 6000);
  }

  // 5. Compare ahead / behind
  const countRes = await runGit(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]);
  let ahead = 0;
  let behind = 0;
  if (countRes.ok && countRes.stdout) {
    const parts = countRes.stdout.split(/\s+/);
    if (parts.length >= 2) {
      ahead = parseInt(parts[0], 10) || 0;
      behind = parseInt(parts[1], 10) || 0;
    }
  }

  const synced = !dirty && ahead === 0 && behind === 0;

  const result = {
    isRepo: true,
    synced,
    remote,
    branch,
    ahead,
    behind,
    dirty,
    dirtyFiles,
    lastChecked: new Date().toLocaleTimeString()
  };
  lastStatusCache = result;
  return result;
}

export function apply(ctx) {
  const registerRoutes = (webServer) => {
    const disposers = [];
    const reg = (route) => {
      const d = webServer.register(route);
      if (typeof d === "function") disposers.push(d);
    };

    const sendJson = (res, status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };

    // 1. GET status
    reg({
      kind: "exact",
      path: "/plugins/git-sync/status",
      handler: async (_req, res) => {
        try {
          const status = await checkGitStatus();
          sendJson(res, 200, status);
        } catch (err) {
          sendJson(res, 500, { error: err.message });
        }
      }
    });

    // 2. POST push (本地与 git 同步)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/push",
      handler: async (_req, res) => {
        try {
          // Stage files
          await runGit(["add", "settings.yaml", "profiles/web/package.json", "profiles/web/cordis.patch.yml", "profiles/web/cordis.yml", "profiles/web/pnpm-workspace.yaml", "skills/", ".credentials.yaml.example", ".gitignore", "README.md", "sync*", "restore*"]);
          
          const statusRes = await runGit(["status", "--porcelain"]);
          if (statusRes.ok && statusRes.stdout) {
            const timeStr = new Date().toLocaleString();
            await runGit(["commit", "-m", `Update DSH config (Web Sync): ${timeStr}`]);
          }

          const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
          const branch = branchRes.ok ? branchRes.stdout : "main";

          const pushRes = await runGit(["push", "origin", branch], DSH_DIR, 15000);
          if (!pushRes.ok) {
            sendJson(res, 500, { ok: false, error: pushRes.stderr || pushRes.error || "Git push 失败，请检查远程仓库权限或网络" });
            return;
          }

          const latestStatus = await checkGitStatus();
          sendJson(res, 200, { ok: true, message: "本地配置已成功同步推送到 GitHub！", status: latestStatus });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      }
    });

    // 3. POST pull (git 与 本地同步)
    reg({
      kind: "exact",
      path: "/plugins/git-sync/pull",
      handler: async (_req, res) => {
        try {
          const branchRes = await runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
          const branch = branchRes.ok ? branchRes.stdout : "main";

          const pkgPath = resolve(PROFILES_WEB_DIR, "package.json");
          let prevPkgMtime = existsSync(pkgPath) ? statSync(pkgPath).mtimeMs : 0;

          const pullRes = await runGit(["pull", "--rebase", "--autostash", "origin", branch], DSH_DIR, 20000);
          if (!pullRes.ok) {
            sendJson(res, 500, { ok: false, error: pullRes.stderr || pullRes.error || "Git pull 失败，请检查网络或冲突" });
            return;
          }

          let pluginsUpdated = false;
          let newPkgMtime = existsSync(pkgPath) ? statSync(pkgPath).mtimeMs : 0;
          if (newPkgMtime !== prevPkgMtime) {
            // Run pnpm install in background
            pluginsUpdated = true;
            try {
              await execFileAsync("pnpm", ["install"], { cwd: PROFILES_WEB_DIR, timeout: 60000 });
            } catch {
              try {
                await execFileAsync("npm", ["install"], { cwd: PROFILES_WEB_DIR, timeout: 60000 });
              } catch {}
            }
          }

          const latestStatus = await checkGitStatus();
          sendJson(res, 200, {
            ok: true,
            message: pluginsUpdated ? "配置与新插件已成功从 GitHub 同步并安装！" : "配置已成功从 GitHub 同步到本地！",
            pluginsUpdated,
            status: latestStatus
          });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      }
    });

    return () => {
      for (const d of disposers) {
        try { d(); } catch {}
      }
    };
  };

  ctx.inject(["webServer"], (sub) => {
    const webServer = sub.get("webServer");
    if (!webServer) return;
    return registerRoutes(webServer);
  });
}
