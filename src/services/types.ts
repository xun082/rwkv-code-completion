/**
 * AI 服务统一接口和类型定义
 */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  frequencyPenalty?: number;
  stopTokens?: (string | number)[];
  signal?: AbortSignal;
  enableThink?: boolean; // 是否启用深度思考（RWKV 特有）
}

export interface AIServiceProvider {
  /**
   * 非流式聊天
   */
  chat(messages: AIMessage[], options?: ChatOptions): Promise<string>;

  /**
   * 流式聊天
   */
  chatStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void>;
}

