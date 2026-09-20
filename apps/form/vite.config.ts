import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The form talks to the CMS same-origin: `/api/survey-start` and
// `POST /api/survey-responses`. Dev: Vite forwards them to the local CMS
// (:6100). Prod: nginx forwards exactly those two paths to the cms container
// (apps/form/nginx.conf) — so the CMS needs no CORS entry for this app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:6100", changeOrigin: false },
    },
  },
});
