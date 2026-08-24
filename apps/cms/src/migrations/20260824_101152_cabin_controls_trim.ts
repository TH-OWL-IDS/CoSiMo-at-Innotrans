import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE text;
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light', 'reading-lamp');
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" USING "control"::"public"."enum_operator_config_cabin_lpu2_playbacks_control";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE 'ventilation';
  ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE 'window-tint';
  ALTER TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" ADD VALUE 'ambient-sound';`)
}
