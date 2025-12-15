import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Message } from "./types";
import { vscode } from "./vscode";
import { Trash2, Send, Square, Copy, Check } from "lucide-react";
import "highlight.js/styles/github-dark.css";

const STORAGE_KEY = "rwkv-chat-messages";
const MAX_CONTEXT_MESSAGES = 5;

// 获取上下文消息（只取最近5条有效消息）
const getContextMessages = (messages: Message[]): Message[] => {
  return messages
    .filter((msg) => !msg.isStreaming && !msg.content.startsWith("❌"))
    .slice(-MAX_CONTEXT_MESSAGES);
};

const App: React.FC = () => {
  // 初始化消息（从 localStorage 恢复）
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const lastUserMessageIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 保存成功的消息到 localStorage（过滤掉错误消息和流式中的消息）
  useEffect(() => {
    try {
      const successMessages = messages.filter(
        (msg) => !msg.isStreaming && !msg.content.startsWith("❌")
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(successMessages));
    } catch {}
  }, [messages]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 处理来自扩展的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "userMessage":
          const userMsgId = Date.now().toString();
          lastUserMessageIdRef.current = userMsgId;
          setMessages((prev) => [
            ...prev,
            {
              id: userMsgId,
              role: "user",
              content: message.message,
              timestamp: Date.now(),
            },
          ]);
          break;

        case "startStream":
          setIsLoading(true);
          setMessages((prev) => [
            ...prev,
            {
              id: `stream-${Date.now()}`,
              role: "assistant",
              content: "",
              timestamp: Date.now(),
              isStreaming: true,
            },
          ]);
          break;

        case "streamChunk":
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && lastMessage.role === "assistant") {
              lastMessage.content += message.chunk;
            }
            return newMessages;
          });
          break;

        case "endStream":
          setIsLoading(false);
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage) {
              lastMessage.isStreaming = false;
            }
            return newMessages;
          });
          lastUserMessageIdRef.current = null;
          break;

        case "error":
          setIsLoading(false);
          // 删除本次失败的用户消息，不保存到历史记录
          setMessages((prev) => {
            if (lastUserMessageIdRef.current) {
              return prev.filter(
                (msg) => msg.id !== lastUserMessageIdRef.current
              );
            }
            return prev;
          });
          lastUserMessageIdRef.current = null;

          // 临时显示错误提示（3秒后自动消失）
          const errorId = `error-${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: errorId,
              role: "assistant",
              content: `❌ ${message.message}`,
              timestamp: Date.now(),
            },
          ]);

          setTimeout(() => {
            setMessages((prev) => prev.filter((msg) => msg.id !== errorId));
          }, 3000);
          break;

        case "clearMessages":
          setMessages([]);
          localStorage.removeItem(STORAGE_KEY);
          lastUserMessageIdRef.current = null;
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 发送消息
  const handleSend = () => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue || isLoading) return;

    const contextMessages = getContextMessages(messages);

    vscode.postMessage({
      type: "sendMessage",
      message: trimmedValue,
      context: contextMessages,
    });

    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  // 快捷键发送
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // 清空聊天记录
  const handleClear = () => {
    if (messages.length === 0) return;

    // 直接清空，不需要确认
    vscode.postMessage({ type: "clearHistory" });
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // 忽略 localStorage 错误
    }
  };

  // 停止生成
  const handleStop = () => {
    vscode.postMessage({ type: "stopGeneration" });

    // 删除本次未完成的对话
    setMessages((prev) => {
      const filtered = prev.filter((msg) => !msg.isStreaming);
      if (lastUserMessageIdRef.current) {
        return filtered.filter(
          (msg) => msg.id !== lastUserMessageIdRef.current
        );
      }
      return filtered;
    });

    lastUserMessageIdRef.current = null;
    setIsLoading(false);
  };

  // 输入框自动调整高度
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  };

  // 消息统计
  const totalMessages = messages.length;
  const contextCount = getContextMessages(messages).length;

  return (
    <div className="flex flex-col h-screen bg-(--vscode-sideBar-background)">
      {/* Header */}
      <div className="flex flex-col border-b border-(--vscode-panel-border) bg-gradient-to-r from-(--vscode-sideBar-background) to-(--vscode-editor-background)">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg">
              AI
            </div>
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-(--vscode-foreground) mb-0.5">
                AI 聊天助手
              </h3>
              <div className="flex items-center gap-2 text-xs">
                {totalMessages > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-(--vscode-badge-background) text-(--vscode-badge-foreground)">
                    <span className="font-medium">{totalMessages}</span>
                    <span className="opacity-80">条消息</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleClear}
            disabled={messages.length === 0}
            title="清空聊天记录"
            className="h-8 w-8 flex items-center justify-center text-(--vscode-icon-foreground) hover:bg-(--vscode-toolbar-hoverBackground) rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-600/10 flex items-center justify-center mb-4">
              <div className="text-5xl">💬</div>
            </div>
            <p className="text-base font-medium text-(--vscode-foreground) mb-2">
              开始新对话
            </p>
            <p className="text-xs text-(--vscode-descriptionForeground) opacity-70 max-w-[200px]">
              支持 Markdown 格式 · 自动保存历史 · 智能上下文管理
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-(--vscode-panel-border) bg-gradient-to-t from-(--vscode-editor-background) to-transparent">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息... (⌘/Ctrl+Enter 发送)"
            disabled={isLoading}
            rows={1}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded-xl px-4 py-3 text-sm placeholder:text-(--vscode-input-placeholderForeground) focus:outline-none focus:border-(--vscode-focusBorder) focus:ring-1 focus:ring-(--vscode-focusBorder) disabled:opacity-50 transition-all shadow-sm"
          />
          {!isLoading ? (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              title="发送消息"
              className="h-10 w-10 shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105 disabled:hover:scale-100"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              onClick={handleStop}
              title="停止生成"
              className="h-10 w-10 shrink-0 flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:scale-105"
            >
              <Square size={18} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 消息气泡组件
const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === "user";
  const isError = message.content.startsWith("❌");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex gap-3 ${
        isUser ? "flex-row-reverse" : ""
      } group animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-xs font-bold shadow-sm ${
          isUser
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
            : isError
            ? "bg-gradient-to-br from-red-500 to-red-600 text-white"
            : "bg-gradient-to-br from-purple-500 to-purple-600 text-white"
        }`}
      >
        {isUser ? "U" : isError ? "⚠" : "AI"}
      </div>
      <div className="flex flex-col gap-1.5 max-w-[85%] flex-1">
        <div
          className={`relative px-4 py-3 text-sm leading-relaxed rounded-2xl shadow-sm ${
            isUser
              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md"
              : isError
              ? "bg-(--vscode-inputValidation-errorBackground) bg-opacity-10 border-2 border-(--vscode-inputValidation-errorBorder) rounded-bl-md"
              : "bg-(--vscode-input-background) border border-(--vscode-panel-border) rounded-bl-md"
          }`}
        >
          {/* 复制按钮 - 只对 AI 消息显示 */}
          {!isUser && !isError && !message.isStreaming && (
            <button
              onClick={handleCopy}
              title={copied ? "已复制" : "复制消息"}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-(--vscode-button-secondaryBackground) hover:bg-(--vscode-button-secondaryHoverBackground) text-(--vscode-button-secondaryForeground) rounded-lg transition-all hover:scale-105 shadow-sm"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          )}

          <div className="markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ node, ...props }) => (
                  <pre
                    className="my-2 p-3 rounded bg-(--vscode-textCodeBlock-background) border border-(--vscode-panel-border) overflow-x-auto"
                    {...props}
                  />
                ),
                code: ({ node, className, children, ...props }: any) => {
                  const inline = !className?.includes("language-");
                  return inline ? (
                    <code
                      className="px-1.5 py-0.5 rounded bg-(--vscode-textCodeBlock-background) text-(--vscode-textCodeBlock-foreground) text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <code
                      className={`text-xs font-mono ${className || ""}`}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                p: ({ node, ...props }) => (
                  <p className="my-1.5 last:mb-0" {...props} />
                ),
                ul: ({ node, ...props }) => (
                  <ul
                    className="list-disc list-inside my-2 space-y-1"
                    {...props}
                  />
                ),
                ol: ({ node, ...props }) => (
                  <ol
                    className="list-decimal list-inside my-2 space-y-1"
                    {...props}
                  />
                ),
                li: ({ node, ...props }) => <li className="ml-2" {...props} />,
                h1: ({ node, ...props }) => (
                  <h1 className="text-lg font-bold mt-3 mb-2" {...props} />
                ),
                h2: ({ node, ...props }) => (
                  <h2
                    className="text-base font-bold mt-2.5 mb-1.5"
                    {...props}
                  />
                ),
                h3: ({ node, ...props }) => (
                  <h3 className="text-sm font-bold mt-2 mb-1" {...props} />
                ),
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-2 border-(--vscode-textBlockQuote-border) bg-(--vscode-textBlockQuote-background) pl-3 py-1 my-2 italic"
                    {...props}
                  />
                ),
                a: ({ node, ...props }) => (
                  <a
                    className="text-(--vscode-textLink-foreground) hover:text-(--vscode-textLink-activeForeground) underline"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  />
                ),
                table: ({ node, ...props }) => (
                  <div className="overflow-x-auto my-2">
                    <table
                      className="min-w-full border border-(--vscode-panel-border) text-xs"
                      {...props}
                    />
                  </div>
                ),
                th: ({ node, ...props }) => (
                  <th
                    className="border border-(--vscode-panel-border) px-2 py-1 bg-(--vscode-textCodeBlock-background) font-semibold text-left"
                    {...props}
                  />
                ),
                td: ({ node, ...props }) => (
                  <td
                    className="border border-(--vscode-panel-border) px-2 py-1"
                    {...props}
                  />
                ),
                hr: ({ node, ...props }) => (
                  <hr
                    className="my-3 border-t border-(--vscode-panel-border)"
                    {...props}
                  />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-current animate-pulse rounded-sm align-middle" />
          )}
        </div>
        <span
          className={`text-[11px] text-(--vscode-descriptionForeground) opacity-60 px-1 font-medium ${
            isUser ? "text-right" : "text-left"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
};

export default App;
