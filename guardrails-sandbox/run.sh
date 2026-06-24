#!/bin/bash
# 同时启动后端 (uvicorn) 和前端 (Vite dev server)
# 前端自动代理 /api 到后端

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛡 启动 Guardrails 沙箱..."
echo ""

# 后端
echo "⟳ 启动后端 (uvicorn)..."
source "$SCRIPT_DIR/../venv/bin/activate"
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# 前端
echo "⟳ 启动前端 (Vite)..."
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "✓ 后端: http://localhost:8000"
echo "✓ 前端: http://localhost:5173"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
