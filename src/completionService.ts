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

// 代码补全服务类 - 支持两种模式：普通补全 和 FIM（Fill In the Middle）
export class CompletionService {
  // 调用本地 RWKV API 并支持多个补全选择
  async getCompletion(
    prefix: string,
    suffix: string,
    languageId: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string[]> {
    // 判断使用哪个接口：如果有 suffix 内容，使用 FIM；否则使用普通补全
    const hasSuffix = suffix && suffix.trim().length > 0;

    if (hasSuffix) {
      // 使用 FIM 接口
      return this.callFIMAPI(prefix, suffix, config, signal);
    } else {
      // 使用普通补全接口
      return this.callCompletionAPI(prefix, config, signal);
    }
  }

  // 普通补全接口
  private async callCompletionAPI(
    prefix: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string[]> {
    try {
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

      if (!response.ok) {
        const errorText = await response.text().catch(() => "无法读取错误信息");
        throw new Error(`API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error("API 返回数据格式错误");
      }

      // 提取所有 choices
      const results: string[] = [];
      for (let i = 0; i < data.choices.length; i++) {
        const choice = data.choices[i];
        const content = choice.message?.content || choice.text;
        if (content && content.trim().length > 0) {
          results.push(content.trim());
        }
      }

      return results;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      return [];
    }
  }

  // FIM 接口（Fill In the Middle）- 固定 4 个并发
  private async callFIMAPI(
    prefix: string,
    suffix: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string[]> {
    try {
      // FIM 接口固定 4 个并发
      const batchSize = 4;
      const prefixArray = Array(batchSize).fill(prefix);
      const suffixArray = Array(batchSize).fill(suffix);

      // 构建 FIM 请求体
      const body = {
        prefix: prefixArray,
        suffix: suffixArray,
        max_tokens: config.maxTokens,
        stop_tokens: [0, 261, 24281],
        temperature: config.temperature,
        top_k: 1,
        top_p: config.topP,
        alpha_presence: config.alphaPresence,
        alpha_frequency: config.alphaFrequency,
        alpha_decay: 0.996,
        stream: false,
        password: config.password,
      };

      // FIM 接口地址
      const fimEndpoint = config.endpoint.replace(
        "/v2/chat/completions",
        "/FIM/v1/batch-FIM"
      );

      // 调用 FIM API
      const response = await fetch(fimEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "无法读取错误信息");
        throw new Error(`FIM API 错误 (${response.status}): ${errorText}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error("FIM API 返回数据格式错误");
      }

      // 提取所有 choices
      const results: string[] = [];
      for (let i = 0; i < data.choices.length; i++) {
        const choice = data.choices[i];
        const content = choice.message?.content || choice.text;
        if (content && content.trim().length > 0) {
          results.push(content.trim());
        }
      }

      return results;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      return [];
    }
  }
}
