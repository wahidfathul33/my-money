ALTER TABLE "deposits" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "deposits" ADD COLUMN "last_interest_payment_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "deposits_idempotency_uniq" ON "deposits" USING btree ("user_id","idempotency_key") WHERE "deposits"."idempotency_key" IS NOT NULL;