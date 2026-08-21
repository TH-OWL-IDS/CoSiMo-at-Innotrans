import { withPayload } from "@payloadcms/next/withPayload";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Local dev: load the gitignored monorepo-root .env.local before Next reads env
// (so NEXT_PUBLIC_* are inlined too). No-op in Docker, where compose injects env.
const rootEnvLocal = fileURLToPath(new URL("../../.env.local", import.meta.url));
try {
  if (existsSync(rootEnvLocal)) process.loadEnvFile(rootEnvLocal);
} catch {
  // ignore — fall back to the ambient environment
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared workspace package is TS-only; let Next transpile it.
  transpilePackages: ["@cosimo/shared"],
  reactStrictMode: true,
  // @cosimo/shared uses ESM ".js" import specifiers that resolve to ".ts"
  // sources. tsx/tsc handle this; teach the Next bundler the same mapping.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default withPayload(nextConfig);
