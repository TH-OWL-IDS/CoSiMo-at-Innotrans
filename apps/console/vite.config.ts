import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: same-origin like the kiosk — Vite forwards the socket to the local
// realtime service. Prod: a static bundle with the realtime URL baked in via
// VITE_REALTIME_URL (see Dockerfile); the page can still be repointed at
// runtime with ?server=… .
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
      },
    },
  },
});
