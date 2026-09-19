import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_personas_accommodations_character" AS ENUM('face', 'blob', 'circle', 'line');
  ALTER TABLE "personas" ADD COLUMN "accommodations_character" "enum_personas_accommodations_character" DEFAULT 'face';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personas" DROP COLUMN "accommodations_character";
  DROP TYPE "public"."enum_personas_accommodations_character";`)
}
