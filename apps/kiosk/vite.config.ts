import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Build-only: the kiosk is a native app (`pnpm cap:sync` builds this bundle
// into ios/). There is no browser dev server — use apps/emulator for that.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
