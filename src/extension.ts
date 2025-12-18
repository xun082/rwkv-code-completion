import * as vscode from "vscode";
import { CompletionService, getConfig } from "./completionService";
import { ChatPanelProvider } from "./chatPanel";
import { ControlPanelProvider } from "./controlPanel";
import { GitCommitPanelProvider } from "./gitCommitPanel";

// 状态栏项
let statusBarItem: vscode.StatusBarItem;

// 保留旧的 TreeView 代码以防需要
// 侧边栏项类型
class SidebarItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly contextValue?: string,
    public readonly description?: string,
    public readonly iconPath?: vscode.ThemeIcon
  ) {
    super(label, collapsibleState);
    this.command = command;
    this.contextValue = contextValue;
    this.description = description;
    this.iconPath = iconPath;
  }
}

// 侧边栏数据提供者
class RWKVSidebarProvider implements vscode.TreeDataProvider<SidebarItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SidebarItem | undefined | null | void
  > = new vscode.EventEmitter<SidebarItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SidebarItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarItem): Thenable<SidebarItem[]> {
    if (!element) {
      // 根级别项
      return Promise.resolve(this.getRootItems());
    }
    return Promise.resolve([]);
  }

  private getRootItems(): SidebarItem[] {
    const config = getConfig();
    const items: SidebarItem[] = [];

    // ========== 状态区域 ==========
    const statusIcon = config.enabled
      ? new vscode.ThemeIcon(
          "pass-filled",
          new vscode.ThemeColor("charts.green")
        )
      : new vscode.ThemeIcon(
          "circle-slash",
          new vscode.ThemeColor("charts.red")
        );

    items.push(
      new SidebarItem(
        "运行状态",
        vscode.TreeItemCollapsibleState.None,
        undefined,
        "status",
        config.enabled ? "✅ 已启用" : "❌ 已禁用",
        statusIcon
      )
    );

    // 启用/禁用按钮
    const toggleIcon = config.enabled
      ? new vscode.ThemeIcon("stop-circle", new vscode.ThemeColor("charts.red"))
      : new vscode.ThemeIcon(
          "play-circle",
          new vscode.ThemeColor("charts.green")
        );

    items.push(
      new SidebarItem(
        config.enabled ? "禁用补全" : "启用补全",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.toggleCompletion",
          title: "切换补全",
        },
        "toggleButton",
        "点击切换",
        toggleIcon
      )
    );

    // ========== 配置区域（可编辑）==========
    items.push(
      new SidebarItem(
        "服务端点",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.editEndpoint",
          title: "编辑服务端点",
        },
        "endpoint",
        config.endpoint.length > 40
          ? config.endpoint.substring(0, 37) + "..."
          : config.endpoint,
        new vscode.ThemeIcon("globe", new vscode.ThemeColor("charts.blue"))
      )
    );

    items.push(
      new SidebarItem(
        "最大 Token",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.editMaxTokens",
          title: "编辑最大Token",
        },
        "maxTokens",
        String(config.maxTokens),
        new vscode.ThemeIcon(
          "symbol-number",
          new vscode.ThemeColor("charts.purple")
        )
      )
    );

    items.push(
      new SidebarItem(
        "温度参数",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.editTemperature",
          title: "编辑温度参数",
        },
        "temperature",
        String(config.temperature),
        new vscode.ThemeIcon("flame", new vscode.ThemeColor("charts.orange"))
      )
    );

    items.push(
      new SidebarItem(
        "Top P",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.editTopP",
          title: "编辑Top P",
        },
        "topP",
        String(config.topP),
        new vscode.ThemeIcon(
          "symbol-parameter",
          new vscode.ThemeColor("charts.yellow")
        )
      )
    );

    items.push(
      new SidebarItem(
        "防抖延迟",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.editDebounceDelay",
          title: "编辑防抖延迟",
        },
        "debounceDelay",
        `${config.debounceDelay}ms`,
        new vscode.ThemeIcon("watch", new vscode.ThemeColor("charts.blue"))
      )
    );

    // ========== 操作按钮 ==========
    items.push(
      new SidebarItem(
        "打开设置",
        vscode.TreeItemCollapsibleState.None,
        {
          command: "rwkv-code-completion.openSettings",
          title: "打开设置",
        },
        "settingsButton",
        "配置参数",
        new vscode.ThemeIcon(
          "settings-gear",
          new vscode.ThemeColor("charts.foreground")
        )
      )
    );

    return items;
  }
}

// 代码补全提供者
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

      // 如果前文太短，不触发补全
      if (prefix.trim().length < 3) {
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
        return null;
      }

      // 返回补全项
      const item = new vscode.InlineCompletionItem(
        completion,
        new vscode.Range(position, position)
      );

      return [item];
    } catch (error: any) {
      if (error.name === "AbortError") {
        return null;
      }
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

  // 监听配置变化
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("rwkv-code-completion")) {
      updateStatusBar();
      controlPanelProvider.refresh(); // 配置变化时刷新控制面板
    }
  });

  vscode.window.showInformationMessage(
    "RWKV 代码补全已启动！点击侧边栏图标查看控制面板"
  );
}

export function deactivate() {}
