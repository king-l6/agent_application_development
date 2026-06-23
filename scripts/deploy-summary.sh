#!/bin/bash
# 一键部署 学习总结 -> GitHub Pages
set -e

cd "$(git rev-parse --show-toplevel)"

# 1. 同步文件
cp "学习总结.html" "site/learning-summary.html"
echo "✓ 已同步到 site/learning-summary.html"

# 2. 推送到 gh-pages
git fetch myrepo gh-pages 2>/dev/null || true
git subtree push --prefix site myrepo gh-pages
echo "✓ 已部署到 https://king-l6.github.io/agent_application_development/learning-summary.html"
