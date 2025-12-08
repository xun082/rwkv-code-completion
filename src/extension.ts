import * as vscode from "vscode";
import { CompletionService, getConfig } from "./completionService";

// 状态栏项
let statusBarItem: vscode.StatusBarItem;

// 代码补全提供者
class RWKVCompletionProvider implements vscode.InlineCompletionItemProvider {
  private lastTriggerTime = 0;
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

    console.log("[RWKV] 触发补全", {
      file: document.fileName,
      line: position.line,
      language: document.languageId,
    });

    if (!config.enabled) {
      console.log("[RWKV] 补全已禁用");
      return null;
    }

    // 防抖处理
    const now = Date.now();
    if (now - this.lastTriggerTime < config.debounceDelay) {
      console.log("[RWKV] 防抖跳过");
      return null;
    }
    this.lastTriggerTime = now;

    // 取消之前的请求
    if (this.abortController) {
      console.log("[RWKV] 取消之前的请求");
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      // 获取上下文
      const prefix = this.getPrefix(document, position);
      const suffix = this.getSuffix(document, position);
      const languageId = document.languageId;

      console.log("[RWKV] 上下文:", {
        prefixLength: prefix.length,
        suffixLength: suffix.length,
      });

      // 如果前文太短，不触发补全
      if (prefix.trim().length < 10) {
        console.log("[RWKV] 前文太短");
        return null;
      }

      // 调用 API
      const completion = await this.completionService.getCompletion(
        prefix,
        suffix,
        languageId,
        config,
        this.abortController.signal
      );

      if (!completion) {
        console.log("[RWKV] API 返回空");
        return null;
      }

      console.log("[RWKV] 补全成功，长度:", completion.length);

      // 返回补全项
      const item = new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("[RWKV] 请求被取消");
        return null;
      }
      console.error("[RWKV ERROR] 补全错误:", error);
      return null;
    }
  }

  // 获取光标前的代码（减少行数节省 token）
  private getPrefix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const startLine = Math.max(0, position.line - 30); // 从50减到30行
    const range = new vscode.Range(
      startLine,
      0,
      position.line,
      position.character
    );
    return document.getText(range);
  }

  // 获取光标后的代码（减少行数节省 token）
  private getSuffix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const endLine = Math.min(document.lineCount - 1, position.line + 10); // 从20减到10行
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
  console.log("RWKV 代码补全插件已激活");

  // 创建状态栏
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "rwkv-code-completion.toggleCompletion";
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 注册代码补全提供者
  const provider = new RWKVCompletionProvider();
  const disposable = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    provider
  );
  context.subscriptions.push(disposable);

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

  // 监听配置变化
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("rwkv-code-completion")) {
      updateStatusBar();
    }
  });

  vscode.window.showInformationMessage("RWKV 代码补全已启动！点击状态栏切换");
}

export function deactivate() {
  console.log("RWKV 代码补全插件已停用");
}
