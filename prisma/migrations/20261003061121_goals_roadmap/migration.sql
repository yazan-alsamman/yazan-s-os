-- CreateEnum
CREATE TYPE "goal_type" AS ENUM ('north_star', 'annual_objective', 'quarterly_goal');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('draft', 'active', 'on_hold', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "goal_confidence" AS ENUM ('low', 'medium', 'high');

-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "goal_id" UUID;

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "title" TEXT NOT NULL,
    "type" "goal_type" NOT NULL,
    "description" TEXT,
    "outcome" TEXT,
    "metric" TEXT,
    "unit" TEXT,
    "baseline" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "start_date" DATE,
    "deadline" DATE,
    "status" "goal_status" NOT NULL DEFAULT 'draft',
    "completed_at" DATE,
    "confidence" "goal_confidence",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_projects" (
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_projects_pkey" PRIMARY KEY ("goal_id","project_id")
);

-- CreateTable
CREATE TABLE "goal_skills" (
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_skills_pkey" PRIMARY KEY ("goal_id","skill_id")
);

-- CreateTable
CREATE TABLE "goal_dependencies" (
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "depends_on_goal_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_dependencies_pkey" PRIMARY KEY ("goal_id","depends_on_goal_id")
);

-- CreateTable
CREATE TABLE "goal_measurements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_user_id_status_deadline_idx" ON "goals"("user_id", "status", "deadline");

-- CreateIndex
CREATE INDEX "goals_parent_id_idx" ON "goals"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "goals_id_user_id_key" ON "goals"("id", "user_id");

-- CreateIndex
CREATE INDEX "goal_projects_project_id_idx" ON "goal_projects"("project_id");

-- CreateIndex
CREATE INDEX "goal_skills_skill_id_idx" ON "goal_skills"("skill_id");

-- CreateIndex
CREATE INDEX "goal_dependencies_depends_on_goal_id_idx" ON "goal_dependencies"("depends_on_goal_id");

-- CreateIndex
CREATE INDEX "goal_measurements_goal_id_date_idx" ON "goal_measurements"("goal_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "goal_measurements_id_user_id_key" ON "goal_measurements"("id", "user_id");

-- CreateIndex
CREATE INDEX "milestones_goal_id_idx" ON "milestones"("goal_id");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_id_user_id_fkey" FOREIGN KEY ("parent_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_projects" ADD CONSTRAINT "goal_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_projects" ADD CONSTRAINT "goal_projects_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_projects" ADD CONSTRAINT "goal_projects_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skills" ADD CONSTRAINT "goal_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skills" ADD CONSTRAINT "goal_skills_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_skills" ADD CONSTRAINT "goal_skills_skill_id_user_id_fkey" FOREIGN KEY ("skill_id", "user_id") REFERENCES "skills"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_depends_on_goal_id_user_id_fkey" FOREIGN KEY ("depends_on_goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_measurements" ADD CONSTRAINT "goal_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_measurements" ADD CONSTRAINT "goal_measurements_goal_id_user_id_fkey" FOREIGN KEY ("goal_id", "user_id") REFERENCES "goals"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules not expressible in Prisma (ADRs 0031–0033)
ALTER TABLE "goals" ADD CONSTRAINT "goals_title_not_blank_chk" CHECK (length(btrim("title")) > 0 AND length("title") <= 200);
ALTER TABLE "goals" ADD CONSTRAINT "goals_completion_chk" CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL));
ALTER TABLE "goals" ADD CONSTRAINT "goals_dates_chk" CHECK ("deadline" IS NULL OR "start_date" IS NULL OR "deadline" >= "start_date");
ALTER TABLE "goals" ADD CONSTRAINT "goals_not_own_parent_chk" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "goal_dependencies" ADD CONSTRAINT "goal_dependencies_not_self_chk" CHECK ("goal_id" <> "depends_on_goal_id");
ALTER TABLE "goal_measurements" ADD CONSTRAINT "goal_measurements_finite_chk" CHECK ("value" = "value" AND "value" <> 'Infinity'::float8 AND "value" <> '-Infinity'::float8);
