import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_survey_responses_lang" AS ENUM('de', 'en');
  CREATE TYPE "public"."enum_survey_responses_suspect_reason" AS ENUM('missing', 'invalid', 'expired', 'too-fast');
  CREATE TABLE "survey_responses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"response_id" varchar NOT NULL,
  	"lang" "enum_survey_responses_lang" NOT NULL,
  	"umux_capabilities" numeric NOT NULL,
  	"umux_ease" numeric NOT NULL,
  	"ad_confusing_clear" numeric NOT NULL,
  	"ad_complicated_simple" numeric NOT NULL,
  	"ad_unpredictable_predictable" numeric NOT NULL,
  	"ad_impractical_practical" numeric NOT NULL,
  	"ad_ugly_attractive" numeric NOT NULL,
  	"utaut_attitude" numeric NOT NULL,
  	"bi_intend" numeric NOT NULL,
  	"consent" boolean DEFAULT false NOT NULL,
  	"form_version" varchar,
  	"duration_sec" numeric,
  	"token_age_sec" numeric,
  	"suspect" boolean,
  	"suspect_reason" "enum_survey_responses_suspect_reason",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "personas" ALTER COLUMN "accommodations_voice_gender" SET DEFAULT 'male';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "survey_responses_id" integer;
  CREATE UNIQUE INDEX "survey_responses_response_id_idx" ON "survey_responses" USING btree ("response_id");
  CREATE INDEX "survey_responses_updated_at_idx" ON "survey_responses" USING btree ("updated_at");
  CREATE INDEX "survey_responses_created_at_idx" ON "survey_responses" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_survey_responses_fk" FOREIGN KEY ("survey_responses_id") REFERENCES "public"."survey_responses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_survey_responses_id_idx" ON "payload_locked_documents_rels" USING btree ("survey_responses_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "survey_responses" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "survey_responses" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_survey_responses_fk";
  
  DROP INDEX "payload_locked_documents_rels_survey_responses_id_idx";
  ALTER TABLE "personas" ALTER COLUMN "accommodations_voice_gender" SET DEFAULT 'female';
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "survey_responses_id";
  DROP TYPE "public"."enum_survey_responses_lang";
  DROP TYPE "public"."enum_survey_responses_suspect_reason";`)
}
