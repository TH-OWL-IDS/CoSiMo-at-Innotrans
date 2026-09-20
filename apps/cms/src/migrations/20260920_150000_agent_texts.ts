import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agent_config" ADD COLUMN "info_question_de" varchar;
   ALTER TABLE "agent_config" ADD COLUMN "info_question_en" varchar;
   ALTER TABLE "agent_config" ADD COLUMN "guest_hello_de" varchar;
   ALTER TABLE "agent_config" ADD COLUMN "guest_hello_en" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agent_config" DROP COLUMN "info_question_de";
   ALTER TABLE "agent_config" DROP COLUMN "info_question_en";
   ALTER TABLE "agent_config" DROP COLUMN "guest_hello_de";
   ALTER TABLE "agent_config" DROP COLUMN "guest_hello_en";`)
}
