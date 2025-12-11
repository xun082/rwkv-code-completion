export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  isStreaming?: boolean; // 是否正在流式输出
}

export interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
  }
}

export type MessageType =
  | { type: "sendMessage"; message: string }
  | { type: "clearHistory" }
  | { type: "stopGeneration" };

export type ResponseType =
  | { type: "userMessage"; message: string }
  | { type: "assistantMessage"; message: string }
  | { type: "error"; message: string }
  | { type: "loading"; isLoading: boolean }
  | { type: "clearMessages" };

