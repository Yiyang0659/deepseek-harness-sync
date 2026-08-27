#!/usr/bin/env bash
# ===================================================
# DeepSeek Harness 一键恢复/初始化脚本 (macOS / Linux)
# ===================================================

set -e

DSH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DSH_DIR"

echo -e "\033[36m===================================================\033[0m"
echo -e "\033[32m  DeepSeek Harness 环境与插件一键还原 (macOS/Linux) \033[0m"
echo -e "\033[36m===================================================\033[0m"
echo ""

# 1. 检查/恢复 .credentials.yaml
if [ ! -f "$DSH_DIR/.credentials.yaml" ]; then
    if [ -f "$DSH_DIR/.credentials.yaml.example" ]; then
        cp "$DSH_DIR/.credentials.yaml.example" "$DSH_DIR/.credentials.yaml"
        echo -e "\033[33m[WARN] 已为您从模板生成 .credentials.yaml，请打开并填入您的真实 API Key！\033[0m"
    fi
else
    echo -e "\033[32m[SUCCESS] 凭据文件 .credentials.yaml 已就绪。\033[0m"
fi

# 2. 还原插件依赖 (pnpm / npm)
if [ -f "$DSH_DIR/profiles/web/package.json" ]; then
    echo -e "\033[36m[INFO] 正在自动安装所有插件 (profiles/web)...\033[0m"
    cd "$DSH_DIR/profiles/web"
    if command -v pnpm &> /dev/null; then
        pnpm install
    else
        npm install
    fi
    cd "$DSH_DIR"
    echo -e "\033[32m[SUCCESS] 所有插件依赖安装完成！\033[0m"
fi

# 3. 检查模型配置
if [ -f "$DSH_DIR/settings.yaml" ]; then
    echo -e "\033[32m[SUCCESS] 模型配置 settings.yaml 已就绪！\033[0m"
fi

echo ""
echo -e "\033[32m[SUCCESS] DeepSeek Harness 配置与插件已全部还原完毕！\033[0m"
echo -e "\033[36m[INFO] 您可以直接启动 DSH (dsh web) 开始使用。\033[0m"
