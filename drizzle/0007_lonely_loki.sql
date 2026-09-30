CREATE TABLE "gold_market_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_id" bigint NOT NULL,
	"vendor_name" text NOT NULL,
	"product_name" text NOT NULL,
	"price_date" date NOT NULL,
	"buy_price" bigint NOT NULL,
	"buyback_price" bigint NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gold_lots" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "gold_lots" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE UNIQUE INDEX "gold_market_prices_external_id_uniq" ON "gold_market_prices" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "gold_market_prices_price_date_idx" ON "gold_market_prices" USING btree ("price_date");