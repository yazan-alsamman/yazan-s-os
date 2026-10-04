-- CreateEnum
CREATE TYPE "opportunity_type" AS ENUM ('role', 'consulting', 'freelance', 'speaking', 'partnership', 'other');

-- CreateEnum
CREATE TYPE "opportunity_status" AS ENUM ('identified', 'applied', 'interviewing', 'offer', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "opportunity_priority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "requirement_importance" AS ENUM ('required', 'preferred');

-- CreateEnum
CREATE TYPE "requirement_kind" AS ENUM ('skill', 'technology', 'certification', 'experience', 'domain', 'architecture', 'ai_ml', 'other');

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "github_resource_id" TEXT,
ADD COLUMN     "github_resource_type" TEXT;

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "organization" TEXT,
    "type" "opportunity_type" NOT NULL DEFAULT 'role',
    "status" "opportunity_status" NOT NULL DEFAULT 'identified',
    "priority" "opportunity_priority" NOT NULL DEFAULT 'medium',
    "description" TEXT,
    "source" TEXT,
    "source_url" TEXT,
    "location" TEXT,
    "deadline" DATE,
    "next_action" TEXT,
    "notes" TEXT,
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_requirements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "kind" "requirement_kind" NOT NULL DEFAULT 'other',
    "label" TEXT NOT NULL,
    "description" TEXT,
    "importance" "requirement_importance" NOT NULL DEFAULT 'required',
    "skill_id" UUID,
    "technology_id" UUID,
    "certification_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunity_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_evidence" (
    "user_id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_evidence_pkey" PRIMARY KEY ("requirement_id","evidence_id")
);

-- CreateIndex
CREATE INDEX "opportunities_user_id_status_idx" ON "opportunities"("user_id", "status");

-- CreateIndex
CREATE INDEX "opportunities_user_id_type_idx" ON "opportunities"("user_id", "type");

-- CreateIndex
CREATE INDEX "opportunities_user_id_deadline_idx" ON "opportunities"("user_id", "deadline");

-- CreateIndex
CREATE INDEX "opportunities_import_record_id_idx" ON "opportunities"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_id_user_id_key" ON "opportunities"("id", "user_id");

-- CreateIndex
CREATE INDEX "opportunity_requirements_opportunity_id_idx" ON "opportunity_requirements"("opportunity_id");

-- CreateIndex
CREATE INDEX "opportunity_requirements_user_id_kind_idx" ON "opportunity_requirements"("user_id", "kind");

-- CreateIndex
CREATE INDEX "opportunity_requirements_skill_id_idx" ON "opportunity_requirements"("skill_id");

-- CreateIndex
CREATE INDEX "opportunity_requirements_technology_id_idx" ON "opportunity_requirements"("technology_id");

-- CreateIndex
CREATE INDEX "opportunity_requirements_certification_id_idx" ON "opportunity_requirements"("certification_id");

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_requirements_id_user_id_key" ON "opportunity_requirements"("id", "user_id");

-- CreateIndex
CREATE INDEX "requirement_evidence_evidence_id_idx" ON "requirement_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "requirement_evidence_user_id_idx" ON "requirement_evidence"("user_id");

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_opportunity_id_user_id_fkey" FOREIGN KEY ("opportunity_id", "user_id") REFERENCES "opportunities"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_technology_id_fkey" FOREIGN KEY ("technology_id") REFERENCES "technologies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_requirements" ADD CONSTRAINT "opportunity_requirements_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_evidence" ADD CONSTRAINT "requirement_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_evidence" ADD CONSTRAINT "requirement_evidence_requirement_id_user_id_fkey" FOREIGN KEY ("requirement_id", "user_id") REFERENCES "opportunity_requirements"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_evidence" ADD CONSTRAINT "requirement_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;
