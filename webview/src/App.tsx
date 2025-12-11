import React, { useState, useEffect, useRef } from "react";
import { Message } from "./types";
import { vscode } from "./vscode";
import { Trash2, Send, Square } from "lucide-react";

console.log("[Chat App] Initializing...");

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "userMessage":
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
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
          break;

        case "error":
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              content: `❌ ${message.message}`,
              timestamp: Date.now(),
            },
          ]);
          setIsLoading(false);
          break;

        case "clearMessages":
          setMessages([]);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleSend = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && !isLoading) {
      vscode.postMessage({ type: "sendMessage", message: trimmedValue });
      setInputValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    vscode.postMessage({ type: "clearHistory" });
  };

  const handleStop = () => {
    vscode.postMessage({ type: "stopGeneration" });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
  };

  return (
    <div className="flex flex-col h-screen bg-(--vscode-sideBar-background)">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--vscode-panel-border)">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-(--vscode-button-background) flex items-center justify-center text-xs font-semibold text-(--vscode-button-foreground)">
            AI
          </div>
          <h3 className="text-sm font-medium text-(--vscode-foreground)">
            AI 聊天助手
          </h3>
        </div>
        <button
          onClick={handleClear}
          className="h-7 w-7 flex items-center justify-center text-(--vscode-icon-foreground) hover:bg-(--vscode-toolbar-hoverBackground) rounded transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3 opacity-20">💬</div>
            <p className="text-sm text-(--vscode-descriptionForeground)">
              开始对话
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-(--vscode-panel-border)">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="发送消息..."
            disabled={isLoading}
            rows={1}
            className="flex-1 min-h-[32px] max-h-[100px] resize-none bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded px-3 py-2 text-sm placeholder:text-[var(--vscode-input-placeholderForeground)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
          />
          {!isLoading ? (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="h-9 w-9 shrink-0 flex items-center justify-center bg-(--vscode-button-background) text-(--vscode-button-foreground) rounded hover:bg-(--vscode-button-hoverBackground) disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} />
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="h-9 w-9 shrink-0 flex items-center justify-center bg-(--vscode-inputValidation-errorBackground) text-white rounded hover:opacity-80 transition-opacity"
            >
              <Square size={16} fill="currentColor" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === "user";

  const renderContent = (content: string) => {
    let rendered = content.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      (_, lang, code) => {
        return `<pre class="my-2 p-2 rounded bg-(--vscode-textCodeBlock-background) border border-(--vscode-panel-border) overflow-x-auto"><code class="text-xs text-(--vscode-textCodeBlock-foreground)">${escapeHtml(
          code.trim()
        )}</code></pre>`;
      }
    );

    rendered = rendered.replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 rounded bg-(--vscode-textCodeBlock-background) text-(--vscode-textCodeBlock-foreground) text-xs">$1</code>'
    );

    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    rendered = rendered.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    rendered = rendered.replace(/\n/g, "<br>");

    return rendered;
  };

  const escapeHtml = (text: string) => {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
          isUser
            ? "bg-(--vscode-button-background) text-(--vscode-button-foreground)"
            : "bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground)"
        }`}
      >
        {isUser ? "U" : "AI"}
      </div>
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div
          className={`px-3 py-2 text-sm leading-relaxed rounded-lg ${
            isUser
              ? "bg-(--vscode-button-background) text-(--vscode-button-foreground)"
              : "bg-(--vscode-input-background) border border-(--vscode-panel-border)"
          }`}
        >
          <div
            dangerouslySetInnerHTML={{ __html: renderContent(message.content) }}
          />
          {message.isStreaming && (
            <span className="inline-block w-1.5 h-3.5 ml-1 bg-current animate-pulse rounded-sm align-middle" />
          )}
        </div>
        <span
          className={`text-xs text-(--vscode-descriptionForeground) px-1 ${
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
