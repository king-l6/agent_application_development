// 构建前刷新检查点快照：仅当项目根 venv 存在时才调用 Python 重新解码。
// venv 缺失（如纯前端 CI）时跳过——已提交的 checkpointSnapshot.generated.js 仍可用。
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const venvPython = resolve(here, '../../../../venv/bin/python')
const script = resolve(here, 'gen-checkpoint-snapshot.py')

if (!existsSync(venvPython)) {
  console.log('[checkpoint-snapshot] 跳过：未找到 venv，沿用已提交的快照文件')
  process.exit(0)
}

const r = spawnSync(venvPython, [script], { stdio: 'inherit' })
if (r.status !== 0) {
  console.warn('[checkpoint-snapshot] 生成失败，沿用已提交的快照文件')
}
process.exit(0)
