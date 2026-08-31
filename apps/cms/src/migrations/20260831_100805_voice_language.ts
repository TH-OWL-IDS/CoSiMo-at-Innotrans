import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_operator_config_tts_voices_language" AS ENUM('de', 'en');
  ALTER TABLE "operator_config_tts_voices" ADD COLUMN "language" "enum_operator_config_tts_voices_language" DEFAULT 'de';
  -- the pre-language catalog rows are the English premades — label them truthfully
  UPDATE "operator_config_tts_voices" SET "language" = 'en';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "operator_config_tts_voices" DROP COLUMN "language";
  DROP TYPE "public"."enum_operator_config_tts_voices_language";`)
}
