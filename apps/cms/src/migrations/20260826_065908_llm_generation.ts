import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "operator_config" ADD COLUMN "llm_generation_temperature" numeric;
  ALTER TABLE "operator_config" ADD COLUMN "llm_generation_top_p" numeric;
  ALTER TABLE "operator_config" ADD COLUMN "llm_generation_max_tokens" numeric;
  ALTER TABLE "operator_config" ADD COLUMN "llm_generation_repetition_penalty" numeric;
  ALTER TABLE "operator_config" ADD COLUMN "llm_generation_thinking" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "operator_config" DROP COLUMN "llm_generation_temperature";
  ALTER TABLE "operator_config" DROP COLUMN "llm_generation_top_p";
  ALTER TABLE "operator_config" DROP COLUMN "llm_generation_max_tokens";
  ALTER TABLE "operator_config" DROP COLUMN "llm_generation_repetition_penalty";
  ALTER TABLE "operator_config" DROP COLUMN "llm_generation_thinking";`)
}
