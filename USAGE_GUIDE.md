# RWKV 代码补全使用指南

## 🎯 多选择补全功能

你的 RWKV 扩展现在支持**批量并发生成多个补全选项**，让你有更多选择！

## 📋 两种补全模式

### 1. **Inline 模式**（自动触发）
- ✨ 输入代码时自动显示补全
- 🔄 按 `Alt+]` 查看**下一个**补全选项
- 🔄 按 `Alt+[` 查看**上一个**补全选项
- ✅ 按 `Tab` 接受当前补全
- ❌ 按 `Esc` 关闭补全

**状态栏提示：** 当有多个选项时，会显示 `💡 RWKV: 3 个补全选项 (Alt+] / Alt+[ 切换)`

### 2. **标准列表模式**（手动触发）
- 📝 按 `Ctrl+Space` 打开补全下拉列表
- 👀 **同时看到所有补全选项**
- ⬆️⬇️ 用方向键选择不同选项
- 👁️ 悬停可预览完整内容
- ✅ 按 `Enter` 接受选择

## ⚙️ 配置选项

### 并发数量
```json
"rwkv-code-completion.numChoices": 3
```
- 设置范围：1-10
- 推荐值：3-5
- 数量越多，选择越丰富（但响应稍慢）

### 补全模式
```json
"rwkv-code-completion.completionMode": "both"
```
- `"both"` - 双模式（推荐）✨
- `"inline"` - 仅 Inline 自动补全
- `"standard"` - 仅标准列表补全

## 🎮 快捷命令

按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）打开命令面板：

- `RWKV: 切换补全模式` - 快速切换显示模式
- `RWKV: 使用帮助` - 查看详细帮助
- `RWKV: 启用/禁用代码补全` - 总开关
- `RWKV: 打开设置` - 打开配置面板

## 📊 API 请求格式

你的扩展现在使用以下格式请求 RWKV API：

```json
{
  "contents": [
    "function trap(height) {",
    "function trap(height) {",
    "function trap(height) {"
  ],
  "max_tokens": 1024,
  "stop_tokens": [0, 261, 24281],
  "temperature": 0.5,
  "top_k": 100,
  "top_p": 0.5,
  "pad_zero": true,
  "alpha_presence": 1.0,
  "alpha_frequency": 0.1,
  "alpha_decay": 0.99,
  "chunk_size": 128,
  "stream": false,
  "password": "rwkv7_7.2b"
}
```

**响应格式：**
```json
{
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    },
    {
      "index": 1,
      "message": { "role": "assistant", "content": "..." },
      "finish_reason": "stop"
    },
    ...
  ]
}
```

## 🔍 调试信息

打开「输出」面板（查看 → 输出），你可以看到：
- ✅ 请求的详细信息（URL、请求体、contents 数量）
- ✅ 响应的详细信息（状态码、choices 数量）
- ✅ 每个补全选择的处理过程
- ✅ 清理过程的详细步骤

## 💡 使用技巧

1. **推荐使用"双模式"**：
   - 日常编码用 Inline 自动补全（快速）
   - 需要精确选择时用 `Ctrl+Space`（直观）

2. **调整并发数量**：
   - 快速补全：设为 1-2
   - 多样选择：设为 3-5
   - 最大探索：设为 6-10

3. **快捷键提示**：
   - Inline 模式下，状态栏会提示可用选项数量
   - 列表模式下，每个选项都有编号和预览

## 🚀 快速开始

1. 打开任意代码文件
2. 输入一些代码
3. **方式一**：等待自动补全出现，按 `Alt+]` 切换选项
4. **方式二**：按 `Ctrl+Space` 查看列表，选择最佳选项

享受多选择的 RWKV 代码补全体验！🎉
