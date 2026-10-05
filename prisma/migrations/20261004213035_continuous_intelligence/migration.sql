-- CreateEnum
CREATE TYPE "intelligence_signal_type" AS ENUM ('skill_stale', 'skill_aging', 'opportunity_gap', 'opportunity_deadline', 'evidence_candidate', 'weekly_review');

-- CreateEnum
CREATE TYPE "intelligence_severity" AS ENUM ('info', 'attention', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "intelligence_status" AS ENUM ('active', 'reviewed', 'dismissed', 'resolved');

-- CreateEnum
CREATE TYPE "evidence_candidate_status" AS ENUM ('candidate', 'accepted', 'rejected');

-- CreateTable
CREATE TABLE "intelligence_signals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "intelligence_signal_type" NOT NULL,
    "severity" "intelligence_severity" NOT NULL DEFAULT 'info',
    "status" "intelligence_status" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "metadata" JSONB,
    "detected_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurred_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "dismissed_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "intelligence_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_candidates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "suggested_type" "evidence_type" NOT NULL,
    "suggested_title" TEXT NOT NULL,
    "suggested_date" DATE,
    "source_url" TEXT,
    "repo_full_name" TEXT,
    "confidence" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" "evidence_candidate_status" NOT NULL DEFAULT 'candidate',
    "github_resource_type" TEXT,
    "github_resource_id" TEXT,
    "accepted_evidence_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evidence_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "coverage" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intelligence_signals_user_id_status_severity_idx" ON "intelligence_signals"("user_id", "status", "severity");

-- CreateIndex
CREATE INDEX "intelligence_signals_user_id_type_status_idx" ON "intelligence_signals"("user_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "intelligence_signals_user_id_dedupe_key_key" ON "intelligence_signals"("user_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "evidence_candidates_user_id_status_idx" ON "evidence_candidates"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_candidates_user_id_source_type_source_id_key" ON "evidence_candidates"("user_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "weekly_reviews_user_id_week_start_idx" ON "weekly_reviews"("user_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reviews_user_id_week_start_key" ON "weekly_reviews"("user_id", "week_start");

-- AddForeignKey
ALTER TABLE "intelligence_signals" ADD CONSTRAINT "intelligence_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_candidates" ADD CONSTRAINT "evidence_candidates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
