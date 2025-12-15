import * as vscode from "vscode";
import { ChatService, ChatMessage } from "./chatService";

export class ChatPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "rwkv-chat-panel";
  private _view?: vscode.WebviewView;
  private chatService: ChatService;
  private abortController?: AbortController;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this.chatService = new ChatService();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 处理来自 webview 的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "sendMessage":
          await this.handleSendMessage(data.message, data.context);
          break;
        case "clearHistory":
          this.handleClearHistory();
          break;
        case "stopGeneration":
          this.handleStopGeneration();
          break;
      }
    });
  }

  private async handleSendMessage(message: string, context?: ChatMessage[]) {
    if (!this._view) {
      return;
    }

    // 显示用户消息
    this._view.webview.postMessage({
      type: "userMessage",
      message: message,
    });

    // 开始流式输出（创建空的助手消息）
    this._view.webview.postMessage({
      type: "startStream",
    });

    try {
      this.abortController = new AbortController();
      
      // 使用流式输出，传递前端提供的上下文
      await this.chatService.sendMessage(
        message,
        (chunk: string) => {
          // 实时发送每个文本块到 webview
          if (this._view) {
            this._view.webview.postMessage({
              type: "streamChunk",
              chunk: chunk,
            });
          }
        },
        this.abortController.signal,
        context // 使用前端传递的上下文消息（最近5条）
      );

      // 流式输出完成
      this._view.webview.postMessage({
        type: "endStream",
      });
    } catch (error: any) {
      if (error.name === "AbortError") {
        this._view.webview.postMessage({
          type: "streamChunk",
          chunk: "\n\n⚠️ 生成已停止",
        });
        this._view.webview.postMessage({
          type: "endStream",
        });
      } else {
        this._view.webview.postMessage({
          type: "error",
          message: error.message,
        });
      }
    } finally {
      this.abortController = undefined;
    }
  }

  private handleClearHistory() {
    this.chatService.clearHistory();
    if (this._view) {
      this._view.webview.postMessage({
        type: "clearMessages",
      });
    }
    vscode.window.showInformationMessage("对话历史已清空");
  }

  private handleStopGeneration() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "dist",
        "webview",
        "assets",
        "index.js"
      )
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "dist",
        "webview",
        "assets",
        "index.css"
      )
    );

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline' 'unsafe-eval'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:; connect-src ${webview.cspSource};">
    <title>RWKV AI 聊天</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    <script>
        window.__VIEW_TYPE__ = 'chat';
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

