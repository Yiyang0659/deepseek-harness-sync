window.__ModuleLoader__.load({
  id: "dsh-git-sync",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement: h, useState, useEffect, useRef } = require("react");
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
      upload: (s, c) => icon([
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "17 8 12 3 7 8" }),
        h("line", { x1: 12, y1: 3, x2: 12, y2: 15 })
      ], s, c, 2.2),
      download: (s, c) => icon([
        h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
        h("polyline", { points: "7 10 12 15 17 10" }),
        h("line", { x1: 12, y1: 15, x2: 12, y2: 3 })
      ], s, c, 2.2),
      refresh: (s, c) => icon([
        h("polyline", { points: "23 4 23 10 17 10" }),
        h("polyline", { points: "1 20 1 14 7 14" }),
        h("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
      ], s, c),
      check: (s, c) => icon([h("polyline", { points: "20 6 9 17 4 12" })], s, c, 2.5),
      gear: (s, c) => icon([
        h("circle", { cx: 12, cy: 12, r: 3 }),
        h("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
      ], s, c)
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

    // ---------------- 样式常量 ----------------
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

    // ---------------- 主组件 ----------------
    function GitSyncHeaderWidget() {
      const [status, setStatus] = useState(null);
      const [loading, setLoading] = useState(false);
      const [loadingType, setLoadingType] = useState(""); // push | pull | status | auto | save
      const [toast, setToast] = useState(null);
      const [showPopover, setShowPopover] = useState(false);
      const [tab, setTab] = useState("status");            // status | settings
      const [log, setLog] = useState([]);
      const [cfgLoaded, setCfgLoaded] = useState(false);
      const [scanSec, setScanSec] = useState(10);
      const [form, setForm] = useState(null);              // 设置表单副本
      const popoverRef = useRef(null);
      const scanTimerRef = useRef(null);

      const refreshStatus = async (silent = true, force = false) => {
        if (!silent) { setLoading(true); setLoadingType("status"); }
        const st = await getJson(`/plugins/git-sync/status${force ? "?force=1" : ""}`);
        if (st) {
          setStatus(st);
          if (st.pollIntervalMs) setScanSec(Math.round(st.pollIntervalMs / 1000));
        }
        if (!silent) { setLoading(false); setLoadingType(""); }
      };

      const refreshLog = async () => {
        const r = await getJson("/plugins/git-sync/log");
        if (r?.ok) setLog(r.log || []);
      };

      const loadConfig = async () => {
        const r = await getJson("/plugins/git-sync/config");
        if (r?.ok && r.config) {
          setForm(r.config);
          setScanSec(Number(r.config.localScanSeconds) || 10);
          setCfgLoaded(true);
        }
      };

      // 轮询：按配置的本地扫描频率；窗口聚焦时立即检查
      useEffect(() => {
        if (!cfgLoaded) return;
        refreshStatus(true);
        if (scanTimerRef.current) clearInterval(scanTimerRef.current);
        scanTimerRef.current = setInterval(() => refreshStatus(true), Math.max(5, scanSec) * 1000);
        return () => clearInterval(scanTimerRef.current);
      }, [cfgLoaded, scanSec]);

      useEffect(() => {
        loadConfig();
        const onFocus = () => refreshStatus(true);
        win.addEventListener?.("focus", onFocus);
        return () => win.removeEventListener?.("focus", onFocus);
      }, []);

      useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(t);
      }, [toast]);

      useEffect(() => {
        if (!showPopover) return;
        if (tab === "status") refreshLog();
        const handler = (e) => {
          if (popoverRef.current && !popoverRef.current.contains(e.target)) setShowPopover(false);
        };
        win.document?.addEventListener("mousedown", handler);
        return () => win.document?.removeEventListener("mousedown", handler);
      }, [showPopover, tab]);

      const runBusy = async (type, fn, okText) => {
        if (loading) return;
        setLoading(true);
        setLoadingType(type);
        const res = await fn();
        setLoading(false);
        setLoadingType("");
        if (res.ok !== false) {
          setToast({ text: res.message || okText, type: res.ok ? "success" : "error" });
          if (res.status) setStatus(res.status);
          else refreshStatus(true);
          refreshLog();
        } else {
          setToast({ text: res.error || "操作失败", type: "error" });
        }
      };

      const handlePush = () => runBusy("push", () => postJson("/plugins/git-sync/push"), "已推送");
      const handlePull = () => runBusy("pull", () => postJson("/plugins/git-sync/pull"), "已拉取");
      const handleAutoRun = () => runBusy("auto", () => postJson("/plugins/git-sync/auto-run"), "试运行完成");
      // 强制刷新走 status?force=1
      const forceRefresh = async () => {
        if (loading) return;
        setLoading(true); setLoadingType("status");
        await refreshStatus(false, true);
      };

      const handleSaveConfig = async () => {
        if (!form || loading) return;
        setLoading(true); setLoadingType("save");
        const r = await postJson("/plugins/git-sync/config", form);
        setLoading(false); setLoadingType("");
        if (r.ok) {
          setForm(r.config);
          setScanSec(Number(r.config.localScanSeconds) || 10);
          setToast({ text: "设置已保存并同步到配置仓库", type: "success" });
        } else {
          setToast({ text: r.error || "保存失败", type: "error" } );
        }
      };

      // ---------- 四态徽标颜色 ----------
      let dotColor = "#10b981";
      let statusLabel = "Git: 已同步";
      let statusTitle = "本地与 GitHub 配置完全一致";
      const stState = status?.state;
      if (!status) {
        dotColor = "#64748b"; statusLabel = "Git: …"; statusTitle = "正在获取状态";
      } else if (stState === "no-repo") {
        dotColor = "#64748b"; statusLabel = "Git: 未就绪"; statusTitle = status.error || "本地未初始化 Git 仓库";
      } else if (stState === "no-remote") {
        dotColor = "#f59e0b"; statusLabel = "Git: 未关联"; statusTitle = "尚未关联 GitHub 远程仓库";
      } else if (stState === "diverged") {
        dotColor = "#a855f7"; statusLabel = `Git: ⚠ 双向分叉`; statusTitle = `本地 ↑${status.ahead} / 云端 ↓${status.behind}，点击【Git与本地同步】自动 rebase 合并`;
      } else if (stState === "behind") {
        dotColor = "#3b82f6"; statusLabel = `Git: ↓${status.behind} 待拉取`; statusTitle = "云端有新提交，请点击【Git与本地同步】";
      } else if (stState === "upload") {
        dotColor = "#f59e0b";
        const aheadText = status.ahead > 0 ? `↑${status.ahead}` : "";
        statusLabel = `Git: ${[aheadText, status.dirty ? "有修改" : ""].filter(Boolean).join(" ")} 待上传`;
        statusTitle = "本地配置已变更，请点击【本地与Git同步】";
      }

      const sch = status?.scheduler;
      const busyText = loadingType === "push" ? "正在上传..." :
        loadingType === "pull" ? "正在拉取..." :
        loadingType === "auto" ? "试运行中..." : "";

      return h("div", { style: { display: "inline-flex", alignItems: "center", gap: "6px", position: "relative", marginLeft: "4px" } },
        // 徽标
        h("button", {
          type: "button", onClick: () => setShowPopover(!showPopover), title: `${statusTitle} · 点击查看详情`,
          style: { ...pillBtn({ padding: "3px 9px", fontSize: "11.5px" }) }
        },
          h("span", { style: { display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` } }),
          Icons.gitBranch(11, "var(--dsw-alias-label-secondary, #94a3b8)"),
          h("span", { style: { fontSize: "11px" } }, statusLabel)
        ),
        // 上传按钮
        h("button", { type: "button", disabled: loading, onClick: handlePush,
          title: "【本地与Git同步】提交并推送本机模型/插件配置到 GitHub",
          style: pillBtn({ opacity: loading && loadingType !== "push" ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer",
            color: loadingType === "push" ? "#93c5fd" : undefined }) },
          Icons.upload(11, loadingType === "push" ? "#93c5fd" : "#38bdf8"),
          h("span", null, loadingType === "push" ? "正在上传..." : "本地与Git同步")
        ),
        // 拉取按钮
        h("button", { type: "button", disabled: loading, onClick: handlePull,
          title: "【Git与本地同步】拉取 GitHub 最新配置并自动安装插件依赖",
          style: pillBtn({ opacity: loading && loadingType !== "pull" ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer",
            color: loadingType === "pull" ? "#93c5fd" : undefined }) },
          Icons.download(11, loadingType === "pull" ? "#93c5fd" : "#34d399"),
          h("span", null, loadingType === "pull" ? "正在拉取..." : "Git与本地同步")
        ),

        // ---------------- 面板 ----------------
        showPopover && h("div", {
          ref: popoverRef,
          style: {
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 99999,
            width: "330px", background: "var(--dsw-alias-bg-layer-1, #0f172a)",
            border: "1px solid var(--dsw-alias-border-l1, #334155)", borderRadius: "10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)", padding: "12px 14px",
            color: "var(--dsw-alias-label-primary, #f8fafc)", fontSize: "12px",
            fontFamily: "var(--dsw-font-family, sans-serif)"
          }
        },
          // 标题行
          h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "8px", marginBottom: "8px", borderBottom: "1px solid var(--dsw-alias-border-l2, #334155)" } },
            h("div", { style: { fontWeight: 700, fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" } },
              Icons.gitBranch(13, "#38bdf8"), "Git 配置同步中心"
            ),
            h("div", { style: { display: "flex", gap: "4px" } },
              h("button", { type: "button", onClick: forceRefresh, title: "强制刷新（立即 fetch 云端）",
                style: { background: "transparent", border: "none", color: "var(--dsw-alias-label-secondary, #94a3b8)", cursor: "pointer", padding: "2px 5px", borderRadius: "4px" } },
                Icons.refresh(12)),
              h("button", { type: "button", onClick: () => setTab(tab === "status" ? "settings" : "status"),
                title: "状态 / 设置切换",
                style: { background: "transparent", border: "none", color: tab === "settings" ? "#38bdf8" : "var(--dsw-alias-label-secondary, #94a3b8)", cursor: "pointer", padding: "2px 5px", borderRadius: "4px" } },
                Icons.gear(13))
            )
          ),
          // Tabs
          h("div", { style: { display: "flex", gap: "6px", marginBottom: "8px" } },
            h("button", { type: "button", onClick: () => setTab("status"),
              style: { flex: 1, padding: "4px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (tab === "status" ? "#0284c7" : "transparent"),
                background: tab === "status" ? "rgba(2,132,199,.25)" : "transparent", color: "inherit" } }, "📊 同步状态"),
            h("button", { type: "button", onClick: () => setTab("settings"),
              style: { flex: 1, padding: "4px 0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, cursor: "pointer",
                border: "1px solid " + (tab === "settings" ? "#0284c7" : "transparent"),
                background: tab === "settings" ? "rgba(2,132,199,.25)" : "transparent", color: "inherit" } }, "⚙️ 定时与频率")
          ),

          // ======== 状态页 ========
          tab === "status" && h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "11.5px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: fieldLabel }, "远程仓库:"),
              h("span", { style: { fontWeight: 600, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: status?.remote || "未配置" },
                status?.remote ? status.remote.replace(/^https?:\/\/github\.com\//, "") : "未配置 origin")),
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: fieldLabel }, "当前分支:"),
              h("span", { style: { fontWeight: 600 } }, status?.branch || "main")),
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: fieldLabel }, "同步状态:"),
              h("span", { style: { fontWeight: 700, color: dotColor } },
                stState === "synced" ? "✅ 实时已同步" :
                stState === "diverged" ? "⚠️ 双向分叉（先拉后推可自动合并）" :
                stState === "behind" ? `☁️ 云端超前 ${status.behind} 个提交` :
                stState === "upload" ? "📝 本地有待上传变更" : "未就绪")),
            sch && h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: fieldLabel }, "每日自动同步:"),
              h("span", { style: { fontWeight: 600, color: "#34d399" } }, `${sch.dailyTime} · ${sch.nextRunText}`)),
            status?.dirtyFiles?.length > 0 && h("div", { style: { background: "var(--dsw-alias-bg-layer-2, #1e293b)", borderRadius: "6px", padding: "6px 8px", marginTop: "2px" } },
              h("div", { style: { ...fieldLabel, marginBottom: "3px" } }, "本地已修改:"),
              status.dirtyFiles.slice(0, 4).map((f, i) =>
                h("div", { key: i, style: { fontSize: "10.5px", color: "#fde68a" } }, `• ${f}`)),
              status.dirtyFiles.length > 4 && h("div", { style: { fontSize: "10.5px", color: "#94a3b8" } }, `...等 ${status.dirtyFiles.length} 项`)),

            // 最近同步记录
            h("div", { style: { marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)" } },
              h("div", { style: { ...fieldLabel, marginBottom: "4px" } }, "最近同步记录"),
              log.length === 0 ? h("div", { style: { fontSize: "10.5px", color: "#64748b" } }, "暂无记录") :
                log.slice(0, 5).map((e, i) => h("div", { key: i, style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "10.5px", padding: "2px 0" } },
                  h("span", null,
                    e.type === "manual" ? "🖐" : e.type === "auto-catchup" ? "⚡" : "🌙"),
                  h("span", { style: { color: "#94a3b8", flexShrink: 0 } }, fmtTime(e.ts)),
                  h("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: e.ok ? "#a7f3d0" : "#fca5a5" }, title: e.detail },
                    `${e.pulled ? "↓" : ""}${e.pushed ? "↑" : "·"} ${e.ok ? e.detail : "失败: " + e.detail}`)
                ))),

            h("div", { style: { display: "flex", gap: "8px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--dsw-alias-border-l2, #334155)" } },
              h("button", { type: "button", onClick: handlePush, disabled: loading,
                style: { flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #0284c7", background: "#0369a1", color: "#fff", fontSize: "11px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" } }, "⬆️ 本地 ➔ Git"),
              h("button", { type: "button", onClick: handlePull, disabled: loading,
                style: { flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #059669", background: "#047857", color: "#fff", fontSize: "11px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" } }, "⬇️ Git ➔ 本地"))
          ),

          // ======== 设置页 ========
          tab === "settings" && form && h("div", { style: { display: "flex", flexDirection: "column", gap: "10px", fontSize: "11.5px" } },
            h("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
              h("span", { style: fieldLabel }, "本地扫描频率（检测自己改了什么）"),
              h("select", { value: String(form.localScanSeconds), onChange: (e) => setForm({ ...form, localScanSeconds: Number(e.target.value) }), style: selectStyle },
                h("option", { value: "10" }, "每 10 秒（推荐）"),
                h("option", { value: "30" }, "每 30 秒（省电）"),
                h("option", { value: "60" }, "每 60 秒"))),
            h("label", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
              h("span", { style: fieldLabel }, "云端巡检频率（检测另一台电脑的更新）"),
              h("select", { value: String(form.remoteFetchMinutes), onChange: (e) => setForm({ ...form, remoteFetchMinutes: Number(e.target.value) }), style: selectStyle },
                h("option", { value: "1" }, "每 1 分钟"),
                h("option", { value: "5" }, "每 5 分钟（推荐）"),
                h("option", { value: "15" }, "每 15 分钟"))),
            h("div", { style: { borderTop: "1px dashed var(--dsw-alias-border-l2, #334155)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "8px" } },
              h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: { fontWeight: 600 } }, "🌙 每日自动同步"),
                h("input", { type: "checkbox", checked: !!form.autoSyncEnabled, onChange: (e) => setForm({ ...form, autoSyncEnabled: e.target.checked }) })),
              form.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: fieldLabel }, "执行时间"),
                h("input", { type: "time", value: form.dailyTime, onChange: (e) => setForm({ ...form, dailyTime: e.target.value }),
                  style: { ...selectStyle, paddingRight: "4px" } })),
              form.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: fieldLabel }, "先拉取再推送（推荐）"),
                h("input", { type: "checkbox", checked: !!form.pullFirst, onChange: (e) => setForm({ ...form, pullFirst: e.target.checked }) })),
              form.autoSyncEnabled && h("label", { style: { display: "flex", alignItems: "center", justifyContent: "space-between" } },
                h("span", { style: fieldLabel }, "错过计划时开机补跑"),
                h("input", { type: "checkbox", checked: !!form.catchUpOnStartup, onChange: (e) => setForm({ ...form, catchUpOnStartup: e.target.checked }) }))),
            h("div", { style: { display: "flex", gap: "8px" } },
              h("button", { type: "button", onClick: handleSaveConfig, disabled: loading,
                style: { flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #0284c7", background: "#0369a1", color: "#fff", fontSize: "11px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" } },
                loadingType === "save" ? "保存中..." : "💾 保存设置"),
              h("button", { type: "button", onClick: handleAutoRun, disabled: loading,
                style: { flex: 1, padding: "5px 8px", borderRadius: "6px", border: "1px solid #475569", background: "transparent", color: "var(--dsw-alias-label-primary,#f8fafc)", fontSize: "11px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" } },
                loadingType === "auto" ? "运行中..." : "▶️ 立即试运行一次")),
            h("div", { style: { fontSize: "10px", color: "#64748b", lineHeight: 1.5 } },
              "日程随 config.json 入库，两台电脑保持同一节奏；服务端调度，浏览器关闭后依然按时执行。")
          )
        ),

        // Toast
        toast && h("div", {
          style: {
            position: "fixed", bottom: "24px", right: "24px", zIndex: 999999,
            padding: "8px 14px", borderRadius: "8px", maxWidth: "360px",
            background: toast.type === "success" ? "#064e3b" : "#7f1d1d",
            border: `1px solid ${toast.type === "success" ? "#059669" : "#dc2626"}`,
            color: toast.type === "success" ? "#6ee7b7" : "#fca5a5",
            fontSize: "12.5px", fontWeight: 600,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", gap: "8px"
          }
        }, toast.type === "success" ? Icons.check(14) : null, toast.text)
      );
    }

    function apply(ctx) {
      ctx.slots.inject("conversation.session.header.actions", () => {
        return ctx.slots.register({
          name: "conversation.session.header.actions",
          id: "git-sync-controls",
          order: 15,
          label: "Git Sync"
        }, GitSyncHeaderWidget);
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
