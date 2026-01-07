import * as vscode from "vscode";
import { CompletionService, getConfig } from "./completionService";
import { ChatPanelProvider } from "./chatPanel";
import { ControlPanelProvider } from "./controlPanel";
import { GitCommitPanelProvider } from "./gitCommitPanel";

// 状态栏项
let statusBarItem: vscode.StatusBarItem;

// 标准补全提供者 - 显示下拉列表
class RWKVStandardCompletionProvider implements vscode.CompletionItemProvider {
  private completionService: CompletionService;
  private abortController: AbortController | null = null;

  constructor() {
    this.completionService = new CompletionService();
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | null> {
    console.log("=".repeat(60));
    console.log("🚀 标准补全提供者被调用");
    console.log("📍 位置:", `行${position.line + 1}:列${position.character}`);
    console.log("📄 文件:", document.fileName);
    console.log("🔤 语言:", document.languageId);
    console.log(
      "🎯 触发方式:",
      context.triggerKind === 0
        ? "自动"
        : context.triggerKind === 1
        ? "手动(Ctrl+Space)"
        : "触发字符"
    );
    if (context.triggerCharacter) {
      console.log("🔠 触发字符:", JSON.stringify(context.triggerCharacter));
    }

    const config = getConfig();
    console.log("⚙️  配置状态:", {
      enabled: config.enabled,
      endpoint: config.endpoint,
      numChoices: config.numChoices,
      completionMode: config.completionMode,
    });

    if (!config.enabled) {
      console.log("❌ 补全已禁用，返回 null");
      return null;
    }

    // 取消之前的请求
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      const prefix = this.getPrefix(document, position);
      const suffix = this.getSuffix(document, position);
      const languageId = document.languageId;

      console.log("📝 前缀长度:", prefix.length, "字符");
      console.log("📝 前缀预览:", prefix.slice(-100).replace(/\n/g, "\\n"));
      console.log("📝 后缀长度:", suffix.length, "字符");

      console.log("🎨 开始调用 completionService.getCompletion...");

      const completions = await this.completionService.getCompletion(
        prefix,
        suffix,
        languageId,
        config,
        this.abortController.signal
      );

      console.log(
        "📦 completionService 返回:",
        completions ? completions.length : 0,
        "个结果"
      );

      if (!completions || completions.length === 0) {
        console.log("❌ 没有补全结果，返回 null");
        return null;
      }

      console.log(
        `✅ 收到 ${completions.length} 个补全，开始创建 CompletionItem...`
      );

      // 验证和过滤补全内容
      const validCompletions: string[] = [];
      completions.forEach((completion, index) => {
        console.log(`📋 补全 #${index + 1}:`, {
          length: completion.length,
          isEmpty: completion.trim().length === 0,
          preview: completion.substring(0, 100).replace(/\n/g, "\\n"),
        });

        if (completion && completion.trim().length > 0) {
          validCompletions.push(completion);
        } else {
          console.warn(`⚠️  补全 #${index + 1} 是空的，已跳过`);
        }
      });

      if (validCompletions.length === 0) {
        console.error("❌ 所有补全都是空的！返回 null");
        return null;
      }

      console.log(
        `✅ 有效补全数量: ${validCompletions.length}/${completions.length}`
      );

      // 创建补全项列表 - 用户可以同时看到所有选项（支持大量并发）
      const items = validCompletions.map((completion, index) => {
        // 计算代码预览（第一行）
        const firstLine = completion.split("\n")[0].trim();
        const preview =
          firstLine.length > 40
            ? firstLine.substring(0, 37) + "..."
            : firstLine;

        // 使用简洁的 label，去掉 emoji，确保排序正确
        const item = new vscode.CompletionItem(
          `${index + 1}/${validCompletions.length}: ${preview}`,
          vscode.CompletionItemKind.Text // 使用 Text 类型，优先级更高
        );

        // 设置插入文本
        item.insertText = completion;
        item.detail = `🤖 RWKV 代码续写 #${index + 1} (${
          completion.length
        } 字符)`;

        // 添加详细的代码预览文档
        const docContent =
          completion.length > 500
            ? completion.substring(0, 500) + "\n\n... (内容已截断)"
            : completion;
        item.documentation = new vscode.MarkdownString(
          `**RWKV 并发补全 #${
            index + 1
          }**\n\n\`\`\`${languageId}\n${docContent}\n\`\`\``
        );

        // 关键：使用 "!" 开头的 sortText，确保排在所有内置补全前面
        // "!" 的 ASCII 码是 33，小于字母和数字，所以会排在最前面
        item.sortText = `!${String(index).padStart(6, "0")}`;

        // 第一个自动预选
        item.preselect = index === 0;

        // 使用 Text 类型而不是 Snippet
        item.kind = vscode.CompletionItemKind.Text;

        // 关键修复：设置合适的 filterText 和 range
        // 使用当前行的文本作为 filterText，这样不会被过滤
        const lineStartPos = new vscode.Position(position.line, 0);
        const currentLineText = document
          .getText(new vscode.Range(lineStartPos, position))
          .trim();

        // 如果当前行有文本，使用它作为 filterText；否则使用空格
        item.filterText = currentLineText || " ";

        // range 保持从光标位置插入，不替换已有内容
        item.range = new vscode.Range(position, position);

        console.log(`✅ 创建 CompletionItem #${index + 1}:`, {
          label: item.label,
          sortText: item.sortText,
          kind: item.kind,
          preselect: item.preselect,
          insertTextLength: completion.length,
          hasRange: !!item.range,
        });

        return item;
      });

      // 显示提示
      const statusMsg =
        completions.length > 10
          ? `✅ ${completions.length} 个补全选项（大量并发）`
          : `✅ ${completions.length} 个补全选项`;
      vscode.window.setStatusBarMessage(statusMsg, 5000);

      // 不再使用 item.command，而是通过文档变化监听器实现连续补全
      console.log(`📤 成功创建 ${items.length} 个 CompletionItem`);
      console.log(`✅ 返回 ${items.length} 个补全项给 VSCode`);
      console.log("=".repeat(60));
      return items;
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("⚠️  请求被中止（AbortError）");
        return null;
      }
      console.error("❌ 标准补全提供者错误:", error);
      console.error("错误堆栈:", error.stack);
      return null;
    }
  }

  private getPrefix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    // 获取光标前的所有代码（从文件开头到光标位置）
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    const fullPrefix = document.getText(range);

    // 如果代码太长，只取最后 2000 个字符
    const prefix =
      fullPrefix.length > 2000 ? fullPrefix.slice(-2000) : fullPrefix;

    console.log("📍 标准补全 - 前缀长度:", prefix.length, "字符");
    return prefix;
  }

  private getSuffix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const endLine = Math.min(document.lineCount - 1, position.line + 10);
    const range = new vscode.Range(
      position.line,
      position.character,
      endLine,
      document.lineAt(endLine).text.length
    );
    return document.getText(range);
  }
}

// 代码补全提供者（Inline 方式）
class RWKVCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastTriggerTime = 0;
  private lastTriggerPosition: vscode.Position | null = null;
  private lastTriggerDocument: string | null = null;
  private abortController: AbortController | null = null;
  private completionService: CompletionService;

  constructor() {
    this.completionService = new CompletionService();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {
    const config = getConfig();

    if (!config.enabled) {
      return null;
    }

    // 如果有多个选择，自动触发标准补全列表而不是 inline
    if (config.numChoices > 1) {
      // 触发标准补全列表（会显示所有选项）
      setTimeout(() => {
        vscode.commands.executeCommand("editor.action.triggerSuggest");
      }, 100);
      return null; // 不返回 inline 补全
    }

    const now = Date.now();
    const currentDocUri = document.uri.toString();

    // 优化防抖：只在相同位置才防抖，位置变化立即触发
    const isSamePosition =
      this.lastTriggerDocument === currentDocUri &&
      this.lastTriggerPosition?.line === position.line &&
      this.lastTriggerPosition?.character === position.character;

    if (isSamePosition && now - this.lastTriggerTime < config.debounceDelay) {
      return null;
    }

    this.lastTriggerTime = now;
    this.lastTriggerPosition = position;
    this.lastTriggerDocument = currentDocUri;

    // 取消之前的请求
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      // 获取上下文
      const prefix = this.getPrefix(document, position);
      const suffix = this.getSuffix(document, position);
      const languageId = document.languageId;

      // 如果前文太短，不触发补全（降低阈值支持连续补全）
      if (prefix.trim().length < 1) {
        return null;
      }

      console.log(
        `📞 Inline 补全：开始请求，配置 numChoices=${config.numChoices}`
      );
      console.log(`📝 配置详情:`, {
        endpoint: config.endpoint,
        numChoices: config.numChoices,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      // 调用 API，获取多个补全选择
      const completions = await this.completionService.getCompletion(
        prefix,
        suffix,
        languageId,
        config,
        this.abortController.signal
      );

      console.log(
        `🔍 Inline 补全：getCompletion 返回类型:`,
        Array.isArray(completions) ? "数组" : typeof completions
      );
      console.log(
        `🔍 Inline 补全：返回值长度:`,
        completions ? completions.length : 0
      );

      if (!completions || completions.length === 0) {
        console.log("❌ Inline 补全：未收到任何结果");
        return null;
      }

      console.log(`🎯 Inline 补全：收到 ${completions.length} 个补全选项`);
      completions.forEach((comp, i) => {
        console.log(
          `  选项 ${i + 1} (长度${comp.length}): ${comp
            .substring(0, 60)
            .replace(/\n/g, "\\n")}...`
        );
      });

      // 返回多个补全项，用户可以通过 Alt+] 和 Alt+[ 切换
      const items = completions.map((completion, index) => {
        const item = new vscode.InlineCompletionItem(
          completion,
          new vscode.Range(position, position)
        );
        return item;
      });

      console.log(
        `✅ Inline 补全：返回 ${items.length} 个 InlineCompletionItem 给 VSCode`
      );

      // 显示详细信息
      const detailMessage = `🎯 RWKV: ${completions.length} 个补全选项`;
      vscode.window.setStatusBarMessage(detailMessage, 10000);

      // 如果有多个，显示提示如何切换
      if (completions.length > 1) {
        vscode.window.setStatusBarMessage(
          `💡 RWKV: ${completions.length} 个补全 (Alt+] / Alt+[ 切换)`,
          10000
        );
      }

      return items;
    } catch (error: any) {
      if (error.name === "AbortError") {
        return null;
      }
      return null;
    }
  }

  // 获取光标前的代码（获取所有代码，确保上下文完整）
  private getPrefix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    // 获取从文件开头到光标的所有代码
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    const fullPrefix = document.getText(range);

    // 如果太长，取最后 2000 个字符
    const prefix =
      fullPrefix.length > 2000 ? fullPrefix.slice(-2000) : fullPrefix;

    console.log("📍 Inline 补全 - 前缀长度:", prefix.length, "字符");
    return prefix;
  }

  // 获取光标后的代码
  private getSuffix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const endLine = Math.min(document.lineCount - 1, position.line + 10);
    const range = new vscode.Range(
      position.line,
      position.character,
      endLine,
      document.lineAt(endLine).text.length
    );
    return document.getText(range);
  }
}

// 更新状态栏
function updateStatusBar() {
  const config = getConfig();
  if (config.enabled) {
    statusBarItem.text = "$(check) RWKV";
    statusBarItem.tooltip = "RWKV 代码补全已启用";
    statusBarItem.backgroundColor = undefined;
  } else {
    statusBarItem.text = "$(x) RWKV";
    statusBarItem.tooltip = "RWKV 代码补全已禁用";
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  // 连续补全：监听文档变化，在补全插入后自动触发下一次
  let lastChangeTime = 0;
  let continuousCompletionTimeout: NodeJS.Timeout | null = null;

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const config = getConfig();
      if (!config.enabled || event.contentChanges.length === 0) {
        return;
      }

      const now = Date.now();
      const timeSinceLastChange = now - lastChangeTime;
      lastChangeTime = now;

      // 只在短时间内没有变化时触发（避免频繁触发）
      if (continuousCompletionTimeout) {
        clearTimeout(continuousCompletionTimeout);
      }

      continuousCompletionTimeout = setTimeout(() => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          // 检查光标位置的代码是否未完成（启发式判断）
          const position = editor.selection.active;
          const line = editor.document.lineAt(position.line);
          const textAfterCursor = line.text
            .substring(position.character)
            .trim();

          // 如果当前行还有内容，或者行未闭合，不触发
          if (textAfterCursor.length > 0) {
            return;
          }

          // 检查是否有代码（不管是什么字符）
          const lineText = line.text.trim();
          if (lineText.length === 0) {
            console.log("🔄 连续补全：当前行为空，不触发");
            return;
          }

          console.log("🔄 连续补全：自动触发下一次补全", {
            line: position.line + 1,
            character: position.character,
            lineText: lineText.substring(0, 50),
          });
          vscode.commands.executeCommand("editor.action.triggerSuggest");
        }
      }, 200); // 200ms 延迟，等待插入完成
    })
  );

  // 创建控制面板提供者（Webview）
  const controlPanelProvider = new ControlPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ControlPanelProvider.viewType,
      controlPanelProvider
    )
  );

  // 创建聊天面板提供者
  const chatPanelProvider = new ChatPanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatPanelProvider.viewType,
      chatPanelProvider
    )
  );

  // 创建 Git 提交面板提供者
  const gitCommitPanelProvider = new GitCommitPanelProvider(
    context.extensionUri
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      GitCommitPanelProvider.viewType,
      gitCommitPanelProvider
    )
  );

  // 创建状态栏
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "rwkv-code-completion.toggleCompletion";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 根据配置注册补全提供者
  const config = getConfig();

  if (config.completionMode === "inline" || config.completionMode === "both") {
    // 注册 Inline 补全提供者（自动触发，用 Alt+] / Alt+[ 切换多个选项）
    const inlineProvider = new RWKVCompletionProvider();
    const inlineDisposable =
      vscode.languages.registerInlineCompletionItemProvider(
        { pattern: "**" },
        inlineProvider
      );
    context.subscriptions.push(inlineDisposable);
    console.log("✅ Inline 补全提供者已注册");
  }

  if (
    config.completionMode === "standard" ||
    config.completionMode === "both"
  ) {
    // 注册标准补全提供者（按 Ctrl+Space 触发，显示下拉列表）
    const standardProvider = new RWKVStandardCompletionProvider();

    // 注册所有可能的触发字符：符号 + 字母 + 数字
    const symbols = [
      ".",
      " ",
      "(",
      "{",
      "[",
      ":",
      ";",
      ",",
      "=",
      "+",
      "-",
      "*",
      "/",
      ">",
      "<",
      "!",
      "&",
      "|",
      "?",
      "\n",
      "}",
      "]",
      ")",
      "'",
      '"',
      "`",
      "\\",
      "@",
      "#",
      "$",
      "%",
      "^",
      "~",
    ];

    // 添加所有字母（a-z, A-Z）
    const letters =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    // 添加所有数字（0-9）
    const numbers = "0123456789".split("");

    const triggerChars = [...symbols, ...letters, ...numbers];

    const standardDisposable = vscode.languages.registerCompletionItemProvider(
      { pattern: "**" },
      standardProvider,
      ...triggerChars
    );
    context.subscriptions.push(standardDisposable);
    console.log(
      `✅ 标准补全提供者已注册（${triggerChars.length} 个触发字符：所有字母、数字、符号）`
    );
  }

  // 注册切换命令
  const toggleCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.toggleCompletion",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentState = config.get("enabled", true);
      await config.update(
        "enabled",
        !currentState,
        vscode.ConfigurationTarget.Global
      );
      updateStatusBar();
      controlPanelProvider.refresh(); // 刷新控制面板
      vscode.window.showInformationMessage(
        `RWKV 代码补全已${!currentState ? "启用" : "禁用"}`
      );
    }
  );
  context.subscriptions.push(toggleCommand);

  // 注册打开设置命令
  const settingsCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.openSettings",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "rwkv-code-completion"
      );
    }
  );
  context.subscriptions.push(settingsCommand);

  // 注册刷新面板命令
  const refreshCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.refreshPanel",
    () => {
      controlPanelProvider.refresh();
      vscode.window.showInformationMessage("面板已刷新");
    }
  );
  context.subscriptions.push(refreshCommand);

  // 注册编辑服务端点命令
  const editEndpointCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.editEndpoint",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentValue = config.get("endpoint", "");
      const newValue = await vscode.window.showInputBox({
        prompt: "请输入 RWKV 服务端点地址",
        value: currentValue,
        placeHolder: "http://192.168.0.12:8000/v3/chat/completions",
        validateInput: (text) => {
          if (!text || text.trim().length === 0) {
            return "服务端点不能为空";
          }
          if (!text.startsWith("http://") && !text.startsWith("https://")) {
            return "服务端点必须以 http:// 或 https:// 开头";
          }
          return null;
        },
      });
      if (newValue !== undefined) {
        await config.update(
          "endpoint",
          newValue,
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`服务端点已更新为: ${newValue}`);
      }
    }
  );
  context.subscriptions.push(editEndpointCommand);

  // 注册编辑最大Token命令
  const editMaxTokensCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.editMaxTokens",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentValue = config.get("maxTokens", 16);
      const newValue = await vscode.window.showInputBox({
        prompt: "请输入最大生成 Token 数 (推荐: 8-32)",
        value: String(currentValue),
        placeHolder: "16",
        validateInput: (text) => {
          const num = parseInt(text);
          if (isNaN(num)) {
            return "请输入有效的数字";
          }
          if (num < 1 || num > 1000) {
            return "Token 数必须在 1-1000 之间";
          }
          return null;
        },
      });
      if (newValue !== undefined) {
        await config.update(
          "maxTokens",
          parseInt(newValue),
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(
          `最大 Token 已更新为: ${newValue}`
        );
      }
    }
  );
  context.subscriptions.push(editMaxTokensCommand);

  // 注册编辑温度命令
  const editTemperatureCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.editTemperature",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentValue = config.get("temperature", 0.1);
      const newValue = await vscode.window.showInputBox({
        prompt: "请输入温度参数 (推荐: 0.05-0.2, 越低越确定)",
        value: String(currentValue),
        placeHolder: "0.1",
        validateInput: (text) => {
          const num = parseFloat(text);
          if (isNaN(num)) {
            return "请输入有效的数字";
          }
          if (num < 0 || num > 2) {
            return "温度必须在 0-2 之间";
          }
          return null;
        },
      });
      if (newValue !== undefined) {
        await config.update(
          "temperature",
          parseFloat(newValue),
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`温度参数已更新为: ${newValue}`);
      }
    }
  );
  context.subscriptions.push(editTemperatureCommand);

  // 注册编辑Top P命令
  const editTopPCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.editTopP",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentValue = config.get("topP", 0.95);
      const newValue = await vscode.window.showInputBox({
        prompt: "请输入 Top P 参数 (推荐: 0.9-0.98)",
        value: String(currentValue),
        placeHolder: "0.95",
        validateInput: (text) => {
          const num = parseFloat(text);
          if (isNaN(num)) {
            return "请输入有效的数字";
          }
          if (num < 0 || num > 1) {
            return "Top P 必须在 0-1 之间";
          }
          return null;
        },
      });
      if (newValue !== undefined) {
        await config.update(
          "topP",
          parseFloat(newValue),
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`Top P 已更新为: ${newValue}`);
      }
    }
  );
  context.subscriptions.push(editTopPCommand);

  // 注册编辑防抖延迟命令
  const editDebounceDelayCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.editDebounceDelay",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentValue = config.get("debounceDelay", 300);
      const newValue = await vscode.window.showInputBox({
        prompt: "请输入防抖延迟时间 (毫秒, 推荐: 200-500)",
        value: String(currentValue),
        placeHolder: "300",
        validateInput: (text) => {
          const num = parseInt(text);
          if (isNaN(num)) {
            return "请输入有效的数字";
          }
          if (num < 0 || num > 5000) {
            return "延迟时间必须在 0-5000 毫秒之间";
          }
          return null;
        },
      });
      if (newValue !== undefined) {
        await config.update(
          "debounceDelay",
          parseInt(newValue),
          vscode.ConfigurationTarget.Global
        );
        vscode.window.showInformationMessage(`防抖延迟已更新为: ${newValue}ms`);
      }
    }
  );
  context.subscriptions.push(editDebounceDelayCommand);

  // 注册切换补全模式命令
  const switchCompletionModeCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.switchCompletionMode",
    async () => {
      const config = vscode.workspace.getConfiguration("rwkv-code-completion");
      const currentMode = config.get<string>("completionMode", "both");

      interface ModeOption {
        label: string;
        description: string;
        value: "inline" | "standard" | "both";
      }

      const options: ModeOption[] = [
        {
          label: "$(list-tree) 双模式（推荐）",
          description: "自动 Inline + Ctrl+Space 列表",
          value: "both",
        },
        {
          label: "$(arrow-right) Inline 模式",
          description: "自动触发，Alt+] / Alt+[ 切换选项",
          value: "inline",
        },
        {
          label: "$(list-unordered) 标准列表模式",
          description: "按 Ctrl+Space 显示下拉列表",
          value: "standard",
        },
      ];

      const selected = await vscode.window.showQuickPick(options, {
        placeHolder: "选择补全显示模式",
        title: "RWKV 补全模式",
      });

      if (selected) {
        await config.update(
          "completionMode",
          selected.value,
          vscode.ConfigurationTarget.Global
        );
        vscode.window
          .showInformationMessage(
            `补全模式已切换为: ${selected.label}。重启扩展以生效。`,
            "重启扩展"
          )
          .then((action) => {
            if (action === "重启扩展") {
              vscode.commands.executeCommand(
                "workbench.action.restartExtensionHost"
              );
            }
          });
      }
    }
  );
  context.subscriptions.push(switchCompletionModeCommand);

  // 注册显示配置状态命令
  const showStatusCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.showStatus",
    () => {
      const config = getConfig();
      const statusInfo = `
【RWKV 代码补全状态】

✅ 启用状态: ${config.enabled ? "已启用" : "已禁用"}
🌐 服务端点: ${config.endpoint}
🔑 密码: ${config.password}
🎯 并发选择数: ${config.numChoices} 个
🎨 补全模式: ${config.completionMode}
🌡️  温度: ${config.temperature}
📊 Top P: ${config.topP}
🔢 最大 Tokens: ${config.maxTokens}
⏱️  防抖延迟: ${config.debounceDelay}ms
🎯 Alpha Presence: ${config.alphaPresence}
🎯 Alpha Frequency: ${config.alphaFrequency}

【使用提示】
- Inline 模式: 自动触发，按 Alt+] / Alt+[ 切换
- 标准模式: 按 Ctrl+Space 查看列表
- 查看控制台输出: 视图 → 输出 → 扩展主机（开发）
      `.trim();

      vscode.window
        .showInformationMessage(
          `当前配置: ${config.numChoices} 个并发选择 | 模式: ${config.completionMode}`,
          "查看详情",
          "打开设置"
        )
        .then((action) => {
          if (action === "查看详情") {
            vscode.window.showInformationMessage(statusInfo);
          } else if (action === "打开设置") {
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "rwkv-code-completion"
            );
          }
        });
    }
  );
  context.subscriptions.push(showStatusCommand);

  // 注册显示使用帮助命令
  const showHelpCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.showHelp",
    () => {
      const config = getConfig();
      const helpMessage = `
### RWKV 代码补全使用指南

**当前配置：**
- 并发选项数：${config.numChoices} 个
- 补全模式：${config.completionMode}

**使用方法：**

1. **Inline 模式（自动触发）**
   - 输入代码时自动显示补全
   - 按 \`Tab\` 接受当前补全
   - 按 \`Alt+]\` 查看下一个选项
   - 按 \`Alt+[\` 查看上一个选项
   - 按 \`Esc\` 关闭补全

2. **标准列表模式（手动触发）**
   - 按 \`Ctrl+Space\` 打开补全列表
   - 用方向键选择不同选项
   - 按 \`Enter\` 接受选择
   - 可以预览每个选项的完整内容

**提示：**
- 推荐使用"双模式"，获得最佳体验
- 可在设置中调整并发数量（1-10）
- 增加并发数会提供更多样化的建议
      `.trim();

      vscode.window
        .showInformationMessage("已在输出面板显示使用帮助", "查看文档")
        .then((action) => {
          if (action === "查看文档") {
            const panel = vscode.window.createWebviewPanel(
              "rwkvHelp",
              "RWKV 使用帮助",
              vscode.ViewColumn.One,
              {}
            );
            panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
              <style>
                body { 
                  font-family: var(--vscode-font-family);
                  padding: 20px;
                  line-height: 1.6;
                }
                h3 { color: var(--vscode-textLink-foreground); }
                code {
                  background: var(--vscode-textCodeBlock-background);
                  padding: 2px 6px;
                  border-radius: 3px;
                }
                ul { padding-left: 20px; }
              </style>
            </head>
            <body>
              ${helpMessage
                .replace(/\n/g, "<br>")
                .replace(/`([^`]+)`/g, "<code>$1</code>")}
            </body>
            </html>
          `;
          }
        });
    }
  );
  context.subscriptions.push(showHelpCommand);

  // 监听配置变化
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("rwkv-code-completion")) {
      updateStatusBar();
      controlPanelProvider.refresh(); // 配置变化时刷新控制面板
    }
  });

  // 生成启动消息
  const modeInfo =
    config.completionMode === "inline"
      ? "Inline 模式 (Alt+] 切换)"
      : config.completionMode === "standard"
      ? "标准列表模式 (Ctrl+Space)"
      : "双模式 (自动 + Ctrl+Space)";

  vscode.window.showInformationMessage(
    `RWKV 代码补全已启动！${config.numChoices} 个并发选项 | ${modeInfo}`
  );
}

export function deactivate() {}
