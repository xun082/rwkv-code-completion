/**
 * SiliconFlow AI 服务提供商
 */

import { AIServiceProvider, AIMessage, ChatOptions } from "../types";

interface SiliconFlowConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class SiliconFlowProvider implements AIServiceProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: SiliconFlowConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl =
      config.baseUrl || "https://api.siliconflow.cn/v1/chat/completions";
    this.defaultModel = config.defaultModel || "deepseek-ai/DeepSeek-V3";
  }

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    const response = await this.request(messages, false, options);
    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }

    throw new Error("AI 服务返回数据格式错误");
  }

  async chatStream(
    messages: AIMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
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
        // 检查是否被中断
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
              const content = data.choices?.[0]?.delta?.content;
              
              if (content) {
                onChunk(content);
              }

              const finishReason = data.choices?.[0]?.finish_reason;
              if (finishReason === "stop" || finishReason === "length") {
                isDone = true;
                break;
              }
            } catch (parseError) {
              // 忽略单个事件的解析错误，继续处理
              console.warn("Parse SSE event error:", parseError);
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
        // 忽略 cancel 错误
      }
      try {
        reader.releaseLock();
      } catch (e) {
        // 忽略 releaseLock 错误
      }
    }
  }

  private async request(
    messages: AIMessage[],
    stream: boolean,
    options?: ChatOptions
  ): Promise<Response> {
    const body: any = {
      model: options?.model || this.defaultModel,
      messages: messages,
      stream: stream,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature ?? 0.7,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1,
      response_format: { type: "text" },
    };

    // 添加 stop tokens（如果有）
    if (options?.stopTokens && options.stopTokens.length > 0) {
      body.stop = options.stopTokens;
    } else {
      body.stop = null;
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI 服务错误 (${response.status}): ${errorText}`);
    }

    return response;
  }
}
