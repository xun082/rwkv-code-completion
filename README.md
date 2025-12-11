# 🤖 RWKV 代码补全插件

基于 RWKV 大语言模型的 VSCode 代码补全、AI 聊天和 Git 提交助手插件。

## ✨ 功能特性

### 1. 🔥 智能代码补全
- 实时代码补全建议
- 基于上下文的智能提示
- 可调节的生成参数（温度、Top P、最大 Token 等）
- 防抖延迟优化，避免频繁请求

### 2. 💬 AI 聊天助手
- 美观的现代化聊天界面
- 支持 Markdown 渲染
- 代码高亮显示
- 快捷问题按钮
- 流式响应显示
- 清空历史记录

### 3. 🎯 Git 提交助手
- 实时显示 Git 状态
- AI 自动生成规范化的提交信息
- 遵循 Conventional Commits 规范
- 支持手动编辑提交信息
- 一键提交更改
- 提交规范参考

## 🚀 快速开始

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm run watch
```

### 编译构建
```bash
pnpm run compile
```

### 调试插件
按 `F5` 启动调试，会打开一个新的 VSCode 窗口。

## 📋 使用指南

### 控制面板
1. 点击侧边栏的 **RWKV 代码补全** 图标
2. 展开 **控制面板**
3. 可以：
   - 查看运行状态
   - 切换启用/禁用
   - 编辑服务端点、Token 数量、温度等参数

### AI 聊天
1. 展开 **AI 聊天** 面板
2. 在输入框中输入问题
3. 点击 **发送** 或按 `Shift+Enter`
4. AI 会流式返回回答
5. 点击快捷按钮快速提问

### Git 提交助手
1. 展开 **Git 提交助手** 面板
2. 修改一些代码文件
3. 点击 **🔄 刷新** 查看更改
4. 点击 **🤖 生成提交信息** 让 AI 自动生成规范化的提交信息
5. 可以手动编辑生成的信息
6. 点击 **✅ 提交更改** 完成提交

## ⚙️ 配置说明

### 基础配置
- **endpoint**: RWKV 服务端点地址
- **password**: RWKV 服务密码
- **enabled**: 启用/禁用代码补全

### 生成参数
- **maxTokens**: 最大生成 Token 数（8-32 推荐）
- **temperature**: 生成温度（0.05-0.2 推荐，越低越确定）
- **topP**: Top P 采样参数（0.9-0.98 推荐）
- **debounceDelay**: 触发补全的延迟时间（毫秒）

## 🏗️ 技术架构

### 前端
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Tailwind CSS** - 样式框架
- **rsbuild** - 构建工具（基于 Rspack）

### 后端
- **VSCode Extension API** - 扩展开发
- **WebviewViewProvider** - Webview 面板
- **InlineCompletionItemProvider** - 代码补全

### 构建系统
- **rsbuild** - Webview 构建（React + Tailwind）
- **esbuild** - 扩展代码构建
- **TypeScript** - 类型检查

## 📁 项目结构

```
rwkv-code-completion/
├── src/                      # 扩展源码
│   ├── extension.ts          # 扩展入口
│   ├── completionService.ts  # 代码补全服务
│   ├── chatPanel.ts          # AI 聊天面板
│   ├── chatService.ts        # AI 聊天服务
│   ├── gitCommitPanel.ts     # Git 提交助手面板
│   └── controlPanel.ts       # 控制面板
├── webview/                  # Webview 前端
│   ├── src/
│   │   ├── index.tsx         # 入口文件
│   │   ├── MainApp.tsx       # 主应用组件
│   │   ├── App.tsx           # AI 聊天组件
│   │   ├── GitCommit.tsx     # Git 提交助手组件
│   │   ├── vscode.ts         # VSCode API 单例
│   │   ├── types.ts          # 类型定义
│   │   └── index.css         # 样式文件
│   └── index.html            # HTML 模板
├── dist/                     # 构建输出
│   ├── extension.js          # 编译后的扩展代码
│   └── webview/              # 编译后的 Webview
│       └── assets/
│           ├── index.js      # React 应用
│           └── index.css     # 样式
├── package.json
├── tsconfig.json
├── rsbuild.config.ts         # rsbuild 配置
├── tailwind.config.js        # Tailwind 配置
├── postcss.config.js         # PostCSS 配置
└── esbuild.js                # esbuild 构建脚本
```

## 🎯 Git 提交规范

插件生成的提交信息遵循 **Conventional Commits** 规范：

- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式化
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建/工具配置

示例：
```
feat(chat): 添加 AI 聊天功能
fix(completion): 修复补全延迟问题
docs: 更新 README 文档
```

## 🛠️ 开发命令

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm run check-types

# 代码检查
pnpm run lint

# 编译扩展
pnpm run compile

# 监听模式（开发）
pnpm run watch

# 打包发布
pnpm run package
```

## 🐛 故障排除

### 问题：Webview 面板空白

**解决方案**：
1. 检查构建产物：`ls -lh dist/webview/assets/`
2. 确认有 `index.js` 和 `index.css`
3. 重新编译：`pnpm run compile`
4. 重新加载扩展（调试窗口点击 🔄）

### 问题：代码补全不工作

**检查清单**：
1. 确认插件已启用（控制面板显示"✅ 已启用"）
2. 检查 endpoint 配置是否正确
3. 确认 RWKV 服务正在运行
4. 查看 VSCode 输出面板的错误信息

### 问题：Git 提交助手显示"无法获取 Git 状态"

**原因**：当前工作区不是 Git 仓库

**解决方案**：
1. 确保在 Git 仓库中使用
2. 运行 `git init` 初始化仓库
3. 点击 🔄 刷新按钮

## 📊 性能优化

- ✅ 防抖延迟：避免频繁 API 请求
- ✅ AbortController：取消未完成的请求
- ✅ 流式响应：实时显示 AI 回答
- ✅ 代码分割：按需加载组件
- ✅ CSS 独立：样式文件单独加载

## 🔒 安全性

- ✅ 严格的 CSP 策略
- ✅ Webview 沙箱隔离
- ✅ 输入验证和清理
- ✅ 错误边界处理

## 📝 更新日志

### v0.0.1 (2025-12-11)
- ✅ 实现智能代码补全
- ✅ 添加 AI 聊天功能
- ✅ 添加 Git 提交助手
- ✅ 采用 rsbuild 构建系统
- ✅ 美观的现代化 UI
- ✅ 完整的配置面板

## 🙏 致谢

- [RWKV](https://github.com/BlinkDL/RWKV-LM) - 开源大语言模型
- [rsbuild](https://rsbuild.dev/) - 快速构建工具
- [Tailwind CSS](https://tailwindcss.com/) - 样式框架

## 📄 许可证

MIT License

---

## 💡 提示

- 插件启动后会在状态栏显示运行状态
- 所有配置都可以在控制面板中实时修改
- AI 聊天支持 Markdown 和代码高亮
- Git 提交信息生成基于代码差异分析

**享受智能编程体验！** 🚀
