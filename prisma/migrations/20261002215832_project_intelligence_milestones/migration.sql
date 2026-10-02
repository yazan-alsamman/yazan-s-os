-- CreateEnum
CREATE TYPE "milestone_status" AS ENUM ('planned', 'in_progress', 'blocked', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "due_date" DATE,
    "completed_at" DATE,
    "status" "milestone_status" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "milestones_project_id_due_date_idx" ON "milestones"("project_id", "due_date");

-- CreateIndex
CREATE INDEX "milestones_user_id_status_due_date_idx" ON "milestones"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "milestones_user_id_completed_at_idx" ON "milestones"("user_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_id_user_id_key" ON "milestones"("id", "user_id");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules not expressible in Prisma (ADR 0022)
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_title_not_blank_chk" CHECK (length(btrim("title")) > 0 AND length("title") <= 200);
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_completion_chk" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));
