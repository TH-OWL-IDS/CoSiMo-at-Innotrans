import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personas_traits_modality" AS ENUM('audio-first', 'visual-first', 'balanced');
  CREATE TYPE "public"."enum_personas_traits_pace" AS ENUM('step-by-step', 'normal', 'brisk');
  CREATE TYPE "public"."enum_personas_traits_verbosity" AS ENUM('terse', 'normal', 'explanatory');
  CREATE TYPE "public"."enum_personas_traits_confirmation" AS ENUM('every-step', 'result-only');
  CREATE TYPE "public"."enum_personas_traits_initiative" AS ENUM('leads', 'responds');
  CREATE TYPE "public"."enum_personas_traits_scope" AS ENUM('basics', 'full');
  ALTER TABLE "personas" ALTER COLUMN "brief" DROP NOT NULL;
  ALTER TABLE "personas" ADD COLUMN "traits_modality" "enum_personas_traits_modality" DEFAULT 'balanced';
  ALTER TABLE "personas" ADD COLUMN "traits_pace" "enum_personas_traits_pace" DEFAULT 'normal';
  ALTER TABLE "personas" ADD COLUMN "traits_verbosity" "enum_personas_traits_verbosity" DEFAULT 'normal';
  ALTER TABLE "personas" ADD COLUMN "traits_confirmation" "enum_personas_traits_confirmation" DEFAULT 'result-only';
  ALTER TABLE "personas" ADD COLUMN "traits_initiative" "enum_personas_traits_initiative" DEFAULT 'responds';
  ALTER TABLE "personas" ADD COLUMN "traits_scope" "enum_personas_traits_scope" DEFAULT 'full';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personas" ALTER COLUMN "brief" SET NOT NULL;
  ALTER TABLE "personas" DROP COLUMN "traits_modality";
  ALTER TABLE "personas" DROP COLUMN "traits_pace";
  ALTER TABLE "personas" DROP COLUMN "traits_verbosity";
  ALTER TABLE "personas" DROP COLUMN "traits_confirmation";
  ALTER TABLE "personas" DROP COLUMN "traits_initiative";
  ALTER TABLE "personas" DROP COLUMN "traits_scope";
  DROP TYPE "public"."enum_personas_traits_modality";
  DROP TYPE "public"."enum_personas_traits_pace";
  DROP TYPE "public"."enum_personas_traits_verbosity";
  DROP TYPE "public"."enum_personas_traits_confirmation";
  DROP TYPE "public"."enum_personas_traits_initiative";
  DROP TYPE "public"."enum_personas_traits_scope";`)
}
