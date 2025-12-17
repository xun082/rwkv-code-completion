import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: path.join(__dirname, "webview/src/index.tsx"),
    },
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "webview/src"),
    },
  },
  output: {
    distPath: {
      root: path.join(__dirname, "dist/webview"),
      js: "assets",
      css: "assets",
    },
    filename: {
      js: "[name].js",
      css: "[name].css",
    },
    // 使用传统的全局变量模式，不使用 ES 模块
    target: "web",
    assetPrefix: "./",
  },
  html: {
    template: path.join(__dirname, "webview/index.html"),
    title: "RWKV Webview",
  },
  performance: {
    chunkSplit: {
      strategy: "all-in-one", // 所有代码打包到一个文件
    },
  },
  tools: {
    postcss: {
      postcssOptions: {
        plugins: [require("@tailwindcss/postcss"), require("autoprefixer")],
      },
    },
  },
});

