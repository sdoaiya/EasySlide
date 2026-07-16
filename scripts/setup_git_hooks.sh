#!/bin/bash
# 设置Git Hooks

set -e

echo "================================="
echo "设置Git Hooks"
echo "================================="
echo ""
echo "ℹ️  注意: README 自动翻译已迁移到 GitHub Actions"
echo ""

# 检查是否在项目根目录
if [ ! -d ".git" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 创建.githooks目录（如果不存在）
if [ ! -d ".githooks" ]; then
    echo "错误: .githooks目录不存在"
    exit 1
fi

# 配置Git使用自定义hooks目录
if [ -f ".githooks/pre-commit" ]; then
    echo "配置Git使用.githooks目录..."
    git config core.hooksPath .githooks

    # 确保hooks有执行权限
    echo "设置hooks执行权限..."
    chmod +x .githooks/pre-commit

    echo ""
    echo "================================="
    echo "✅ Git Hooks设置完成！"
    echo "================================="
    echo ""
    echo "已启用的功能："
    echo "  • pre-commit / pre-push: 阻止疑似明文凭据进入 Git"
    echo ""
    echo "提示："
    echo "  - API Key、Token 等凭据只应在 EasySlide 设置页填写"
    echo "  - 检测到疑似真实凭据时会阻止提交和推送"
else
    echo ""
    echo "================================="
    echo "✅ 无需设置 Git Hooks"
    echo "================================="
    echo ""
    echo "README 翻译由 GitHub Actions 自动处理"
    echo "查看详情: .githooks/README.md"
fi

echo ""

