import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: same-origin, the socket proxied to the local realtime service. Prod: a
// static bundle with VITE_REALTIME_URL baked in; ?server=… repoints at runtime.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": {
        target: "http://localhost:6101",
        ws: true,
      },
    },
  },
});
