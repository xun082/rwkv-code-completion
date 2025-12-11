// VSCode API 单例
// acquireVsCodeApi() 只能调用一次，所以需要缓存

export interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
    __vscodeApi__?: VSCodeAPI;
  }
}

// 获取或创建 VSCode API 实例
export function getVSCodeAPI(): VSCodeAPI {
  if (!window.__vscodeApi__) {
    console.log("[VSCode API] 首次获取 VSCode API");
    window.__vscodeApi__ = window.acquireVsCodeApi();
  }
  return window.__vscodeApi__;
}

export const vscode = getVSCodeAPI();

