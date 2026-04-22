import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import { hashPassword } from "../lib/auth";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(APP_ROOT, ".env.local") });
dotenv.config({ path: path.join(APP_ROOT, ".env") });

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || "admin123";

async function createAdmin() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash },
    create: {
      username: "admin",
      passwordHash,
      name: "Admin",
      role: "admin",
    },
  });

  console.log("Admin user:", admin.username);
  return admin;
}

async function seedFull() {
  await createAdmin();

  const contest1 = await prisma.contest.upsert({
    where: { id: "seed-contest-1" },
    update: {},
    create: {
      id: "seed-contest-1",
      title: "Task 1 - Sample Contest",
      description: "First sample contest for testing",
      status: "ongoing",
    },
  });
  console.log("Created contest:", contest1.title);

  const contest2 = await prisma.contest.upsert({
    where: { id: "seed-contest-2" },
    update: {},
    create: {
      id: "seed-contest-2",
      title: "Task 2 - Sample Contest",
      description: "Second sample contest for testing",
      status: "ongoing",
    },
  });
  console.log("Created contest:", contest2.title);
}

async function seedAdminOnly() {
  await createAdmin();
}

const adminOnly = process.argv.includes("--admin-only");

(adminOnly ? seedAdminOnly : seedFull)()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
