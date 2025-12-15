import { aiService } from "./services/AIService";
import { AIMessage } from "./services/types";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export class ChatService {
  private conversationHistory: ChatMessage[] = [];

  // 发送聊天消息（流式输出）
  async sendMessage(
    userMessage: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    contextMessages?: ChatMessage[]
  ): Promise<string> {
    try {
      // 使用前端传递的上下文，如果没有则使用本地历史记录
      const historyToUse =
        contextMessages && contextMessages.length > 0
          ? contextMessages
          : this.conversationHistory.slice(-20);

      let fullMessage = "";

      // 转换为 AIMessage 格式
      const aiMessages: AIMessage[] = historyToUse.map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      }));

      await aiService.sendMessageStream(
        userMessage,
        (chunk: string) => {
          fullMessage += chunk;
          if (onChunk) {
            onChunk(chunk);
          }
        },
        aiMessages,
        signal
      );

      // 保存到本地历史（用于后备）
      this.conversationHistory.push(
        {
          role: "user",
          content: userMessage,
          timestamp: Date.now(),
        },
        {
          role: "assistant",
          content: fullMessage,
          timestamp: Date.now(),
        }
      );

      return fullMessage;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      throw new Error(`聊天请求失败: ${error.message}`);
    }
  }

  // 清空对话历史
  clearHistory() {
    this.conversationHistory = [];
  }

  // 获取对话历史
  getHistory(): ChatMessage[] {
    return this.conversationHistory;
  }

  // 导出对话历史
  exportHistory(): string {
    return JSON.stringify(this.conversationHistory, null, 2);
  }
}
