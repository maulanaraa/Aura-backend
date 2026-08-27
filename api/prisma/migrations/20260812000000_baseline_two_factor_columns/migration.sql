-- Baseline migration: records the `two_factor_secret` / `is_two_factor_enabled`
-- columns that already exist on the live database (added previously via
-- `prisma db push`, never captured in a migration file). This migration is
-- marked as already-applied via `prisma migrate resolve --applied`, not run
-- directly, so it must exactly match what's already on the database.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "two_factor_secret" TEXT,
ADD COLUMN     "is_two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;
