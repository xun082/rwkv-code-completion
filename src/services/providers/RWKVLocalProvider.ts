/**
 * RWKV 本地服务提供商
 *
 * RWKV API v2 格式说明：
 * - API 端点：http://192.168.0.157:8001/v2/chat/completions
 * - 使用 contents 数组而非 messages 数组
 * - 每个 content 是完整的对话字符串："User: xxx\nAssistant: xxx\nUser: xxx\nAssistant: <think"
 * - 历史对话需要拼接在同一个字符串中，每行之间用单个 \n 分隔
 * 
 * 批量并发支持：
 * - contents 数组可以包含多个 prompt，用于并发生成多个补全选择
 * - 例如：["prompt1", "prompt1", "prompt1"] 会生成 3 个不同的补全
 * - 响应格式：标准 OpenAI Chat Completion 格式，包含多个 choices
 * - 每个 choice 包含：index, message (role, content), finish_reason
 *
 * 请求参数：
 * - max_tokens: 最大生成 token 数（默认 1024）
 * - stop_tokens: 停止词 ID 数组（默认 [0, 261, 24281]）
 * - temperature: 温度参数（默认 0.5）
 * - top_k: Top K 采样（默认 100）
 * - top_p: Top P 采样（默认 0.5）
 * - alpha_presence: 重复惩罚 - 内容（默认 1.0）
 * - alpha_frequency: 重复惩罚 - 频率（默认 0.1）
 * - alpha_decay: 衰减系数（默认 0.99）
 * - chunk_size: 分块大小（默认 128）
 * - pad_zero: 填充零（默认 true）
 * - password: 服务密码（默认 "rwkv7_7.2b"）
 * - stream: 是否流式输出（默认 false）
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

  async chat(messages: AIMessage[], options?: ChatOptions): Promise<string | string[]> {
    try {
      const response = await this.request(messages, false, options);
      const data = await response.json();

      console.log("====== RWKV API 响应数据 ======");
      console.log("📦 返回的 choices 数量:", data.choices?.length || 0);
      console.log("🔍 请求的 numChoices:", options?.numChoices ?? 1);
      if (data.choices && data.choices.length > 0) {
        console.log("📝 前3个 choices 预览:");
        data.choices.slice(0, 3).forEach((choice: any, i: number) => {
          const content = choice.message?.content || choice.text || "";
          console.log(`  Choice ${i + 1}: ${content.substring(0, 50).replace(/\n/g, "\\n")}...`);
        });
      }
      console.log("================================");

      if (data.choices && data.choices.length > 0) {
        console.log(`🔄 开始提取所有 ${data.choices.length} 个 choices...`);
        const results: string[] = [];
        
        // 提取所有返回的 choices，不管配置的 numChoices 是多少
        for (let i = 0; i < data.choices.length; i++) {
          const choice = data.choices[i];
          console.log(`  处理 Choice ${i}:`, {
            hasMessage: !!choice.message,
            hasContent: !!choice.message?.content,
            hasText: !!choice.text,
          });
          
          const content = choice.message?.content || choice.text;
          if (content) {
            results.push(content);
            console.log(`  ✅ Choice ${i} 提取成功，长度: ${content.length}`);
          } else {
            console.log(`  ⚠️  Choice ${i} 没有 content`);
          }
        }
        
        console.log(`✅ 成功提取 ${results.length} 个补全选择（共 ${data.choices.length} 个 choices）`);
        
        if (results.length > 0) {
          // 如果只有1个结果，返回字符串；否则返回数组
          if (results.length === 1) {
            console.log(`📤 只有1个结果，返回字符串`);
            return results[0];
          } else {
            console.log(`📤 有 ${results.length} 个结果，返回数组`);
            return results;
          }
        }
      }

      console.error("❌ AI 服务返回数据格式错误");
      throw new Error("AI 服务返回数据格式错误: " + JSON.stringify(data));
    } catch (error: any) {
      console.error("❌ 聊天请求失败:", error.message);
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

    // 检查是否是代码补全模式（通过 options 中的标记判断）
    const isCodeCompletion = options?.model === "code-completion";
    
    let contentString: string;
    if (isCodeCompletion) {
      // 代码补全模式：直接使用用户消息内容作为 prompt（纯代码）
      const userMessage = messages.find(m => m.role === "user");
      contentString = userMessage?.content || "";
    } else {
      // 对话模式：使用对话格式
      contentString = this.convertMessagesToContent(messages, enableThink);
    }

    // 构建 contents 数组 - 支持批量并发请求（用于生成多个补全选项）
    // 对于代码补全，生成多个相同的 prompt 以获得不同的补全建议
    const numChoices = options?.numChoices ?? 1; // 默认1个选择，代码补全时可设置为更多
    const contents: string[] = Array(numChoices).fill(contentString);

    // 构建请求体 - RWKV 特定格式
    const body: any = {
      contents: contents, // 使用 contents 数组支持批量并发
      stream: stream,
      password: this.password,
      // RWKV 参数
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.5,
      top_p: options?.topP ?? 0.5,
      top_k: options?.topK ?? 100,
      // RWKV 特定的采样参数
      alpha_presence: options?.alphaPresence ?? 1.0,
      alpha_frequency: options?.alphaFrequency ?? 0.1,
      alpha_decay: 0.99,
      chunk_size: 128,
      pad_zero: true,
    };

    // 停止词设置
    if (options?.stopTokens && options.stopTokens.length > 0) {
      body.stop_tokens = options.stopTokens;
    } else {
      // 默认停止词
      body.stop_tokens = [0, 261, 24281];
    }

    // 输出请求信息用于调试
    console.log("====== RWKV API 请求开始 ======");
    console.log("URL:", this.baseUrl);
    console.log("模式:", isCodeCompletion ? "代码补全" : "对话");
    console.log("🎯 请求的 numChoices:", numChoices);
    console.log("📦 实际 Contents 数量:", contents.length);
    console.log("📝 Contents 是否全部相同:", contents.every(c => c === contents[0]));
    console.log("Contents[0] 预览:", contents[0].substring(Math.max(0, contents[0].length - 100)));
    if (contents.length > 1) {
      console.log("✅ 确认：正在发送批量并发请求！");
    } else {
      console.warn("⚠️ 警告：只发送了 1 个 content！");
    }
    console.log("完整请求体:", JSON.stringify(body, null, 2));
    console.log("================================");

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
      
      console.log("====== RWKV API 响应 ======");
      console.log("状态码:", response.status);
      console.log("状态文本:", response.statusText);
      console.log("===========================");

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
