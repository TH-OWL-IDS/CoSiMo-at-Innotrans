import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The operator config splits into five globals (agent · llm · speech · voices · cabin).
// This migration ADDS them and copies the data; the next one drops the old global.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_llm_config_provider" AS ENUM('anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_llm_config_fallback_provider" AS ENUM('none', 'anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_speech_config_stt_provider" AS ENUM('deepgram');
  CREATE TYPE "public"."enum_speech_config_tts_provider" AS ENUM('elevenlabs');
  CREATE TYPE "public"."enum_voices_voices_gender" AS ENUM('female', 'male');
  CREATE TYPE "public"."enum_voices_voices_language" AS ENUM('de', 'en');
  CREATE TYPE "public"."enum_cabin_config_lpu2_playbacks_control" AS ENUM('interior-light-cw', 'interior-light-ww', 'reading-1', 'reading-2', 'reading-3', 'reading-4', 'outer-cw', 'outer-ww', 'floor-cw', 'floor-ww', 'roofline-cw', 'roofline-ww', 'headrests-cw', 'headrests-ww', 'signals-cw', 'signals-ww', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash', 'signals-red', 'signals-green', 'signals-blue');
  CREATE TABLE "agent_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"system_prompt" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "llm_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "enum_llm_config_provider" DEFAULT 'anthropic' NOT NULL,
  	"base_url" varchar,
  	"model" varchar,
  	"fallback_provider" "enum_llm_config_fallback_provider" DEFAULT 'none',
  	"fallback_base_url" varchar,
  	"fallback_model" varchar,
  	"generation_temperature" numeric,
  	"generation_top_p" numeric,
  	"generation_max_tokens" numeric,
  	"generation_repetition_penalty" numeric,
  	"generation_thinking" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "speech_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stt_provider" "enum_speech_config_stt_provider" DEFAULT 'deepgram' NOT NULL,
  	"stt_base_url" varchar,
  	"stt_model" varchar,
  	"tts_provider" "enum_speech_config_tts_provider" DEFAULT 'elevenlabs' NOT NULL,
  	"tts_base_url" varchar,
  	"tts_voice_id" varchar,
  	"tts_voice_id_male" varchar,
  	"tts_model" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "voices_voices" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar,
  	"gender" "enum_voices_voices_gender" DEFAULT 'female',
  	"language" "enum_voices_voices_language" DEFAULT 'de',
  	"voice_id" varchar NOT NULL,
  	"description" varchar NOT NULL
  );
  
  CREATE TABLE "voices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "cabin_config_lpu2_playbacks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"control" "enum_cabin_config_lpu2_playbacks_control" NOT NULL,
  	"playback" numeric NOT NULL
  );
  
  CREATE TABLE "cabin_config_light_scenes" (
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
  
  CREATE TABLE "cabin_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lpu2_base_url" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "voices_voices" ADD CONSTRAINT "voices_voices_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."voices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cabin_config_lpu2_playbacks" ADD CONSTRAINT "cabin_config_lpu2_playbacks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cabin_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "cabin_config_light_scenes" ADD CONSTRAINT "cabin_config_light_scenes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cabin_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "voices_voices_order_idx" ON "voices_voices" USING btree ("_order");
  CREATE INDEX "voices_voices_parent_id_idx" ON "voices_voices" USING btree ("_parent_id");
  CREATE INDEX "cabin_config_lpu2_playbacks_order_idx" ON "cabin_config_lpu2_playbacks" USING btree ("_order");
  CREATE INDEX "cabin_config_lpu2_playbacks_parent_id_idx" ON "cabin_config_lpu2_playbacks" USING btree ("_parent_id");
  CREATE INDEX "cabin_config_light_scenes_order_idx" ON "cabin_config_light_scenes" USING btree ("_order");
  CREATE INDEX "cabin_config_light_scenes_parent_id_idx" ON "cabin_config_light_scenes" USING btree ("_parent_id");`)
  // ── data: the one operator-config row and its arrays move into the new globals ──
  await db.execute(sql`
   INSERT INTO "agent_config" ("system_prompt", "updated_at", "created_at")
    SELECT "agent_system_prompt", COALESCE("updated_at", now()), COALESCE("created_at", now()) FROM "operator_config" ORDER BY "id" LIMIT 1;
  INSERT INTO "llm_config" ("provider", "base_url", "model", "fallback_provider", "fallback_base_url", "fallback_model", "generation_temperature", "generation_top_p", "generation_max_tokens", "generation_repetition_penalty", "generation_thinking", "updated_at", "created_at")
    SELECT COALESCE("llm_provider"::text, 'anthropic')::"public"."enum_llm_config_provider", "llm_base_url", "llm_model",
           COALESCE("llm_fallback_provider"::text, 'none')::"public"."enum_llm_config_fallback_provider", "llm_fallback_base_url", "llm_fallback_model",
           "llm_generation_temperature", "llm_generation_top_p", "llm_generation_max_tokens", "llm_generation_repetition_penalty", COALESCE("llm_generation_thinking", false),
           COALESCE("updated_at", now()), COALESCE("created_at", now())
    FROM "operator_config" ORDER BY "id" LIMIT 1;
  INSERT INTO "speech_config" ("stt_provider", "stt_base_url", "stt_model", "tts_provider", "tts_base_url", "tts_voice_id", "tts_voice_id_male", "tts_model", "updated_at", "created_at")
    SELECT COALESCE("stt_provider"::text, 'deepgram')::"public"."enum_speech_config_stt_provider", "stt_base_url", "stt_model",
           COALESCE("tts_provider"::text, 'elevenlabs')::"public"."enum_speech_config_tts_provider", "tts_base_url", "tts_voice_id", "tts_voice_id_male", "tts_model",
           COALESCE("updated_at", now()), COALESCE("created_at", now())
    FROM "operator_config" ORDER BY "id" LIMIT 1;
  INSERT INTO "voices" ("updated_at", "created_at") VALUES (now(), now());
  INSERT INTO "voices_voices" ("_order", "_parent_id", "id", "key", "label", "gender", "language", "voice_id", "description")
    SELECT v."_order", (SELECT "id" FROM "voices" ORDER BY "id" LIMIT 1), v."id", v."key", v."label",
           COALESCE(v."gender"::text, 'female')::"public"."enum_voices_voices_gender", COALESCE(v."language"::text, 'de')::"public"."enum_voices_voices_language",
           v."voice_id", COALESCE(v."description", '')
    FROM "operator_config_tts_voices" v;
  INSERT INTO "cabin_config" ("lpu2_base_url", "updated_at", "created_at")
    SELECT "cabin_lpu2_base_url", COALESCE("updated_at", now()), COALESCE("created_at", now()) FROM "operator_config" ORDER BY "id" LIMIT 1;
  INSERT INTO "cabin_config" ("updated_at", "created_at") SELECT now(), now() WHERE NOT EXISTS (SELECT 1 FROM "cabin_config");
  INSERT INTO "cabin_config_lpu2_playbacks" ("_order", "_parent_id", "id", "control", "playback")
    SELECT p."_order", (SELECT "id" FROM "cabin_config" ORDER BY "id" LIMIT 1), p."id", p."control"::text::"public"."enum_cabin_config_lpu2_playbacks_control", p."playback"
    FROM "operator_config_cabin_lpu2_playbacks" p;
  INSERT INTO "cabin_config_light_scenes" ("_order", "_parent_id", "id", "key", "label", "roofline_on", "roofline_intensity", "roofline_bias", "rooflight_on", "rooflight_intensity", "rooflight_bias", "floor_on", "floor_intensity", "floor_bias")
    SELECT s."_order", (SELECT "id" FROM "cabin_config" ORDER BY "id" LIMIT 1), s."id", s."key", s."label", s."roofline_on", s."roofline_intensity", s."roofline_bias", s."rooflight_on", s."rooflight_intensity", s."rooflight_bias", s."floor_on", s."floor_intensity", s."floor_bias"
    FROM "operator_config_cabin_light_scenes" s;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "agent_config" CASCADE;
  DROP TABLE "llm_config" CASCADE;
  DROP TABLE "speech_config" CASCADE;
  DROP TABLE "voices_voices" CASCADE;
  DROP TABLE "voices" CASCADE;
  DROP TABLE "cabin_config_lpu2_playbacks" CASCADE;
  DROP TABLE "cabin_config_light_scenes" CASCADE;
  DROP TABLE "cabin_config" CASCADE;
  DROP TYPE "public"."enum_llm_config_provider";
  DROP TYPE "public"."enum_llm_config_fallback_provider";
  DROP TYPE "public"."enum_speech_config_stt_provider";
  DROP TYPE "public"."enum_speech_config_tts_provider";
  DROP TYPE "public"."enum_voices_voices_gender";
  DROP TYPE "public"."enum_voices_voices_language";
  DROP TYPE "public"."enum_cabin_config_lpu2_playbacks_control";`)
}
