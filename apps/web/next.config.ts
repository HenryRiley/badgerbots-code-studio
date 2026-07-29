import type { NextConfig } from "next";
import path from "node:path";

const classroomStaticDeployment = process.env.BADGERBOTS_CLASSROOM_STATIC_DEPLOYMENT === "1";

const nextConfig: NextConfig = {
  output: "export",
  ...(classroomStaticDeployment ? { basePath: "/classroom" } : {}),
  env: {
    NEXT_PUBLIC_BADGERBOTS_CLASSROOM_AT_ROOT: classroomStaticDeployment ? "1" : "0",
  },
  trailingSlash: true,
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
