-- CreateTable
CREATE TABLE "github_pull_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "repo_external_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "author_login" TEXT,
    "state" TEXT NOT NULL,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "base_branch" TEXT,
    "head_branch" TEXT,
    "additions" INTEGER,
    "deletions" INTEGER,
    "changed_files" INTEGER,
    "comments" INTEGER,
    "gh_created_at" TIMESTAMPTZ(3),
    "gh_updated_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "merged_at" TIMESTAMPTZ(3),
    "url" TEXT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_issues" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "repo_external_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "author_login" TEXT,
    "state" TEXT NOT NULL,
    "comments" INTEGER,
    "labels" TEXT[],
    "assignees" TEXT[],
    "milestone" TEXT,
    "gh_created_at" TIMESTAMPTZ(3),
    "gh_updated_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "url" TEXT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_releases" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "repo_external_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "tag_name" TEXT,
    "name" TEXT,
    "author_login" TEXT,
    "draft" BOOLEAN NOT NULL DEFAULT false,
    "prerelease" BOOLEAN NOT NULL DEFAULT false,
    "gh_created_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "url" TEXT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_contributors" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "repo_external_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "contributions" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" TEXT,
    "url" TEXT,
    "synced_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_contributors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "github_pull_requests_user_id_gh_created_at_idx" ON "github_pull_requests"("user_id", "gh_created_at");

-- CreateIndex
CREATE INDEX "github_pull_requests_user_id_repo_external_id_idx" ON "github_pull_requests"("user_id", "repo_external_id");

-- CreateIndex
CREATE INDEX "github_pull_requests_user_id_state_idx" ON "github_pull_requests"("user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "github_pull_requests_user_id_repo_external_id_number_key" ON "github_pull_requests"("user_id", "repo_external_id", "number");

-- CreateIndex
CREATE INDEX "github_issues_user_id_gh_created_at_idx" ON "github_issues"("user_id", "gh_created_at");

-- CreateIndex
CREATE INDEX "github_issues_user_id_repo_external_id_idx" ON "github_issues"("user_id", "repo_external_id");

-- CreateIndex
CREATE INDEX "github_issues_user_id_state_idx" ON "github_issues"("user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "github_issues_user_id_repo_external_id_number_key" ON "github_issues"("user_id", "repo_external_id", "number");

-- CreateIndex
CREATE INDEX "github_releases_user_id_published_at_idx" ON "github_releases"("user_id", "published_at");

-- CreateIndex
CREATE INDEX "github_releases_user_id_repo_external_id_idx" ON "github_releases"("user_id", "repo_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_releases_user_id_repo_external_id_external_id_key" ON "github_releases"("user_id", "repo_external_id", "external_id");

-- CreateIndex
CREATE INDEX "github_contributors_user_id_repo_external_id_idx" ON "github_contributors"("user_id", "repo_external_id");

-- CreateIndex
CREATE INDEX "github_contributors_user_id_login_idx" ON "github_contributors"("user_id", "login");

-- CreateIndex
CREATE UNIQUE INDEX "github_contributors_user_id_repo_external_id_login_key" ON "github_contributors"("user_id", "repo_external_id", "login");

-- AddForeignKey
ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_issues" ADD CONSTRAINT "github_issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_releases" ADD CONSTRAINT "github_releases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_contributors" ADD CONSTRAINT "github_contributors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 9.7 invariants (ADR 0055): non-negative counts, valid states, positive numbers.
ALTER TABLE "github_pull_requests"
  ADD CONSTRAINT "github_pull_requests_number_chk" CHECK ("number" > 0),
  ADD CONSTRAINT "github_pull_requests_state_chk" CHECK ("state" IN ('open', 'closed')),
  ADD CONSTRAINT "github_pull_requests_counts_chk" CHECK (
    ("additions" IS NULL OR "additions" >= 0)
    AND ("deletions" IS NULL OR "deletions" >= 0)
    AND ("changed_files" IS NULL OR "changed_files" >= 0)
    AND ("comments" IS NULL OR "comments" >= 0));

ALTER TABLE "github_issues"
  ADD CONSTRAINT "github_issues_number_chk" CHECK ("number" > 0),
  ADD CONSTRAINT "github_issues_state_chk" CHECK ("state" IN ('open', 'closed')),
  ADD CONSTRAINT "github_issues_comments_chk" CHECK ("comments" IS NULL OR "comments" >= 0);

ALTER TABLE "github_releases"
  ADD CONSTRAINT "github_releases_external_id_chk" CHECK (length(btrim("external_id")) > 0);

ALTER TABLE "github_contributors"
  ADD CONSTRAINT "github_contributors_contributions_chk" CHECK ("contributions" >= 0),
  ADD CONSTRAINT "github_contributors_login_chk" CHECK (length(btrim("login")) > 0);
