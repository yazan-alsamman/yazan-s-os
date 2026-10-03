-- CreateEnum
CREATE TYPE "copilot_role" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "copilot_answer_mode" AS ENUM ('synthesis', 'retrieval_only');

-- CreateEnum
CREATE TYPE "copilot_tool_status" AS ENUM ('ok', 'rejected', 'failed');

-- CreateTable
CREATE TABLE "copilot_conversations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "copilot_role" NOT NULL,
    "content" TEXT,
    "answer" JSONB,
    "mode" "copilot_answer_mode",
    "provider" TEXT,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_tool_calls" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "copilot_tool_status" NOT NULL,
    "result_count" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copilot_conversations_user_id_updated_at_idx" ON "copilot_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_conversations_id_user_id_key" ON "copilot_conversations"("id", "user_id");

-- CreateIndex
CREATE INDEX "copilot_messages_conversation_id_created_at_idx" ON "copilot_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_messages_id_user_id_key" ON "copilot_messages"("id", "user_id");

-- CreateIndex
CREATE INDEX "copilot_tool_calls_message_id_idx" ON "copilot_tool_calls"("message_id");

-- CreateIndex
CREATE INDEX "copilot_tool_calls_user_id_created_at_idx" ON "copilot_tool_calls"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_conversation_id_user_id_fkey" FOREIGN KEY ("conversation_id", "user_id") REFERENCES "copilot_conversations"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_tool_calls" ADD CONSTRAINT "copilot_tool_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copilot_tool_calls" ADD CONSTRAINT "copilot_tool_calls_message_id_user_id_fkey" FOREIGN KEY ("message_id", "user_id") REFERENCES "copilot_messages"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 8 invariants (ADRs 0046–0050). Appended to the generated migration.
ALTER TABLE "copilot_conversations"
  ADD CONSTRAINT "copilot_conversations_title_not_blank_chk" CHECK (length(btrim("title")) > 0);
-- A user turn carries the question; an assistant turn carries a validated answer and its mode.
ALTER TABLE "copilot_messages"
  ADD CONSTRAINT "copilot_messages_role_payload_chk" CHECK (
    ("role" = 'user' AND "content" IS NOT NULL AND "answer" IS NULL AND "mode" IS NULL)
    OR ("role" = 'assistant' AND "answer" IS NOT NULL AND "mode" IS NOT NULL)
  );
ALTER TABLE "copilot_messages"
  ADD CONSTRAINT "copilot_messages_usage_chk" CHECK (
    ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    AND ("latency_ms" IS NULL OR "latency_ms" >= 0)
  );
ALTER TABLE "copilot_tool_calls"
  ADD CONSTRAINT "copilot_tool_calls_duration_chk" CHECK ("duration_ms" >= 0);
