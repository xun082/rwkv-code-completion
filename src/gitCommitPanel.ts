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

      // 1. 获取 staged 的 diff
      const { stdout: stagedDiff } = await exec("git diff --cached", { cwd });

      // 2. 获取 unstaged 的 diff
      const { stdout: unstagedDiff } = await exec("git diff", { cwd });

      // 3. 获取 untracked 文件内容
      const { stdout: untrackedFiles } = await exec(
        "git ls-files --others --exclude-standard",
        { cwd }
      );
      const untrackedList = untrackedFiles
        .trim()
        .split("\n")
        .filter((f) => f);

      let untrackedContent = "";
      if (untrackedList.length > 0) {
        for (const file of untrackedList.slice(0, 10)) {
          try {
            const { stdout: fileContent } = await exec(
              `git diff --no-index /dev/null "${file}"`,
              { cwd }
            );
            untrackedContent += fileContent + "\n";
          } catch (err: any) {
            // git diff --no-index 会返回非 0 退出码，但 stdout 仍包含 diff
            if (err.stdout) {
              untrackedContent += err.stdout + "\n";
            }
          }
        }
      }

      const allDiffs = [stagedDiff, unstagedDiff, untrackedContent]
        .filter((d) => d.trim())
        .join("\n\n");

      return allDiffs;
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

      // 如果 diff 为空，说明没有任何改动
      if (!diff || diff.trim() === "") {
        vscode.window.showWarningMessage("没有可分析的代码改动");
        if (this._view) {
          this._view.webview.postMessage({
            type: "generating",
            isGenerating: false,
          });
        }
        return;
      }

      // 限制 diff 长度，避免请求过大
      // 增加限制到 6000 字符，以便包含更多上下文
      const limitedDiff =
        diff.length > 6000
          ? diff.substring(0, 6000) +
            "\n\n... (内容已截断，共 " +
            diff.length +
            " 字符)"
          : diff;

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

      // 提供更友好的错误信息
      let errorMsg = error.message || "未知错误";
      if (errorMsg.includes("fetch")) {
        errorMsg = "无法连接到 RWKV 服务，请检查服务是否运行";
      } else if (errorMsg.includes("AbortError")) {
        errorMsg = "生成已取消";
      }

      vscode.window.showErrorMessage(`生成提交信息失败: ${errorMsg}`);
      if (this._view) {
        this._view.webview.postMessage({
          type: "generating",
          isGenerating: false,
        });
      }
    }
  }

  // buildPrompt 和 callAI 方法已被 AI 服务替代

  private async commitChanges(message: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("没有打开的工作区");
        return;
      }

      // 验证消息格式
      if (!message || message.trim().length === 0) {
        vscode.window.showErrorMessage("提交消息不能为空");
        return;
      }

      // 清理消息：移除多余空格和换行
      const cleanMessage = message.trim().replace(/\s+/g, " ");

      const cwd = workspaceFolder.uri.fsPath;

      // 添加所有更改
      await exec("git add -A", { cwd });

      // 转义双引号和反斜杠
      const escapedMessage = cleanMessage
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\$/g, "\\$")
        .replace(/`/g, "\\`");

      await exec(`git commit -m "${escapedMessage}"`, { cwd });

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
      console.error("[Git Commit] 提交失败:", error);
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
