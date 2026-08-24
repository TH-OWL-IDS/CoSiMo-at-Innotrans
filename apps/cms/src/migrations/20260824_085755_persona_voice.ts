import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personas_accommodations_voice_gender" AS ENUM('female', 'male');
  CREATE TYPE "public"."enum_personas_accommodations_voice_tone" AS ENUM('neutral', 'warm', 'ruhig', 'lebhaft');
  ALTER TABLE "personas" ADD COLUMN "accommodations_volume" numeric DEFAULT 1;
  ALTER TABLE "personas" ADD COLUMN "accommodations_voice_gender" "enum_personas_accommodations_voice_gender" DEFAULT 'female';
  ALTER TABLE "personas" ADD COLUMN "accommodations_voice_tone" "enum_personas_accommodations_voice_tone" DEFAULT 'neutral';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personas" DROP COLUMN "accommodations_volume";
  ALTER TABLE "personas" DROP COLUMN "accommodations_voice_gender";
  ALTER TABLE "personas" DROP COLUMN "accommodations_voice_tone";
  DROP TYPE "public"."enum_personas_accommodations_voice_gender";
  DROP TYPE "public"."enum_personas_accommodations_voice_tone";`)
}
