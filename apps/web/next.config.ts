import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app"],
  serverExternalPackages: [
    "@prisma/adapter-better-sqlite3",
    "@prisma/client",
    "better-sqlite3",
  ],
  turbopack: {
    root: path.resolve(appRoot, "../.."),
  },
};

export default nextConfig;
