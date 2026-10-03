-- CreateEnum
CREATE TYPE "integration_provider" AS ENUM ('github', 'google');

-- CreateEnum
CREATE TYPE "integration_status" AS ENUM ('connected', 'degraded', 'error', 'expired', 'revoked', 'disconnected');

-- CreateEnum
CREATE TYPE "integration_sync_status" AS ENUM ('idle', 'running', 'success', 'partial', 'failed');

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "account_email" TEXT,
    "account_login" TEXT,
    "status" "integration_status" NOT NULL DEFAULT 'connected',
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMPTZ(3),
    "scopes" TEXT[],
    "capabilities" TEXT[],
    "connected_at" TIMESTAMPTZ(3),
    "last_sync_at" TIMESTAMPTZ(3),
    "last_attempted_sync_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_states" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "resource_type" TEXT NOT NULL,
    "status" "integration_sync_status" NOT NULL DEFAULT 'idle',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cursor" TEXT,
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_external_resources" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider" "integration_provider" NOT NULL,
    "resource_type" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "url" TEXT,
    "metadata" JSONB NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "last_synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "integration_external_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_resource_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_resource_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_connections_user_id_provider_idx" ON "integration_connections"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_id_user_id_key" ON "integration_connections"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_user_id_provider_external_account_i_key" ON "integration_connections"("user_id", "provider", "external_account_id");

-- CreateIndex
CREATE INDEX "integration_sync_states_user_id_connection_id_idx" ON "integration_sync_states"("user_id", "connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sync_states_connection_id_resource_type_key" ON "integration_sync_states"("connection_id", "resource_type");

-- CreateIndex
CREATE INDEX "integration_external_resources_user_id_connection_id_resour_idx" ON "integration_external_resources"("user_id", "connection_id", "resource_type");

-- CreateIndex
CREATE UNIQUE INDEX "integration_external_resources_id_user_id_key" ON "integration_external_resources"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_external_resources_user_id_provider_resource_ty_key" ON "integration_external_resources"("user_id", "provider", "resource_type", "external_id");

-- CreateIndex
CREATE INDEX "integration_resource_links_user_id_project_id_idx" ON "integration_resource_links"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "integration_resource_links_user_id_resource_id_idx" ON "integration_resource_links"("user_id", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "integration_resource_links_user_id_resource_id_project_id_key" ON "integration_resource_links"("user_id", "resource_id", "project_id");

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_states" ADD CONSTRAINT "integration_sync_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_sync_states" ADD CONSTRAINT "integration_sync_states_connection_id_user_id_fkey" FOREIGN KEY ("connection_id", "user_id") REFERENCES "integration_connections"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_external_resources" ADD CONSTRAINT "integration_external_resources_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_external_resources" ADD CONSTRAINT "integration_external_resources_connection_id_user_id_fkey" FOREIGN KEY ("connection_id", "user_id") REFERENCES "integration_connections"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_resource_id_user_id_fkey" FOREIGN KEY ("resource_id", "user_id") REFERENCES "integration_external_resources"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_resource_links" ADD CONSTRAINT "integration_resource_links_project_id_user_id_fkey" FOREIGN KEY ("project_id", "user_id") REFERENCES "projects"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 9.5 invariants (ADR 0052). Appended to the generated migration.
ALTER TABLE "integration_connections"
  ADD CONSTRAINT "integration_connections_names_chk"
  CHECK (length(btrim("display_name")) > 0 AND length(btrim("external_account_id")) > 0);
ALTER TABLE "integration_sync_states"
  ADD CONSTRAINT "integration_sync_counts_chk"
  CHECK ("records_fetched" >= 0 AND "records_updated" >= 0 AND "records_failed" >= 0);
ALTER TABLE "integration_external_resources"
  ADD CONSTRAINT "integration_external_resources_id_chk"
  CHECK (length(btrim("external_id")) > 0 AND length(btrim("resource_type")) > 0);
