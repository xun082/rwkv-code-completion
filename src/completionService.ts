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
  numChoices: number;
  alphaPresence: number;
  alphaFrequency: number;
  completionMode: "inline" | "standard" | "both";
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
    numChoices: config.get("numChoices", 24), // 默认 24 个并发
    alphaPresence: config.get("alphaPresence", 1.0),
    alphaFrequency: config.get("alphaFrequency", 0.1),
    completionMode: config.get("completionMode", "both") as
      | "inline"
      | "standard"
      | "both",
  };
}

// 代码补全服务类
export class CompletionService {
  private provider: RWKVLocalProvider | null = null;
  private lastEndpoint: string = "";
  private lastPassword: string = "";

  // 获取或创建 provider（如果配置改变则重新创建）
  private getProvider(config: CompletionConfig): RWKVLocalProvider {
    // 如果配置改变了，重新创建 provider
    if (
      !this.provider ||
      this.lastEndpoint !== config.endpoint ||
      this.lastPassword !== config.password
    ) {
      console.log("🔄 创建新的 RWKV Provider", {
        endpoint: config.endpoint,
        password: config.password,
      });
      this.provider = new RWKVLocalProvider({
        baseUrl: config.endpoint,
        password: config.password,
      });
      this.lastEndpoint = config.endpoint;
      this.lastPassword = config.password;
    }
    return this.provider;
  }

  // 调用本地 RWKV API 并支持多个补全选择
  async getCompletion(
    prefix: string,
    suffix: string,
    languageId: string,
    config: CompletionConfig,
    signal: AbortSignal
  ): Promise<string[]> {
    try {
      const provider = this.getProvider(config);

      // 使用完整的前缀（已经在 extension.ts 中限制了长度）
      const prefixPart = prefix;

      // 构建 prompt - 纯代码格式（不使用对话格式）
      const codePrompt = prefixPart;

      // 构建消息（使用 user 消息承载纯代码）
      const messages: AIMessage[] = [{ role: "user", content: codePrompt }];

      console.log("====== 代码补全请求 ======");
      console.log("语言:", languageId);
      console.log("前缀长度:", prefixPart.length);
      console.log("📊 配置的 numChoices:", config.numChoices);
      if (config.numChoices > 10) {
        console.log("🚀 大量并发模式 (>10)");
      }
      console.log(
        "📍 前缀预览:",
        prefixPart.substring(prefixPart.length - 100).replace(/\n/g, "\\n")
      );
      console.log("========================");

      // 调用 provider，支持批量并发生成多个选择
      const result = await provider.chat(messages, {
        model: "code-completion", // 标记为代码补全模式
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        topP: config.topP,
        topK: 100,
        enableThink: false,
        numChoices: config.numChoices, // 批量并发生成
        alphaPresence: config.alphaPresence,
        alphaFrequency: config.alphaFrequency,
        signal: signal,
      });

      // 处理结果（可能是单个字符串或数组）
      console.log("====== 收到 Provider 响应 ======");
      console.log(
        "🔍 result 类型:",
        Array.isArray(result) ? "数组" : typeof result
      );
      console.log(
        "🔍 result 内容:",
        Array.isArray(result)
          ? `[${result.length}个元素]`
          : result.substring(0, 50)
      );

      const results = Array.isArray(result) ? result : [result];

      console.log("📦 转换后的 results 数组长度:", results.length);
      console.log("================================");

      // 清理每个补全内容 - 保留所有结果，即使内容相同
      const cleanedResults: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const text = results[i];
        const cleaned = this.cleanCompletion(text, prefix);

        // 即使清理后为空或相同，也保留（让用户看到所有选项）
        if (cleaned !== undefined && cleaned !== null) {
          const displayText = cleaned.trim() || text.trim();
          console.log(
            `✅ 补全 ${i + 1} (长度${displayText.length}):`,
            displayText.substring(0, 50).replace(/\n/g, "\\n") + "..."
          );
          cleanedResults.push(displayText);
        } else {
          // 如果清理失败，使用原始文本
          console.log(`⚠️ 补全 ${i + 1}: 清理失败，使用原始文本`);
          cleanedResults.push(text.trim());
        }
      }

      console.log("====== 最终返回 ======");
      console.log(
        `✅ 返回 ${cleanedResults.length} 个补全（原始 ${results.length} 个）`
      );
      console.log("所有结果都会显示，即使内容相同");
      console.log("=====================");

      return cleanedResults;
    } catch (error: any) {
      if (error.name === "AbortError") {
        throw error;
      }
      return [];
    }
  }

  // 清理代码补全内容
  private cleanCompletion(text: string, prefix?: string): string {
    if (!text) {
      console.log("⚠️  补全内容为空");
      return "";
    }

    console.log("🔧 开始清理补全内容, 原始长度:", text.length);

    let cleanResult = text;

    // 步骤1：移除思考标记（如果有）
    cleanResult = cleanResult.replace(/>[\s\S]*?<\/think>\s*/g, "");
    if (cleanResult.includes("</think>")) {
      const thinkEndIndex = cleanResult.indexOf("</think>");
      cleanResult = cleanResult.substring(thinkEndIndex + 8).trim();
    }
    if (cleanResult.includes("<think>")) {
      cleanResult = cleanResult.replace(/<think>/g, "");
    }

    // 步骤2：移除 markdown 代码块标记
    cleanResult = cleanResult
      .replace(/^```[\w]*\n?/gm, "")
      .replace(/\n?```$/gm, "")
      .replace(/```/g, "");

    // 步骤3：移除 "Assistant:" 前缀（如果有）
    cleanResult = cleanResult.replace(/^Assistant:\s*/i, "");

    if (!prefix) {
      console.log("✅ 清理完成（无前缀检查）, 长度:", cleanResult.length);
      return cleanResult.trim();
    }

    // 步骤4：去除与前缀重复的部分
    // 找到补全内容和前缀的重叠部分
    const prefixEnd = prefix.slice(-200); // 取前缀的最后200个字符
    let overlapLength = 0;

    // 从长到短检查重叠
    for (
      let len = Math.min(prefixEnd.length, cleanResult.length);
      len > 5;
      len--
    ) {
      const prefixTail = prefixEnd.slice(-len);
      const completionHead = cleanResult.slice(0, len);

      if (prefixTail === completionHead) {
        overlapLength = len;
        console.log(`🔍 发现重叠部分，长度: ${len}`);
        break;
      }
    }

    if (overlapLength > 0) {
      cleanResult = cleanResult.slice(overlapLength);
      console.log(`✂️  移除重叠部分后，剩余长度: ${cleanResult.length}`);
    }

    // 步骤5：移除前缀完整行的重复
    const prefixLines = prefix.split("\n");
    const lastPrefixLines = prefixLines.slice(-5); // 最后5行
    const resultLines = cleanResult.split("\n");
    const cleanedLines: string[] = [];

    for (const line of resultLines) {
      const trimmedLine = line.trim();

      // 保留空行（用于保持格式）
      if (!trimmedLine) {
        cleanedLines.push(line);
        continue;
      }

      // 跳过完全重复的行（与前缀的最后几行对比）
      const isDuplicate = lastPrefixLines.some(
        (prefixLine) => prefixLine.trim() === trimmedLine
      );

      if (isDuplicate && trimmedLine.length > 10) {
        console.log(`⏭️  跳过重复行: ${trimmedLine.substring(0, 30)}...`);
        continue;
      }

      cleanedLines.push(line);
    }

    let finalResult = cleanedLines.join("\n").trim();

    // 步骤6：限制长度（最多15行非空行）
    const nonEmptyLines = finalResult
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (nonEmptyLines.length > 15) {
      const limitedLines = finalResult.split("\n").slice(0, 20);
      finalResult = limitedLines.join("\n").trim();
      console.log(`✂️  限制长度到 15 个非空行`);
    }

    console.log(`✅ 清理完成，最终长度: ${finalResult.length}`);
    return finalResult;
  }
}
