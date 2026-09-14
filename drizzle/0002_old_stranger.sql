ALTER TABLE "gold_lots" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "gold_sales" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "gl_idempotency_uniq" ON "gold_lots" USING btree ("user_id","idempotency_key") WHERE "gold_lots"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "gs_idempotency_uniq" ON "gold_sales" USING btree ("user_id","idempotency_key") WHERE "gold_sales"."idempotency_key" IS NOT NULL;