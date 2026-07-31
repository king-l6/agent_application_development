# 教学偏好（从 Codex 同步）

> Cursor 不会自动继承 Codex 会话记忆。本文件是跨工具的教学约定真相源。

## 学习者背景

- 熟悉 JavaScript，通过「完整 JS ↔ 原始 py」并排阅读学 Python

## 每节课固定结构

1. 这一节的核心
2. 目标 Python **精确范围**（行号/符号）——只译这一段
3. `js_practice/` 完全体 JS：该范围内的**完整翻译**
4. 对应表 + 关键语义 + 窄测试 + 小练习 → 暂停

## 「完整翻译」＝ 本节范围译全，不是整文件搬空

| 要做 | 不要做 |
|---|---|
| 只译**本小节**对应的 py 符号/行号 | 把整份 `main.py` 一次性塞进一个 JS |
| 范围内每个函数的**函数体**都译出（if/for/return） | 只写 `this.x = y` 空壳类框 |
| 范围内被调用的辅助函数一并译完 | 范围外的下一小节逻辑提前搬进来 |

例子：T2.1 若只讲「注册工具」，就译 `ToolRecord` + `ToolRegistry.register/get/names` + `validate_schema_shape`；  
`_walk` / `validate(args)` 留给下一小节，不要为了「有函数体」把整课校验器都塞进来。

## 其它约定

- `js` = JavaScript，不是 JSON
