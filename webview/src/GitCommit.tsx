import React, { useState, useEffect, useRef } from "react";
import { vscode } from "./vscode";
import {
  FileText,
  Sparkles,
  Check,
  ChevronDown,
  RefreshCw,
} from "lucide-react";

interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
  untracked: string[];
}

const GitCommit: React.FC = () => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 请求初始状态
    vscode.postMessage({ type: "getStatus" });

    // 监听来自扩展的消息
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case "statusUpdate":
          setStatus(message.status);
          break;
        case "messageGenerated":
          setCommitMessage(message.message);
          break;
        case "generating":
          setIsGenerating(message.isGenerating);
          break;
        case "commitSuccess":
          setCommitMessage("");
          vscode.postMessage({ type: "getStatus" });
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleGenerate = () => {
    vscode.postMessage({ type: "generateMessage" });
  };

  const handleCommit = () => {
    if (commitMessage.trim()) {
      vscode.postMessage({
        type: "commit",
        message: commitMessage.trim(),
      });
    }
  };

  const getTotalChanges = () => {
    if (!status) return 0;
    return (
      status.added.length +
      status.modified.length +
      status.deleted.length +
      status.renamed.length +
      status.untracked.length
    );
  };

  const hasChanges = getTotalChanges() > 0;

  return (
    <div className="flex flex-col h-full bg-(--vscode-sideBar-background)">
      {/* 顶部提交区域 */}
      <div className="border-b border-(--vscode-sideBarSectionHeader-border)">
        {/* 提交信息输入框 + AI 按钮 */}
        <div className="p-2 flex gap-1">
          <input
            type="text"
            ref={textareaRef as any}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="AI 生成提交消息 (自动识别类型)"
            className="flex-1 h-[32px] bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) px-3 py-1.5 text-[13px] focus:outline-none focus:border-(--vscode-focusBorder) placeholder:text-(--vscode-input-placeholderForeground) rounded"
          />

          <button
            onClick={handleGenerate}
            disabled={!hasChanges || isGenerating}
            className="w-[32px] h-[32px] bg-transparent text-(--vscode-foreground) border border-(--vscode-input-border) flex items-center justify-center rounded disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-(--vscode-toolbar-hoverBackground) transition-colors"
            title="AI 自动生成提交信息"
          >
            {isGenerating ? (
              <div className="flex gap-0.5">
                <span
                  className="w-1 h-1 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></span>
                <span
                  className="w-1 h-1 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                ></span>
                <span
                  className="w-1 h-1 bg-current rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></span>
              </div>
            ) : (
              <Sparkles size={16} />
            )}
          </button>
        </div>

        {/* 提交按钮 */}
        <div className="px-2 pb-2">
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || isGenerating}
            className="w-full h-[28px] bg-[#0e639c] text-white flex items-center justify-center gap-2 text-[13px] font-normal disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-[#1177bb] transition-all"
          >
            <Check size={15} strokeWidth={2.5} />
            <span>提交</span>
            <ChevronDown size={13} className="opacity-80" />
          </button>
        </div>
      </div>

      {/* 文件列表区域 - 原生 VSCode 样式 */}
      <div className="flex-1 overflow-y-auto">
        {/* 更改标题 - 原生样式 */}
        <div className="h-[22px] px-2 flex items-center justify-between text-[11px] font-bold text-(--vscode-sideBarSectionHeader-foreground) bg-(--vscode-sideBarSectionHeader-background) border-t border-(--vscode-sideBarSectionHeader-border)">
          <span>更改</span>
          {getTotalChanges() > 0 && (
            <span className="bg-(--vscode-badge-background) text-(--vscode-badge-foreground) min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[11px] font-semibold">
              {getTotalChanges()}
            </span>
          )}
        </div>

        {/* 文件列表 */}
        {!status ? (
          <div className="py-10 text-center text-[13px] text-(--vscode-descriptionForeground)">
            <RefreshCw
              size={20}
              className="mx-auto mb-3 animate-spin opacity-40"
            />
            <div>加载中...</div>
          </div>
        ) : !hasChanges ? (
          <div className="py-10 text-center text-[13px] text-(--vscode-descriptionForeground)">
            <Check size={24} className="mx-auto mb-3 opacity-20" />
            <div>没有更改</div>
          </div>
        ) : (
          <div className="py-0.5">
            {status.added.map((file, i) => (
              <div
                key={`added-${i}`}
                className="h-[22px] px-2 flex items-center gap-2 text-[13px] hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
              >
                <span className="shrink-0 text-[11px] font-semibold text-[#89d185] w-[14px] text-center">
                  A
                </span>
                <FileText
                  size={16}
                  className="shrink-0 opacity-60"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-(--vscode-foreground)">
                  {file}
                </span>
              </div>
            ))}
            {status.modified.map((file, i) => (
              <div
                key={`modified-${i}`}
                className="h-[22px] px-2 flex items-center gap-2 text-[13px] hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
              >
                <span className="shrink-0 text-[11px] font-semibold text-[#e2c08d] w-[14px] text-center">
                  M
                </span>
                <FileText
                  size={16}
                  className="shrink-0 opacity-60"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-(--vscode-foreground)">
                  {file}
                </span>
              </div>
            ))}
            {status.deleted.map((file, i) => (
              <div
                key={`deleted-${i}`}
                className="h-[22px] px-2 flex items-center gap-2 text-[13px] hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
              >
                <span className="shrink-0 text-[11px] font-semibold text-[#f48771] w-[14px] text-center">
                  D
                </span>
                <FileText
                  size={16}
                  className="shrink-0 opacity-60"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-(--vscode-foreground) opacity-70">
                  {file}
                </span>
              </div>
            ))}
            {status.renamed.map((file, i) => (
              <div
                key={`renamed-${i}`}
                className="h-[22px] px-2 flex items-center gap-2 text-[13px] hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
              >
                <span className="shrink-0 text-[11px] font-semibold text-[#73c991] w-[14px] text-center">
                  R
                </span>
                <FileText
                  size={16}
                  className="shrink-0 opacity-60"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-(--vscode-foreground)">
                  {file}
                </span>
              </div>
            ))}
            {status.untracked.map((file, i) => (
              <div
                key={`untracked-${i}`}
                className="h-[22px] px-2 flex items-center gap-2 text-[13px] hover:bg-(--vscode-list-hoverBackground) cursor-pointer"
              >
                <span className="shrink-0 text-[11px] font-semibold text-[#73c991] w-[14px] text-center">
                  U
                </span>
                <FileText
                  size={16}
                  className="shrink-0 opacity-60"
                  strokeWidth={1.5}
                />
                <span className="flex-1 truncate text-(--vscode-foreground)">
                  {file}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GitCommit;
