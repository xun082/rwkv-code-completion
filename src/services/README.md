# AI 服务架构说明

## 统一服务架构

使用统一的服务接口，方便切换不同的 AI 服务提供商。

## 当前使用

默认使用 SiliconFlow（硅基流动）作为 AI 服务提供商。

## 切换服务提供商

### 1. 创建新的提供商

在 `src/services/providers/` 目录下创建新的提供商类，实现 `AIServiceProvider` 接口：

```typescript
// src/services/providers/YourProvider.ts
import { AIServiceProvider, AIMessage, ChatOptions } from "../types";

export class YourProvider implements AIServiceProvider {
  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    // 实现非流式聊天
  }

  async chatStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
    // 实现流式聊天
  }
}
```

### 2. 更新默认提供商

在 `src/services/AIService.ts` 中修改默认实例：

```typescript
import { YourProvider } from "./providers/YourProvider";

const provider = new YourProvider({
  apiKey: "your-api-key",
  // 其他配置...
});

export const aiService = new AIService(provider);
```

## 支持的提供商

### SiliconFlow（当前）

使用 `@azure/core-sse` 处理 SSE 流式响应。

配置：

```typescript
const provider = new SiliconFlowProvider({
  apiKey: "your-api-key",
  baseUrl: "https://api.siliconflow.cn/v1/chat/completions", // 可选
  defaultModel: "deepseek-ai/DeepSeek-V3", // 可选
});
```

### 扩展其他提供商

可以轻松添加支持：

- OpenAI
- Azure OpenAI
- Claude
- 其他兼容 OpenAI API 的服务

## 使用示例

```typescript
import { aiService } from "./services/AIService";

// 非流式聊天
const response = await aiService.chat([{ role: "user", content: "你好" }]);

// 流式聊天
await aiService.chatStream([{ role: "user", content: "你好" }], (chunk) =>
  console.log(chunk)
);

// Git 提交信息生成
const message = await aiService.generateGitCommit(diff, "feat", "auth");

// 对话（带历史记录）
await aiService.sendMessageStream(
  "你好",
  (chunk) => console.log(chunk),
  conversationHistory
);
```
