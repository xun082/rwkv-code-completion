import * as vscode from "vscode";

// RWKV API 响应类型
interface RWKVResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    delta?: {
      content?: string;
    };
    text?: string;
  }>;
  text?: string;
  content?: string;
}

// 配置接口
export interface CompletionConfig {
  enabled: boolean;
  endpoint: string;
  password: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  alphaPresence: number;
  alphaFrequency: number;
  debounceDelay: number;
}

// 获取配置
export function getConfig(): CompletionConfig {
  const config = vscode.workspace.getConfiguration("rwkv-code-completion");
  return {
    enabled: config.get("enabled", true),
    endpoint: config.get(
      "endpoint",
      "http://192.168.0.12:8000/v3/chat/completions"
    ),
    password: config.get("password", "rwkv7_7.2b_webgen"),
    maxTokens: config.get("maxTokens", 16), // 默认16，极度短
    temperature: config.get("temperature", 0.1), // 默认0.1，极度确定
    topP: config.get("topP", 0.95), // 默认0.95
    alphaPresence: config.get("alphaPresence", 0.5),
    alphaFrequency: config.get("alphaFrequency", 0.5),
    debounceDelay: config.get("debounceDelay", 300),
  };
}

// 代码补全服务类
export class CompletionService {
  // 日志辅助函数（已禁用）
  private log(message: string, data?: any) {}
  private logError(message: string, error?: any) {}

  // 构建代码补全 prompt
  buildPrompt(prefix: string, suffix: string, languageId: string): string {
    // 取最近的代码（不要太多）
    const prefixPart = prefix.slice(-180);

    // 最简单的方式：直接给代码
    // 加一个换行，让模型知道要续写下一行
    return prefixPart;
  }

  // 调用本地 RWKV API
  async getCompletion(
    prefix: string,
    suffix: string,
    languageId: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string | null> {
    const url = config.endpoint;
    const startTime = Date.now();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const prompt = this.buildPrompt(prefix, suffix, languageId);

    // RWKV API 完整参数（FIM 优化）
    const body: any = {
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: config.maxTokens,
      stop_tokens: [0, 261, 24281], // RWKV 默认停止符
      temperature: config.temperature,
      top_k: 1,
      top_p: config.topP,
      pad_zero: true,
      alpha_presence: config.alphaPresence,
      alpha_frequency: config.alphaFrequency,
      alpha_decay: 0.996,
      chunk_size: 128,
      stream: false,
      enable_think: false,
      password: config.password,
    };


    try {
      this.log("开始发送请求...");
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      });

      const duration = Date.now() - startTime;
      this.log(`响应时间: ${duration}ms`);
      this.log(`响应状态: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        this.logError(`API 错误 [${response.status}]:`, errorText);
        vscode.window.showErrorMessage(
          `RWKV 服务失败: ${response.status} - ${errorText.substring(0, 100)}`
        );
        return null;
      }

      const responseText = await response.text();
      this.log("原始响应:", responseText.substring(0, 500));

      let data: RWKVResponse;
      try {
        data = JSON.parse(responseText) as RWKVResponse;
        this.log("解析后的响应:", data);
      } catch (parseError: any) {
        this.logError("JSON 解析失败:", parseError);
        vscode.window.showErrorMessage("服务返回了无效的 JSON");
        return null;
      }

      // 尝试从多种可能的字段获取内容
      let content = "";

      // 尝试 1: choices[0].message.content (标准 OpenAI 格式)
      if (data.choices && data.choices.length > 0) {
        const choice = data.choices[0];
        this.log("choices[0] 内容:", choice);

        if (choice.message?.content) {
          content = choice.message.content;
          this.log("✓ 从 choices[0].message.content 获取");
        } else if (choice.delta?.content) {
          content = choice.delta.content;
          this.log("✓ 从 choices[0].delta.content 获取");
        } else if (choice.text) {
          content = choice.text;
          this.log("✓ 从 choices[0].text 获取");
        }
      }

      // 尝试 2: 顶层 text 字段
      if (!content && data.text) {
        content = data.text;
        this.log("✓ 从 text 字段获取");
      }

      // 尝试 3: 顶层 content 字段
      if (!content && data.content) {
        content = data.content;
        this.log("✓ 从 content 字段获取");
      }

      if (!content) {
        this.log("✗ 未找到内容，响应结构:", Object.keys(data));
        this.log("完整响应:", data);
        return null;
      }

      this.log("原始补全内容:", content.substring(0, 200));
      const cleaned = this.cleanCompletion(content, prefix);
      this.log("清理后的补全:", cleaned.substring(0, 200));

      if (!cleaned || cleaned.trim().length === 0) {
        this.log("清理后内容为空");
        return null;
      }

      return cleaned;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      if (error.name === "AbortError") {
        this.log(`请求被取消 (${duration}ms)`);
        throw error;
      }
      this.logError("API 调用错误:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      vscode.window.showErrorMessage(`服务调用失败: ${error.message}`);
      return null;
    }
  }

  // 彻底清理重复内容 - FIM 增强版
  cleanCompletion(text: string, prefix?: string): string {
    if (!text) {
      return "";
    }

    this.log("========== 开始清理 ==========");
    this.log("原始内容:", text.substring(0, 200));

    // 移除 markdown 代码块
    text = text.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "");

    // 移除开头空行
    text = text.replace(/^\n+/, "");

    if (!prefix) {
      return text.trim();
    }

    const prefixLines = prefix.split("\n");
    const lastLine = prefixLines[prefixLines.length - 1] || "";
    let cleaned = text.trim();

    this.log("前文最后一行:", `"${lastLine}"`);

    // === 策略0: 智能检测完全重复的定义 ===
    // 更精确地检测：如果是完整的函数/类定义（不是参数或括号）
    const fullDefinitionPatterns = [
      /^\s*function\s+\w+\s*\([^)]*\)\s*\{/, // 完整函数定义
      /^\s*class\s+\w+\s*\{/, // 完整类定义
      /^\s*const\s+\w+\s*=\s*function/, // 函数表达式
      /^\s*const\s+\w+\s*=\s*\(/, // 箭头函数
    ];

    for (const pattern of fullDefinitionPatterns) {
      if (pattern.test(cleaned)) {
        const match = cleaned.match(pattern);
        if (match && prefix.includes(match[0].trim().substring(0, 30))) {
          this.log("❌ 检测到完整定义重复，丢弃:", match[0].substring(0, 50));
          return "";
        }
      }
    }

    // 如果只是括号或参数，不丢弃
    // 例如：(matrix) { 或 (a, b) 都是合法的补全

    // === 策略1: 完整行重复检测 ===
    if (lastLine.trim().length > 0) {
      const trimmedLast = lastLine.trim();

      if (cleaned.startsWith(trimmedLast)) {
        this.log("✓ 移除完整行重复:", trimmedLast);
        cleaned = cleaned.substring(trimmedLast.length).trim();
      }
    }

    // === 策略2: 后缀匹配（超强版）===
    // 检查整个前文末尾，不只是最后一行
    if (prefix.length > 0) {
      const prefixEnd = prefix.slice(-80); // 前文最后80字符
      let bestMatch = 0;

      // 从长到短找最长重叠（至少2个字符）
      for (
        let len = Math.min(prefixEnd.length, cleaned.length);
        len >= 2;
        len--
      ) {
        const tail = prefixEnd.slice(-len);
        if (cleaned.startsWith(tail)) {
          bestMatch = len;
          break;
        }
      }

      if (bestMatch > 0) {
        const overlap = prefixEnd.slice(-bestMatch);
        this.log(
          "✓ 移除重叠:",
          overlap.length > 30 ? overlap.substring(0, 30) + "..." : overlap
        );
        cleaned = cleaned.substring(bestMatch).trim();
      }
    }

    // === 策略3: 检查前文最后几行是否整体重复 ===
    const lastFewLines = prefixLines.slice(-3).join("\n").trim();
    if (lastFewLines.length > 10 && cleaned.startsWith(lastFewLines)) {
      this.log("✓ 移除多行重复");
      cleaned = cleaned.substring(lastFewLines.length).trim();
    }

    // === 策略4: 逐行检查是否在前文中出现过 ===
    const cleanedLines = cleaned.split("\n");
    const uniqueLines: string[] = [];

    for (const line of cleanedLines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        uniqueLines.push(line);
        continue;
      }

      // 检查这一行是否在前文最后20行中出现过
      const recentPrefix = prefixLines.slice(-20).join("\n");
      if (recentPrefix.includes(trimmed)) {
        this.log("⚠ 跳过重复行:", trimmed.substring(0, 50));
        continue;
      }

      uniqueLines.push(line);
    }

    cleaned = uniqueLines.join("\n").trim();

    // === 策略5: Token/单词级别去重 ===
    const tokens = lastLine
      .trim()
      .split(/[\s\(\)\[\]\{\},;.]+/)
      .filter((t) => t.length > 2);
    if (tokens.length > 0) {
      for (let n = Math.min(3, tokens.length); n >= 1; n--) {
        const lastTokens = tokens.slice(-n).join(" ");
        if (cleaned.startsWith(lastTokens)) {
          this.log("✓ 移除重复 token:", lastTokens);
          cleaned = cleaned.substring(lastTokens.length).trim();
          break;
        }
      }
    }

    // 移除多余空行
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    // 严格限制为 2-3 行（代码补全不应太长）
    const finalLines = cleaned
      .split("\n")
      .filter((line) => line.trim().length > 0);
    if (finalLines.length > 3) {
      this.log("⚠ 限制输出为3行");
      cleaned = finalLines.slice(0, 3).join("\n");
    }

    if (cleaned.length === 0) {
      this.log("❌ 清理后为空");
      return "";
    }

    this.log("✅ 清理完成:", cleaned.substring(0, 150));
    this.log("========== 清理结束 ==========");

    return cleaned;
  }
}
