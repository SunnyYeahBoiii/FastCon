import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(APP_ROOT, ".env.local") });
dotenv.config({ path: path.join(APP_ROOT, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --import tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
