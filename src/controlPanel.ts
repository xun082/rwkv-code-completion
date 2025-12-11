import * as vscode from "vscode";
import { getConfig } from "./completionService";

export class ControlPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "rwkv-control-panel";
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
        case "updateConfig":
          await this.handleUpdateConfig(data.key, data.value);
          break;
        case "toggleEnabled":
          await this.handleToggleEnabled();
          break;
        case "openSettings":
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "rwkv-code-completion"
          );
          break;
        case "getConfig":
          this.sendConfig();
          break;
      }
    });

    // 发送初始配置
    this.sendConfig();
  }

  private async handleUpdateConfig(key: string, value: any) {
    const config = vscode.workspace.getConfiguration("rwkv-code-completion");
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`配置已更新: ${key}`);
      this.sendConfig();
    } catch (error: any) {
      vscode.window.showErrorMessage(`更新失败: ${error.message}`);
    }
  }

  private async handleToggleEnabled() {
    const config = vscode.workspace.getConfiguration("rwkv-code-completion");
    const currentState = config.get("enabled", true);
    await config.update(
      "enabled",
      !currentState,
      vscode.ConfigurationTarget.Global
    );
    vscode.window.showInformationMessage(
      `RWKV 代码补全已${!currentState ? "启用" : "禁用"}`
    );
    this.sendConfig();
  }

  private sendConfig() {
    if (this._view) {
      const config = getConfig();
      this._view.webview.postMessage({
        type: "configUpdate",
        config: config,
      });
    }
  }

  public refresh() {
    this.sendConfig();
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>RWKV 控制面板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 1rem;
            overflow-x: hidden;
        }

        .section {
            margin-bottom: 1.5rem;
        }

        .section-title {
            font-size: 0.6875rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--vscode-descriptionForeground);
            opacity: 0.7;
            margin-bottom: 0.75rem;
            padding: 0 0.25rem;
        }

        /* 状态卡片 */
        .status-card {
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            padding: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .status-indicator {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .status-dot {
            width: 0.5rem;
            height: 0.5rem;
            border-radius: 50%;
            background-color: rgba(128, 128, 128, 0.5);
        }

        .status-dot.active {
            background-color: #89d185;
        }

        .status-text {
            font-size: var(--vscode-font-size);
            font-weight: normal;
        }

        .toggle-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            padding: 0.375rem 0.875rem;
            font-size: var(--vscode-font-size);
            font-weight: normal;
            cursor: pointer;
        }

        .toggle-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        /* 配置项 */
        .config-item {
            margin-bottom: 1rem;
        }

        .config-header {
            display: flex;
            align-items: center;
            gap: 0.375rem;
            margin-bottom: 0.375rem;
        }

        .config-icon {
            font-size: 1rem;
            width: 1.25rem;
            height: 1.25rem;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .config-label {
            font-size: var(--vscode-font-size);
            font-weight: normal;
            color: var(--vscode-foreground);
        }

        .config-display {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.375rem 0.5rem;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            cursor: text;
        }

        .config-display:hover {
            border-color: var(--vscode-focusBorder);
        }

        .config-value {
            font-size: var(--vscode-font-size);
            font-weight: normal;
            font-family: inherit;
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--vscode-input-foreground);
        }

        .edit-btn {
            background: none;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 0.125rem 0.25rem;
            border-radius: 2px;
            opacity: 0;
            font-size: 0.6875rem;
        }

        .config-display:hover .edit-btn {
            opacity: 0.7;
        }

        .edit-btn:hover {
            opacity: 1;
        }

        /* 编辑模式 */
        .config-edit {
            display: flex;
            gap: 0.375rem;
            align-items: center;
        }

        .config-input {
            flex: 1;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-focusBorder);
            border-radius: 2px;
            padding: 0.375rem 0.5rem;
            font-family: inherit;
            font-size: var(--vscode-font-size);
        }

        .config-input:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        .edit-actions {
            display: flex;
            gap: 0.25rem;
        }

        .save-btn, .cancel-btn {
            width: 1.5rem;
            height: 1.5rem;
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 0.75rem;
            font-weight: normal;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .save-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }

        .save-btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .cancel-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .cancel-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        /* 设置按钮 */
        .settings-btn {
            width: 100%;
            background-color: var(--vscode-button-secondaryBackground);
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 2px;
            padding: 0.5rem;
            font-size: var(--vscode-font-size);
            font-weight: normal;
            cursor: pointer;
            text-align: center;
        }

        .settings-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="section">
        <div class="section-title">运行状态</div>
        <div class="status-card">
            <div class="status-indicator">
                <div class="status-dot" id="statusDot"></div>
                <span class="status-text" id="statusText">加载中...</span>
            </div>
            <button class="toggle-btn" id="toggleBtn">切换</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">基础配置</div>

        <div class="config-item" data-key="endpoint">
            <div class="config-header">
                <span class="config-icon">🌐</span>
                <span class="config-label">服务端点</span>
            </div>
            <div class="config-display">
                <span class="config-value" data-display></span>
                <button class="edit-btn">✏️</button>
            </div>
            <div class="config-edit hidden" data-edit>
                <input type="text" class="config-input" data-input placeholder="http://192.168.0.12:8000/..."/>
                <div class="edit-actions">
                    <button class="save-btn" data-save>✓</button>
                    <button class="cancel-btn" data-cancel>✕</button>
                </div>
            </div>
        </div>

        <div class="config-item" data-key="maxTokens">
            <div class="config-header">
                <span class="config-icon">🔢</span>
                <span class="config-label">最大 Token</span>
            </div>
            <div class="config-display">
                <span class="config-value" data-display></span>
                <button class="edit-btn">✏️</button>
            </div>
            <div class="config-edit hidden" data-edit>
                <input type="number" class="config-input" data-input min="1" max="1000"/>
                <div class="edit-actions">
                    <button class="save-btn" data-save>✓</button>
                    <button class="cancel-btn" data-cancel>✕</button>
                </div>
            </div>
        </div>

        <div class="config-item" data-key="temperature">
            <div class="config-header">
                <span class="config-icon">🌡️</span>
                <span class="config-label">温度参数</span>
            </div>
            <div class="config-display">
                <span class="config-value" data-display></span>
                <button class="edit-btn">✏️</button>
            </div>
            <div class="config-edit hidden" data-edit>
                <input type="number" class="config-input" data-input step="0.01" min="0" max="2"/>
                <div class="edit-actions">
                    <button class="save-btn" data-save>✓</button>
                    <button class="cancel-btn" data-cancel>✕</button>
                </div>
            </div>
        </div>

        <div class="config-item" data-key="topP">
            <div class="config-header">
                <span class="config-icon">🎯</span>
                <span class="config-label">Top P</span>
            </div>
            <div class="config-display">
                <span class="config-value" data-display></span>
                <button class="edit-btn">✏️</button>
            </div>
            <div class="config-edit hidden" data-edit>
                <input type="number" class="config-input" data-input step="0.01" min="0" max="1"/>
                <div class="edit-actions">
                    <button class="save-btn" data-save>✓</button>
                    <button class="cancel-btn" data-cancel>✕</button>
                </div>
            </div>
        </div>

        <div class="config-item" data-key="debounceDelay">
            <div class="config-header">
                <span class="config-icon">⏱️</span>
                <span class="config-label">防抖延迟</span>
            </div>
            <div class="config-display">
                <span class="config-value" data-display></span>
                <button class="edit-btn">✏️</button>
            </div>
            <div class="config-edit hidden" data-edit>
                <input type="number" class="config-input" data-input min="0" max="5000"/>
                <div class="edit-actions">
                    <button class="save-btn" data-save>✓</button>
                    <button class="cancel-btn" data-cancel>✕</button>
                </div>
            </div>
        </div>
    </div>

    <div class="section">
        <button class="settings-btn" id="settingsBtn">⚙️ 打开完整设置</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentConfig = null;

        // 请求初始配置
        vscode.postMessage({ type: 'getConfig' });

        // 监听配置更新
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'configUpdate') {
                currentConfig = message.config;
                updateUI(message.config);
            }
        });

        function updateUI(config) {
            // 更新状态
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const toggleBtn = document.getElementById('toggleBtn');

            if (config.enabled) {
                statusDot.classList.add('active');
                statusText.textContent = '✅ 已启用';
                toggleBtn.textContent = '禁用';
            } else {
                statusDot.classList.remove('active');
                statusText.textContent = '❌ 已禁用';
                toggleBtn.textContent = '启用';
            }

            // 更新配置项
            updateConfigItem('endpoint', config.endpoint);
            updateConfigItem('maxTokens', config.maxTokens);
            updateConfigItem('temperature', config.temperature);
            updateConfigItem('topP', config.topP);
            updateConfigItem('debounceDelay', config.debounceDelay + 'ms');
        }

        function updateConfigItem(key, value) {
            const item = document.querySelector(\`[data-key="\${key}"]\`);
            if (item) {
                const display = item.querySelector('[data-display]');
                if (display) {
                    display.textContent = value;
                }
            }
        }

        // 切换启用/禁用
        document.getElementById('toggleBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleEnabled' });
        });

        // 打开设置
        document.getElementById('settingsBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'openSettings' });
        });

        // 配置项编辑
        document.querySelectorAll('.config-item').forEach(item => {
            const key = item.getAttribute('data-key');
            const displayDiv = item.querySelector('.config-display');
            const editDiv = item.querySelector('[data-edit]');
            const input = item.querySelector('[data-input]');
            const saveBtn = item.querySelector('[data-save]');
            const cancelBtn = item.querySelector('[data-cancel]');
            const editBtn = item.querySelector('.edit-btn');

            // 点击编辑
            const startEdit = () => {
                if (currentConfig) {
                    let value = currentConfig[key];
                    if (key === 'debounceDelay') {
                        // 去掉 'ms' 后缀
                        const displayValue = item.querySelector('[data-display]').textContent;
                        value = displayValue.replace('ms', '');
                    }
                    input.value = value;
                }
                displayDiv.classList.add('hidden');
                editDiv.classList.remove('hidden');
                input.focus();
            };

            editBtn.addEventListener('click', startEdit);
            displayDiv.addEventListener('click', startEdit);

            // 保存
            const save = () => {
                let value = input.value.trim();
                if (value) {
                    // 类型转换
                    if (key === 'maxTokens' || key === 'debounceDelay') {
                        value = parseInt(value);
                    } else if (key === 'temperature' || key === 'topP') {
                        value = parseFloat(value);
                    }
                    vscode.postMessage({
                        type: 'updateConfig',
                        key: key,
                        value: value
                    });
                }
                displayDiv.classList.remove('hidden');
                editDiv.classList.add('hidden');
            };

            saveBtn.addEventListener('click', save);

            // 取消
            const cancel = () => {
                displayDiv.classList.remove('hidden');
                editDiv.classList.add('hidden');
            };

            cancelBtn.addEventListener('click', cancel);

            // 键盘快捷键
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    save();
                } else if (e.key === 'Escape') {
                    cancel();
                }
            });
        });
    </script>
</body>
</html>`;
  }
}
