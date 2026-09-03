import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "operator_config_cabin_lpu2_playbacks_cues" CASCADE;
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE text;
  -- rows from the old two-control model cannot cast into the rig catalog:
  -- drop them; the seed re-creates the full map on next boot
  DELETE FROM "operator_config_cabin_lpu2_playbacks" WHERE "control" IN ('interior-light', 'reading-lamp');
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light-cw', 'interior-light-ww', 'reading-1', 'reading-2', 'reading-3', 'reading-4', 'outer-cw', 'outer-ww', 'floor-cw', 'floor-ww', 'roofline-cw', 'roofline-ww', 'headrests-cw', 'headrests-ww', 'signals-cw', 'signals-ww', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash');
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" USING "control"::"public"."enum_operator_config_cabin_lpu2_playbacks_control";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "operator_config_cabin_lpu2_playbacks_cues" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"scene" varchar NOT NULL,
  	"cue" numeric NOT NULL
  );
  
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE text;
  DROP TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control";
  CREATE TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" AS ENUM('interior-light', 'reading-lamp');
  ALTER TABLE "operator_config_cabin_lpu2_playbacks" ALTER COLUMN "control" SET DATA TYPE "public"."enum_operator_config_cabin_lpu2_playbacks_control" USING "control"::"public"."enum_operator_config_cabin_lpu2_playbacks_control";
  ALTER TABLE "operator_config_cabin_lpu2_playbacks_cues" ADD CONSTRAINT "operator_config_cabin_lpu2_playbacks_cues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config_cabin_lpu2_playbacks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_cues_order_idx" ON "operator_config_cabin_lpu2_playbacks_cues" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_cues_parent_id_idx" ON "operator_config_cabin_lpu2_playbacks_cues" USING btree ("_parent_id");`)
}
