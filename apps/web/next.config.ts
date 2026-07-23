import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  transpilePackages: [
    "@badgerbots/block-editor",
    "@badgerbots/java-dsl",
    "@badgerbots/program-model",
    "@badgerbots/runtime-protocol",
  ],
};

export default nextConfig;
