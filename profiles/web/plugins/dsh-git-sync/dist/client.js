window.__ModuleLoader__.load({
  id: "dsh-git-sync",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const { createElement: h, useState, useEffect, useRef } = require("react");
    const reactDom = require("react-dom");
    const win = globalThis;
    const bodyEl = win.document?.body ?? null;
    const base = win.location?.origin ?? "";

    const name = "dsh-git-sync-client";
    const inject = ["slots"];

    // SVG Icons
    const Icons = {
      gitBranch: (size = 13, color = "currentColor") =>
        h("svg", {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: color,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }
        },
          h("line", { x1: 6, y1: 3, x2: 6, y2: 15 }),
          h("circle", { cx: 18, cy: 6, r: 3 }),
          h("circle", { cx: 6, cy: 18, r: 3 }),
          h("path", { d: "M18 9a9 9 0 0 1-9 9" })
        ),
      upload: (size = 12, color = "currentColor") =>
        h("svg", {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: color,
          strokeWidth: 2.2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }
        },
          h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
          h("polyline", { points: "17 8 12 3 7 8" }),
          h("line", { x1: 12, y1: 3, x2: 12, y2: 15 })
        ),
      download: (size = 12, color = "currentColor") =>
        h("svg", {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: color,
          strokeWidth: 2.2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { display: "inline-block", verticalAlign: "-2px", flexShrink: 0 }
        },
          h("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
          h("polyline", { points: "7 10 12 15 17 10" }),
          h("line", { x1: 12, y1: 15, x2: 12, y2: 3 })
        ),
      refresh: (size = 11, color = "currentColor") =>
        h("svg", {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: color,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { display: "inline-block", verticalAlign: "-1px" }
        },
          h("polyline", { points: "23 4 23 10 17 10" }),
          h("polyline", { points: "1 20 1 14 7 14" }),
          h("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
        ),
      check: (size = 12, color = "#10b981") =>
        h("svg", {
          viewBox: "0 0 24 24",
          width: size,
          height: size,
          fill: "none",
          stroke: color,
          strokeWidth: 2.5,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        },
          h("polyline", { points: "20 6 9 17 4 12" })
        )
    };

    // API Helpers
    async function fetchStatus() {
      try {
        const res = await win.fetch?.(base + "/plugins/git-sync/status");
        if (!res || !res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    }

    async function doPush() {
      try {
        const res = await win.fetch?.(base + "/plugins/git-sync/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (!res) return { ok: false, error: "网络请求失败" };
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    async function doPull() {
      try {
        const res = await win.fetch?.(base + "/plugins/git-sync/pull", {
          method: "POST",
          headers: { "Content-Type": "application/json" }
        });
        if (!res) return { ok: false, error: "网络请求失败" };
        return await res.json();
      } catch (err) {
        return { ok: false, error: err.message };
      }
    }

    // Main Header Component
    function GitSyncHeaderWidget() {
      const [status, setStatus] = useState(null);
      const [loading, setLoading] = useState(false);
      const [loadingType, setLoadingType] = useState(""); // "push" | "pull" | "status"
      const [toast, setToast] = useState(null); // { text, type: "success"|"error" }
      const [showPopover, setShowPopover] = useState(false);
      const popoverRef = useRef(null);

      // Refresh Status
      const refreshStatus = async (silent = false) => {
        if (!silent) {
          setLoading(true);
          setLoadingType("status");
        }
        const st = await fetchStatus();
        if (st) setStatus(st);
        if (!silent) {
          setLoading(false);
          setLoadingType("");
        }
      };

      // Periodic check every 12 seconds & on focus
      useEffect(() => {
        refreshStatus(true);
        const timer = setInterval(() => refreshStatus(true), 12000);
        const onFocus = () => refreshStatus(true);
        win.addEventListener?.("focus", onFocus);
        return () => {
          clearInterval(timer);
          win.removeEventListener?.("focus", onFocus);
        };
      }, []);

      // Auto clear toast after 4s
      useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(null), 4000);
        return () => clearTimeout(timer);
      }, [toast]);

      // Click outside popover handler
      useEffect(() => {
        if (!showPopover) return;
        const handler = (e) => {
          if (popoverRef.current && !popoverRef.current.contains(e.target)) {
            setShowPopover(false);
          }
        };
        win.document?.addEventListener("mousedown", handler);
        return () => win.document?.removeEventListener("mousedown", handler);
      }, [showPopover]);

      // Handle Push (本地与 git 同步)
      const handlePush = async () => {
        if (loading) return;
        setLoading(true);
        setLoadingType("push");
        setShowPopover(false);
        const res = await doPush();
        setLoading(false);
        setLoadingType("");
        if (res.ok) {
          setToast({ text: res.message || "本地配置已成功推送到 GitHub！", type: "success" });
          if (res.status) setStatus(res.status);
          else refreshStatus(true);
        } else {
          setToast({ text: res.error || "同步上传失败", type: "error" });
        }
      };

      // Handle Pull (git 与 本地同步)
      const handlePull = async () => {
        if (loading) return;
        setLoading(true);
        setLoadingType("pull");
        setShowPopover(false);
        const res = await doPull();
        setLoading(false);
        setLoadingType("");
        if (res.ok) {
          setToast({ text: res.message || "已成功从 GitHub 同步配置！", type: "success" });
          if (res.status) setStatus(res.status);
          else refreshStatus(true);
        } else {
          setToast({ text: res.error || "同步拉取失败", type: "error" });
        }
      };

      // Compute status state & dot color
      let dotColor = "#10b981"; // green
      let statusLabel = "Git: 已同步";
      let statusTitle = "本地与 GitHub 配置完全一致";

      if (!status || !status.isRepo) {
        dotColor = "#64748b";
        statusLabel = "Git: 未就绪";
        statusTitle = status?.error || "本地未初始化 Git 仓库";
      } else if (!status.remote) {
        dotColor = "#f59e0b";
        statusLabel = "Git: 未关联";
        statusTitle = "尚未关联 GitHub 远程仓库 (origin)";
      } else if (status.behind > 0) {
        dotColor = "#3b82f6"; // blue
        statusLabel = `Git: ↓${status.behind} 待拉取`;
        statusTitle = `云端有 ${status.behind} 个新提交，请点击【Git与本地同步】`;
      } else if (status.dirty || status.ahead > 0) {
        dotColor = "#f59e0b"; // yellow / orange
        const aheadText = status.ahead > 0 ? `↑${status.ahead}` : "";
        const dirtyText = status.dirty ? "有修改" : "";
        statusLabel = `Git: ${[aheadText, dirtyText].filter(Boolean).join(" ")} 待上传`;
        statusTitle = `本地配置已变更，请点击【本地与Git同步】`;
      }

      return h("div", {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          position: "relative",
          marginLeft: "4px"
        }
      },
        // 1. Status Badge
        h("button", {
          type: "button",
          onClick: () => setShowPopover(!showPopover),
          title: `${statusTitle} · 点击查看详情与状态`,
          style: {
            background: "var(--dsw-alias-bg-layer-2, #1e293b)",
            border: "1px solid var(--dsw-alias-border-l2, #334155)",
            borderRadius: "999px",
            padding: "3px 9px",
            fontSize: "11.5px",
            fontWeight: 600,
            lineHeight: 1.5,
            color: "var(--dsw-alias-label-primary, #f8fafc)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transition: "all 0.15s ease",
            userSelect: "none"
          }
        },
          h("span", {
            style: {
              display: "inline-block",
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: dotColor,
              boxShadow: `0 0 6px ${dotColor}`
            }
          }),
          Icons.gitBranch(11, "var(--dsw-alias-label-secondary, #94a3b8)"),
          h("span", { style: { fontSize: "11px" } }, statusLabel)
        ),

        // 2. Button 1: 本地与git同步 (Push)
        h("button", {
          type: "button",
          disabled: loading,
          onClick: handlePush,
          title: "【本地与Git同步】将当前本地的模型和插件配置上传提交到 GitHub (Push)",
          style: {
            background: "var(--dsw-alias-bg-layer-2, #1e293b)",
            border: "1px solid var(--dsw-alias-border-l2, #334155)",
            borderRadius: "999px",
            padding: "3px 10px",
            fontSize: "11px",
            fontWeight: 600,
            lineHeight: 1.5,
            color: loadingType === "push" ? "#93c5fd" : "var(--dsw-alias-label-primary, #f8fafc)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transition: "all 0.15s ease",
            userSelect: "none",
            opacity: loading && loadingType !== "push" ? 0.6 : 1
          }
        },
          Icons.upload(11, loadingType === "push" ? "#93c5fd" : "#38bdf8"),
          h("span", null, loadingType === "push" ? "正在上传..." : "本地与Git同步")
        ),

        // 3. Button 2: git与本地同步 (Pull)
        h("button", {
          type: "button",
          disabled: loading,
          onClick: handlePull,
          title: "【Git与本地同步】从 GitHub 拉取最新配置到本地并自动更新插件依赖 (Pull)",
          style: {
            background: "var(--dsw-alias-bg-layer-2, #1e293b)",
            border: "1px solid var(--dsw-alias-border-l2, #334155)",
            borderRadius: "999px",
            padding: "3px 10px",
            fontSize: "11px",
            fontWeight: 600,
            lineHeight: 1.5,
            color: loadingType === "pull" ? "#93c5fd" : "var(--dsw-alias-label-primary, #f8fafc)",
            cursor: loading ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            transition: "all 0.15s ease",
            userSelect: "none",
            opacity: loading && loadingType !== "pull" ? 0.6 : 1
          }
        },
          Icons.download(11, loadingType === "pull" ? "#93c5fd" : "#34d399"),
          h("span", null, loadingType === "pull" ? "正在拉取..." : "Git与本地同步")
        ),

        // 4. Details Popover Modal
        showPopover && h("div", {
          ref: popoverRef,
          style: {
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 99999,
            width: "300px",
            background: "var(--dsw-alias-bg-layer-1, #0f172a)",
            border: "1px solid var(--dsw-alias-border-l1, #334155)",
            borderRadius: "10px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
            padding: "12px 14px",
            color: "var(--dsw-alias-label-primary, #f8fafc)",
            fontSize: "12px",
            fontFamily: "var(--dsw-font-family, sans-serif)"
          }
        },
          h("div", {
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--dsw-alias-border-l2, #334155)",
              paddingBottom: "8px",
              marginBottom: "10px"
            }
          },
            h("div", { style: { fontWeight: 700, fontSize: "12.5px", display: "flex", alignItems: "center", gap: "6px" } },
              Icons.gitBranch(13, "#38bdf8"),
              "Git 配置同步状态"
            ),
            h("button", {
              type: "button",
              onClick: () => refreshStatus(false),
              title: "刷新检测",
              style: {
                background: "transparent",
                border: "none",
                color: "var(--dsw-alias-label-secondary, #94a3b8)",
                cursor: "pointer",
                padding: "2px 5px",
                borderRadius: "4px"
              }
            }, Icons.refresh(12))
          ),
          h("div", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "11.5px" } },
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: { color: "var(--dsw-alias-label-secondary, #94a3b8)" } }, "远程仓库:"),
              h("span", {
                style: {
                  fontWeight: 600,
                  maxWidth: "180px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap"
                },
                title: status?.remote || "未配置"
              }, status?.remote ? status.remote.replace(/^https?:\/\/github\.com\//, "") : "未配置 origin")
            ),
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: { color: "var(--dsw-alias-label-secondary, #94a3b8)" } }, "当前分支:"),
              h("span", { style: { fontWeight: 600 } }, status?.branch || "main")
            ),
            h("div", { style: { display: "flex", justifyContent: "space-between" } },
              h("span", { style: { color: "var(--dsw-alias-label-secondary, #94a3b8)" } }, "同步状态:"),
              h("span", { style: { fontWeight: 700, color: dotColor } },
                status?.synced ? "✅ 实时已同步" :
                status?.behind > 0 ? `⚠️ 云端超前 ${status.behind} 个提交` :
                status?.dirty || status?.ahead > 0 ? `📝 本地有待同步变更` : "未配置"
              )
            ),
            status?.dirtyFiles && status.dirtyFiles.length > 0 && h("div", {
              style: {
                background: "var(--dsw-alias-bg-layer-2, #1e293b)",
                borderRadius: "6px",
                padding: "6px 8px",
                marginTop: "4px"
              }
            },
              h("div", { style: { color: "var(--dsw-alias-label-secondary, #94a3b8)", fontSize: "11px", marginBottom: "3px" } }, "已修改的配置项:"),
              status.dirtyFiles.slice(0, 4).map((f, i) =>
                h("div", { key: i, style: { fontSize: "10.5px", color: "#fde68a" } }, `• ${f}`)
              ),
              status.dirtyFiles.length > 4 && h("div", { style: { fontSize: "10.5px", color: "#94a3b8" } }, `...等 ${status.dirtyFiles.length} 项`)
            )
          ),
          h("div", {
            style: {
              display: "flex",
              gap: "8px",
              marginTop: "12px",
              paddingTop: "8px",
              borderTop: "1px solid var(--dsw-alias-border-l2, #334155)"
            }
          },
            h("button", {
              type: "button",
              onClick: handlePush,
              disabled: loading,
              style: {
                flex: 1,
                padding: "5px 8px",
                borderRadius: "6px",
                border: "1px solid #0284c7",
                background: "#0369a1",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }
            }, "⬆️ 本地 ➔ Git"),
            h("button", {
              type: "button",
              onClick: handlePull,
              disabled: loading,
              style: {
                flex: 1,
                padding: "5px 8px",
                borderRadius: "6px",
                border: "1px solid #059669",
                background: "#047857",
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer"
              }
            }, "⬇️ Git ➔ 本地")
          )
        ),

        // 5. Toast Notification
        toast && h("div", {
          style: {
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 999999,
            padding: "8px 14px",
            borderRadius: "8px",
            background: toast.type === "success" ? "#064e3b" : "#7f1d1d",
            border: `1px solid ${toast.type === "success" ? "#059669" : "#dc2626"}`,
            color: toast.type === "success" ? "#6ee7b7" : "#fca5a5",
            fontSize: "12.5px",
            fontWeight: 600,
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            animation: "fadeIn 0.2s ease"
          }
        },
          toast.type === "success" ? Icons.check(14) : null,
          toast.text
        )
      );
    }

    function apply(ctx) {
      // Inject directly into conversation session header actions
      ctx.slots.inject("conversation.session.header.actions", () => {
        return ctx.slots.register({
          name: "conversation.session.header.actions",
          id: "git-sync-controls",
          order: 15, // directly to the right of AGY (2) badge (order 10)
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
