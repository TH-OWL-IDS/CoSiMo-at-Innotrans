import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Shared workspace package is TS-only; let Next transpile it.
  transpilePackages: ["@cosimo/shared"],
  reactStrictMode: true,
};

export default withPayload(nextConfig);
