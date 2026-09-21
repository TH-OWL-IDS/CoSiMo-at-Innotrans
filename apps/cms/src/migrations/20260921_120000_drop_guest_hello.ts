import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// The check-in (and with it the guest chip's hello) is gone — 2026-09-21.
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agent_config" DROP COLUMN IF EXISTS "guest_hello_de";
   ALTER TABLE "agent_config" DROP COLUMN IF EXISTS "guest_hello_en";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agent_config" ADD COLUMN "guest_hello_de" varchar;
   ALTER TABLE "agent_config" ADD COLUMN "guest_hello_en" varchar;`)
}
