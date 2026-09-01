---
name: agy-long-argv-fix
description: |
  Fix for DSH Antigravity (agy CLI) models failing with "failed to spawn agy:
  Error: spawn ENAMETOOLONG" on Windows. Typical pattern: Antigravity / Gemini
  3.x Flash models work in OLD sessions/workspaces but fail in a NEW session or
  newly created project workspace. Use when the user reports agy or Antigravity
  models unusable, model switch errors, spawn ENAMETOOLONG, or before enabling
  Antigravity models in a new project. Also re-apply after DSH or dsh-agy-link
  updates (node_modules get overwritten, the patch is lost).
triggers:
  - "ENAMETOOLONG"
  - "failed to spawn agy"
  - "agy 不能用"
  - "agy无法使用"
  - "Antigravity 模型不能用"
  - "Antigravity 模型无法使用"
  - "Gemini 3.7 Flash 不能用"
  - "Gemini 3.6 Flash 不能用"
  - "模型切换失败"
  - "新建项目模型不能用"
---

# Antigravity (agy) spawn ENAMETOOLONG 修复指南

## 一句话结论

dsh-agy-link 桥接把整个 prompt 放在**命令行** `-p` 参数里传给 agy.exe；
新会话首次调用的 prompt 包含 DSH 注入的完整技能目录（40KB+），
超过 Windows CreateProcess 单条命令行 **32767 字符**硬上限，
导致 `spawn ENAMETOOLONG`。修复方案：超长 prompt 改走 **stdin**（脚本自动打补丁）。

## 症状识别（满足即适用本技能）

- 会话里报错：`failed to spawn agy: Error: spawn ENAMETOOLONG`（PROCESS_EXIT）
- 且随后重试报 `Duplicate request ignored ... (BUSY)`（3 秒防重复窗口吞掉了重试）
- 典型用户感受：**"其他文件夹能用，这个文件夹/新建的项目不能用"**
  - 真相：不是目录问题，是**会话新旧**问题。老会话已与 agy 建立会话绑定
    （binding），后续每轮只传增量消息（几百字符）不超限；新会话首次调用必须
    全量传输（含 41KB 技能目录注入）→ 必炸。
- 标题生成（session-title，小 payload）能成功、主对话失败 —— 也是本问题的特征

## 根因数据流

```
DSH 注入的用户消息（新会话首轮）:
  seq7 用户消息            ~324 字符
  seq8 runtime-context     ~390 字符
  seq9 技能目录 system-reminder ~40,910 字符
  ────────────────────────────────────
  合计 trailingUser        ~41,624 字符 > 32,767 (CreateProcess 上限)
                            ↓
dsh-agy-link: args.push("-p", prompt)   ← prompt 全量上命令行
                            ↓
spawn agy.exe → CreateProcessW 溢出 → Error: spawn ENAMETOOLONG
```

补丁原理：`startAgyProcess` 内检测 argv 总长 >30000（cmd shim 时 >7000），
去掉 `-p` 参数，把 prompt 写入子进程 stdin 后关闭（agy 无 `-p` 时从 stdin
读 prompt，`--output-format stream-json` 事件流不受影响，已实测）。

## 快速诊断（3 步）

```powershell
# 1) 确认症状：解压当前会话记录找报错（需 python + pip install zstandard）
python -c "import zstandard;print('ok')"
# 在报错的会话目录: ~/.dsh/sessions/<工作区目录名>/session-*/session.jsonl.zstd
# 解压后搜索 "failed to spawn agy" → 确认是 ENAMETOOLONG（而非配额/登录问题）

# 2) 确认补丁状态（有标记=已打补丁）
Select-String -Path "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-agy-link\dist\index.js" -Pattern 'PATCH\(agy-long-argv'

# 3) 确认补丁已加载：服务端进程启动时间必须晚于 index.js 修改时间
Get-NetTCPConnection -LocalPort 3080 -State Listen | Select-Object -First 1 OwningProcess
Get-Process -Id <PID> | Select-Object StartTime
(Get-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-agy-link\dist\index.js").LastWriteTime
```

## 一键修复（推荐）

```powershell
# 检测并修复（幂等，重复运行安全；自动备份 + node --check 校验 + 失败回滚）
powershell -NoProfile -ExecutionPolicy Bypass -File `
  "$env:USERPROFILE\.dsh\skills\agy-long-argv-fix\scripts\Fix-AgyLongArgv.ps1"

# 修复 + 端到端验证（真实调用一次 agy，约 10 秒）
# + 自动重启 DSH（会断开所有运行中的会话！）
powershell -NoProfile -ExecutionPolicy Bypass -File `
  "$env:USERPROFILE\.dsh\skills\agy-long-argv-fix\scripts\Fix-AgyLongArgv.ps1" -Test -Restart
```

修复后**必须重启 DSH** 才生效（Node 进程启动时加载代码）：
`%USERPROFILE%\.dsh\restart.bat`。然后切换 Antigravity 模型发消息验证。

## 手工修复步骤（脚本锚点失效时）

文件：`~\.dsh\profiles\web\node_modules\dsh-agy-link\dist\index.js`（先备份！）

**改动 1**：在 `function startAgyProcess(opts) {` 内，`const viaCmd = ...` 行之后、
`const env = opts.env ?? process.env;` 之前插入：

```js
	// PATCH(agy-long-argv 2026-09-01): Windows CreateProcess caps a single command
	// line at 32767 UTF-16 chars (cmd.exe at 8191). First-turn requests embed the
	// whole injected context (skills catalog etc.) into the "-p" prompt, which
	// overflowed the limit and made spawn fail with ENAMETOOLONG. When the argv is
	// too long, drop "-p <prompt>" from the command line and forward the prompt via
	// stdin instead (agy reads the prompt from stdin when -p is absent). The auth
	// login probe is protected because it runs with keepStdin: true.
	let stdinPrompt = null;
	if (!opts.keepStdin) {
		try {
			const pi = opts.args.indexOf("-p");
			if (pi >= 0 && pi + 1 < opts.args.length) {
				let totalLen = String(opts.bin ?? "").length + 16;
				for (const a of opts.args) totalLen += String(a ?? "").length + 3;
				if (totalLen > (viaCmd ? 7000 : 30000)) {
					stdinPrompt = opts.args[pi + 1];
					opts.args = opts.args.slice(0, pi).concat(opts.args.slice(pi + 2));
				}
			}
		} catch {}
	}
```

**改动 2**：同函数内，`let settled = false;` 之后原为：

```js
	if (!opts.keepStdin) try {
		child.stdin?.end();
	} catch {}
```

替换为：

```js
	if (stdinPrompt !== null) try {
		child.stdin?.write(stdinPrompt);
	} catch {}
	if (stdinPrompt !== null || !opts.keepStdin) try {
		child.stdin?.end();
	} catch {}
```

改完执行 `node --check <文件>`（若报 ES Module 错，复制为 .mjs 后缀再检查），
通过后重启 DSH。

## 预防与注意事项

1. **DSH / dsh-agy-link 升级后补丁会丢**（node_modules 被覆盖，且 node_modules
   不入库）→ 重跑一键修复脚本即可，跑完重启 DSH。
2. **绑定失效机制**（补丁后无需担心，但要知道）：会话内**切换模型**、
   **编辑历史消息**会使 agy 会话绑定失效，下一次调用退回全量路径。
   未打补丁时这会让"本来能用的会话"突然报错；打完补丁后只是多一次全量调用。
3. **技能目录越大越危险**：每装一个技能，全局目录（~40KB）就更大，
   未打补丁的机器上首次调用更容易超限。治本靠补丁，不靠删技能。
4. 若脚本提示"锚点未命中"，说明上游代码结构变了——可能上游已自带修复
   （stdin/临时文件传 prompt），先重启验证；若仍报错，按"手工修复步骤"
   在新版代码中定位 `args.push("-p", ...)` 的位置做等价改造。
5. 本问题值得反馈给 DSH 上游（dsh-agy-link 模块）：正确做法是 prompt 永远
   走 stdin 或临时文件，不走命令行。

## 关键文件路径

| 文件 | 说明 |
|---|---|
| `~\.dsh\profiles\web\node_modules\dsh-agy-link\dist\index.js` | 桥接实现（补丁目标） |
| 同目录 `index.js.bak-*` | 打补丁前的原始备份 |
| `~\.dsh\agy-link\sessions.json` | 会话→agy 会话绑定表（`sessionId:accountId` → conversationId） |
| `~\.dsh\agy-accounts\pool.json` | agy 账号池（配额/启用状态/activeAccountIds） |
| `~\.dsh\restart.bat` | 重启 DSH Web（杀 3080 端口进程并重启） |
| `<桥接文件所在包>\.gemini\antigravity-cli\cli.log` | 各 agy 账号的 CLI 日志（查认证/配额/调用） |
| `~\.dsh\skills\agy-long-argv-fix\scripts\Fix-AgyLongArgv.ps1` | 一键修复脚本（UTF-8 with BOM！PS5.1 才能正确解析中文） |
