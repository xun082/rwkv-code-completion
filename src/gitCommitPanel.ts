import * as vscode from "vscode";
import { getConfig } from "./completionService";
import * as cp from "child_process";
import { promisify } from "util";
import { aiService } from "./services/AIService";

const exec = promisify(cp.exec);

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
  untracked: string[];
}

export class GitCommitPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "rwkv-git-commit";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
        case "getStatus":
          await this.sendGitStatus();
          break;
        case "getConfig":
          await this.sendGitConfig();
          break;
        case "generateMessage":
          await this.generateCommitMessage();
          break;
        case "commit":
          await this.commitChanges(data.message);
          break;
      }
    });
  }

  private async sendGitConfig() {
    const config = vscode.workspace.getConfiguration(
      "rwkv-code-completion.git"
    );
    const commitTypes = config.get("commitTypes", []);
    const useEmoji = config.get("useEmoji", false);

    if (this._view) {
      this._view.webview.postMessage({
        type: "configUpdate",
        config: {
          commitTypes,
          useEmoji,
        },
      });
    }
  }

  // 解码 Git 文件名中的八进制转义
  private decodeGitFileName(fileName: string): string {
    // Git 会将非 ASCII 字符转义为八进制，并用双引号包裹
    // 例如: "next/12. React Server Components \350\257\246\350\247\243.md"
    if (fileName.startsWith('"') && fileName.endsWith('"')) {
      // 移除首尾引号
      fileName = fileName.slice(1, -1);

      // 将八进制转义序列转换为实际字符
      // \350\257\246 -> 详
      fileName = fileName.replace(/\\(\d{3})/g, (match, octal) => {
        return String.fromCharCode(parseInt(octal, 8));
      });

      // 处理其他转义字符
      fileName = fileName
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\\\/g, "\\")
        .replace(/\\"/g, '"');
    }

    return fileName;
  }

  private async getGitStatus(): Promise<GitStatus | null> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return null;
      }

      const cwd = workspaceFolder.uri.fsPath;
      const { stdout } = await exec("git status --porcelain", { cwd });

      const status: GitStatus = {
        modified: [],
        added: [],
        deleted: [],
        renamed: [],
        untracked: [],
      };

      stdout.split("\n").forEach((line) => {
        if (!line) {
          return;
        }

        // porcelain 格式：XY PATH
        // X = staged 状态，Y = unstaged 状态
        const stagedStatus = line[0];
        const unstagedStatus = line[1];
        let file = line.substring(3);

        // 解码文件名
        file = this.decodeGitFileName(file);

        // 显示所有改动的文件（staged 或 unstaged）
        if (stagedStatus === "M" || unstagedStatus === "M") {
          if (!status.modified.includes(file)) {
            status.modified.push(file);
          }
        } else if (stagedStatus === "A" || unstagedStatus === "A") {
          if (!status.added.includes(file)) {
            status.added.push(file);
          }
        } else if (stagedStatus === "D" || unstagedStatus === "D") {
          if (!status.deleted.includes(file)) {
            status.deleted.push(file);
          }
        } else if (stagedStatus === "R" || unstagedStatus === "R") {
          if (!status.renamed.includes(file)) {
            status.renamed.push(file);
          }
        } else if (line.startsWith("??")) {
          status.untracked.push(file);
        }
      });

      return status;
    } catch (error) {
      console.error("获取 Git 状态失败:", error);
      return null;
    }
  }

  private async getGitDiff(): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return "";
      }

      const cwd = workspaceFolder.uri.fsPath;

      // 优先获取 staged 的 diff
      const { stdout: stagedDiff } = await exec("git diff --cached", { cwd });

      // 如果有 staged 的改动，只用 staged 的；否则用 unstaged 的
      if (stagedDiff.trim()) {
        return stagedDiff;
      }

      const { stdout: unstagedDiff } = await exec("git diff", { cwd });
      return unstagedDiff;
    } catch (error) {
      console.error("获取 Git diff 失败:", error);
      return "";
    }
  }

  private async sendGitStatus() {
    const status = await this.getGitStatus();
    if (this._view) {
      this._view.webview.postMessage({
        type: "statusUpdate",
        status,
      });
    }
  }

  private async generateCommitMessage() {
    try {
      if (this._view) {
        this._view.webview.postMessage({
          type: "generating",
          isGenerating: true,
        });
      }

      const status = await this.getGitStatus();

      // 检查是否有任何改动（staged、unstaged 或 untracked）
      const hasChanges =
        status &&
        (status.modified.length > 0 ||
          status.added.length > 0 ||
          status.deleted.length > 0 ||
          status.renamed.length > 0 ||
          status.untracked.length > 0);

      if (!hasChanges) {
        vscode.window.showWarningMessage("没有可提交的更改");
        if (this._view) {
          this._view.webview.postMessage({
            type: "generating",
            isGenerating: false,
          });
        }
        return;
      }

      const diff = await this.getGitDiff();

      // 如果没有 diff（可能只有 untracked 文件），生成文件列表说明
      let diffContent = diff;
      if (!diff || diff.trim() === "") {
        const fileList = [
          ...status!.added.map((f) => `A ${f}`),
          ...status!.modified.map((f) => `M ${f}`),
          ...status!.deleted.map((f) => `D ${f}`),
          ...status!.renamed.map((f) => `R ${f}`),
          ...status!.untracked.map((f) => `U ${f}`),
        ].join("\n");
        diffContent = `变更文件列表：\n${fileList}`;
      }

      // 限制 diff 长度，避免请求过大
      const limitedDiff =
        diffContent.length > 3000
          ? diffContent.substring(0, 3000) + "\n..."
          : diffContent;

      // 使用 AI 服务生成提交信息（AI 自动识别类型）
      const message = await aiService.generateGitCommit(limitedDiff);

      if (this._view) {
        this._view.webview.postMessage({
          type: "messageGenerated",
          message: message.trim(),
        });
        this._view.webview.postMessage({
          type: "generating",
          isGenerating: false,
        });
      }
    } catch (error: any) {
      console.error("[Git Commit] 生成失败:", error);
      vscode.window.showErrorMessage(`生成提交信息失败: ${error.message}`);
      if (this._view) {
        this._view.webview.postMessage({
          type: "generating",
          isGenerating: false,
        });
      }
    }
  }

  // buildPrompt 和 callAI 方法已被 SiliconFlow 服务替代

  private async commitChanges(message: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("没有打开的工作区");
        return;
      }

      const cwd = workspaceFolder.uri.fsPath;

      // 添加所有更改
      await exec("git add -A", { cwd });

      // 提交
      await exec(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });

      vscode.window.showInformationMessage("✅ 提交成功！");

      // 刷新状态
      await this.sendGitStatus();

      // 清空消息
      if (this._view) {
        this._view.webview.postMessage({
          type: "commitSuccess",
        });
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`提交失败: ${error.message}`);
    }
  }

  public refresh() {
    this.sendGitStatus();
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
    <title>Git 提交助手</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    <script>
        window.__VIEW_TYPE__ = 'git';
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
