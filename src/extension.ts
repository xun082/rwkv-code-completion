import * as vscode from "vscode";
import { CompletionService, getConfig } from "./completionService";

class RWKVCompletionProvider implements vscode.CompletionItemProvider {
  private completionService: CompletionService;
  private abortController: AbortController | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.completionService = new CompletionService();
  }

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<vscode.CompletionItem[] | null> {
    const config = getConfig();

    // 防抖：清除之前的 timer，只在停止输入半秒后才触发请求
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 延迟执行 - 只有停止输入后才发送请求
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        // 取消之前的请求（如果有）
        if (this.abortController) {
          this.abortController.abort();
        }
        this.abortController = new AbortController();

        try {
          const prefix = this.getPrefix(document, position);
          const suffix = this.getSuffix(document, position);
          const languageId = document.languageId;

          // 显示加载提示
          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `🤖 RWKV 正在生成 ${config.numChoices} 个代码补全...`,
              cancellable: true,
            },
            async (progress, progressToken) => {
              progressToken.onCancellationRequested(() => {
                this.abortController?.abort();
              });

              const completions = await this.completionService.getCompletion(
                prefix,
                suffix,
                languageId,
                config,
                this.abortController!.signal
              );

              if (!completions || completions.length === 0) {
                vscode.window.showWarningMessage("未生成任何补全结果");
                return;
              }

              const validCompletions = completions.filter(
                (c) => c && c.trim().length > 0
              );

              if (validCompletions.length === 0) {
                vscode.window.showWarningMessage("所有补全结果为空");
                return;
              }

              // 显示成功消息
              vscode.window.showInformationMessage(
                `✅ 已生成 ${validCompletions.length} 个补全选项`
              );

              // 显示 WebView 面板
              this.showCompletionWebview(
                document,
                position,
                validCompletions,
                languageId
              );
            }
          );

          resolve(null);
        } catch (error: any) {
          if (error.name !== "AbortError") {
            console.error("补全错误:", error);
            vscode.window.showErrorMessage(`补全失败: ${error.message}`);
          }
          resolve(null);
        }
      }, config.debounceDelay);
    });
  }

  private showCompletionWebview(
    document: vscode.TextDocument,
    position: vscode.Position,
    completions: string[],
    languageId: string
  ) {
    const panel = vscode.window.createWebviewPanel(
      "rwkvCompletion",
      `🤖 RWKV 代码补全 (${completions.length} 个选项)`,
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // 生成 HTML 内容
    panel.webview.html = this.getWebviewContent(completions, languageId);

    // 保存原始文档和位置（关键！）
    const targetDocument = document;
    const targetPosition = position; // 触发补全时的位置

    // 处理消息
    panel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === "insert") {
        // 先切换回原编辑器
        const editor = await vscode.window.showTextDocument(
          targetDocument,
          vscode.ViewColumn.One,
          false
        );

        if (!editor) {
          vscode.window.showErrorMessage("无法打开目标编辑器");
          return;
        }

        // 使用触发补全时保存的位置
        const insertPosition = targetPosition;

        const success = await editor.edit((editBuilder) => {
          editBuilder.insert(insertPosition, message.code);
        });

        if (success) {
          panel.dispose();

          // 插入成功后，延迟触发下一次补全
          setTimeout(() => {
            vscode.commands.executeCommand("editor.action.triggerSuggest");
          }, 300);
        } else {
          vscode.window.showErrorMessage("代码插入失败");
        }
      }
    }, undefined);
  }

  private getWebviewContent(completions: string[], languageId: string): string {
    // 直接使用 JSON.stringify，它会自动处理转义
    const completionsJson = JSON.stringify(completions);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box; 
    }
    
    body {
      font-family: var(--vscode-font-family);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 16px;
      height: 100vh;
      overflow: auto;
    }

    .header {
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid var(--vscode-panel-border);
    }

    .title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .subtitle {
      font-size: 12px;
      opacity: 0.7;
    }

    .code-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 12px;
      height: calc(100vh - 120px);
      min-height: 600px;
    }

    .code-block {
      border: 2px solid var(--vscode-panel-border);
      border-radius: 6px;
      overflow: hidden;
      transition: all 0.15s ease;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background: var(--vscode-sideBar-background);
      min-height: 0;
    }

    .code-block:hover {
      border-color: var(--vscode-focusBorder);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      transform: scale(1.02);
    }

    .code-block.selected {
      border-color: var(--vscode-button-background);
      box-shadow: 0 0 0 2px var(--vscode-button-background);
    }

    .code-header {
      padding: 10px 14px;
      background: var(--vscode-titleBar-activeBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }

    .code-label {
      font-weight: 600;
      font-size: 13px;
      display: block;
      margin-bottom: 3px;
    }

    .code-meta {
      font-size: 10px;
      opacity: 0.6;
    }

    .code-content {
      background: var(--vscode-textCodeBlock-background);
      overflow: auto;
      flex: 1;
      min-height: 0;
    }

    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
      height: 100%;
    }

    code {
      font-family: inherit;
    }

    .hint {
      text-align: center;
      padding: 12px;
      opacity: 0.5;
      font-size: 11px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">🤖 RWKV 代码补全 - 2×2 网格</div>
    <div class="subtitle">共 ${completions.length} 个选项，点击任一代码块插入</div>
  </div>

  <div class="code-grid" id="codeList"></div>

  <div class="hint">
    💡 点击代码块插入 | Hover 放大查看
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const completions = ${completionsJson};

    function escapeHtml(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function insertCode(index) {
      const code = completions[index];
      vscode.postMessage({
        command: 'insert',
        code: code
      });
    }

    function renderAllCode() {
      const container = document.getElementById('codeList');
      const html = [];
      
      for (let index = 0; index < completions.length; index++) {
        const code = completions[index];
        const lines = code.split('\\n');
        const escapedCode = escapeHtml(code);
        
        html.push(\`
          <div class="code-block" data-index="\${index}">
            <div class="code-header">
              <div class="code-label">选项 \${index + 1}</div>
              <div class="code-meta">\${code.length} 字符 · \${lines.length} 行</div>
            </div>
            <div class="code-content">
              <pre><code>\${escapedCode}</code></pre>
            </div>
          </div>
        \`);
      }
      
      container.innerHTML = html.join('');

      // 绑定点击事件
      const blocks = document.querySelectorAll('.code-block');
      blocks.forEach((el, idx) => {
        el.addEventListener('click', function(e) {
          const index = parseInt(this.dataset.index);
          
          // 视觉反馈
          blocks.forEach(b => b.classList.remove('selected'));
          this.classList.add('selected');
          
          // 插入代码
          insertCode(index);
        });
      });
    }

    // 初始化
    renderAllCode();
  </script>
</body>
</html>`;
  }

  private getPrefix(
    document: vscode.TextDocument,
    position: vscode.Position
  ): string {
    const range = new vscode.Range(new vscode.Position(0, 0), position);
    const fullPrefix = document.getText(range);
    return fullPrefix.length > 2000 ? fullPrefix.slice(-2000) : fullPrefix;
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

export function activate(context: vscode.ExtensionContext) {
  const provider = new RWKVCompletionProvider();

  // 注册打开设置命令
  const openSettingsCommand = vscode.commands.registerCommand(
    "rwkv-code-completion.openSettings",
    () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "rwkv-code-completion"
      );
    }
  );

  // 生成所有可打印 ASCII 字符 + 空格作为触发字符
  const triggerChars = [
    " ", // 空格
    "\n", // 换行
    ...Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)),
  ];

  const disposable = vscode.languages.registerCompletionItemProvider(
    { pattern: "**" },
    provider,
    ...triggerChars
  );

  context.subscriptions.push(openSettingsCommand, disposable);

  // 监听文档变化，在删除/换行/空格时自动触发补全
  let debounceTimer: NodeJS.Timeout | undefined;
  let lastTriggerTime = 0;
  const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    // 清除之前的定时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // 获取配置
    const config = getConfig();
    if (!config.enabled) {
      return;
    }

    // 只处理当前活动编辑器的文档
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== event.document) {
      return;
    }

    // 避免过于频繁触发（最少间隔 500ms）
    const now = Date.now();
    if (now - lastTriggerTime < 500) {
      return;
    }

    // 检查是否是删除、换行或空格操作
    const shouldTrigger = event.contentChanges.some((change) => {
      // 删除操作：rangeLength > 0 且 text 为空
      const isDelete = change.rangeLength > 0 && change.text === "";
      // 换行操作：text 只包含换行符
      const isNewline = change.text === "\n" || change.text === "\r\n";
      // 空格输入：text 只是一个空格
      const isSpace = change.text === " ";

      return isDelete || isNewline || isSpace;
    });

    if (!shouldTrigger) {
      return;
    }

    // 防抖：延迟触发补全
    debounceTimer = setTimeout(() => {
      if (editor === vscode.window.activeTextEditor) {
        lastTriggerTime = Date.now();
        // 手动触发代码补全
        vscode.commands.executeCommand("editor.action.triggerSuggest");
      }
    }, config.debounceDelay);
  });

  context.subscriptions.push(changeListener);
}

export function deactivate() {}
