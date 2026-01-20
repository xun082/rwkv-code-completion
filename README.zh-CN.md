# RWKV 代码补全

<div align="center">

**基于 RWKV 模型的智能代码补全插件**

[![版本](https://img.shields.io/badge/版本-0.0.5-blue.svg)](https://github.com/xun082/rwkv-code-completion)
[![许可证](https://img.shields.io/badge/许可证-MIT-green.svg)](https://github.com/xun082/rwkv-code-completion/blob/main/LICENSE)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

---

## ✨ 主要特性

- 🚀 **实时代码补全**：输入时自动触发，无需等待
- 🎯 **多选择展示**：一次生成 4 个建议，2×2 网格显示
- 🔄 **FIM 支持**：智能理解上下文，填充中间代码
- ⚡ **防抖优化**：停止输入后触发，节省资源
- 🎨 **美观界面**：现代化的补全选择界面

---

## 📦 快速开始

### 1. 安装插件

在 VSCode 扩展市场搜索 "RWKV 代码补全" 或从 VSIX 文件安装。

### 2. 部署后端（必做）

本插件需**自建 RWKV 推理后端**，请按 [rwkv_lightning](https://github.com/RWKV-Vibe/rwkv_lightning) 仓库说明部署；`endpoint` 填 `http://<主机>:<端口>/v2/chat/completions`，`password` 与 `--password` 一致。

### 3. 配置服务

按 `Ctrl+,` 打开设置，搜索 `rwkv-code-completion`，配置服务地址：

```json
{
  "rwkv-code-completion.endpoint": "http://192.168.0.157:8001/v2/chat/completions",
  "rwkv-code-completion.password": "rwkv7_7.2b",
  "rwkv-code-completion.numChoices": 4
}
```

### 4. 开始使用

直接编写代码，插件会自动触发补全！

---

## 🎮 使用说明

### 自动触发

插件会在以下情况自动触发补全：

- ✅ 输入任何字符
- ✅ 输入空格
- ✅ 按回车换行
- ✅ 删除字符

### 选择补全

1. 补全会在侧边面板显示 2×2 网格
2. 查看不同的补全建议
3. 点击任意一个代码块插入到光标位置
4. 自动关闭面板，继续编码

### FIM 模式

当光标后面有代码时，自动启用 FIM（Fill-in-the-Middle）模式：

```javascript
function calculateTotal(items) {
  // 光标在这里 ← 会智能生成中间代码
  return total;
}
```

---

## ⚙️ 配置参数

### 基础配置

| 参数       | 默认值                          | 说明                                               |
| ---------- | ------------------------------- | -------------------------------------------------- |
| `endpoint` | `http://192.168.0.157:8001/...` | RWKV 服务地址 |
| `password` | `rwkv7_7.2b`                    | 服务密码      |
| `enabled`  | `true`                          | 启用/禁用补全                                      |

### 生成参数

| 参数          | 默认值 | 范围   | 说明               |
| ------------- | ------ | ------ | ------------------ |
| `numChoices`  | `4`    | 1-50   | 生成的补全数量     |
| `maxTokens`   | `1024` | 1-4096 | 最大生成长度       |
| `temperature` | `0.5`  | 0-2    | 温度（越低越保守） |
| `topP`        | `0.5`  | 0-1    | Top P 采样         |

### 性能参数

| 参数             | 默认值 | 范围   | 说明             |
| ---------------- | ------ | ------ | ---------------- |
| `debounceDelay`  | `300`  | 0-5000 | 防抖延迟（毫秒） |
| `alphaPresence`  | `1.0`  | -      | 惩罚重复内容     |
| `alphaFrequency` | `0.1`  | -      | 惩罚重复频率     |

---

## 🔧 常见问题

### ❓ 补全没有反应

**检查清单：** 按 [rwkv_lightning](https://github.com/RWKV-Vibe/rwkv_lightning) 部署并启动后端；确认 `endpoint`、`password` 正确；检查插件已启用；等待防抖延迟（默认 300ms）。

### ❓ 补全速度慢

**优化方案：**

1. 减少 `numChoices`（推荐 4）
2. 减小 `maxTokens`（推荐 200-500）
3. 使用本地 RWKV 服务

### ❓ 补全质量不满意

**调整参数：**

1. 调整 `temperature`（推荐 0.3-0.7）
2. 增加 `maxTokens`（500-1024）
3. 调整 `alphaPresence` 和 `alphaFrequency`

---

## 🛠️ 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm run watch

# 编译
pnpm run compile

# 打包
pnpm run package
```

按 `F5` 启动调试。

---

## 🤝 贡献

欢迎贡献代码！请查看 [贡献指南](CONTRIBUTING.md)。

---

## 📄 许可证

[MIT License](LICENSE)

---

## 🔗 相关链接

- [GitHub 仓库](https://github.com/xun082/rwkv-code-completion)
- [rwkv_lightning 后端](https://github.com/RWKV-Vibe/rwkv_lightning)
- [RWKV 官方](https://github.com/BlinkDL/RWKV-LM)
- [问题反馈](https://github.com/xun082/rwkv-code-completion/issues)

---

<div align="center">

**感谢使用 RWKV 代码补全插件！**

如果觉得有用，请给我们一个 ⭐ Star

</div>
