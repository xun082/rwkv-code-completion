/**
 * SiliconFlow AI Service
 * 封装 SiliconFlow API 请求
 */

interface SiliconFlowMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface SiliconFlowResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      reasoning_content?: string;
      tool_calls?: any[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
  model: string;
  object: string;
}

export class SiliconFlowService {
  private readonly apiKey =
    "sk-akaemjzequsiwfzyfpijamrnsuvvfeicsbtsqnzqshfvxexv";
  private readonly baseUrl = "https://api.siliconflow.cn/v1/chat/completions";

  // 可用的高级模型
  private readonly models = {
    qwen: "Qwen/Qwen2.5-72B-Instruct", // Qwen 高级模型
    deepseek: "deepseek-ai/DeepSeek-V3", // DeepSeek V3 最新模型
    qwenVL: "Qwen/Qwen2.5-VL-72B-Instruct", // Qwen 视觉语言模型
  };

  /**
   * 发送聊天请求（非流式）
   */
  async chat(
    messages: SiliconFlowMessage[],
    options?: {
      model?: "qwen" | "deepseek" | "qwenVL";
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<string> {
    const model = options?.model || "deepseek";
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    const requestBody = {
      model: this.models[model],
      messages: messages,
      stream: false,
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1,
      response_format: { type: "text" },
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SiliconFlow API 错误 (${response.status}): ${errorText}`
        );
      }

      const data: SiliconFlowResponse = await response.json();

      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }

      throw new Error("SiliconFlow API 返回数据格式错误");
    } catch (error) {
      throw error;
    }
  }

  /**
   * 发送聊天请求（流式输出）
   */
  async chatStream(
    messages: SiliconFlowMessage[],
    onChunk: (text: string) => void,
    options?: {
      model?: "qwen" | "deepseek" | "qwenVL";
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }
  ): Promise<void> {
    const model = options?.model || "deepseek";
    const temperature = options?.temperature ?? 0.7;
    const maxTokens = options?.maxTokens ?? 4096;

    const requestBody = {
      model: this.models[model],
      messages: messages,
      stream: true, // 启用流式输出
      max_tokens: maxTokens,
      temperature: temperature,
      top_p: 0.7,
      top_k: 50,
      frequency_penalty: 0.5,
      n: 1,
      response_format: { type: "text" },
    };

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: options?.signal, // 支持中止请求
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SiliconFlow API 错误 (${response.status}): ${errorText}`
        );
      }

      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("无法获取响应流");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (trimmedLine === "" || trimmedLine === "data: [DONE]") {
            continue;
          }

          if (trimmedLine.startsWith("data: ")) {
            try {
              const jsonStr = trimmedLine.slice(6);
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {}
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * 生成 Git 提交信息
   */
  async generateGitCommit(
    diff: string,
    commitType?: string,
    scope?: string
  ): Promise<string> {
    const typeInfo = commitType ? `类型已选择: ${commitType}` : "";
    const scopeInfo = scope ? `范围: ${scope}` : "";

    const systemPrompt = `你是一个专业的 Git 提交信息生成助手。
请根据提供的 Git diff 内容，生成简洁的提交描述（subject）。

${typeInfo ? typeInfo + "\n" : ""}${scopeInfo ? scopeInfo + "\n" : ""}
要求：
1. 只返回提交描述（subject 部分），不要包含类型（type）和范围（scope）
2. 使用中文，简洁明了，不超过 50 字
3. 直接描述改动内容，例如："添加用户登录功能"、"修复数据库连接问题"
4. 不要包含任何格式符号，只返回纯文本描述
5. 不要包含 markdown 格式或代码块
6. 不要重复前面的类型和范围信息`;

    const messages: SiliconFlowMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `请为以下 Git diff 生成提交描述：\n\n${diff}`,
      },
    ];

    return await this.chat(messages, {
      model: "deepseek",
      temperature: 0.7,
      maxTokens: 200,
    });
  }

  /**
   * AI 对话（通用 - 非流式）
   */
  async sendMessage(
    userMessage: string,
    conversationHistory?: SiliconFlowMessage[]
  ): Promise<string> {
    const messages: SiliconFlowMessage[] = [
      ...(conversationHistory || []),
      {
        role: "user",
        content: userMessage,
      },
    ];

    return await this.chat(messages, {
      model: "deepseek",
      temperature: 0.7,
      maxTokens: 4096,
    });
  }

  /**
   * AI 对话（流式输出）
   */
  async sendMessageStream(
    userMessage: string,
    onChunk: (text: string) => void,
    conversationHistory?: SiliconFlowMessage[],
    signal?: AbortSignal
  ): Promise<void> {
    const messages: SiliconFlowMessage[] = [
      {
        role: "system",
        content:
          "你是一个友好、专业的 AI 助手，擅长编程和技术问题。请用简洁、清晰的中文回答问题，支持 Markdown 格式。",
      },
      ...(conversationHistory || []),
      {
        role: "user",
        content: userMessage,
      },
    ];

    await this.chatStream(messages, onChunk, {
      model: "deepseek",
      temperature: 0.7,
      maxTokens: 4096,
      signal,
    });
  }
}

// 导出单例实例
export const siliconFlowService = new SiliconFlowService();
