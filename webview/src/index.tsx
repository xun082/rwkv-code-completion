import React from "react";
import { createRoot } from "react-dom/client";
import MainApp from "./MainApp";
import "./index.css";

console.log("[Index] ===== RWKV Webview Starting =====");
console.log("[Index] window.__VIEW_TYPE__:", window.__VIEW_TYPE__);
console.log("[Index] Searching for root container...");

const container = document.getElementById("root");

if (container) {
  console.log("[Index] ✅ Root container found!");
  console.log("[Index] Creating React root...");

  const root = createRoot(container);

  console.log("[Index] Rendering MainApp component...");
  root.render(
    <React.StrictMode>
      <MainApp />
    </React.StrictMode>
  );

  console.log("[Index] ✅ MainApp rendered successfully!");
} else {
  console.error("[Index] ❌ ERROR: Root container NOT found!");
  console.error("[Index] document.body:", document.body);
  console.error("[Index] document.body.innerHTML:", document.body?.innerHTML);
}
