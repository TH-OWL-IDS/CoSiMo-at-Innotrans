import { withPayload } from "@payloadcms/next/withPayload";

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
