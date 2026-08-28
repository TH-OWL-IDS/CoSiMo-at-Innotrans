import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personas" ALTER COLUMN "accommodations_theme" SET DEFAULT 'weiss';
  ALTER TABLE "personas" DROP COLUMN "accommodations_contrast";
  DROP TYPE "public"."enum_personas_accommodations_contrast";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personas_accommodations_contrast" AS ENUM('normal', 'high');
  ALTER TABLE "personas" ALTER COLUMN "accommodations_theme" SET DEFAULT 'classic';
  ALTER TABLE "personas" ADD COLUMN "accommodations_contrast" "enum_personas_accommodations_contrast" DEFAULT 'normal';`)
}
