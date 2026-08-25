import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev: same-origin like the kiosk — Vite forwards the socket to the local
// realtime service. Prod: a static bundle with the realtime URL baked in via
// VITE_REALTIME_URL (see Dockerfile); the page can still be repointed at
// runtime with ?server=… .
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:6101",
        ws: true,
      },
    },
  },
});
