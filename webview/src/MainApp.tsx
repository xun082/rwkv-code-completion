import React, { useEffect, useState } from "react";
import ChatApp from "./App";
import GitCommit from "./GitCommit";

// 声明全局类型
declare global {
  interface Window {
    __VIEW_TYPE__?: string;
  }
}

const MainApp: React.FC = () => {
  const [viewType, setViewType] = useState<string>("chat");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const type = window.__VIEW_TYPE__ || "chat";
    setViewType(type);
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "var(--vscode-foreground)",
        }}
      >
        加载中...
      </div>
    );
  }

  // 根据 VIEW_TYPE 渲染对应组件
  if (viewType === "git") {
    return <GitCommit />;
  }

  return <ChatApp />;
};

export default MainApp;
