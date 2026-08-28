import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "route_config_faults" CASCADE;
  DROP TYPE "public"."enum_route_config_faults_kind";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_route_config_faults_kind" AS ENUM('signal-hold', 'door-fault', 'slow-order', 'low-battery');
  CREATE TABLE "route_config_faults" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_route_config_faults_kind" NOT NULL,
  	"every_minutes" numeric DEFAULT 10,
  	"chance_pct" numeric DEFAULT 30,
  	"duration_sec" numeric DEFAULT 45
  );
  
  ALTER TABLE "route_config_faults" ADD CONSTRAINT "route_config_faults_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."route_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "route_config_faults_order_idx" ON "route_config_faults" USING btree ("_order");
  CREATE INDEX "route_config_faults_parent_id_idx" ON "route_config_faults" USING btree ("_parent_id");`)
}
