import { siliconFlowService } from "./siliconFlowService";

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
    signal?: AbortSignal
  ): Promise<string> {
    // 添加用户消息到历史
    this.conversationHistory.push({
      role: "user",
      content: userMessage,
      timestamp: Date.now(),
    });

    // 构建消息历史（保留最近10轮对话）
    const recentHistory = this.conversationHistory.slice(-20);

    try {
      console.log("[Chat] 正在使用 SiliconFlow AI 流式回复...");

      let fullMessage = "";

      // 使用流式输出
      await siliconFlowService.sendMessageStream(
        userMessage,
        (chunk: string) => {
          fullMessage += chunk;
          if (onChunk) {
            onChunk(chunk); // 实时回调每个文本块
          }
        },
        recentHistory.slice(0, -1).map((msg) => ({
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content,
        }))
      );

      // 添加完整的助手回复到历史
      this.conversationHistory.push({
        role: "assistant",
        content: fullMessage,
        timestamp: Date.now(),
      });

      console.log("[Chat] AI 流式回复完成");
      return fullMessage;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      console.error("[Chat] AI 回复错误:", error);
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
