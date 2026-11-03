// dsh-git-sync v2 — client plugin (web)
// Header badge + panel (状态 / 设置) and, when dsh-better-sidebar is present,
// a full-width "Git 同步中心" sidebar page registered through ctx.betterSidebar.

window.__ModuleLoader__.load({
  id: "dsh-git-sync",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement: h, useState, useEffect, useRef, useCallback } = require("react");
    const win = globalThis;
    const base = win.location?.origin ?? "";

    const name = "dsh-git-sync-client";
    const inject = ["slots"];

    // ---------------- SVG Icons ----------------
    const icon = (paths, size = 12, color = "currentColor", sw = 2) =>
      h("svg", {
        viewBox: "0 0 24 24", width: size, height: size, fill: "none",
        stroke: color, strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round",
        style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }
      }, ...paths);

    const Icons = {
      gitBranch: (s, c) => icon([
        h("line", { x1: 6, y1: 3, x2: 6, y2: 15 }),
        h("circle", { cx: 18, cy: 6, r: 3 }),
        h("circle", { cx: 6, cy: 18, r: 3 }),
        h("path", { d: "M18 9a9 9 0 0 1-9 9" })
      ], s, c),
      check: (s, c) => icon([h("polyline", { points: "20 6 9 17 4 12" })], s, c, 2.5),
      refresh: (s, c) => icon([
        h("polyline", { points: "23 4 23 10 17 10" }),
        h("polyline", { points: "1 20 1 14 7 14" }),
        h("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
      ], s, c),
      gear: (s, c) => icon([
        h("circle", { cx: 12, cy: 12, r: 3 }),
        h("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
      ], s, c),
      wrench: (s, c) => icon([
        h("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" })
      ], s, c),
      bolt: (s, c) => icon([h("polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2" })], s, c),
      box: (s, c) => icon([
        h("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }),
        h("polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }),
        h("line", { x1: 12, y1: 22.08, x2: 12, y2: 12 })
      ], s, c),
      upload: (s, c) => icon([
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "17 8 12 3 7 8" }),
        h("line", { x1: 12, y1: 3, x2: 12, y2: 15 })
      ], s, c, 2.2),
      download: (s, c) => icon([
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "7 10 12 15 17 10" }),
        h("line", { x1: 12, y1: 15, x2: 12, y2: 3 })
      ], s, c, 2.2)
    };

    // ---------------- API ----------------
    const getJson = async (path) => {
      try {
        const res = await win.fetch?.(base + path);
        if (!res || !res.ok) return null;
        return await res.json();
      } catch { return null; }
    };
    const postJson = async (path, body = {}) => {
      try {
        const res = await win.fetch?.(base + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res) return { ok: false, error: "网络请求失败" };
        return await res.json();
      } catch (err) { return { ok: false, error: err.message }; }
    };

    const fmtTime = (ts) => {
      try {
        return new Date(ts).toLocaleString("zh-CN", {
          month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
        });
      } catch { return ""; }
    };

    // ---------------- shared styles ----------------
    const pillBtn = (extra = {}) => ({
      background: "var(--dsw-alias-bg-layer-2, #1e293b)",
      border: "1px solid var(--dsw-alias-border-l2, #334155)",
      borderRadius: "999px",
      padding: "3px 10px",
      fontSize: "11px",
      fontWeight: 600,
      lineHeight: 1.5,
      color: "var(--dsw-alias-label-primary, #f8fafc)",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      transition: "all 0.15s ease",
      userSelect: "none",
      ...extra
    });
    const fieldLabel = { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #94a3b8)" };
    const selectStyle = {
      background: "var(--dsw-alias-bg-layer-2, #1e293b)",
      border: "1px solid var(--dsw-alias-border-l2, #334155)",
      borderRadius: "6px", color: "var(--dsw-alias-label-primary, #f8fafc)",
      fontSize: "11px", padding: "3px 6px", cursor: "pointer"
    };
    const cardStyle = {
      background: "var(--dsw-alias-bg-layer-2, #1e293b)",
      borderRadius: "6px", padding: "6px 8px"
    };
    const primaryBtn = (extra = {}) => ({
      flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #0284c7",
      background: "#0369a1", color: "#fff", fontSize: "11px", fontWeight: 600,
      cursor: "pointer", ...extra
    });
    const ghostBtn = (extra = {}) => ({
      flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #475569",
      background: "transparent", color: "var(--dsw-alias-label-primary, #f8fafc)",
      fontSize: "11px", fontWeight: 600, cursor: "pointer", ...extra
    });

    const STATE_META = {
      synced: { color: "#10b981", label: "Git: 已同步" },
      upload: { color: "#f59e0b", label: "Git: 待上传" },
      behind: { color: "#3b82f6", label: "Git: 待拉取" },
      diverged: { color: "#a855f7", label: "Git: 双向分叉" },
      conflict: { color: "#ef4444", label: "Git: 冲突" },
      "no-remote": { color: "#f59e0b", label: "Git: 未关联" },
      "no-repo": { color: "#64748b", label: "Git: 未就绪" }
    };

    function stateText(st) {
      switch (st) {
        case "synced": return "✅ 实时已同步";
        case "diverged": return "⚠️ 双向分叉（先拉后推可自动合并）";
        case "behind": return "☁️ 云端超前，待拉取";
        case "upload": return "📝 本地有待上传变更";
        case "conflict": return "🛑 存在冲突，可一键修复";
        case "no-remote": return "未配置 origin 远程";
        default: return "未就绪";
      }
    }

    // ============================================================
    // Shared sync hook: polling, config, operations, toast
    // ============================================================

    function useGitSync() {
      const [status, setStatus] = useState(null);
      const [loading, setLoading] = useState(false);
      const [loadingType, setLoadingType] = useState("");
      const [toast, setToast] = useState(null);
      const [log, setLog] = useState([]);
      const [form, setForm] = useState(null);
      const [cfgLoaded, setCfgLoaded] = useState(false);
      const [scanSec, setScanSec] = useState(10);
      const scanTimerRef = useRef(null);

      const refreshStatus = useCallback(async (silent = true, force = false) => {
        if (!silent) { setLoading(true); setLoadingType("status"); }
        const st = await getJson(`/plugins/git-sync/status${force ? "?force=1" : ""}`);
        if (st) {
          setStatus(st);
          if (st.pollIntervalMs) setScanSec(Math.round(st.pollIntervalMs / 1000));
        }
        if (!silent) { setLoading(false); setLoadingType(""); }
      }, []);

      const refreshLog = useCallback(async () => {
        const r = await getJson("/plugins/git-sync/log");
        if (r?.ok) setLog(r.log || []);
      }, []);

      const loadConfig = useCallback(async () => {
        const r = await getJson("/plugins/git-sync/config");
        if (r?.ok && r.config) {
          setForm(r.config);
          setScanSec(Number(r.config.localScanSeconds) || 10);
          setCfgLoaded(true);
        }
      }, []);

      useEffect(() => {
        loadConfig();
        const onFocus = () => refreshStatus(true);
        win.addEventListener?.("focus", onFocus);
        return () => win.removeEventListener?.("focus", onFocus);
      }, [loadConfig, refreshStatus]);

      // keep the recent-sync log fresh (header panel + sidebar page share it)
      useEffect(() => {
        refreshLog();
        const t = setInterval(refreshLog, 60000);
        return () => clearInterval(t);
      }, [refreshLog]);

      useEffect(() => {
        if (!cfgLoaded) return;
        refreshStatus(true);
        if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        scanTimerRef.current = setInterval(() => refreshStatus(true), Math.max(5, scanSec) * 1000);
        return () => clearInterval(scanTimerRef.current);
      }, [cfgLoaded, scanSec, refreshStatus]);

      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4200);
        return () => clearTimeout(t);
      }, [toast]);

      const runBusy = useCallback(async (type, fn, okText) => {
        if (loading) return null;
        setLoading(true);
        setLoadingType(type);
        const res = await fn();
        setLoading(false);
        setLoadingType("");
        if (res && res.ok !== false) {
          setToast({ text: res.message || okText, type: res.ok ? "success" : "error" });
          if (res.status) setStatus(res.status);
          else refreshStatus(true);
          refreshLog();
        } else {
          setToast({ text: (res && res.error) || "操作失败", type: "error" });
        }
        return res;
      }, [loading, refreshStatus, refreshLog]);

      const push = useCallback(() => runBusy("push", () => postJson("/plugins/git-sync/push"), "已推送"), [runBusy]);
      const pull = useCallback(() => runBusy("pull", () => postJson("/plugins/git-sync/pull"), "已拉取"), [runBusy]);
      const autoRun = useCallback(() => runBusy("auto", () => postJson("/plugins/git-sync/auto-run"), "试运行完成"), [runBusy]);
      const repair = useCallback(() => runBusy("repair", () => postJson("/plugins/git-sync/repair"), "修复完成"), [runBusy]);
      const bridgeSync = useCallback((id) => runBusy("bridge", () => postJson("/plugins/git-sync/bridge-sync", id ? { id } : {}), "适配器配置已桥接"), [runBusy]);

      const saveConfig = useCallback(async (next) => {
        if (loading) return null;
        setLoading(true); setLoadingType("save");
        const r = await postJson("/plugins/git-sync/config", next);
        setLoading(false); setLoadingType("");
        if (r.ok) {
          setForm(r.config);
          setScanSec(Number(r.config.localScanSeconds) || 10);
          setToast({ text: "设置已保存（config.json 将随仓库同步）", type: "success" });
          refreshStatus(true);
        } else {
          setToast({ text: r.error || "保存失败", type: "error" });
        }
        return r;
      }, [loading, refreshStatus]);

      return {
        status, loading, loadingType, toast, log, form, cfgLoaded, scanSec,
        setForm, refreshStatus, refreshLog, loadConfig, saveConfig,
        push, pull, autoRun, repair, bridgeSync
      };
    }

    function Toast({ toast }) {
      if (!toast) return null;
      return h("div", {
        style: {
          position: "fixed", bottom: "24px", right: "24px", zIndex: 999999,
          padding: "8px 14px", borderRadius: "8px", maxWidth: "380px",
          background: toast.type === "success" ? "#064e3b" : "#7f1d1d",
          border: `1px solid ${toast.type === "success" ? "#059669" : "#dc2626"}`,
          color: toast.type === "success" ? "#6ee7b7" : "#fca5a5",
          fontSize: "12.5px", fontWeight: 600,
          boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", gap: "8px"
        }
      }, toast.type === "success" ? Icons.check(14) : null, toast.text);
    }

    // ============================================================
    // Status body (popover + sidebar page share it)
    // ============================================================

    function ConflictBanner({ d }) {
      const st = d.status;
      if (!st) return null;
      const conflicted = st.state === "conflict";
      const needsRepair = conflicted || st.state === "diverged";
      if (!needsRepair) return null;
      return h("div", {
        style: {
          background: conflicted ? "rgba(239,68,68,.12)" : "rgba(168,85,247,.12)",
          border: `1px solid ${conflicted ? "#ef4444" : "#a855f7"}`,
          borderRadius: "6px", padding: "7px 9px", fontSize: "11px", lineHeight: 1.5
        }
      },
        h("div", { style: { fontWeight: 700, color: conflicted ? "#fca5a5" : "#d8b4fe", marginBottom: "3px" } },
          conflicted ? "🛑 检测到卡死的合并状态" : "⚠️ 本地与云端双向分叉"),
        h("div", { style: { color: "var(--dsw-alias-label-secondary, #94a3b8)" } },
          conflicted
            ? "v2 支持自动恢复：中止卡死的 rebase/merge 并清理冲突标记（不改动文件内容）。"
            : "先拉取再推送即可自动 rebase 合并。"),
        h("button", {
          type: "button", onClick: d.repair, disabled: d.loading,
          style: { ...ghostBtn({ flex: "none", marginTop: "6px", padding: "4px 10px", borderColor: conflicted ? "#ef4444" : "#a855f7", fontSize: "11px" }) }
        }, d.loadingType === "repair" ? "修复中..." : "🛠 一键修复")
      );
    }

    function AdapterChips({ d, onToggle, onBridge }) {
      const adapters = (d.status && d.status.adapters) || [];
      if (adapters.length === 0) return null;
      return h("div", null,
        h("div", { style: { ...fieldLabel, margin: "4px 0 4px", display: "flex", alignItems: "center", gap: "4px" } },
          Icons.box(11), "AI 工具配置适配器"),
        h("div", { style: { display: "flex", flexWrap: "wrap", gap: "4px" } },
          adapters.map((a) => {
            const on = a.enabled;
            const bg = on ? (a.found ? "rgba(5,150,105,.25)" : "rgba(245,158,11,.25)") : "var(--dsw-alias-bg-layer-2, #1e293b)";
            const border = on ? (a.found ? "#059669" : "#f59e0b") : "var(--dsw-alias-border-l2, #334155)";
            const title = `${a.name}\n${a.note}\n路径: ${a.path || "未检测到"}\n点击${on ? "停用" : "启用"}`;
            return h("button", {
              key: a.id, type: "button", title,
              onClick: () => onToggle(a),
              style: {
                background: bg, border: `1px solid ${border}`, borderRadius: "999px",
                padding: "2px 8px", fontSize: "10.5px", fontWeight: 600, cursor: "pointer",
                color: "var(--dsw-alias-label-primary, #f8fafc)", display: "inline-flex", gap: "4px", alignItems: "center"
              }
            },
              h("span", null, a.emoji || "🔧"),
              h("span", null, a.name),
              on ? h("span", { style: { color: a.found ? "#6ee7b7" : "#fde68a", fontSize: "9.5px" } }, a.found ? `✓${a.files}` : "未检测到") : null);
          })
        ),
        adapters.some((a) => a.enabled && a.found) && h("button", {
          type: "button", onClick: onBridge, disabled: d.loading,
          style: { ...ghostBtn({ flex: "none", marginTop: "6px", fontSize: "10.5px", padding: "3px 10px" }) }
        }, d.loadingType === "bridge" ? "桥接中..." : "⇄ 立即桥接已启用工具并上传")
      );
    }

    function StatusBody({ d, compact }) {
      const st = d.status;
      const meta = st ? (STATE_META[st.state] || STATE_META["no-repo"]) : { color: "#64748b" };
      const sch = st && st.scheduler;

      const toggleAdapter = (a) => {
        if (!d.form) return;
        const adapters = { ...d.form.adapters, [a.id]: { ...(d.form.adapters[a.id] || {}), enabled: !a.enabled } };
        d.saveConfig({ ...d.form, adapters });
      };

      return h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "11.5px" } },
        // repo rows
        h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "远程仓库:"),
          h("span", { style: { fontWeight: 600, maxWidth: compact ? "190px" : "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: (st && st.remote) || "未配置" },
            st && st.remote ? st.remote.replace(/^https?:\/\/github\.com\//, "") : "未配置 origin")),
        h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "当前分支:"),
          h("span", { style: { fontWeight: 600 } }, (st && st.branch) || "main")),
        h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "同步状态:"),
          h("span", { style: { fontWeight: 700, color: meta.color } }, st ? stateText(st.state) : "获取中…")),
        st && st.ahead > 0 && st.state !== "synced" && h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "领先/落后:"),
          h("span", { style: { fontWeight: 600 } }, `↑${st.ahead} / ↓${st.behind}`)),

        sch && h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "每日自动同步:"),
          h("span", { style: { fontWeight: 600, color: "#34d399" } }, `${sch.dailyTime} · ${sch.nextRunText}`)),
        st && st.realtime && h("div", { style: { display: "flex", justifyContent: "space-between" } },
          h("span", { style: fieldLabel }, "实时同步:"),
          h("span", { style: { fontWeight: 600, color: st.realtime.enabled ? "#34d399" : "#94a3b8" } },
            st.realtime.enabled ? `⚡ 已开启（变更后 ${st.realtime.debounceSeconds}s 自动同步）` : "已关闭")),

        ConflictBanner({ d }),

        // adapters
        AdapterChips({
          d, compact,
          onToggle: toggleAdapter,
          onBridge: () => d.bridgeSync()
        }),

        // dirty files
        st && st.dirtyFiles && st.dirtyFiles.length > 0 && h("div", { style: cardStyle },
          h("div", { style: { ...fieldLabel, marginBottom: "3px" } }, "本地已修改:"),
          st.dirtyFiles.slice(0, compact ? 4 : 8).map((f, i) =>
            h("div", { key: i, style: { fontSize: "10.5px", color: "#fde68a" } }, `• ${f}`)),
          st.dirtyFiles.length > (compact ? 4 : 8) && h("div", { style: { fontSize: "10.5px", color: "#94a3b8" } }, `...等 ${st.dirtyFiles.length} 项`)),

        // log
        h("div", { style: { marginTop: "2px", paddingTop: "6px", borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)" } },
          h("div", { style: { ...fieldLabel, marginBottom: "4px" } }, "最近同步记录"),
          d.log.length === 0 ? h("div", { style: { fontSize: "10.5px", color: "#64748b" } }, "暂无记录") :
            d.log.slice(0, compact ? 5 : 10).map((e, i) => h("div", { key: i, style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", padding: "2px 0" } },
              h("span", null,
                e.type === "manual" ? "🖐" : e.type === "repair" ? "🛠" : e.type === "realtime" ? "⚡" : e.type === "auto-catchup" ? "⏱" : "🌙"),
              h("span", { style: { color: "#94a3b8", flexShrink: 0 } }, fmtTime(e.ts)),
              h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: e.ok ? "#a7f3d0" : "#fca5a5" }, title: e.detail },
                `${e.pulled ? "↓" : ""}${e.pushed ? "↑" : "·"} ${e.ok ? e.detail : "失败: " + e.detail}`)
            ))),

        // actions
        h("div", { style: { display: "flex", gap: "8px", marginTop: "4px", paddingTop: "8px", borderTop: "1px solid var(--dsw-alias-border-l2, #334155)" } },
          h("button", { type: "button", onClick: d.push, disabled: d.loading,
            style: primaryBtn({ cursor: d.loading ? "not-allowed" : "pointer" }) }, d.loadingType === "push" ? "上传中…" : "⬆️ 本地 ➔ Git"),
          h("button", { type: "button", onClick: d.pull, disabled: d.loading,
            style: { ...primaryBtn({ border: "1px solid #059669", background: "#047857" }), cursor: d.loading ? "not-allowed" : "pointer" } },
            d.loadingType === "pull" ? "拉取中…" : "⬇️ Git ➔ 本地"))
      );
    }

    // ============================================================
    // Settings body
    // ============================================================

    function SettingsBody({ d }) {
      if (!d.form) return h("div", { style: { fontSize: "11px", color: "#64748b" } }, "设置读取中…");
      const f = d.form;
      const setF = (patch) => d.setForm({ ...f, ...patch });
      const adapters = (d.status && d.status.adapters) || [];

      return h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", fontSize: "11.5px" } },
        h("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          h("span", { style: fieldLabel }, "本地扫描频率（检测自己改了什么）"),
          h("select", { value: String(f.localScanSeconds), onChange: (e) => setF({ localScanSeconds: Number(e.target.value) }), style: selectStyle },
            h("option", { value: "10" }, "每 10 秒（推荐）"),
            h("option", { value: "30" }, "每 30 秒（省电）"),
            h("option", { value: "60" }, "每 60 秒"),
            h("option", { value: "300" }, "每 5 分钟"))),
        h("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
          h("span", { style: fieldLabel }, "云端巡检频率（检测另一台电脑的更新）"),
          h("select", { value: String(f.remoteFetchMinutes), onChange: (e) => setF({ remoteFetchMinutes: Number(e.target.value) }), style: selectStyle },
            h("option", { value: "1" }, "每 1 分钟"),
            h("option", { value: "5" }, "每 5 分钟（推荐）"),
            h("option", { value: "15" }, "每 15 分钟"))),

        // realtime
        h("div", { style: { borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "8px" } },
          h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: { fontWeight: 600 } }, "⚡ 实时同步（文件变更自动提交推送）"),
            h("input", { type: "checkbox", checked: !!(f.realtime && f.realtime.enabled), onChange: (e) => setF({ realtime: { ...(f.realtime || {}), enabled: e.target.checked } }) })),
          f.realtime && f.realtime.enabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: fieldLabel }, "变更静默期"),
            h("select", { value: String(f.realtime.debounceSeconds), onChange: (e) => setF({ realtime: { ...f.realtime, debounceSeconds: Number(e.target.value) } }), style: selectStyle },
              h("option", { value: "15" }, "15 秒"),
              h("option", { value: "30" }, "30 秒（推荐）"),
              h("option", { value: "60" }, "1 分钟"),
              h("option", { value: "120" }, "2 分钟")))),

        // daily
        h("div", { style: { borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "8px" } },
          h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: { fontWeight: 600 } }, "🌙 每日自动同步"),
            h("input", { type: "checkbox", checked: !!f.autoSyncEnabled, onChange: (e) => setF({ autoSyncEnabled: e.target.checked }) })),
          f.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: fieldLabel }, "执行时间"),
            h("input", { type: "time", value: f.dailyTime, onChange: (e) => setF({ dailyTime: e.target.value }),
              style: { ...selectStyle, paddingRight: "4px" } })),
          f.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: fieldLabel }, "先拉取再推送（推荐）"),
            h("input", { type: "checkbox", checked: !!f.pullFirst, onChange: (e) => setF({ pullFirst: e.target.checked }) })),
          f.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("span", { style: fieldLabel }, "错过计划时开机补跑"),
            h("input", { type: "checkbox", checked: f.catchUpOnStartup !== false, onChange: (e) => setF({ catchUpOnStartup: e.target.checked }) }))),

        // adapters detail
        h("div", { style: { borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "8px" } },
          h("div", { style: { fontWeight: 600 } }, "🧩 AI 工具适配器"),
          h("div", { style: { fontSize: "10px", color: "#64748b", lineHeight: 1.5 } },
            "启用后，对应工具的配置会镜像到仓库 bridges/ 目录，随 git 实时同步；拉取时自动写回。API 密钥等敏感文件仍建议排除。"),
          adapters.map((a) => {
            const conf = (f.adapters && f.adapters[a.id]) || {};
            return h("div", { key: a.id, style: { ...cardStyle, display: "flex", flexDirection: "column", gap: "4px" } },
              h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: { fontWeight: 600, fontSize: "11px" } }, `${a.emoji || "🔧"} ${a.name}`),
                h("input", {
                  type: "checkbox",
                  checked: !!(f.adapters && f.adapters[a.id] && f.adapters[a.id].enabled),
                  onChange: (e) => setF({ adapters: { ...(f.adapters || {}), [a.id]: { ...(f.adapters[a.id] || {}), enabled: e.target.checked } } })
                })),
              h("div", { style: { fontSize: "9.5px", color: a.found ? "#6ee7b7" : "#fbbf24" } },
                a.found ? `已检测: ${a.path}` : "未检测到默认路径，可手动指定"),
              h("input", {
                type: "text", value: conf.path || "", placeholder: "自定义路径（可选，支持 ~）",
                onChange: (e) => setF({ adapters: { ...(f.adapters || {}), [a.id]: { enabled: conf.enabled === true, path: e.target.value } } }),
                style: { ...selectStyle, width: "100%", boxSizing: "border-box", fontSize: "10.5px" }
              }));
          })),

        h("div", { style: { display: "flex", gap: "8px" } },
          h("button", { type: "button", onClick: () => d.saveConfig(f), disabled: d.loading,
            style: primaryBtn({ cursor: d.loading ? "not-allowed" : "pointer" }) },
            d.loadingType === "save" ? "保存中..." : "💾 保存设置"),
          h("button", { type: "button", onClick: d.autoRun, disabled: d.loading,
            style: ghostBtn({ cursor: d.loading ? "not-allowed" : "pointer" }) },
            d.loadingType === "auto" ? "运行中..." : "▶️ 立即试运行一次")),
        h("div", { style: { fontSize: "10px", color: "#64748b", lineHeight: 1.5 } },
          "设置保存在 git-sync/config.json 并随仓库入库；每日同步由服务端调度，浏览器关闭后依然按时执行。")
      );
    }

    // ============================================================
    // Header widget: badge + popover (状态 / 设置 tabs)
    // ============================================================

    function GitSyncHeaderWidget() {
      const d = useGitSync();
      const [showPopover, setShowPopover] = useState(false);
      const [tab, setTab] = useState("status");
      const popoverRef = useRef(null);

      useEffect(() => {
        if (!showPopover) return;
        if (tab === "status") d.refreshLog();
        const handler = (e) => {
          if (popoverRef.current && !popoverRef.current.contains(e.target)) setShowPopover(false);
        };
        win.document?.addEventListener("mousedown", handler);
        return () => win.document?.removeEventListener("mousedown", handler);
      }, [showPopover, tab, d.refreshLog]);

      // badge label
      let dotColor = "#64748b", statusLabel = "Git: …", statusTitle = "正在获取状态";
      const st = d.status;
      if (st) {
        const meta = STATE_META[st.state] || STATE_META["no-repo"];
        dotColor = meta.color;
        statusLabel = meta.label;
        statusTitle = st.error || stateTitleFor(st);
      }
      function stateTitleFor(st) {
        switch (st.state) {
          case "synced": return "本地与 GitHub 配置完全一致";
          case "behind": return `云端有 ${st.behind} 个新提交，打开面板点击【Git ➔ 本地】`;
          case "upload": return `本地有变更${st.ahead ? `（领先 ${st.ahead} 个提交）` : ""}，打开面板点击【本地 ➔ Git】`;
          case "diverged": return `本地 ↑${st.ahead} / 云端 ↓${st.behind}，先拉取再推送可自动合并`;
          case "conflict": return "存在未解决的合并冲突，可一键修复";
          case "no-remote": return "尚未关联 GitHub 远程仓库";
          default: return "本地未初始化 Git 仓库";
        }
      }

      return h("div", { style: { display: "inline-flex", alignItems: "center", gap: "6px", position: "relative", marginLeft: "4px" } },
        h("button", {
          type: "button", onClick: () => setShowPopover(!showPopover), title: `${statusTitle} · 点击查看详情`,
          style: { ...pillBtn({ padding: "3px 9px", fontSize: "11.5px" }) }
        },
          h("span", { style: { display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` } }),
          Icons.gitBranch(11, "var(--dsw-alias-label-secondary, #94a3b8)"),
          h("span", { style: { fontSize: "11px" } }, statusLabel)
        ),

        showPopover && h("div", {
          ref: popoverRef,
          style: {
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 99999,
            width: "340px", maxHeight: "76vh", overflowY: "auto",
            background: "var(--dsw-alias-bg-layer-1, #0f172a)",
            border: "1px solid var(--dsw-alias-border-l1, #334155)", borderRadius: "10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)", padding: "12px 14px",
            color: "var(--dsw-alias-label-primary, #f8fafc)", fontSize: "12px",
            fontFamily: "var(--dsw-font-family, sans-serif)"
          }
        },
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "8px", marginBottom: "8px", borderBottom: "1px solid var(--dsw-alias-border-l2, #334155)" } },
            h("div", { style: { fontWeight: 700, fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" } },
              Icons.gitBranch(13, "#38bdf8"), "Git 配置同步中心"),
            h("div", { style: { display: "flex", gap: "4px" } },
              h("button", { type: "button", onClick: () => d.refreshStatus(false, true), title: "强制刷新（立即 fetch 云端）",
                style: { background: "transparent", border: "none", color: "var(--dsw-alias-label-secondary, #94a3b8)", cursor: "pointer", padding: "2px 5px", borderRadius: "4px" } },
                Icons.refresh(12)),
              h("button", { type: "button", onClick: () => setTab(tab === "status" ? "settings" : "status"),
                title: "状态 / 设置切换",
                style: { background: "transparent", border: "none", color: tab === "settings" ? "#38bdf8" : "var(--dsw-alias-label-secondary, #94a3b8)", cursor: "pointer", padding: "2px 5px", borderRadius: "4px" } },
                Icons.gear(13))
            )
          ),
          h("div", { style: { display: "flex", gap: "6px", marginBottom: "8px" } },
            h("button", { type: "button", onClick: () => setTab("status"),
              style: { flex: 1, padding: "4px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (tab === "status" ? "#0284c7" : "transparent"),
                background: tab === "status" ? "rgba(2,132,199,.25)" : "transparent", color: "inherit" } }, "📊 同步状态"),
            h("button", { type: "button", onClick: () => setTab("settings"),
              style: { flex: 1, padding: "4px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (tab === "settings" ? "#0284c7" : "transparent"),
                background: tab === "settings" ? "rgba(2,132,199,.25)" : "transparent", color: "inherit" } }, "⚙️ 设置与适配器")
          ),
          tab === "status"
            ? h(StatusBody, { d, compact: true })
            : h(SettingsBody, { d })
        ),
        h(Toast, { toast: d.toast })
      );
    }

    // ============================================================
    // Sidebar page (dsh-better-sidebar integration, optional)
    // ============================================================

    function DashboardPage() {
      const d = useGitSync();
      return h("div", {
        style: {
          padding: "14px 16px", fontSize: "12px", height: "100%", boxSizing: "border-box",
          overflowY: "auto", color: "var(--dsw-alias-label-primary, #f8fafc)",
          fontFamily: "var(--dsw-font-family, sans-serif)", display: "flex", flexDirection: "column", gap: "14px"
        }
      },
        h("div", { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "13px" } },
          Icons.gitBranch(15, "#38bdf8"), "Git 配置同步中心",
          h("span", { style: { fontSize: "10px", fontWeight: 500, color: "var(--dsw-alias-label-secondary, #94a3b8)" } }, "v2 · multi-harness config sync")),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", alignItems: "start" } },
          h("div", null, h(StatusBody, { d, compact: false })),
          h("div", null, h(SettingsBody, { d }))),
        h(Toast, { toast: d.toast })
      );
    }

    function tryGetBetterSidebar(ctx) {
      try {
        if (ctx && ctx.betterSidebar && typeof ctx.betterSidebar.registerTab === "function") return ctx.betterSidebar;
        if (ctx && typeof ctx.get === "function") {
          const svc = ctx.get("betterSidebar");
          if (svc && typeof svc.registerTab === "function") return svc;
        }
      } catch { /* service not provided (plugin absent) */ }
      return null;
    }

    function watchBetterSidebar(ctx) {
      // dsh-better-sidebar is optional: poll briefly for its service and
      // register the full page when present. Degrades silently otherwise.
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        const svc = tryGetBetterSidebar(ctx);
        if (svc) {
          clearInterval(timer);
          try {
            svc.registerTab({
              id: "dsh-git-sync:center",
              title: "Git 同步中心",
              icon: (size) => Icons.gitBranch(size, "currentColor"),
              order: 85,
              single: true,
              component: () => h(DashboardPage, null)
            });
          } catch (err) { win.console?.warn?.("[dsh-git-sync] sidebar tab registration failed:", err); }
        } else if (attempts > 40) {
          clearInterval(timer);
        }
      }, 3000);
      if (timer.unref) timer.unref();
      return () => clearInterval(timer);
    }

    function apply(ctx) {
      let disposeSidebar = null;

      ctx.slots.inject("conversation.session.header.actions", () => {
        const dispose = ctx.slots.register({
          name: "conversation.session.header.actions",
          id: "git-sync-controls",
          order: 15,
          label: "Git Sync"
        }, GitSyncHeaderWidget);
        // one-shot sidebar integration per session
        if (!disposeSidebar) disposeSidebar = watchBetterSidebar(ctx);
        return dispose;
      });

      return () => { if (disposeSidebar) { try { disposeSidebar(); } catch { /* ignore */ } } };
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
