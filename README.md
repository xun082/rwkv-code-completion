# RWKV 代码补全

<div align="center">

![RWKV Logo](https://raw.githubusercontent.com/xun082/rwkv-code-completion/main/icon.png)

**基于 RWKV 模型的智能代码补全插件**

[![Version](https://img.shields.io/badge/version-0.0.5-blue.svg)](https://github.com/xun082/rwkv-code-completion)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/xun082/rwkv-code-completion/blob/main/LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

---

## ✨ 功能特性

### 🚀 智能代码补全

- **实时补全**：输入代码时自动触发，无需等待
- **多选择模式**：同时生成 4 个补全建议，2×2 网格展示
- **FIM 支持**：支持 Fill-in-the-Middle（填充中间）模式，智能理解上下文
- **防抖优化**：停止输入后才触发，避免频繁请求
- **自动触发**：支持删除、换行、空格等操作自动触发补全

### 🎯 使用场景

- ✅ 函数自动补全
- ✅ 代码块生成
- ✅ 变量命名建议
- ✅ 注释和文档生成
- ✅ 代码重构建议

---

## 📦 安装

### 方式一：从 VSIX 安装（推荐）

1. 下载最新的 `.vsix` 文件
2. 打开 VSCode，按 `Ctrl+Shift+X`（Mac: `Cmd+Shift+X`）打开扩展面板
3. 点击右上角的 `···` 菜单
4. 选择 "从 VSIX 安装..."
5. 选择下载的 `.vsix` 文件

### 方式二：从市场安装

在 VSCode 扩展市场搜索 "RWKV 代码补全" 并安装。

---

## 🖥️ 后端部署（必读）

本插件需**自建 RWKV 推理后端**。请按 [rwkv_lightning](https://github.com/RWKV-Vibe/rwkv_lightning) 仓库说明完成部署；配置插件时，`endpoint` 填 `http://<主机>:<端口>/v2/chat/completions`，`password` 与后端启动参数 `--password` 一致。

---

## ⚙️ 配置

按 `Ctrl+,`（Mac: `Cmd+,`）打开设置，搜索 `rwkv-code-completion`：

```json
{
  // 服务地址
  "rwkv-code-completion.endpoint": "http://192.168.0.157:8001/v2/chat/completions",

  // 服务密码
  "rwkv-code-completion.password": "rwkv7_7.2b",

  // 补全选择数量（1-50）
  "rwkv-code-completion.numChoices": 4,

  // 防抖延迟（毫秒）
  "rwkv-code-completion.debounceDelay": 300,

  // 最大生成 token 数
  "rwkv-code-completion.maxTokens": 1024,

  // 温度（0-2，越低越保守）
  "rwkv-code-completion.temperature": 0.5,

  // Top P 采样
  "rwkv-code-completion.topP": 0.5,

  // Alpha Presence（惩罚重复内容）
  "rwkv-code-completion.alphaPresence": 1.0,

  // Alpha Frequency（惩罚重复频率）
  "rwkv-code-completion.alphaFrequency": 0.1
}
```

---

## 🎮 使用方法

### 基本使用

1. **自动触发**：编写代码时，插件会自动触发补全
2. **查看建议**：补全会以 2×2 网格显示在侧边面板
3. **选择插入**：点击任意一个代码块即可插入到光标位置

### 触发方式

插件会在以下情况自动触发：

- ✅ 输入任何字符
- ✅ 输入空格
- ✅ 按回车换行
- ✅ 删除字符（Backspace/Delete）

### 高级用法

#### Fill-in-the-Middle 模式

当光标后面有代码时，插件会自动使用 FIM 模式：

```javascript
function calculateTotal(items) {
  // 光标在这里 ← 插件会理解上下文
  return total;
}
```

插件会智能生成中间部分的代码。

#### 调整生成数量

```json
{
  "rwkv-code-completion.numChoices": 8 // 生成 8 个建议
}
```

**注意**：数量越多，请求时间越长。建议 4-8 个。

#### 调整防抖延迟

```json
{
  "rwkv-code-completion.debounceDelay": 500 // 500ms 后触发
}
```

**建议**：

- 快速响应：150-300ms
- 节省资源：500-1000ms

---

## 📊 参数说明

| 参数             | 默认值                                          | 范围   | 说明                                                                 |
| ---------------- | ----------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `endpoint`       | `http://192.168.0.157:8001/v2/chat/completions` | -      | RWKV 服务地址      |
| `password`       | `rwkv7_7.2b`                                    | -      | 服务密码           |
| `numChoices`     | `4`                                             | 1-50   | 生成的补全数量                                                       |
| `debounceDelay`  | `300`                                           | 0-5000 | 防抖延迟（毫秒）                                                     |
| `maxTokens`      | `1024`                                          | 1-4096 | 最大生成 token 数                                                    |
| `temperature`    | `0.5`                                           | 0-2    | 温度（越低越保守）                                                   |
| `topP`           | `0.5`                                           | 0-1    | Top P 采样                                                           |
| `alphaPresence`  | `1.0`                                           | -      | 惩罚重复内容                                                         |
| `alphaFrequency` | `0.1`                                           | -      | 惩罚重复频率                                                         |

---

## 🔧 故障排查

### 补全没有触发

**原因**：服务地址配置错误、RWKV 服务未启动、防抖延迟太长。

**解决方案**：按 [rwkv_lightning](https://github.com/RWKV-Vibe/rwkv_lightning) 完成后端部署；检查 `endpoint`、`password`；减小 `debounceDelay`。

### 补全速度慢

**原因**：`numChoices` 过大、`maxTokens` 过大、网络延迟。

**解决方案**：减少 `numChoices` 到 4 或更少；减小 `maxTokens` 到 200–500；使用本地 RWKV 服务。

### 补全质量不好

**原因**：`temperature` 设置不当、`maxTokens` 太小。

**解决方案**：调整 `temperature` 到 0.3–0.7；增加 `maxTokens` 到 500–1024；调整 `alphaPresence` 和 `alphaFrequency`。

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发

```bash
# 安装依赖
pnpm install

# 开发模式（监听文件变化）
pnpm run watch

# 编译
pnpm run compile

# 打包
pnpm run package
```

按 `F5` 启动调试。

---

## 📄 许可证

[MIT License](LICENSE)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/xun082/rwkv-code-completion)
- [rwkv_lightning 后端](https://github.com/RWKV-Vibe/rwkv_lightning)（推荐用于部署推理服务）
- [RWKV 官方](https://github.com/BlinkDL/RWKV-LM)
- [问题反馈](https://github.com/xun082/rwkv-code-completion/issues)

---

## 💬 反馈与支持

如果遇到问题或有建议，欢迎：

- 提交 [Issue](https://github.com/xun082/rwkv-code-completion/issues)
- 发起 [Discussion](https://github.com/xun082/rwkv-code-completion/discussions)
- 为项目 ⭐ Star

---

<div align="center">

**感谢使用 RWKV 代码补全插件！**

Made with ❤️ by RWKV Community

</div>
