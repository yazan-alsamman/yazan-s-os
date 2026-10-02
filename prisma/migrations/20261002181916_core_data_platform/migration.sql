-- CreateEnum
CREATE TYPE "record_origin" AS ENUM ('manual', 'import');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('idea', 'discovery', 'architecture', 'development', 'validation', 'production', 'maintenance', 'archived');

-- CreateEnum
CREATE TYPE "project_health" AS ENUM ('not_assessed', 'on_track', 'at_risk', 'blocked');

-- CreateEnum
CREATE TYPE "certification_status" AS ENUM ('planned', 'in_progress', 'earned', 'revoked');

-- CreateEnum
CREATE TYPE "evidence_type" AS ENUM ('certificate', 'screenshot', 'architecture_diagram', 'repository', 'demo', 'production_metric', 'document', 'testimonial', 'publication', 'other');

-- CreateEnum
CREATE TYPE "technology_usage_type" AS ENUM ('core', 'supporting', 'infrastructure', 'tooling', 'other');

-- CreateEnum
CREATE TYPE "evidence_strength" AS ENUM ('weak', 'moderate', 'strong');

-- CreateEnum
CREATE TYPE "import_source" AS ENUM ('peos_json', 'csv', 'linkedin_csv');

-- CreateEnum
CREATE TYPE "import_job_status" AS ENUM ('pending_review', 'completed');

-- CreateEnum
CREATE TYPE "import_entity_type" AS ENUM ('profile', 'experience', 'education', 'skill', 'technology', 'certification', 'project', 'evidence');

-- CreateEnum
CREATE TYPE "import_validation_status" AS ENUM ('valid', 'invalid');

-- CreateEnum
CREATE TYPE "import_match" AS ENUM ('new', 'duplicate');

-- CreateEnum
CREATE TYPE "import_review_status" AS ENUM ('pending', 'accepted', 'rejected');

-- CreateEnum
CREATE TYPE "import_decision" AS ENUM ('create', 'update');

-- CreateEnum
CREATE TYPE "import_confidence" AS ENUM ('high', 'medium', 'low');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "location" TEXT,
    "website" TEXT,
    "professional_objective" TEXT,
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "description" TEXT,
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT,
    "field_of_study" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "description" TEXT,
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "level_model" TEXT NOT NULL DEFAULT 'peos-default-v1',
    "target_level" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technologies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT,
    "version" TEXT,
    "notes" TEXT,
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "technologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "category" TEXT,
    "issue_date" DATE,
    "expiry_date" DATE,
    "credential_id" TEXT,
    "verification_url" TEXT,
    "status" "certification_status" NOT NULL DEFAULT 'earned',
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "problem" TEXT,
    "solution" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'idea',
    "health_status" "project_health" NOT NULL DEFAULT 'not_assessed',
    "start_date" DATE,
    "target_date" DATE,
    "completed_at" DATE,
    "impact" TEXT,
    "repository_url" TEXT,
    "demo_url" TEXT,
    "production_url" TEXT,
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "evidence_type" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_url" TEXT,
    "file_url" TEXT,
    "date" DATE,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(3),
    "origin" "record_origin" NOT NULL DEFAULT 'manual',
    "import_record_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_skills" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_skills_pkey" PRIMARY KEY ("project_id","skill_id")
);

-- CreateTable
CREATE TABLE "technology_usages" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "technology_id" UUID NOT NULL,
    "usage_type" "technology_usage_type" NOT NULL DEFAULT 'core',
    "proficiency_evidence" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technology_usages_pkey" PRIMARY KEY ("project_id","technology_id")
);

-- CreateTable
CREATE TABLE "project_evidence" (
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_evidence_pkey" PRIMARY KEY ("project_id","evidence_id")
);

-- CreateTable
CREATE TABLE "skill_evidence" (
    "user_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "strength" "evidence_strength" NOT NULL DEFAULT 'moderate',
    "date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_evidence_pkey" PRIMARY KEY ("skill_id","evidence_id")
);

-- CreateTable
CREATE TABLE "certification_skills" (
    "user_id" UUID NOT NULL,
    "certification_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_skills_pkey" PRIMARY KEY ("certification_id","skill_id")
);

-- CreateTable
CREATE TABLE "certification_evidence" (
    "user_id" UUID NOT NULL,
    "certification_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_evidence_pkey" PRIMARY KEY ("certification_id","evidence_id")
);

-- CreateTable
CREATE TABLE "experience_evidence" (
    "user_id" UUID NOT NULL,
    "experience_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experience_evidence_pkey" PRIMARY KEY ("experience_id","evidence_id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "import_source" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "parser_version" TEXT NOT NULL,
    "status" "import_job_status" NOT NULL DEFAULT 'pending_review',
    "entity_hint" "import_entity_type",
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "invalid_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "entity_type" "import_entity_type" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "validation_status" "import_validation_status" NOT NULL,
    "validation_errors" JSONB,
    "confidence" "import_confidence" NOT NULL,
    "match" "import_match" NOT NULL DEFAULT 'new',
    "matched_entity_id" UUID,
    "review_status" "import_review_status" NOT NULL DEFAULT 'pending',
    "decision" "import_decision",
    "result_entity_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_import_record_id_idx" ON "profiles"("import_record_id");

-- CreateIndex
CREATE INDEX "experiences_user_id_start_date_idx" ON "experiences"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "experiences_import_record_id_idx" ON "experiences"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiences_id_user_id_key" ON "experiences"("id", "user_id");

-- CreateIndex
CREATE INDEX "education_user_id_start_date_idx" ON "education"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "education_import_record_id_idx" ON "education"("import_record_id");

-- CreateIndex
CREATE INDEX "skills_user_id_category_idx" ON "skills"("user_id", "category");

-- CreateIndex
CREATE INDEX "skills_import_record_id_idx" ON "skills"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_id_user_id_key" ON "skills"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_user_id_key_key" ON "skills"("user_id", "key");

-- CreateIndex
CREATE INDEX "technologies_user_id_category_idx" ON "technologies"("user_id", "category");

-- CreateIndex
CREATE INDEX "technologies_import_record_id_idx" ON "technologies"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "technologies_id_user_id_key" ON "technologies"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "technologies_user_id_key_key" ON "technologies"("user_id", "key");

-- CreateIndex
CREATE INDEX "certifications_user_id_status_idx" ON "certifications"("user_id", "status");

-- CreateIndex
CREATE INDEX "certifications_user_id_expiry_date_idx" ON "certifications"("user_id", "expiry_date");

-- CreateIndex
CREATE INDEX "certifications_import_record_id_idx" ON "certifications"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "certifications_id_user_id_key" ON "certifications"("id", "user_id");

-- CreateIndex
CREATE INDEX "projects_user_id_status_idx" ON "projects"("user_id", "status");

-- CreateIndex
CREATE INDEX "projects_user_id_updated_at_idx" ON "projects"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "projects_import_record_id_idx" ON "projects"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_id_user_id_key" ON "projects"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_user_id_slug_key" ON "projects"("user_id", "slug");

-- CreateIndex
CREATE INDEX "evidence_user_id_type_idx" ON "evidence"("user_id", "type");

-- CreateIndex
CREATE INDEX "evidence_user_id_date_idx" ON "evidence"("user_id", "date");

-- CreateIndex
CREATE INDEX "evidence_import_record_id_idx" ON "evidence"("import_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_id_user_id_key" ON "evidence"("id", "user_id");

-- CreateIndex
CREATE INDEX "project_skills_skill_id_idx" ON "project_skills"("skill_id");

-- CreateIndex
CREATE INDEX "technology_usages_technology_id_idx" ON "technology_usages"("technology_id");

-- CreateIndex
CREATE INDEX "project_evidence_evidence_id_idx" ON "project_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "skill_evidence_evidence_id_idx" ON "skill_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "certification_skills_skill_id_idx" ON "certification_skills"("skill_id");

-- CreateIndex
CREATE INDEX "certification_evidence_evidence_id_idx" ON "certification_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "experience_evidence_evidence_id_idx" ON "experience_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "import_jobs_user_id_created_at_idx" ON "import_jobs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "import_jobs_id_user_id_key" ON "import_jobs"("id", "user_id");

-- CreateIndex
CREATE INDEX "import_records_job_id_review_status_idx" ON "import_records"("job_id", "review_status");

-- CreateIndex
CREATE INDEX "import_records_user_id_review_status_idx" ON "import_records"("user_id", "review_status");

-- CreateIndex
CREATE UNIQUE INDEX "import_records_id_user_id_key" ON "import_records"("id", "user_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technologies" ADD CONSTRAINT "technologies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technologies" ADD CONSTRAINT "technologies_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_import_record_id_fkey" FOREIGN KEY ("import_record_id") REFERENCES "import_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_skill_id_user_id_fkey" FOREIGN KEY ("skill_id", "user_id") REFERENCES "skills"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technology_usages" ADD CONSTRAINT "technology_usages_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technology_usages" ADD CONSTRAINT "technology_usages_technology_id_user_id_fkey" FOREIGN KEY ("technology_id", "user_id") REFERENCES "technologies"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_evidence" ADD CONSTRAINT "project_evidence_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_evidence" ADD CONSTRAINT "project_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_skill_id_user_id_fkey" FOREIGN KEY ("skill_id", "user_id") REFERENCES "skills"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_evidence" ADD CONSTRAINT "skill_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_skills" ADD CONSTRAINT "certification_skills_certification_id_user_id_fkey" FOREIGN KEY ("certification_id", "user_id") REFERENCES "certifications"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_skills" ADD CONSTRAINT "certification_skills_skill_id_user_id_fkey" FOREIGN KEY ("skill_id", "user_id") REFERENCES "skills"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_evidence" ADD CONSTRAINT "certification_evidence_certification_id_user_id_fkey" FOREIGN KEY ("certification_id", "user_id") REFERENCES "certifications"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_evidence" ADD CONSTRAINT "certification_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_evidence" ADD CONSTRAINT "experience_evidence_experience_id_user_id_fkey" FOREIGN KEY ("experience_id", "user_id") REFERENCES "experiences"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_evidence" ADD CONSTRAINT "experience_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_job_id_user_id_fkey" FOREIGN KEY ("job_id", "user_id") REFERENCES "import_jobs"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Integrity constraints not expressible in the Prisma schema (ADR 0011) ─────
-- Non-blank required text
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_organization_not_blank_chk" CHECK (length(btrim("organization")) > 0);
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_title_not_blank_chk" CHECK (length(btrim("title")) > 0);
ALTER TABLE "education" ADD CONSTRAINT "education_institution_not_blank_chk" CHECK (length(btrim("institution")) > 0);
ALTER TABLE "skills" ADD CONSTRAINT "skills_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "technologies" ADD CONSTRAINT "technologies_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_issuer_not_blank_chk" CHECK (length(btrim("issuer")) > 0);
ALTER TABLE "projects" ADD CONSTRAINT "projects_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_title_not_blank_chk" CHECK (length(btrim("title")) > 0);

-- Normalised keys are lower-case and trimmed (duplicate detection, ADR 0011)
ALTER TABLE "skills" ADD CONSTRAINT "skills_key_normalised_chk" CHECK ("key" = lower(btrim("key")) AND length("key") > 0);
ALTER TABLE "technologies" ADD CONSTRAINT "technologies_key_normalised_chk" CHECK ("key" = lower(btrim("key")) AND length("key") > 0);

-- Project slugs: lower-case kebab-case, max 80
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length("slug") <= 80);

-- Date ordering
ALTER TABLE "experiences" ADD CONSTRAINT "experiences_dates_chk" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "education" ADD CONSTRAINT "education_dates_chk" CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_dates_chk" CHECK ("expiry_date" IS NULL OR "issue_date" IS NULL OR "expiry_date" >= "issue_date");
ALTER TABLE "projects" ADD CONSTRAINT "projects_target_date_chk" CHECK ("target_date" IS NULL OR "start_date" IS NULL OR "target_date" >= "start_date");
ALTER TABLE "projects" ADD CONSTRAINT "projects_completed_at_chk" CHECK ("completed_at" IS NULL OR "start_date" IS NULL OR "completed_at" >= "start_date");

-- Skill target level: generic bound; the level model validates the exact range (ADR 0013)
ALTER TABLE "skills" ADD CONSTRAINT "skills_target_level_range_chk" CHECK ("target_level" IS NULL OR ("target_level" >= 0 AND "target_level" <= 10));
ALTER TABLE "skills" ADD CONSTRAINT "skills_level_model_not_blank_chk" CHECK (length(btrim("level_model")) > 0);

-- Evidence verification consistency
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_verified_at_chk" CHECK (("verified" AND "verified_at" IS NOT NULL) OR (NOT "verified" AND "verified_at" IS NULL));


-- Import review queue consistency
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_decision_chk" CHECK (("review_status" = 'accepted') = ("decision" IS NOT NULL AND "result_entity_id" IS NOT NULL));
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_reviewed_chk" CHECK ("review_status" = 'pending' OR "reviewed_at" IS NOT NULL);
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_accept_valid_chk" CHECK ("review_status" <> 'accepted' OR "validation_status" = 'valid');
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_match_chk" CHECK (("match" = 'duplicate') = ("matched_entity_id" IS NOT NULL));
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_counts_chk" CHECK ("record_count" >= 0 AND "invalid_count" >= 0 AND "invalid_count" <= "record_count" AND "file_size" >= 0);
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_sha256_chk" CHECK ("file_sha256" ~ '^[0-9a-f]{64}$');
