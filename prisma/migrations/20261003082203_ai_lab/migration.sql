-- CreateEnum
CREATE TYPE "experiment_status" AS ENUM ('planned', 'active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "experiment_decision" AS ENUM ('adopt', 'reject', 'inconclusive');

-- CreateEnum
CREATE TYPE "experiment_run_status" AS ENUM ('completed', 'failed', 'aborted');

-- CreateTable
CREATE TABLE "ai_experiments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "hypothesis" TEXT,
    "objective" TEXT,
    "category" TEXT,
    "status" "experiment_status" NOT NULL DEFAULT 'planned',
    "decision" "experiment_decision",
    "result" TEXT,
    "reproducibility_note" TEXT,
    "started_at" DATE,
    "completed_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ai_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "experiment_id" UUID NOT NULL,
    "run_number" INTEGER NOT NULL,
    "label" TEXT,
    "status" "experiment_run_status" NOT NULL DEFAULT 'completed',
    "model" TEXT,
    "model_version" TEXT,
    "provider" TEXT,
    "prompt_version" TEXT,
    "dataset_name" TEXT,
    "dataset_version" TEXT,
    "code_ref" TEXT,
    "environment" TEXT,
    "run_at" DATE,
    "cost_usd" DOUBLE PRECISION,
    "latency_ms" DOUBLE PRECISION,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "experiment_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_metrics" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "higher_is_better" BOOLEAN,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_evidence" (
    "user_id" UUID NOT NULL,
    "experiment_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_evidence_pkey" PRIMARY KEY ("experiment_id","evidence_id")
);

-- CreateIndex
CREATE INDEX "ai_experiments_user_id_status_idx" ON "ai_experiments"("user_id", "status");

-- CreateIndex
CREATE INDEX "ai_experiments_user_id_created_at_idx" ON "ai_experiments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_experiments_project_id_idx" ON "ai_experiments"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_experiments_id_user_id_key" ON "ai_experiments"("id", "user_id");

-- CreateIndex
CREATE INDEX "experiment_runs_experiment_id_idx" ON "experiment_runs"("experiment_id");

-- CreateIndex
CREATE INDEX "experiment_runs_user_id_idx" ON "experiment_runs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_runs_id_user_id_key" ON "experiment_runs"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_runs_experiment_id_run_number_key" ON "experiment_runs"("experiment_id", "run_number");

-- CreateIndex
CREATE INDEX "experiment_metrics_run_id_idx" ON "experiment_metrics"("run_id");

-- CreateIndex
CREATE INDEX "experiment_evidence_evidence_id_idx" ON "experiment_evidence"("evidence_id");

-- AddForeignKey
ALTER TABLE "ai_experiments" ADD CONSTRAINT "ai_experiments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_experiments" ADD CONSTRAINT "ai_experiments_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_runs" ADD CONSTRAINT "experiment_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_runs" ADD CONSTRAINT "experiment_runs_experiment_id_user_id_fkey" FOREIGN KEY ("experiment_id", "user_id") REFERENCES "ai_experiments"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_metrics" ADD CONSTRAINT "experiment_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_metrics" ADD CONSTRAINT "experiment_metrics_run_id_user_id_fkey" FOREIGN KEY ("run_id", "user_id") REFERENCES "experiment_runs"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_evidence" ADD CONSTRAINT "experiment_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_evidence" ADD CONSTRAINT "experiment_evidence_experiment_id_user_id_fkey" FOREIGN KEY ("experiment_id", "user_id") REFERENCES "ai_experiments"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_evidence" ADD CONSTRAINT "experiment_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 6 domain invariants (ADRs 0036–0040). Appended to the generated migration.
ALTER TABLE "ai_experiments"
  ADD CONSTRAINT "ai_experiments_title_not_blank_chk" CHECK (length(btrim("title")) > 0);
ALTER TABLE "ai_experiments"
  ADD CONSTRAINT "ai_experiments_dates_chk"
  CHECK ("completed_at" IS NULL OR "started_at" IS NULL OR "completed_at" >= "started_at");

ALTER TABLE "experiment_runs"
  ADD CONSTRAINT "experiment_runs_number_positive_chk" CHECK ("run_number" >= 1);
ALTER TABLE "experiment_runs"
  ADD CONSTRAINT "experiment_runs_cost_chk" CHECK ("cost_usd" IS NULL OR "cost_usd" >= 0);
ALTER TABLE "experiment_runs"
  ADD CONSTRAINT "experiment_runs_latency_chk" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0);
ALTER TABLE "experiment_runs"
  ADD CONSTRAINT "experiment_runs_tokens_in_chk" CHECK ("tokens_input" IS NULL OR "tokens_input" >= 0);
ALTER TABLE "experiment_runs"
  ADD CONSTRAINT "experiment_runs_tokens_out_chk" CHECK ("tokens_output" IS NULL OR "tokens_output" >= 0);

ALTER TABLE "experiment_metrics"
  ADD CONSTRAINT "experiment_metrics_value_finite_chk" CHECK ("value" = "value" AND "value" <> 'Infinity'::double precision AND "value" <> '-Infinity'::double precision);
ALTER TABLE "experiment_metrics"
  ADD CONSTRAINT "experiment_metrics_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
