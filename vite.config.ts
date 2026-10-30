import {lineCardsPlugin} from './scripts/line-cards.mjs';
import { defineConfig } from "vite";
import {staticContentPlugin} from "./scripts/lib/static-build.mjs";
export default defineConfig(({command})=>({
  publicDir: command === "build" ? false : "public",
  plugins: [staticContentPlugin(),lineCardsPlugin()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { manifest: true, target: ["safari14.5", "chrome88"], assetsInlineLimit: 0, rollupOptions: { input: { app:'index.html', sharePreview:'review/social-share.html', lineShare:'line-share.html', jiangshiReview:'review/jiangshi-name.html' } } },
}));
