# 🐳 DeepSeek Harness (DSH) 配置与插件实时同步仓库

本项目用于将本地 **DeepSeek Harness (DSH)** 的完整配置（包括模型供应商配置、预设、所有已安装插件、自定义 Skill）上传到 GitHub，并支持 **跨设备一键还原** 与 **本地修改后实时自动同步**。

---

## 📁 仓库同步内容清单

| 文件 / 目录 | 作用说明 | 是否同步 |
| :--- | :--- | :---: |
| `settings.yaml` | **模型配置核心**（OpenCode / ZAI / DeepSeek 等各 Provider、模型参数、默认模型与预设） | ✅ 实时同步 |
| `profiles/web/package.json` | **插件依赖清单**（记录所有从 npm 或 GitHub 安装的 DSH 插件及 bundles） | ✅ 实时同步 |
| `profiles/web/cordis.patch.yml` | **Cordis 插件补丁层**（插件高级行为与自定义注入配置） | ✅ 实时同步 |
| `profiles/web/pnpm-workspace.yaml` | Workspace 项目配置 | ✅ 实时同步 |
| `skills/` | **自定义 Agent Skills** 存放目录 | ✅ 实时同步 |
| `.credentials.yaml.example` | **API Key 安全模板**（供新设备参考填写） | ✅ 实时同步 |
| `sync.ps1` / `sync-watch.*` | **实时同步引擎与脚本** | ✅ 实时同步 |
| `restore.bat` / `restore.ps1` | **新设备一键还原环境与插件脚本** | ✅ 实时同步 |
| `.credentials.yaml` | 包含真实 API Key 的私密凭据文件 | 🔒 **已安全忽略（不上传）** |
| `sessions/` / `storages/` | 运行日志、会话历史与缓存文件 | 🚫 **已忽略** |
| `node_modules/` | 插件二进制依赖库（通过 package.json 自动安装） | 🚫 **已忽略** |

---

## 🚀 第一步：初始化并上传到你的 GitHub

### 1. 在 GitHub 上新建一个仓库
1. 打开 [GitHub 新建仓库页面](https://github.com/new)。
2. 仓库名填入例如 `my-dsh-config` 或 `deepseek-harness-config`。
3. **重要推荐：建议选择 Private（私有仓库）**。
4. 不需要勾选 `Add a README file`（本地已有）。
5. 点击 **Create repository**。

### 2. 本地关联并推送
在当前目录（`C:\Users\wy_liuxiaoyang\.dsh`）打开 PowerShell 或终端，运行以下命令（将 `<你的GitHub账号>` 和 `<你的仓库名>` 替换为实际值）：

```bash
git init
git branch -M main
git remote add origin https://github.com/<你的GitHub账号>/<你的仓库名>.git
```

然后运行一次初始化提交并推送到 GitHub：
```powershell
.\sync.ps1 -Push -Message "Initial commit: DeepSeek Harness configs and plugins"
```
或者双击运行目录下的 **`sync-push.bat`**。

---

## ⚡ 第二步：启用实时自动同步 (Real-time Sync)

当你在 DSH 界面中添加了新模型、修改了设置，或者安装了新插件后，无需每次手动运行命令，实时同步服务会自动检测并将变更提交推送到 GitHub。

### 方式 A：启动有界面监控窗口
双击运行 **`sync-watch.bat`**：
- 它会实时监听 `settings.yaml`、`profiles/web/package.json`、`cordis.patch.yml` 以及 `skills/` 目录的任何变更。
- 检测到变更后，自动进行 5 秒防抖，随后自动 `git pull --rebase` 并 `git commit` + `git push` 上传到 GitHub。

### 方式 B：后台静默运行
双击运行 **`sync-watch-silent.vbs`**（将在后台完全无窗口静默监控运行）。

### 方式 C：一键手动同步
- 上传修改：双击 **`sync-push.bat`**
- 拉取云端修改：双击 **`sync-pull.bat`**

---

## 🧩 如何从 awesome-dsh-list 安装新插件并自动同步

参考 [awesome-dsh-list](https://github.com/kingselyjoe/awesome-dsh-list) 中的 1000+ 插件生态，安装插件非常简单：

### 方法 1：通过 Web 界面插件市场
如果你安装了 `dsh-market` / `dsh-web-plugin-manager`，直接在 Web 界面一键安装插件，DSH 会自动更新 `profiles/web/package.json`，实时监控程序会自动将新插件清单推送到 GitHub！

### 方法 2：通过命令行直接添加
在 `profiles/web` 目录下运行安装命令（例如安装 `dsh-better-sidebar` 或从 GitHub 安装）：
```bash
cd profiles\web
pnpm add dsh-better-sidebar
```
并在 `package.json` 的 `dsh.profile.bundles` 中添加插件名称。保存后，实时同步脚本会自动同步到 GitHub。

---

## 💻 在另一台新电脑上快速恢复 (Restore)

当你在另一台电脑上安装了 DeepSeek Harness 并需要同步这套配置时：

1. 将本仓库克隆到新电脑的 DSH 配置目录（即用户主目录下的 `.dsh`）：
   ```bash
   git clone https://github.com/<你的GitHub账号>/<你的仓库名>.git ~/.dsh
   ```
2. 双击运行 **`restore.bat`**（或执行 `powershell .\restore.ps1`）：
   - 脚本会自动从模板生成 `.credentials.yaml`
   - 脚本会自动执行 `pnpm install` 批量还原所有插件
3. 打开 `.credentials.yaml`，填入你的 API Key。
4. 启动 DSH (`dsh web`)，所有模型与插件即刻无缝可用！

---

## 🔐 凭据与安全说明

为了防止 API Key 泄露风险：
- `.credentials.yaml` 已经被内置在 `.gitignore` 中，不会被上传。
- 仓库中提供 `.credentials.yaml.example` 模板供新机器参考配置。
