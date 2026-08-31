import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "operator_config_cabin_lpu2_playbacks_cues" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"scene" varchar NOT NULL,
  	"cue" numeric NOT NULL
  );
  
  ALTER TABLE "operator_config_cabin_lpu2_playbacks_cues" ADD CONSTRAINT "operator_config_cabin_lpu2_playbacks_cues_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."operator_config_cabin_lpu2_playbacks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_cues_order_idx" ON "operator_config_cabin_lpu2_playbacks_cues" USING btree ("_order");
  CREATE INDEX "operator_config_cabin_lpu2_playbacks_cues_parent_id_idx" ON "operator_config_cabin_lpu2_playbacks_cues" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "operator_config_cabin_lpu2_playbacks_cues" CASCADE;`)
}
