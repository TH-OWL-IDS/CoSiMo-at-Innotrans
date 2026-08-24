import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_operator_config_tts_voices_gender" AS ENUM('female', 'male');
  CREATE TABLE "operator_config_tts_voices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar,
  	"gender" "enum_operator_config_tts_voices_gender" DEFAULT 'female',
  	"voice_id" varchar NOT NULL,
  	"description" varchar NOT NULL
  );
  
  ALTER TABLE "personas" ADD COLUMN "accommodations_voice" varchar;
  ALTER TABLE "operator_config_tts_voices" ADD CONSTRAINT "operator_config_tts_voices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "operator_config_tts_voices_order_idx" ON "operator_config_tts_voices" USING btree ("_order");
  CREATE INDEX "operator_config_tts_voices_parent_id_idx" ON "operator_config_tts_voices" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "operator_config_tts_voices" CASCADE;
  ALTER TABLE "personas" DROP COLUMN "accommodations_voice";
  DROP TYPE "public"."enum_operator_config_tts_voices_gender";`)
}
