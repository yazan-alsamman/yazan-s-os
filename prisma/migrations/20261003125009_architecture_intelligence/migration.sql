-- CreateEnum
CREATE TYPE "decision_status" AS ENUM ('proposed', 'accepted', 'rejected', 'deprecated', 'superseded');

-- CreateEnum
CREATE TYPE "component_type" AS ENUM ('service', 'database', 'queue', 'external_api', 'ai_model', 'infrastructure');

-- CreateTable
CREATE TABLE "architecture_decisions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "problem" TEXT,
    "constraints" TEXT,
    "decision" TEXT,
    "consequences" TEXT,
    "status" "decision_status" NOT NULL DEFAULT 'proposed',
    "decided_at" DATE,
    "revisit_date" DATE,
    "superseded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "architecture_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "architecture_alternatives" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "pros" TEXT,
    "cons" TEXT,
    "rejected_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "architecture_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "architecture_decision_evidence" (
    "user_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "architecture_decision_evidence_pkey" PRIMARY KEY ("decision_id","evidence_id")
);

-- CreateTable
CREATE TABLE "architecture_components" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" "component_type" NOT NULL,
    "purpose" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "architecture_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_projects" (
    "user_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_projects_pkey" PRIMARY KEY ("decision_id","project_id")
);

-- CreateTable
CREATE TABLE "component_technologies" (
    "user_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "technology_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_technologies_pkey" PRIMARY KEY ("component_id","technology_id")
);

-- CreateTable
CREATE TABLE "component_projects" (
    "user_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_projects_pkey" PRIMARY KEY ("component_id","project_id")
);

-- CreateTable
CREATE TABLE "component_dependencies" (
    "user_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "depends_on_component_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_dependencies_pkey" PRIMARY KEY ("component_id","depends_on_component_id")
);

-- CreateTable
CREATE TABLE "decision_components" (
    "user_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_components_pkey" PRIMARY KEY ("decision_id","component_id")
);

-- CreateIndex
CREATE INDEX "architecture_decisions_user_id_status_idx" ON "architecture_decisions"("user_id", "status");

-- CreateIndex
CREATE INDEX "architecture_decisions_user_id_decided_at_idx" ON "architecture_decisions"("user_id", "decided_at");

-- CreateIndex
CREATE INDEX "architecture_decisions_superseded_by_id_idx" ON "architecture_decisions"("superseded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "architecture_decisions_id_user_id_key" ON "architecture_decisions"("id", "user_id");

-- CreateIndex
CREATE INDEX "architecture_alternatives_decision_id_idx" ON "architecture_alternatives"("decision_id");

-- CreateIndex
CREATE INDEX "architecture_decision_evidence_evidence_id_idx" ON "architecture_decision_evidence"("evidence_id");

-- CreateIndex
CREATE INDEX "architecture_components_user_id_type_idx" ON "architecture_components"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "architecture_components_id_user_id_key" ON "architecture_components"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "architecture_components_user_id_key_key" ON "architecture_components"("user_id", "key");

-- CreateIndex
CREATE INDEX "decision_projects_project_id_idx" ON "decision_projects"("project_id");

-- CreateIndex
CREATE INDEX "component_technologies_technology_id_idx" ON "component_technologies"("technology_id");

-- CreateIndex
CREATE INDEX "component_projects_project_id_idx" ON "component_projects"("project_id");

-- CreateIndex
CREATE INDEX "component_dependencies_depends_on_component_id_idx" ON "component_dependencies"("depends_on_component_id");

-- CreateIndex
CREATE INDEX "decision_components_component_id_idx" ON "decision_components"("component_id");

-- AddForeignKey
ALTER TABLE "architecture_decisions" ADD CONSTRAINT "architecture_decisions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_decisions" ADD CONSTRAINT "architecture_decisions_superseded_by_id_user_id_fkey" FOREIGN KEY ("superseded_by_id", "user_id") REFERENCES "architecture_decisions"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_alternatives" ADD CONSTRAINT "architecture_alternatives_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_alternatives" ADD CONSTRAINT "architecture_alternatives_decision_id_user_id_fkey" FOREIGN KEY ("decision_id", "user_id") REFERENCES "architecture_decisions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_decision_evidence" ADD CONSTRAINT "architecture_decision_evidence_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_decision_evidence" ADD CONSTRAINT "architecture_decision_evidence_decision_id_user_id_fkey" FOREIGN KEY ("decision_id", "user_id") REFERENCES "architecture_decisions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_decision_evidence" ADD CONSTRAINT "architecture_decision_evidence_evidence_id_user_id_fkey" FOREIGN KEY ("evidence_id", "user_id") REFERENCES "evidence"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "architecture_components" ADD CONSTRAINT "architecture_components_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_projects" ADD CONSTRAINT "decision_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_projects" ADD CONSTRAINT "decision_projects_decision_id_user_id_fkey" FOREIGN KEY ("decision_id", "user_id") REFERENCES "architecture_decisions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_projects" ADD CONSTRAINT "decision_projects_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_technologies" ADD CONSTRAINT "component_technologies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_technologies" ADD CONSTRAINT "component_technologies_component_id_user_id_fkey" FOREIGN KEY ("component_id", "user_id") REFERENCES "architecture_components"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_technologies" ADD CONSTRAINT "component_technologies_technology_id_user_id_fkey" FOREIGN KEY ("technology_id", "user_id") REFERENCES "technologies"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_projects" ADD CONSTRAINT "component_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_projects" ADD CONSTRAINT "component_projects_component_id_user_id_fkey" FOREIGN KEY ("component_id", "user_id") REFERENCES "architecture_components"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_projects" ADD CONSTRAINT "component_projects_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_dependencies" ADD CONSTRAINT "component_dependencies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_dependencies" ADD CONSTRAINT "component_dependencies_component_id_user_id_fkey" FOREIGN KEY ("component_id", "user_id") REFERENCES "architecture_components"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_dependencies" ADD CONSTRAINT "component_dependencies_depends_on_component_id_user_id_fkey" FOREIGN KEY ("depends_on_component_id", "user_id") REFERENCES "architecture_components"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_components" ADD CONSTRAINT "decision_components_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_components" ADD CONSTRAINT "decision_components_decision_id_user_id_fkey" FOREIGN KEY ("decision_id", "user_id") REFERENCES "architecture_decisions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_components" ADD CONSTRAINT "decision_components_component_id_user_id_fkey" FOREIGN KEY ("component_id", "user_id") REFERENCES "architecture_components"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 7 domain invariants (ADRs 0041–0045). Appended to the generated migration.
ALTER TABLE "architecture_decisions"
  ADD CONSTRAINT "architecture_decisions_title_not_blank_chk" CHECK (length(btrim("title")) > 0);
-- Every decided state carries its decision date; a proposal has none (ADR 0042).
ALTER TABLE "architecture_decisions"
  ADD CONSTRAINT "architecture_decisions_decided_at_chk"
  CHECK (("status" = 'proposed') = ("decided_at" IS NULL));
-- superseded ⇔ a superseding decision is recorded; never superseded by itself.
ALTER TABLE "architecture_decisions"
  ADD CONSTRAINT "architecture_decisions_superseded_chk"
  CHECK (("status" = 'superseded') = ("superseded_by_id" IS NOT NULL));
ALTER TABLE "architecture_decisions"
  ADD CONSTRAINT "architecture_decisions_not_self_superseded_chk"
  CHECK ("superseded_by_id" IS NULL OR "superseded_by_id" <> "id");
ALTER TABLE "architecture_alternatives"
  ADD CONSTRAINT "architecture_alternatives_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "architecture_components"
  ADD CONSTRAINT "architecture_components_name_not_blank_chk" CHECK (length(btrim("name")) > 0);
ALTER TABLE "component_dependencies"
  ADD CONSTRAINT "component_dependencies_not_self_chk" CHECK ("component_id" <> "depends_on_component_id");
