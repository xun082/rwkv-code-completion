/**
 * RWKV 本地服务提供商
 *
 * RWKV API 格式说明：
 * - 使用 contents 数组而非 messages 数组
 * - 每个 content 是完整的对话字符串："User: xxx\nAssistant: xxx\nUser: xxx\nAssistant: <think"
 * - 历史对话需要拼接在同一个字符串中，每行之间用单个 \n 分隔
 * - <think 是 RWKV 的思考模式标记（不闭合）
 *
 * RWKV 深度思考模式：
 * - 思考内容格式：>思考内容...</think>
 * - 真实回复：</think> 之后的内容
 * - 示例：">我要友好回复用户。</think>\n你好！有什么可以帮助的吗？"
 * - 渲染策略：思考内容用浅色显示，真实回复正常显示
 */

import { AIServiceProvider, AIMessage, ChatOptions } from "../types";

interface RWKVLocalConfig {
  baseUrl: string;
  password: string;
  defaultModel?: string;
}

export class RWKVLocalProvider implements AIServiceProvider {
  private baseUrl: string;
  private password: string;

  constructor(config: RWKVLocalConfig) {
    if (!config.baseUrl) {
      throw new Error("baseUrl 是必需的配置参数");
    }
    if (!config.password) {
      throw new Error("password 是必需的配置参数");
    }

    this.baseUrl = config.baseUrl;
    this.password = config.password;
  }

  /**
   * 将 AIMessage[] 转换为 RWKV 的 content 字符串格式
   * 格式: "User: xxx\nAssistant: xxx\nUser: xxx\nAssistant: <think"
   */
  private convertMessagesToContent(
    messages: AIMessage[],
    enableThink: boolean = true
  ): string {
    let systemPrompt = "";
    let userPrompt = "";
    let conversationHistory = "";

    for (const msg of messages) {
      if (msg.role === "system") {
        // 收集系统提示
        systemPrompt += msg.content + "\n";
      } else if (msg.role === "user") {
        // 如果有之前的对话历史，先加入
        if (conversationHistory) {
          conversationHistory += `User: ${msg.content}\n`;
        } else {
          userPrompt += msg.content + "\n";
        }
      } else if (msg.role === "assistant") {
        conversationHistory += `Assistant: ${msg.content}\n`;
      }
    }

    // 组合格式：systemPrompt + User: userPrompt + Assistant: <think>\n</think> (关闭思考)
    let content = systemPrompt.trim();

    if (userPrompt) {
      content += `\n\nUser: ${userPrompt.trim()}`;
    }

    if (conversationHistory) {
      content += `\n\n${conversationHistory.trim()}`;
    }

    if (enableThink) {
      content += "\n\nAssistant: <think";
    } else {
      content += "\n\nAssistant: <think>\n</think>";
    }

    return content;
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    try {
      const response = await this.request(messages, false, options);
      const data = await response.json();

      if (data.choices && data.choices.length > 0) {
        const content =
          data.choices[0].message?.content || data.choices[0].text;
        if (content) {
          return content;
        }
      }

      throw new Error("AI 服务返回数据格式错误: " + JSON.stringify(data));
    } catch (error: any) {
      throw new Error(`聊天请求失败: ${error.message || "未知错误"}`);
    }
  }

  async chatStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
    try {
      const response = await this.request(messages, true, options);

      if (!response.body) {
        throw new Error("无法获取响应流");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let isDone = false;

      try {
        while (!isDone) {
          if (options?.signal?.aborted) {
            const abortError: any = new Error("用户停止生成");
            abortError.name = "AbortError";
            throw abortError;
          }

          const { done, value } = await reader.read();

          if (done) {
            isDone = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();

            if (!trimmedLine || trimmedLine.startsWith(":")) {
              continue;
            }

            if (trimmedLine === "data: [DONE]") {
              isDone = true;
              break;
            }

            if (trimmedLine.startsWith("data: ")) {
              try {
                const jsonStr = trimmedLine.substring(6);
                const data = JSON.parse(jsonStr);

                if (data.choices && data.choices.length > 0) {
                  const choice = data.choices[0];
                  const content = choice.delta?.content;

                  if (content) {
                    onChunk(content);
                  }

                  const finishReason = choice.finish_reason;
                  if (finishReason === "stop" || finishReason === "length") {
                    isDone = true;
                    break;
                  }
                }
              } catch (parseError) {
                // 忽略解析错误
              }
            }
          }
        }
      } catch (error: any) {
        if (options?.signal?.aborted || error.name === "AbortError") {
          const abortError: any = new Error("用户停止生成");
          abortError.name = "AbortError";
          throw abortError;
        }
        throw error;
      } finally {
        try {
          reader.cancel();
        } catch (e) {
          // 忽略错误
        }
        try {
          reader.releaseLock();
        } catch (e) {
          // 忽略错误
        }
      }
    } catch (error: any) {
      throw new Error(`流式请求失败: ${error.message || "未知错误"}`);
    }
  }

  private async request(
    messages: AIMessage[],
    stream: boolean,
    options?: ChatOptions
  ): Promise<Response> {
    // 从 options 中获取 enableThink，默认为 true（开启深度思考）
    const enableThink = options?.enableThink ?? true;

    // 将 messages 转换为 RWKV 的 content 格式
    const contentString = this.convertMessagesToContent(messages, enableThink);

    // 构建 contents 数组 - 固定为 1 个元素（不使用并发）
    const contents: string[] = [contentString];

    // 构建请求体 - RWKV 特定格式
    const body: any = {
      contents: contents, // 使用 contents 而非 messages
      stream: stream,
      password: this.password,
      enable_think: enableThink, // 控制深度思考
      // RWKV 参数
      max_tokens: options?.maxTokens ?? 2048,
      temperature: options?.temperature ?? 1.0,
      top_p: options?.topP ?? 0.3,
      top_k: options?.topK ?? 1,
      // RWKV 特定的采样参数
      alpha_presence: 0.5,
      alpha_frequency: 0.5,
      alpha_decay: 0.996,
      chunk_size: 128,
      pad_zero: true,
    };

    if (options?.stopTokens && options.stopTokens.length > 0) {
      body.stop_tokens = options.stopTokens;
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: stream ? "text/event-stream" : "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch (e) {
          errorText = "无法读取错误信息";
        }
        throw new Error(
          `AI 服务错误 (${response.status}): ${
            errorText || response.statusText
          }`
        );
      }

      return response;
    } catch (error: any) {
      if (error.name === "TypeError" && error.message.includes("fetch")) {
        throw new Error(
          `网络连接失败: 无法连接到 ${this.baseUrl}，请检查服务器是否运行，地址是否正确`
        );
      } else if (error.name === "AbortError") {
        throw error;
      } else {
        throw new Error(`请求失败: ${error.message || "未知错误"}`);
      }
    }
  }
}
