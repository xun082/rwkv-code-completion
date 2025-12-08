# RWKV 代码补全插件

一个类似 GitHub Copilot 的 VSCode 代码补全插件，支持硅基流动 API 和本地服务。

## ✨ 特性

- 🚀 **实时代码补全**：根据上下文智能补全代码，减少重复输入
- 🔄 **双模式支持**：
  - 硅基流动 API（云端服务）
  - 本地服务（端侧部署）
- ⚙️ **灵活配置**：支持自定义 API Key、模型、温度等参数
- 📊 **状态栏显示**：实时显示补全状态，一键启用/禁用
- 🎯 **多语言支持**：支持所有编程语言

## 📦 安装

1. 克隆或下载此项目
2. 在项目目录运行：
```bash
pnpm install
pnpm run compile
```
3. 按 F5 启动调试，会打开一个新的 VSCode 窗口
4. 在新窗口中测试插件功能

## 🔧 配置

### 使用硅基流动 API（默认）

1. 打开 VSCode 设置（`Ctrl/Cmd + ,`）
2. 搜索 `rwkv-code-completion`
3. 配置以下选项：
   - **Provider**: 选择 `siliconflow`
   - **API Key**: 输入你的硅基流动 API Key
   - **Model**: 选择模型（默认：`Qwen/Qwen2.5-Coder-32B-Instruct`）
   - **Max Tokens**: 最大生成 token 数（默认：1024）
   - **Temperature**: 生成温度（默认：0.3）

### 使用本地服务

1. 打开 VSCode 设置
2. 搜索 `rwkv-code-completion`
3. 配置以下选项：
   - **Provider**: 选择 `local`
   - **Local Endpoint**: 输入本地服务地址（如：`http://localhost:8080/v1/chat/completions`）
   - **Local Model**: 输入模型名称

## 🎮 使用方法

### 自动补全

1. 确保插件已启用（状态栏显示 `✓ RWKV 补全`）
2. 在编辑器中输入代码
3. 稍等片刻，会出现灰色的补全建议
4. 按 `Tab` 键接受补全，按 `Esc` 键拒绝

### 命令

- **RWKV: 启用/禁用代码补全**：快速切换补全功能
- **RWKV: 打开设置**：快速打开插件设置页面

### 状态栏

点击右下角的 `RWKV 补全` 状态栏图标可以快速启用/禁用补全功能。

## ⚙️ 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `rwkv-code-completion.enabled` | boolean | true | 启用或禁用代码补全 |
| `rwkv-code-completion.provider` | string | siliconflow | 服务提供商（siliconflow/local） |
| `rwkv-code-completion.siliconflow.apiKey` | string | - | 硅基流动 API Key |
| `rwkv-code-completion.siliconflow.model` | string | Qwen/Qwen2.5-Coder-32B-Instruct | 硅基流动模型 |
| `rwkv-code-completion.siliconflow.maxTokens` | number | 1024 | 最大生成 token 数 |
| `rwkv-code-completion.siliconflow.temperature` | number | 0.3 | 生成温度（0-2） |
| `rwkv-code-completion.local.endpoint` | string | http://localhost:8080/v1/chat/completions | 本地服务端点 |
| `rwkv-code-completion.local.model` | string | default | 本地模型名称 |
| `rwkv-code-completion.debounceDelay` | number | 300 | 触发补全延迟（毫秒） |

## 🔌 API 接口说明

### 硅基流动 API

默认使用硅基流动的 Chat Completions API：
- **端点**: `https://api.siliconflow.cn/v1/chat/completions`
- **认证**: Bearer Token
- **请求格式**: 标准 OpenAI 兼容格式

### 本地服务

本地服务需要实现兼容 OpenAI Chat Completions 的 API 接口：

```javascript
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "your-model-name",
  "messages": [
    {
      "role": "user",
      "content": "代码补全提示词"
    }
  ],
  "stream": false,
  "max_tokens": 1024,
  "temperature": 0.3,
  "top_p": 0.95
}
```

响应格式：
```json
{
  "choices": [
    {
      "message": {
        "content": "补全的代码内容"
      }
    }
  ]
}
```

## 🛠️ 开发

### 项目结构

```
rwkv-code-completion/
├── src/
│   ├── extension.ts          # 主扩展文件
│   └── test/                 # 测试文件
├── package.json              # 插件配置
├── tsconfig.json             # TypeScript 配置
└── README.md                 # 说明文档
```

### 构建和测试

```bash
# 安装依赖
pnpm install

# 编译
pnpm run compile

# 监听模式
pnpm run watch

# 运行测试
pnpm test

# 打包
pnpm run package
```

## 📝 注意事项

1. **API Key 安全**：不要将 API Key 提交到版本控制系统
2. **网络连接**：使用硅基流动 API 需要稳定的网络连接
3. **本地服务**：确保本地服务已启动并可访问
4. **性能优化**：插件内置防抖机制，避免频繁请求
5. **补全质量**：补全质量取决于所选模型和提示词设计

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- 硅基流动提供的 API 服务
- VSCode 扩展 API
- Qwen 系列模型
