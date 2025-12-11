import React, { useState, useEffect, useRef } from "react";
import { vscode } from "./vscode";
import {
  FileText,
  FilePlus,
  FileX,
  FileEdit,
  File,
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

console.log("[Git Commit] Initializing...");

const GitCommit: React.FC = () => {
  console.log("[Git Commit] Component rendering");

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
    <div className="flex flex-col h-full bg-[var(--vscode-sideBar-background)]">
      {/* 顶部提交区域 */}
      <div className="border-b border-[var(--vscode-sideBarSectionHeader-border)]">
        {/* 提交信息输入框 + AI 按钮 */}
        <div className="p-2 flex gap-1">
          <input
            type="text"
            ref={textareaRef as any}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="消息 (按 ⌘ 在 main 提交)"
            className="flex-1 h-[32px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] px-3 py-1.5 text-[13px] focus:outline-none focus:border-[var(--vscode-focusBorder)] placeholder:text-[var(--vscode-input-placeholderForeground)] rounded"
          />
          {/* AI 生成按钮 - 在输入框右边 */}
          <button
            onClick={handleGenerate}
            disabled={!hasChanges || isGenerating}
            className="w-[32px] h-[32px] bg-transparent text-[var(--vscode-foreground)] border border-[var(--vscode-input-border)] flex items-center justify-center rounded disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
            title="AI 生成提交信息"
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
        <div className="h-[22px] px-2 flex items-center justify-between text-[11px] font-bold text-[var(--vscode-sideBarSectionHeader-foreground)] bg-[var(--vscode-sideBarSectionHeader-background)] border-t border-[var(--vscode-sideBarSectionHeader-border)]">
          <span>更改</span>
          {getTotalChanges() > 0 && (
            <span className="bg-[var(--vscode-badge-background)] text-[var(--vscode-badge-foreground)] min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[11px] font-semibold">
              {getTotalChanges()}
            </span>
          )}
        </div>

        {/* 文件列表 */}
        {!status ? (
          <div className="py-10 text-center text-[13px] text-[var(--vscode-descriptionForeground)]">
            <RefreshCw
              size={20}
              className="mx-auto mb-3 animate-spin opacity-40"
            />
            <div>加载中...</div>
          </div>
        ) : !hasChanges ? (
          <div className="py-10 text-center text-[13px] text-[var(--vscode-descriptionForeground)]">
            <Check size={24} className="mx-auto mb-3 opacity-20" />
            <div>没有更改</div>
          </div>
        ) : (
          <div className="py-0.5">
            {status.added.map((file, i) => (
              <div
                key={`added-${i}`}
                className="h-[22px] px-2 flex items-center gap-1.5 text-[13px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              >
                <FilePlus
                  size={14}
                  className="flex-shrink-0 text-[#89d185]"
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-[var(--vscode-list-activeSelectionForeground)]">
                  {file}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-[#89d185] w-4 text-center">
                  A
                </span>
              </div>
            ))}
            {status.modified.map((file, i) => (
              <div
                key={`modified-${i}`}
                className="h-[22px] px-2 flex items-center gap-1.5 text-[13px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              >
                <FileEdit
                  size={14}
                  className="flex-shrink-0 text-[#e2c08d]"
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-[var(--vscode-list-activeSelectionForeground)]">
                  {file}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-[#e2c08d] w-4 text-center">
                  M
                </span>
              </div>
            ))}
            {status.deleted.map((file, i) => (
              <div
                key={`deleted-${i}`}
                className="h-[22px] px-2 flex items-center gap-1.5 text-[13px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              >
                <FileX
                  size={14}
                  className="flex-shrink-0 text-[#f48771]"
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-[var(--vscode-list-activeSelectionForeground)] line-through opacity-70">
                  {file}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-[#f48771] w-4 text-center">
                  D
                </span>
              </div>
            ))}
            {status.renamed.map((file, i) => (
              <div
                key={`renamed-${i}`}
                className="h-[22px] px-2 flex items-center gap-1.5 text-[13px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              >
                <FileText
                  size={14}
                  className="flex-shrink-0 text-[#73c991]"
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-[var(--vscode-list-activeSelectionForeground)]">
                  {file}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-[#73c991] w-4 text-center">
                  R
                </span>
              </div>
            ))}
            {status.untracked.map((file, i) => (
              <div
                key={`untracked-${i}`}
                className="h-[22px] px-2 flex items-center gap-1.5 text-[13px] hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              >
                <File
                  size={14}
                  className="flex-shrink-0 text-[var(--vscode-descriptionForeground)]"
                  strokeWidth={2}
                />
                <span className="flex-1 truncate text-[var(--vscode-list-activeSelectionForeground)] opacity-90">
                  {file}
                </span>
                <span className="flex-shrink-0 text-[11px] font-bold text-[var(--vscode-descriptionForeground)] w-4 text-center opacity-60">
                  ?
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
