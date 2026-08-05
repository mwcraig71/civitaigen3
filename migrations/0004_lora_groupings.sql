CREATE TABLE "lora_groupings" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"char_ids" json DEFAULT '[]'::json NOT NULL,
	"style_override_ids" json DEFAULT '[]'::json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lora_groupings" ADD CONSTRAINT "lora_groupings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;