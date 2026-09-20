// The agent_config text columns are NOT here: 20260920_150000_agent_texts added them
// (hand-written, so the generator's snapshot did not know them).
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_knowledge_topic" AS ENUM('monocab', 'cosimo');
  CREATE TABLE "knowledge" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"topic" "enum_knowledge_topic" DEFAULT 'monocab' NOT NULL,
  	"title" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"body" varchar NOT NULL,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "knowledge_id" integer;
  CREATE INDEX "knowledge_updated_at_idx" ON "knowledge" USING btree ("updated_at");
  CREATE INDEX "knowledge_created_at_idx" ON "knowledge" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_knowledge_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_knowledge_id_idx" ON "payload_locked_documents_rels" USING btree ("knowledge_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "knowledge" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "knowledge" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_knowledge_fk";
  
  DROP INDEX "payload_locked_documents_rels_knowledge_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "knowledge_id";
  DROP TYPE "public"."enum_knowledge_topic";`)
}
