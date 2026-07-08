import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: the kiosk talks same-origin (like the packaged native app talks
// to one server URL); Vite forwards the socket to realtime and /api to Payload.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:4000",
        ws: true,
      },
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
