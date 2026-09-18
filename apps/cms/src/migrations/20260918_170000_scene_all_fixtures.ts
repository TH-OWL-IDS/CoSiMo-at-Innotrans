import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// A scene now describes every fixture of the rig: outer light, headrests,
// the four reading lamps and the signal light (white + RGB + red mode) join
// the three interior groups. All new columns default to off.

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cabin_config_light_scenes_signals_mode" AS ENUM('none', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash');
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "outer_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "outer_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "outer_bias" numeric DEFAULT -100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "headrests_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "headrests_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "headrests_bias" numeric DEFAULT -100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading1_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading1_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading2_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading2_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading3_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading3_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading4_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "reading4_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_on" boolean DEFAULT false;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_intensity" numeric DEFAULT 100;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_bias" numeric DEFAULT 0;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_red" numeric DEFAULT 0;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_green" numeric DEFAULT 0;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_blue" numeric DEFAULT 0;
  ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_mode" "enum_cabin_config_light_scenes_signals_mode" DEFAULT 'none';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "outer_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "outer_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "outer_bias";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "headrests_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "headrests_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "headrests_bias";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading1_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading1_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading2_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading2_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading3_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading3_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading4_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "reading4_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_on";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_intensity";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_bias";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_red";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_green";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_blue";
  ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_mode";
  DROP TYPE "public"."enum_cabin_config_light_scenes_signals_mode";`)
}
