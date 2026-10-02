import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_URL is optional here so that `prisma generate`/`validate` work without a
// database (CI, fresh clones). Commands that need a connection fail loudly if unset.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
