import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Second half of the config split: the old operator-config global goes
// (its data was copied into the five new globals by the previous migration).

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "operator_config_tts_voices" CASCADE;
  DROP TABLE "operator_config_cabin_lpu2_playbacks" CASCADE;
  DROP TABLE "operator_config_cabin_light_scenes" CASCADE;
  DROP TABLE "operator_config" CASCADE;
  DROP TYPE "public"."enum_operator_config_tts_voices_gender";
  DROP TYPE "public"."enum_operator_config_tts_voices_language";
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  DROP TYPE "public"."enum_operator_config_llm_provider";
  DROP TYPE "public"."enum_operator_config_llm_fallback_provider";
  DROP TYPE "public"."enum_operator_config_stt_provider";
  DROP TYPE "public"."enum_operator_config_tts_provider";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_operator_config_tts_voices_gender" AS ENUM('female', 'male');
  CREATE TYPE "public"."enum_operator_config_tts_voices_language" AS ENUM('de', 'en');
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light-cw', 'interior-light-ww', 'reading-1', 'reading-2', 'reading-3', 'reading-4', 'outer-cw', 'outer-ww', 'floor-cw', 'floor-ww', 'roofline-cw', 'roofline-ww', 'headrests-cw', 'headrests-ww', 'signals-cw', 'signals-ww', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash', 'signals-red', 'signals-green', 'signals-blue');
  CREATE TYPE "public"."enum_operator_config_llm_provider" AS ENUM('anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_operator_config_llm_fallback_provider" AS ENUM('none', 'anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_operator_config_stt_provider" AS ENUM('deepgram');
  CREATE TYPE "public"."enum_operator_config_tts_provider" AS ENUM('elevenlabs');
  CREATE TABLE "operator_config_tts_voices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar,
  	"gender" "enum_operator_config_tts_voices_gender" DEFAULT 'female',
  	"language" "enum_operator_config_tts_voices_language" DEFAULT 'de',
  	"voice_id" varchar NOT NULL,
  	"description" varchar NOT NULL
  );
  
  CREATE TABLE "operator_config_cabin_lpu2_playbacks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"control" "enum_operator_config_cabin_lpu2_playbacks_control" NOT NULL,
  	"playback" numeric NOT NULL
  );
  
  CREATE TABLE "operator_config_cabin_light_scenes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"roofline_on" boolean DEFAULT true,
  	"roofline_intensity" numeric DEFAULT 100,
  	"roofline_bias" numeric DEFAULT -100,
  	"rooflight_on" boolean DEFAULT true,
  	"rooflight_intensity" numeric DEFAULT 100,
  	"rooflight_bias" numeric DEFAULT -100,
  	"floor_on" boolean DEFAULT true,
  	"floor_intensity" numeric DEFAULT 100,
  	"floor_bias" numeric DEFAULT -100
  );
  
  CREATE TABLE "operator_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"agent_system_prompt" varchar,
  	"llm_provider" "enum_operator_config_llm_provider" DEFAULT 'anthropic' NOT NULL,
  	"llm_base_url" varchar,
  	"llm_model" varchar,
  	"llm_fallback_provider" "enum_operator_config_llm_fallback_provider" DEFAULT 'none',
  	"llm_fallback_base_url" varchar,
  	"llm_fallback_model" varchar,
  	"llm_generation_temperature" numeric,
  	"llm_generation_top_p" numeric,
  	"llm_generation_max_tokens" numeric,
  	"llm_generation_repetition_penalty" numeric,
  	"llm_generation_thinking" boolean DEFAULT false,
  	"stt_provider" "enum_operator_config_stt_provider" DEFAULT 'deepgram' NOT NULL,
  	"stt_base_url" varchar,
  	"stt_model" varchar,
  	"tts_provider" "enum_operator_config_tts_provider" DEFAULT 'elevenlabs' NOT NULL,
  	"tts_base_url" varchar,
  	"tts_voice_id" varchar,
  	"tts_voice_id_male" varchar,
  	"tts_model" varchar,
  	"cabin_lpu2_base_url" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "operator_config_tts_voices" ADD CONSTRAINT "operator_config_tts_voices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ADD CONSTRAINT "operator_config_cabin_lpu2_playbacks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "operator_config_cabin_light_scenes" ADD CONSTRAINT "operator_config_cabin_light_scenes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "operator_config_tts_voices_order_idx" ON "operator_config_tts_voices" USING btree ("_order");
  CREATE INDEX "operator_config_tts_voices_parent_id_idx" ON "operator_config_tts_voices" USING btree ("_parent_id");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_order_idx" ON "operator_config_cabin_lpu2_playbacks" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_parent_id_idx" ON "operator_config_cabin_lpu2_playbacks" USING btree ("_parent_id");
  CREATE INDEX "operator_config_cabin_light_scenes_order_idx" ON "operator_config_cabin_light_scenes" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_light_scenes_parent_id_idx" ON "operator_config_cabin_light_scenes" USING btree ("_parent_id");`)
}
