# RWKV 代码补全插件

基于 RWKV 的 VSCode 插件，提供代码补全、AI 聊天和 Git 提交助手。

## 功能

代码补全：写代码时自动提示

AI 聊天：侧边栏聊天窗口，聊天记录自动保存

Git 提交助手：自动生成规范的 commit 消息，支持 commitlint 格式

## 安装使用

1. 下载插件包，在 VSCode 按 `Ctrl+Shift+X` 打开扩展面板
2. 点右上角三个点 → 从 VSIX 安装
3. 点击侧边栏的机器人图标，进入控制面板
4. 填写 RWKV 服务地址（例如 `http://192.168.0.12:8000/v3/chat/completions`）
5. 填写服务密码，点击启用补全

配置好后直接写代码就会自动提示。

## 调整参数

在控制面板可以调整：

防抖延迟：打字后多久触发补全（默认 300ms）  
最大 Token：补全的长度（8-32）  
温度：随机性（0.1-0.2，数字越小越保守）

## AI 聊天

点击 AI 聊天面板，输入框打字，按 `Ctrl/Cmd + Enter` 发送。支持 Markdown 和代码块高亮。

聊天记录会自动保存，失败的对话不会保存，3 秒后自动消失。

只保留最近 5 条有效对话作为上下文，避免消耗太多 token。

## Git 提交助手

修改代码后打开 Git 提交助手面板：

1. 从下拉菜单选择提交类型（feat/fix/docs...）
2. 填写 scope（可选，比如 auth、ui、api）
3. 点 AI 按钮，自动生成描述
4. 预览完整消息，确认后提交

示例：

```
feat(chat): 添加消息持久化功能
fix(api): 修复用户登录接口超时问题
docs: 更新使用文档
```

## 自定义提交类型

按 `Ctrl/Cmd + ,` 打开设置，搜索 `rwkv-code-completion.git`：

```json
{
  "rwkv-code-completion.git.commitTypes": [
    {
      "type": "feat",
      "description": "新功能",
      "emoji": "✨"
    },
    {
      "type": "wip",
      "description": "进行中",
      "emoji": "🚧"
    }
  ],
  "rwkv-code-completion.git.useEmoji": false,
  "rwkv-code-completion.git.useScope": true
}
```

内置类型：feat、fix、docs、style、refactor、perf、test、build、ci、chore

## 常见问题

代码补全没反应：检查控制面板是否显示已启用，确认服务地址填对了，试试等 300ms，实在不行重启 VSCode

聊天一直转圈：可能是服务挂了，点停止按钮检查服务状态

提示不是 Git 仓库：在项目根目录运行 `git init`

AI 生成的提交消息不满意：直接手动改，或者换个提交类型、填写更具体的 scope、多点几次生成按钮

聊天记录丢了：保存在 localStorage 里，清理缓存会丢失

## 开发

```bash
pnpm install
pnpm run watch
pnpm run compile
```

按 F5 启动调试。
