import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "personas" ALTER COLUMN "accommodations_text_size" SET DATA TYPE text;
  ALTER TABLE "personas" ALTER COLUMN "accommodations_text_size" SET DEFAULT 'l'::text;
  -- The scale is re-anchored: "l" is now the largest the slit holds (what "m"
  -- rendered as before), "m" and "s" only go smaller. Every row that was not
  -- explicitly small keeps today's look → 'l'; "xl" no longer exists.
  UPDATE "personas" SET "accommodations_text_size" = 'l' WHERE "accommodations_text_size" IS NOT NULL AND "accommodations_text_size" <> 's';
  DROP TYPE "public"."enum_personas_accommodations_text_size";
  CREATE TYPE "public"."enum_personas_accommodations_text_size" AS ENUM('s', 'm', 'l');
  ALTER TABLE "personas" ALTER COLUMN "accommodations_text_size" SET DEFAULT 'l'::"public"."enum_personas_accommodations_text_size";
  ALTER TABLE "personas" ALTER COLUMN "accommodations_text_size" SET DATA TYPE "public"."enum_personas_accommodations_text_size" USING "accommodations_text_size"::"public"."enum_personas_accommodations_text_size";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_personas_accommodations_text_size" ADD VALUE 'xl';
  ALTER TABLE "personas" ALTER COLUMN "accommodations_text_size" SET DEFAULT 'm';`)
}
