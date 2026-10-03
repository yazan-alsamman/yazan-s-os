-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "level_model_id" UUID;

-- CreateTable
CREATE TABLE "skill_level_models" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "levels" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skill_level_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technology_skills" (
    "user_id" UUID NOT NULL,
    "technology_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technology_skills_pkey" PRIMARY KEY ("technology_id","skill_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_level_models_id_user_id_key" ON "skill_level_models"("id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_level_models_user_id_name_key" ON "skill_level_models"("user_id", "name");

-- CreateIndex
CREATE INDEX "technology_skills_skill_id_idx" ON "technology_skills"("skill_id");

-- CreateIndex
CREATE INDEX "skills_level_model_id_idx" ON "skills"("level_model_id");

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_level_model_id_user_id_fkey" FOREIGN KEY ("level_model_id", "user_id") REFERENCES "skill_level_models"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_level_models" ADD CONSTRAINT "skill_level_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technology_skills" ADD CONSTRAINT "technology_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technology_skills" ADD CONSTRAINT "technology_skills_technology_id_user_id_fkey" FOREIGN KEY ("technology_id", "user_id") REFERENCES "technologies"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technology_skills" ADD CONSTRAINT "technology_skills_skill_id_user_id_fkey" FOREIGN KEY ("skill_id", "user_id") REFERENCES "skills"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity rules not expressible in Prisma (ADR 0026, ADR 0030)
ALTER TABLE "skill_level_models" ADD CONSTRAINT "skill_level_models_name_chk" CHECK (length(btrim("name")) > 0 AND length("name") <= 80);
ALTER TABLE "skill_level_models" ADD CONSTRAINT "skill_level_models_levels_chk" CHECK (jsonb_typeof("levels") = 'array' AND jsonb_array_length("levels") = 6);
ALTER TABLE "skills" ADD CONSTRAINT "skills_level_model_chk" CHECK ("level_model" IN ('peos-default-v1', 'custom') AND (("level_model" = 'custom') = ("level_model_id" IS NOT NULL)));
