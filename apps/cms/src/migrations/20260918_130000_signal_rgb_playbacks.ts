import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The signal light's RGB playbacks (installer's API sheet 2026-09-18: pb38/39/40)
// join the LPU-2 catalog — the CMS select gains three keys, so the enum must too.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE IF NOT EXISTS 'signals-red';
  ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE IF NOT EXISTS 'signals-green';
  ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE IF NOT EXISTS 'signals-blue';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DELETE FROM "operator_config_cabin_lpu2_playbacks" WHERE "control" IN ('signals-red', 'signals-green', 'signals-blue');
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE text;
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light-cw', 'interior-light-ww', 'reading-1', 'reading-2', 'reading-3', 'reading-4', 'outer-cw', 'outer-ww', 'floor-cw', 'floor-ww', 'roofline-cw', 'roofline-ww', 'headrests-cw', 'headrests-ww', 'signals-cw', 'signals-ww', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash');
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" USING "control"::"public"."enum_operator_config_cabin_lpu2_playbacks_control";`)
}
