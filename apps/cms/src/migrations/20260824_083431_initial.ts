import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personas_accommodations_language" AS ENUM('de', 'en');
  CREATE TYPE "public"."enum_personas_accommodations_text_size" AS ENUM('s', 'm', 'l', 'xl');
  CREATE TYPE "public"."enum_personas_accommodations_contrast" AS ENUM('normal', 'high');
  CREATE TYPE "public"."enum_personas_accommodations_input" AS ENUM('voice', 'text', 'both');
  CREATE TYPE "public"."enum_sessions_turns_role" AS ENUM('user', 'cosimo');
  CREATE TYPE "public"."enum_sessions_turns_modality" AS ENUM('voice', 'text');
  CREATE TYPE "public"."enum_sessions_turns_lang" AS ENUM('de', 'en');
  CREATE TYPE "public"."enum_sessions_turns_outcome" AS ENUM('ok', 'not_understood', 'error', 'offline_canned', 'interrupted');
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'operator');
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light', 'reading-lamp', 'ventilation', 'window-tint', 'ambient-sound');
  CREATE TYPE "public"."enum_operator_config_llm_provider" AS ENUM('anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_operator_config_llm_fallback_provider" AS ENUM('none', 'anthropic', 'openai-compatible');
  CREATE TYPE "public"."enum_operator_config_stt_provider" AS ENUM('deepgram');
  CREATE TYPE "public"."enum_operator_config_tts_provider" AS ENUM('elevenlabs');
  CREATE TYPE "public"."enum_route_config_faults_kind" AS ENUM('signal-hold', 'door-fault', 'slow-order', 'low-battery');
  CREATE TABLE "personas_nfc_ids" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar NOT NULL
  );
  
  CREATE TABLE "personas_memories" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"note" varchar NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "personas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"copy_from_id" integer,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"summary" varchar,
  	"brief" varchar NOT NULL,
  	"accommodations_language" "enum_personas_accommodations_language" DEFAULT 'de',
  	"accommodations_theme" varchar DEFAULT 'classic',
  	"accommodations_text_size" "enum_personas_accommodations_text_size" DEFAULT 'm',
  	"accommodations_contrast" "enum_personas_accommodations_contrast" DEFAULT 'normal',
  	"accommodations_input" "enum_personas_accommodations_input" DEFAULT 'both',
  	"accommodations_audio_output" boolean DEFAULT true,
  	"accommodations_speech_rate" numeric DEFAULT 1,
  	"accommodations_show_text" boolean DEFAULT false,
  	"accommodations_reduce_motion" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sessions_turns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"role" "enum_sessions_turns_role",
  	"modality" "enum_sessions_turns_modality",
  	"lang" "enum_sessions_turns_lang",
  	"transcript" varchar,
  	"detected_intent" varchar,
  	"face_emotion" varchar,
  	"latency_ms" numeric,
  	"outcome" "enum_sessions_turns_outcome",
  	"action" jsonb,
  	"actions" jsonb,
  	"llm" jsonb,
  	"timings" jsonb,
  	"error" varchar,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "sessions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"session_id" varchar NOT NULL,
  	"device_id" varchar,
  	"persona" varchar,
  	"consent" boolean,
  	"started_at" timestamp(3) with time zone,
  	"ended_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'operator',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"personas_id" integer,
  	"sessions_id" integer,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "operator_config_cabin_lpu2_playbacks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"control" "enum_operator_config_cabin_lpu2_playbacks_control" NOT NULL,
  	"playback" numeric NOT NULL
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
  
  CREATE TABLE "route_config_stops" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"stop_id" varchar NOT NULL,
  	"name_de" varchar NOT NULL,
  	"name_en" varchar NOT NULL,
  	"travel_seconds_from_prev" numeric DEFAULT 240,
  	"dwell_seconds" numeric DEFAULT 45,
  	"demand" numeric DEFAULT 2
  );
  
  CREATE TABLE "route_config_faults" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_route_config_faults_kind" NOT NULL,
  	"every_minutes" numeric DEFAULT 10,
  	"chance_pct" numeric DEFAULT 30,
  	"duration_sec" numeric DEFAULT 45
  );
  
  CREATE TABLE "route_config" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"line_de" varchar DEFAULT 'Extertalbahn',
  	"line_en" varchar DEFAULT 'Extertal line',
  	"cruise_speed_kmh" numeric DEFAULT 55,
  	"capacity" numeric DEFAULT 4,
  	"notes_de" varchar,
  	"notes_en" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "personas_nfc_ids" ADD CONSTRAINT "personas_nfc_ids_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "personas_memories" ADD CONSTRAINT "personas_memories_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "personas" ADD CONSTRAINT "personas_copy_from_id_personas_id_fk" FOREIGN KEY ("copy_from_id") REFERENCES "public"."personas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "sessions_turns" ADD CONSTRAINT "sessions_turns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_personas_fk" FOREIGN KEY ("personas_id") REFERENCES "public"."personas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sessions_fk" FOREIGN KEY ("sessions_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ADD CONSTRAINT "operator_config_cabin_lpu2_playbacks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "route_config_stops" ADD CONSTRAINT "route_config_stops_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."route_config"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "route_config_faults" ADD CONSTRAINT "route_config_faults_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."route_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "personas_nfc_ids_order_idx" ON "personas_nfc_ids" USING btree ("_order");
  CREATE INDEX "personas_nfc_ids_parent_id_idx" ON "personas_nfc_ids" USING btree ("_parent_id");
  CREATE INDEX "personas_memories_order_idx" ON "personas_memories" USING btree ("_order");
  CREATE INDEX "personas_memories_parent_id_idx" ON "personas_memories" USING btree ("_parent_id");
  CREATE INDEX "personas_copy_from_idx" ON "personas" USING btree ("copy_from_id");
  CREATE UNIQUE INDEX "personas_key_idx" ON "personas" USING btree ("key");
  CREATE INDEX "personas_updated_at_idx" ON "personas" USING btree ("updated_at");
  CREATE INDEX "personas_created_at_idx" ON "personas" USING btree ("created_at");
  CREATE INDEX "sessions_turns_order_idx" ON "sessions_turns" USING btree ("_order");
  CREATE INDEX "sessions_turns_parent_id_idx" ON "sessions_turns" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "sessions_session_id_idx" ON "sessions" USING btree ("session_id");
  CREATE INDEX "sessions_updated_at_idx" ON "sessions" USING btree ("updated_at");
  CREATE INDEX "sessions_created_at_idx" ON "sessions" USING btree ("created_at");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_personas_id_idx" ON "payload_locked_documents_rels" USING btree ("personas_id");
  CREATE INDEX "payload_locked_documents_rels_sessions_id_idx" ON "payload_locked_documents_rels" USING btree ("sessions_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_order_idx" ON "operator_config_cabin_lpu2_playbacks" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_parent_id_idx" ON "operator_config_cabin_lpu2_playbacks" USING btree ("_parent_id");
  CREATE INDEX "route_config_stops_order_idx" ON "route_config_stops" USING btree ("_order");
  CREATE INDEX "route_config_stops_parent_id_idx" ON "route_config_stops" USING btree ("_parent_id");
  CREATE INDEX "route_config_faults_order_idx" ON "route_config_faults" USING btree ("_order");
  CREATE INDEX "route_config_faults_parent_id_idx" ON "route_config_faults" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "personas_nfc_ids" CASCADE;
  DROP TABLE "personas_memories" CASCADE;
  DROP TABLE "personas" CASCADE;
  DROP TABLE "sessions_turns" CASCADE;
  DROP TABLE "sessions" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "operator_config_cabin_lpu2_playbacks" CASCADE;
  DROP TABLE "operator_config" CASCADE;
  DROP TABLE "route_config_stops" CASCADE;
  DROP TABLE "route_config_faults" CASCADE;
  DROP TABLE "route_config" CASCADE;
  DROP TYPE "public"."enum_personas_accommodations_language";
  DROP TYPE "public"."enum_personas_accommodations_text_size";
  DROP TYPE "public"."enum_personas_accommodations_contrast";
  DROP TYPE "public"."enum_personas_accommodations_input";
  DROP TYPE "public"."enum_sessions_turns_role";
  DROP TYPE "public"."enum_sessions_turns_modality";
  DROP TYPE "public"."enum_sessions_turns_lang";
  DROP TYPE "public"."enum_sessions_turns_outcome";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  DROP TYPE "public"."enum_operator_config_llm_provider";
  DROP TYPE "public"."enum_operator_config_llm_fallback_provider";
  DROP TYPE "public"."enum_operator_config_stt_provider";
  DROP TYPE "public"."enum_operator_config_tts_provider";
  DROP TYPE "public"."enum_route_config_faults_kind";`)
}
