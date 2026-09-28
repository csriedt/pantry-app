import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components gates every `'use cache'` variant (`cacheTag`,
  // `cacheLife`, `updateTag`). Server-side caching is parked for
  // OpenNext/Cloudflare production deploys (see the pet store cached
  // action), but enabled for the local/Node showcase.
  cacheComponents: true,
  // Pin the workspace root: a stray package-lock.json outside the repo makes
  // Turbopack guess the wrong root otherwise.
  turbopack: { root: process.cwd() },
};

export default nextConfig;
