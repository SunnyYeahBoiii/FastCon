import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";
import { hashPassword } from "../lib/auth";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminPasswordHash = await hashPassword("admin123");

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      passwordHash: adminPasswordHash,
      name: "Admin Hệ Thống",
      role: "admin",
    },
  });

  console.log("Created admin user:", admin);

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

  console.log("Created contest 1:", contest1);

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

  console.log("Created contest 2:", contest2);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
