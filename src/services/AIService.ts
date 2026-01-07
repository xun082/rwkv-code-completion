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
    const result = await this.provider.chat(messages, options);
    // 如果返回数组，取第一个结果
    return Array.isArray(result) ? result[0] : result;
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
    const systemPrompt = `你是 Git 提交消息生成专家。`;

    const userPrompt = `请根据下面的代码改动（diff），生成一行 Git 提交消息。

【重要】直接输出提交消息，格式：类型: 描述

类型必须是以下之一：feat、fix、docs、style、refactor、perf、test、chore

示例输出：
feat: 添加用户登录功能
fix: 修复内存泄漏问题
chore: 更新依赖配置

【代码改动如下】
${diff}

【请直接输出一行提交消息】`;

    const messages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const result = await this.chat(messages, {
      temperature: 0.7,
      maxTokens: 200,
      topP: 0.3,
      topK: 1,
      enableThink: false,
    });

    let cleanResult = result.trim();

    cleanResult = cleanResult.replace(/>[\s\S]*?<\/think>\s*/g, "");
    if (cleanResult.includes("</think>")) {
      const thinkEndIndex = cleanResult.indexOf("</think>");
      cleanResult = cleanResult.substring(thinkEndIndex + 8).trim();
    }

    const allLines = cleanResult.split("\n");
    let commitMessage = "";

    for (const line of allLines) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }
      if (trimmed.startsWith(">")) {
        continue;
      }
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        continue;
      }
      if (
        trimmed.match(
          /^(分析|说明|类型|描述|关键词|符合规范|任务|格式|示例|要求)[:：]/i
        )
      ) {
        continue;
      }
      if (
        trimmed.match(
          /^(import|export|const|let|var|function|class|\/\/|\/\*|\{|\})/i
        )
      ) {
        continue;
      }
      if (trimmed.startsWith("```") || trimmed.startsWith("`")) {
        continue;
      }

      if (trimmed.match(/^(feat|fix|docs|style|refactor|perf|test|chore):/i)) {
        commitMessage = trimmed;
        break;
      }

      if (!commitMessage && trimmed.length >= 5 && trimmed.length <= 100) {
        commitMessage = trimmed;
      }
    }

    if (!commitMessage) {
      throw new Error("无法生成有效的提交消息，请检查代码改动");
    }

    let finalMessage = commitMessage
      .replace(/^[#*`\-]+\s*/, "")
      .replace(/[`\-]+$/, "")
      .replace(/^(提交消息|git\s+commit)[:：]\s*/i, "")
      .trim();

    if (
      !finalMessage.match(/^(feat|fix|docs|style|refactor|perf|test|chore):/i)
    ) {
      if (finalMessage.length >= 3 && finalMessage.length <= 100) {
        finalMessage = "chore: " + finalMessage.replace(/^[:：]\s*/, "");
      } else {
        throw new Error("生成的提交消息格式不正确");
      }
    }

    if (finalMessage.length > 72) {
      finalMessage = finalMessage.substring(0, 69) + "...";
    }

    return finalMessage;
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
        content: "你是一个专业的 AI 编程助手。用简洁、清晰的中文回答问题。",
      },
      ...(conversationHistory || []),
      { role: "user", content: userMessage },
    ];

    await this.chatStream(messages, onChunk, {
      temperature: 1.0, // RWKV 推荐值
      maxTokens: 8192, // 增加到 8192，支持更长的回复
      topP: 0.3, // RWKV 推荐值
      topK: 1, // RWKV 推荐值
      signal,
    });
  }
}

// 创建默认实例 - 使用本地 RWKV 服务
function createProvider(): RWKVLocalProvider {
  const config = vscode.workspace.getConfiguration("rwkv-code-completion");
  const baseUrl =
    config.get<string>("chat.baseUrl") ||
    "http://192.168.0.157:8001/v2/chat/completions";
  const password = config.get<string>("chat.password") || "rwkv7_7.2b";

  return new RWKVLocalProvider({
    baseUrl,
    password,
  });
}

export const aiService = new AIService(createProvider());
