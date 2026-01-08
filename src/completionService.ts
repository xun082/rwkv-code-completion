import * as vscode from "vscode";

// 配置接口
export interface CompletionConfig {
  enabled: boolean;
  endpoint: string;
  password: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  debounceDelay: number;
  numChoices: number;
  alphaPresence: number;
  alphaFrequency: number;
}

// 获取配置
export function getConfig(): CompletionConfig {
  const config = vscode.workspace.getConfiguration("rwkv-code-completion");
  return {
    enabled: config.get("enabled", true),
    endpoint: config.get(
      "endpoint",
      "http://192.168.0.157:8001/v2/chat/completions"
    ),
    password: config.get("password", "rwkv7_7.2b"),
    maxTokens: config.get("maxTokens", 200),
    temperature: config.get("temperature", 0.5),
    topP: config.get("topP", 0.5),
    debounceDelay: config.get("debounceDelay", 150),
    numChoices: config.get("numChoices", 24),
    alphaPresence: config.get("alphaPresence", 1.0),
    alphaFrequency: config.get("alphaFrequency", 0.1),
  };
}

// 代码补全服务类 - 直接调用 RWKV API在
export class CompletionService {
  // 调用本地 RWKV API 并支持多个补全选择
  async getCompletion(
    prefix: string,
    suffix: string,
    languageId: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string[]> {
    try {
      console.log("====== 代码补全请求 ======");
      console.log("语言:", languageId);
      console.log("前缀长度:", prefix.length);
      console.log("📊 请求的补全数量:", config.numChoices);
      console.log(
        "📍 前缀预览:",
        prefix.substring(prefix.length - 100).replace(/\n/g, "\\n")
      );
      console.log("========================");

      // 构建请求体
      const contents = Array(config.numChoices).fill(prefix);
      const body = {
        contents: contents,
        stream: false,
        password: config.password,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        top_k: 100,
        alpha_presence: config.alphaPresence,
        alpha_frequency: config.alphaFrequency,
        alpha_decay: 0.99,
        chunk_size: 128,
        pad_zero: true,
        stop_tokens: [0, 261, 24281],
      };

      console.log("🎯 发送请求，Contents 数量:", contents.length);

      // 调用 API
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: signal,
      });

      console.log("====== API 响应 ======");
      console.log("状态码:", response.status);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "无法读取错误信息");
        throw new Error(`API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      console.log("📦 返回的 choices 数量:", data.choices?.length || 0);

      if (!data.choices || data.choices.length === 0) {
        throw new Error("API 返回数据格式错误");
      }

      // 提取所有 choices
      const results: string[] = [];
      for (let i = 0; i < data.choices.length; i++) {
        const choice = data.choices[i];
        const content = choice.message?.content || choice.text;
        if (content) {
          results.push(content);
        }
      }

      console.log(`✅ 成功提取 ${results.length} 个补全`);

      // 清理每个补全内容
      const cleanedResults: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const cleaned = this.cleanCompletion(results[i], prefix);
        if (cleaned && cleaned.trim().length > 0) {
          cleanedResults.push(cleaned.trim());
        }
      }

      console.log(`✅ 返回 ${cleanedResults.length} 个有效补全`);
      return cleanedResults;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      console.error("❌ 补全请求失败:", error.message);
      return [];
    }
  }

  // 清理代码补全内容 - API 返回的就是纯代码，只需要基础清理
  private cleanCompletion(text: string, prefix: string): string {
    if (!text) {
      return "";
    }

    // API 返回的就是纯代码，直接返回即可
    // 例如：" {\n  let left = 0;\n  let right" 或 "\n  let left = 0;\n  let right ="
    return text;
  }
}
