// =============================================================================
// Vite設定ファイル
// =============================================================================
// Viteはフロントエンド開発ツール（ビルドツール）の設定ファイルです。
// ここでTailwind CSSプラグインと、APIプロキシの設定を行います。
// =============================================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(), // ReactのJSX変換を有効にする
    tailwindcss(), // Tailwind CSSを有効にする
  ],
  server: {
    // 開発サーバーのプロキシ設定
    // /api で始まるリクエストをバックエンドサーバー（port:8000）に転送する
    // これにより、フロントエンドからバックエンドへのCORSエラーを回避できます
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""), // /api プレフィックスを除去
      },
    },
  },
});
