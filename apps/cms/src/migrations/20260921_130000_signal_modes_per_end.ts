import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The signal light's red mode is per end now (front / rear independent):
// two selects (none | red | flash) replace the one exclusive mode.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cabin_config_light_scenes_signals_mode_front" AS ENUM('none', 'red', 'flash');
   CREATE TYPE "public"."enum_cabin_config_light_scenes_signals_mode_rear" AS ENUM('none', 'red', 'flash');
   ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_mode_front" "enum_cabin_config_light_scenes_signals_mode_front" DEFAULT 'none';
   ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_mode_rear" "enum_cabin_config_light_scenes_signals_mode_rear" DEFAULT 'none';
   UPDATE "cabin_config_light_scenes" SET
     "signals_mode_front" = (CASE "signals_mode"::text WHEN 'signals-front-red' THEN 'red' WHEN 'signals-front-flash' THEN 'flash' ELSE 'none' END)::"enum_cabin_config_light_scenes_signals_mode_front",
     "signals_mode_rear" = (CASE "signals_mode"::text WHEN 'signals-rear-red' THEN 'red' WHEN 'signals-rear-flash' THEN 'flash' ELSE 'none' END)::"enum_cabin_config_light_scenes_signals_mode_rear";
   ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_mode";
   DROP TYPE "public"."enum_cabin_config_light_scenes_signals_mode";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_cabin_config_light_scenes_signals_mode" AS ENUM('none', 'signals-front-red', 'signals-rear-red', 'signals-front-flash', 'signals-rear-flash');
   ALTER TABLE "cabin_config_light_scenes" ADD COLUMN "signals_mode" "enum_cabin_config_light_scenes_signals_mode" DEFAULT 'none';
   ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_mode_front";
   ALTER TABLE "cabin_config_light_scenes" DROP COLUMN "signals_mode_rear";
   DROP TYPE "public"."enum_cabin_config_light_scenes_signals_mode_front";
   DROP TYPE "public"."enum_cabin_config_light_scenes_signals_mode_rear";`)
}
