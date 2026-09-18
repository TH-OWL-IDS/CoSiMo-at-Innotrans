import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "operator_config_cabin_light_scenes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"roofline_on" boolean DEFAULT true,
  	"roofline_intensity" numeric DEFAULT 100,
  	"roofline_bias" numeric DEFAULT -100,
  	"rooflight_on" boolean DEFAULT true,
  	"rooflight_intensity" numeric DEFAULT 100,
  	"rooflight_bias" numeric DEFAULT -100,
  	"floor_on" boolean DEFAULT true,
  	"floor_intensity" numeric DEFAULT 100,
  	"floor_bias" numeric DEFAULT -100
  );
  
  ALTER TABLE "operator_config_cabin_light_scenes" ADD CONSTRAINT "operator_config_cabin_light_scenes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "operator_config_cabin_light_scenes_order_idx" ON "operator_config_cabin_light_scenes" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_light_scenes_parent_id_idx" ON "operator_config_cabin_light_scenes" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "operator_config_cabin_light_scenes" CASCADE;`)
}
