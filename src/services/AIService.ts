/**
 * AI 服务统一入口
 */

import * as vscode from "vscode";
import { AIServiceProvider, AIMessage, ChatOptions } from "./types";
import { RWKVLocalProvider } from "./providers/RWKVLocalProvider";

export class AIService {
  private provider: AIServiceProvider;

  constructor(provider: AIServiceProvider) {
    this.provider = provider;
  }

  /**
   * 非流式聊天
   */
  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    return this.provider.chat(messages, options);
  }

  /**
   * 流式聊天
   */
  async chatStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
    return this.provider.chatStream(messages, onChunk, options);
  }

  /**
   * 辅助方法：生成 Git 提交信息
   */
  async generateGitCommit(diff: string): Promise<string> {
    const systemPrompt = `你是一个专业的 Git 提交信息生成助手。
请根据提供的 Git diff 内容，自动识别提交类型并生成规范的提交信息。

提交类型：
- feat: 新功能
- fix: 修复问题
- docs: 文档更新
- style: 代码格式（不影响功能）
- refactor: 重构（不是新功能也不是修复）
- perf: 性能优化
- test: 测试相关
- build: 构建相关
- ci: CI/CD 相关
- chore: 其他杂项

要求：
1. 返回格式：类型: 描述（例如："feat: 添加用户登录功能"）
2. 根据改动内容自动选择最合适的类型
3. 描述使用中文，简洁明了，不超过 50 字
4. 直接返回完整的提交消息，不要其他格式
5. 不要包含 markdown 格式或代码块`;

    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请分析以下 Git diff 并生成提交消息：\n\n${diff}` },
    ];

    return this.chat(messages, {
      temperature: 0.7,
      maxTokens: 200,
    });
  }

  /**
   * 辅助方法：AI 对话（流式）
   */
  async sendMessageStream(
    userMessage: string,
    onChunk: (chunk: string) => void,
    conversationHistory?: AIMessage[],
    signal?: AbortSignal
  ): Promise<void> {
    const messages: AIMessage[] = [
      {
        role: "system",
        content:
          "你是一个专业的 AI 编程助手。用简洁、清晰的中文回答问题。",
      },
      ...(conversationHistory || []),
      { role: "user", content: userMessage },
    ];

    await this.chatStream(messages, onChunk, {
      temperature: 0.7,
      maxTokens: 4096,
      signal,
    });
  }
}

// 创建默认实例 - 使用本地 RWKV 服务
function createProvider(): RWKVLocalProvider {
  const config = vscode.workspace.getConfiguration("rwkv-code-completion");
  const baseUrl =
    config.get<string>("chat.baseUrl") ||
    "http://192.168.0.82:8001/v3/chat/completions";
  const password = config.get<string>("chat.password") || "rwkv7_7.2b";

  return new RWKVLocalProvider({
    baseUrl,
    password,
  });
}

export const aiService = new AIService(createProvider());

