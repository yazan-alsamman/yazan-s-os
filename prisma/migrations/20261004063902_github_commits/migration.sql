-- CreateTable
CREATE TABLE "github_commits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "repo_external_id" TEXT NOT NULL,
    "repo_full_name" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT,
    "author_login" TEXT,
    "authored_at" TIMESTAMPTZ(3),
    "committed_at" TIMESTAMPTZ(3),
    "additions" INTEGER,
    "deletions" INTEGER,
    "url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_commits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "github_commits_user_id_authored_at_idx" ON "github_commits"("user_id", "authored_at");

-- CreateIndex
CREATE INDEX "github_commits_user_id_repo_external_id_idx" ON "github_commits"("user_id", "repo_external_id");

-- CreateIndex
CREATE UNIQUE INDEX "github_commits_user_id_repo_external_id_sha_key" ON "github_commits"("user_id", "repo_external_id", "sha");

-- AddForeignKey
ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 9.6 invariants (ADR 0054).
ALTER TABLE "github_commits"
  ADD CONSTRAINT "github_commits_counts_chk"
  CHECK (("additions" IS NULL OR "additions" >= 0) AND ("deletions" IS NULL OR "deletions" >= 0));
ALTER TABLE "github_commits"
  ADD CONSTRAINT "github_commits_sha_chk" CHECK (length(btrim("sha")) > 0);
