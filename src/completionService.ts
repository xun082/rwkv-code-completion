import * as vscode from "vscode";
import { RWKVLocalProvider } from "./services/providers/RWKVLocalProvider";
import { AIMessage } from "./services/types";

// 配置接口
export interface CompletionConfig {
  enabled: boolean;
  endpoint: string;
  password: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  debounceDelay: number;
}

// 获取配置
export function getConfig(): CompletionConfig {
  const config = vscode.workspace.getConfiguration("rwkv-code-completion");
  return {
    enabled: config.get("enabled", true),
    endpoint: config.get(
      "endpoint",
      "http://192.168.0.12:8000/v1/chat/completions"
    ),
    password: config.get("password", "rwkv7_7.2b_webgen"),
    maxTokens: config.get("maxTokens", 200), // 与 Git commit 一致
    temperature: config.get("temperature", 0.7), // 与 Git commit 一致
    topP: config.get("topP", 0.3), // 与 Git commit 一致
    debounceDelay: config.get("debounceDelay", 150),
  };
}

// 代码补全服务类
export class CompletionService {
  private provider: RWKVLocalProvider | null = null;

  // 获取或创建 provider
  private getProvider(config: CompletionConfig): RWKVLocalProvider {
    if (!this.provider) {
      this.provider = new RWKVLocalProvider({
        baseUrl: config.endpoint,
        password: config.password,
      });
    }
    return this.provider;
  }

  // 调用本地 RWKV API（完全按照 generateGitCommit 的方式）
  async getCompletion(
    prefix: string,
    suffix: string,
    languageId: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string | null> {
    try {
      const provider = this.getProvider(config);

      // 取最近的代码（最多400字符）
      const prefixPart = prefix.slice(-400);

      // 构建 prompt（完全模仿 Git commit）
      const systemPrompt = `你是代码补全助手。`;

      const userPrompt = `续写以下 ${languageId} 代码：

${prefixPart}`;

      // 构建消息（完全按照 Git commit 的方式）
      const messages: AIMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      // 调用 provider（参数与 Git commit 完全一致）
      const result = await provider.chat(messages, {
        temperature: 0.7, // 与 Git commit 一致
        maxTokens: 200, // 与 Git commit 一致
        topP: 0.3, // 与 Git commit 一致
        topK: 1, // 与 Git commit 一致
        enableThink: false, // 与 Git commit 一致
      });

      // 清理补全内容（完全模仿 Git commit 的清理逻辑）
      const cleaned = this.cleanCompletion(result, prefix);

      if (!cleaned || cleaned.trim().length === 0) {
        return null;
      }

      return cleaned;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      return null;
    }
  }

  // 清理补全内容（完全模仿 generateGitCommit 的逻辑）
  private cleanCompletion(text: string, prefix?: string): string {
    if (!text) {
      return "";
    }

    let cleanResult = text.trim();

    // 步骤1：移除思考内容（与 Git commit 一致）
    cleanResult = cleanResult.replace(/>[\s\S]*?<\/think>\s*/g, "");
    if (cleanResult.includes("</think>")) {
      const thinkEndIndex = cleanResult.indexOf("</think>");
      cleanResult = cleanResult.substring(thinkEndIndex + 8).trim();
    }

    // 步骤2：移除 markdown 代码块
    cleanResult = cleanResult
      .replace(/^```[\w]*\n?/gm, "")
      .replace(/\n?```$/gm, "");

    if (!prefix) {
      return cleanResult;
    }

    const prefixLines = prefix.split("\n");

    // 步骤3：逐行处理（与 Git commit 一致）
    const allLines = cleanResult.split("\n");
    let completion = "";

    for (const line of allLines) {
      const trimmed = line.trim();

      // 跳过空行
      if (!trimmed) {
        if (completion) {
          completion += "\n" + line;
        }
        continue;
      }

      // 跳过以 > 开头的（思考内容）
      if (trimmed.startsWith(">")) {
        continue;
      }

      // 跳过说明文本
      if (trimmed.match(/^(续写|代码|输出|以下|请)[:：]/i)) {
        continue;
      }

      // 跳过完全重复的行
      const recentPrefix = prefixLines.slice(-10).join("\n");
      if (recentPrefix.includes(trimmed) && trimmed.length > 15) {
        continue;
      }

      // 添加这一行
      completion += (completion ? "\n" : "") + line;
    }

    // 步骤4：后缀匹配去重（与 Git commit 类似）
    if (prefix.length > 0 && completion) {
      const prefixEnd = prefix.slice(-100);
      for (
        let len = Math.min(prefixEnd.length, completion.length);
        len >= 2;
        len--
      ) {
        const tail = prefixEnd.slice(-len);
        if (completion.startsWith(tail)) {
          completion = completion.substring(len).trim();
          break;
        }
      }
    }

    // 步骤5：限制长度（最多10行）
    const finalLines = completion
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (finalLines.length > 10) {
      completion = finalLines.slice(0, 10).join("\n");
    }

    return completion;
  }
}
