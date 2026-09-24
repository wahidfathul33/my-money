CREATE TYPE "public"."recurring_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TABLE "recurring_savings_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rsc_amount_positive" CHECK ("recurring_savings_contributions"."amount" > 0),
	CONSTRAINT "rsc_end_date_valid" CHECK ("recurring_savings_contributions"."end_date" IS NULL OR "recurring_savings_contributions"."end_date" >= "recurring_savings_contributions"."start_date")
);
--> statement-breakpoint
CREATE TABLE "recurring_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid,
	"type" "category_type" NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"note" text,
	"frequency" "recurring_frequency" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_run_date" date NOT NULL,
	"status" "recurring_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rt_amount_positive" CHECK ("recurring_transactions"."amount" > 0),
	CONSTRAINT "rt_end_date_valid" CHECK ("recurring_transactions"."end_date" IS NULL OR "recurring_transactions"."end_date" >= "recurring_transactions"."start_date")
);
--> statement-breakpoint
ALTER TABLE "recurring_savings_contributions" ADD CONSTRAINT "recurring_savings_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_savings_contributions" ADD CONSTRAINT "recurring_savings_contributions_goal_id_savings_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_savings_contributions" ADD CONSTRAINT "recurring_savings_contributions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_transactions" ADD CONSTRAINT "recurring_transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rsc_status_next_run_idx" ON "recurring_savings_contributions" USING btree ("status","next_run_date");--> statement-breakpoint
CREATE INDEX "rsc_user_idx" ON "recurring_savings_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rsc_goal_idx" ON "recurring_savings_contributions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "rt_status_next_run_idx" ON "recurring_transactions" USING btree ("status","next_run_date");--> statement-breakpoint
CREATE INDEX "rt_user_idx" ON "recurring_transactions" USING btree ("user_id");
