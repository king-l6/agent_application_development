#!/bin/bash
# 学习总结一键收尾：锁旧天 + 部署
set -e

cd "$(git rev-parse --show-toplevel)"

# ===== 1. 自动锁定除最后一天外的所有天 =====
python3 << 'PYEOF'
import re

with open('学习总结.html', 'r', encoding='utf-8') as f:
    content = f.read()

days = re.findall(r'id="day(\d+)"', content)
if not days:
    print('未找到 day 块')
    exit(0)

current_day = max(int(d) for d in days)
print(f'当前天: Day {current_day}，锁定前 {current_day - 1} 天')

# 锁定所有非当前天的 tab
for i in range(1, current_day):
    old = f'<button class="tab-btn" data-day="{i}">Day {i}'
    new = f'<button class="tab-btn locked" data-day="{i}">Day {i} <span style="font-size:0.7rem;">🔒</span></button>'
    if old in content:
        content = content.replace(old, new)

    # 加 lock-badge 到 day-header
    marker = f'id="day{i}">'
    pos = content.find(marker)
    if pos > 0:
        div_end = content.find('</div>', pos)
        snippet = content[pos:div_end]
        if 'lock-badge' not in snippet:
            content = content[:div_end] + '\n      <span class="lock-badge">🔒 已锁定</span>' + content[div_end:]

# 确保当前天 active
content = content.replace(
    f'<button class="tab-btn locked" data-day="{current_day}"',
    f'<button class="tab-btn active" data-day="{current_day}"'
)
content = content.replace(
    f'<button class="tab-btn" data-day="{current_day}"',
    f'<button class="tab-btn active" data-day="{current_day}"'
)

# 当前天加"可编辑"标签
marker = f'id="day{current_day}">'
pos = content.find(marker)
if pos > 0:
    div_end = content.find('</div>', pos)
    snippet = content[pos:div_end]
    if 'lock-badge' not in snippet and '已锁定' not in snippet:
        content = content[:div_end] + '\n      <span class="lock-badge">📝 可编辑</span>' + content[div_end:]

with open('学习总结.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('✅ 锁定完成')
PYEOF

# ===== 2. 同步到 site/ =====
cp 学习总结.html site/learning-summary.html
# 保留一份到临时位置供部署用
cp 学习总结.html /tmp/_learning_summary_deploy.html
echo "✅ 已同步到 site/learning-summary.html"

# ===== 3. 暂存未提交变更，部署，恢复 =====
has_stash=false
if ! git diff --quiet || ! git diff --cached --quiet; then
    git stash push -m "lock-and-deploy-auto-stash"
    has_stash=true
    echo "📦 暂存了未提交变更"
fi

# 4. 部署到 gh-pages
git fetch myrepo gh-pages 2>/dev/null || true
git branch -D temp-gh-deploy 2>/dev/null || true
git checkout -b temp-gh-deploy myrepo/gh-pages
cp /tmp/_learning_summary_deploy.html learning-summary.html
git add learning-summary.html
git commit -m "update learning-summary" 2>/dev/null || echo "  没有新变更"
git push myrepo temp-gh-deploy:gh-pages --force
git checkout main
git branch -D temp-gh-deploy
rm -f /tmp/_learning_summary_deploy.html

# 恢复暂存
if [ "$has_stash" = true ]; then
    git stash pop
    echo "📦 已恢复未提交变更"
fi

echo ""
echo "✅ 完成！访问 https://king-l6.github.io/agent_application_development/learning-summary.html"
