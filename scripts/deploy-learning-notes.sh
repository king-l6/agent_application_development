#!/bin/bash
# 一键部署 AI 学习笔记 / 实验台 -> GitHub Pages
#
# 正确链路（2026-06 摸索固化）：
#   1. 构建 Vue 应用：site/vue-app/summary -> 产物输出到 site/summary
#   2. commit + push main
#   3. 把 site/ 子树 split 出来强推到 gh-pages 分支根目录（Pages 发布源）
#
# 关键事实：
#   - GitHub Pages 发布源 = gh-pages 分支根目录（不是 main）
#   - 线上 /summary/ 对应 gh-pages 的 summary/ 目录
#   - 远程名是 origin（旧脚本里的 myrepo 已不存在）
#   - 旧脚本 deploy-summary.sh / lock-and-deploy.sh 操作的是废弃的单文件，勿用
#
# 用法：bash scripts/deploy-learning-notes.sh "提交信息"
set -e

cd "$(git rev-parse --show-toplevel)"
MSG="${1:-update learning notes}"

echo "==> 1/4 构建 Vue 应用"
( cd site/vue-app/summary && npm run build )

echo "==> 2/4 提交改动到 main"
git add -A
if git diff --cached --quiet; then
  echo "  （无改动可提交，跳过）"
else
  git commit -m "$MSG

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
fi

echo "==> 3/4 推送 main（落后则先 rebase）"
git fetch origin main -q
git rebase origin/main || { echo "❌ rebase 冲突，请手动解决后重跑"; exit 1; }
git push origin main

echo "==> 4/4 部署 site/ 子树到 gh-pages"
SPLIT=$(git subtree split --prefix site main)
git push origin "${SPLIT}:refs/heads/gh-pages" --force

echo ""
echo "✅ 部署完成（Pages 构建约需 30-60 秒）"
echo "   https://king-l6.github.io/agent_application_development/summary/"
echo "   看不到更新时：浏览器强制刷新 Cmd+Shift+R 清缓存"
