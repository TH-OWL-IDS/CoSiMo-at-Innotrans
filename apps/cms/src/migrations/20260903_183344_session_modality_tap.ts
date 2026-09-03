import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_sessions_turns_modality" ADD VALUE 'tap';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sessions_turns" ALTER COLUMN "modality" SET DATA TYPE text;
  DROP TYPE "public"."enum_sessions_turns_modality";
  CREATE TYPE "public"."enum_sessions_turns_modality" AS ENUM('voice', 'text');
  ALTER TABLE "sessions_turns" ALTER COLUMN "modality" SET DATA TYPE "public"."enum_sessions_turns_modality" USING "modality"::"public"."enum_sessions_turns_modality";`)
}
