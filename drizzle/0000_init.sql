-- docs/04-database-schema.md §13. Required before tx_note_trgm_idx below
-- (gin_trgm_ops), which is why this runs first in this migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('active', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('gold', 'deposit', 'property', 'vehicle', 'other');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."category_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('active', 'matured', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."entry_source" AS ENUM('transaction', 'opening_balance', 'adjustment', 'savings_contribution', 'savings_withdrawal', 'debt_disbursement', 'debt_payment', 'receivable_disbursement', 'receivable_payment', 'gold_purchase', 'gold_sale', 'deposit_placement', 'deposit_withdrawal', 'deposit_interest');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'pending', 'removed');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('active', 'partially_paid', 'paid', 'written_off');--> statement-breakpoint
CREATE TYPE "public"."payout_schedule" AS ENUM('at_maturity', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."savings_status" AS ENUM('active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('cash', 'bank', 'ewallet', 'credit_card');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"default_currency" text DEFAULT 'IDR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"locale" text DEFAULT 'id-ID' NOT NULL,
	"default_wallet_id" uuid,
	"count_receivables_as_asset" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "household_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "household_role" DEFAULT 'member' NOT NULL,
	"invited_by" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by" uuid,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hi_email_lower" CHECK ("household_invitations"."email" = lower("household_invitations"."email"))
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" DEFAULT 'member' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"share_wealth" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"default_currency" text DEFAULT 'IDR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"created_by" uuid NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_name_not_blank" CHECK (length(btrim("households"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "wallet_type" NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"icon" text DEFAULT 'dompet' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"exclude_from_household" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_name_not_blank" CHECK (length(btrim("wallets"."name")) > 0),
	CONSTRAINT "wallets_cc_non_positive" CHECK ("wallets"."type" <> 'credit_card' OR "wallets"."balance" <= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"name_norm" text GENERATED ALWAYS AS (lower(btrim("categories"."name"))) STORED,
	"type" "category_type" NOT NULL,
	"system_key" text,
	"icon" text DEFAULT 'tag' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_no_self_parent" CHECK ("categories"."id" <> "categories"."parent_id"),
	CONSTRAINT "categories_system_no_parent" CHECK ("categories"."system_key" IS NULL OR "categories"."parent_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"source" "entry_source" NOT NULL,
	"transaction_id" uuid,
	"source_id" uuid,
	"entry_date" timestamp with time zone NOT NULL,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_amount_nonzero" CHECK ("ledger_entries"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid,
	"type" "transaction_type" NOT NULL,
	"category_id" uuid,
	"amount" bigint NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"note" text,
	"counterparty_user_id" uuid,
	"linked_transaction_id" uuid,
	"created_by" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"idempotency_key" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tx_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "tx_category_rule" CHECK (("transactions"."type" = 'transfer' AND "transactions"."category_id" IS NULL) OR ("transactions"."type" <> 'transfer' AND "transactions"."category_id" IS NOT NULL)),
	CONSTRAINT "tx_counterparty_rule" CHECK ("transactions"."counterparty_user_id" IS NULL OR ("transactions"."type" = 'transfer' AND "transactions"."counterparty_user_id" <> "transactions"."user_id")),
	CONSTRAINT "tx_link_requires_counterparty" CHECK ("transactions"."linked_transaction_id" IS NULL OR "transactions"."counterparty_user_id" IS NOT NULL),
	CONSTRAINT "tx_no_self_link" CHECK ("transactions"."linked_transaction_id" <> "transactions"."id"),
	CONSTRAINT "tx_created_by_rule" CHECK ("transactions"."created_by" = "transactions"."user_id" OR ("transactions"."type" = 'transfer' AND "transactions"."counterparty_user_id" = "transactions"."created_by"))
);
--> statement-breakpoint
CREATE TABLE "savings_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"savings_goal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"contribution_date" timestamp with time zone NOT NULL,
	"note" text,
	"idempotency_key" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sc_amount_nonzero" CHECK ("savings_contributions"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "savings_goals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"target_amount" bigint NOT NULL,
	"current_amount" bigint DEFAULT 0 NOT NULL,
	"target_date" date,
	"status" "savings_status" DEFAULT 'active' NOT NULL,
	"icon" text DEFAULT 'target' NOT NULL,
	"color" text DEFAULT 'emerald' NOT NULL,
	"exclude_from_household" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sg_target_positive" CHECK ("savings_goals"."target_amount" > 0),
	CONSTRAINT "sg_current_nonneg" CHECK ("savings_goals"."current_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"cached_value" bigint DEFAULT 0 NOT NULL,
	"cached_at" timestamp with time zone,
	"exclude_from_household" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"principal" bigint NOT NULL,
	"interest_rate_annual" numeric(7, 4) NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0.2000' NOT NULL,
	"start_date" date NOT NULL,
	"maturity_date" date NOT NULL,
	"payout_schedule" "payout_schedule" DEFAULT 'at_maturity' NOT NULL,
	"aro_enabled" boolean DEFAULT false NOT NULL,
	"aro_include_interest" boolean DEFAULT false NOT NULL,
	"status" "deposit_status" DEFAULT 'active' NOT NULL,
	"wallet_id" uuid,
	"rolled_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_principal_positive" CHECK ("deposits"."principal" > 0),
	CONSTRAINT "deposit_dates_valid" CHECK ("deposits"."maturity_date" > "deposits"."start_date"),
	CONSTRAINT "deposit_rate_sane" CHECK ("deposits"."interest_rate_annual" BETWEEN 0 AND 100),
	CONSTRAINT "deposit_tax_sane" CHECK ("deposits"."tax_rate" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "gold_lots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weight_grams" numeric(18, 4) NOT NULL,
	"remaining_grams" numeric(18, 4) NOT NULL,
	"purchase_price_per_gram" bigint NOT NULL,
	"purchase_date" date NOT NULL,
	"gold_form" text,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gold_weight_positive" CHECK ("gold_lots"."weight_grams" > 0),
	CONSTRAINT "gold_remaining_valid" CHECK ("gold_lots"."remaining_grams" >= 0 AND "gold_lots"."remaining_grams" <= "gold_lots"."weight_grams")
);
--> statement-breakpoint
CREATE TABLE "gold_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"price_date" date NOT NULL,
	"sell_price_per_gram" bigint NOT NULL,
	"buyback_price_per_gram" bigint NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gold_price_positive" CHECK ("gold_prices"."sell_price_per_gram" > 0 AND "gold_prices"."buyback_price_per_gram" > 0),
	CONSTRAINT "gold_buyback_lte_sell" CHECK ("gold_prices"."buyback_price_per_gram" <= "gold_prices"."sell_price_per_gram")
);
--> statement-breakpoint
CREATE TABLE "gold_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"weight_grams" numeric(18, 4) NOT NULL,
	"price_per_gram" bigint NOT NULL,
	"proceeds" bigint NOT NULL,
	"cost_basis" bigint NOT NULL,
	"realized_gain" bigint NOT NULL,
	"sale_date" date NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"debt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"payment_date" date NOT NULL,
	"note" text,
	"idempotency_key" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payment_positive" CHECK ("debt_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "debts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"creditor_name" text NOT NULL,
	"counterparty_user_id" uuid,
	"initial_amount" bigint NOT NULL,
	"remaining_amount" bigint NOT NULL,
	"interest_rate" numeric(7, 4) DEFAULT '0',
	"start_date" date NOT NULL,
	"due_date" date,
	"status" "obligation_status" DEFAULT 'active' NOT NULL,
	"affects_wallet" boolean DEFAULT true NOT NULL,
	"wallet_id" uuid,
	"exclude_from_household" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_initial_positive" CHECK ("debts"."initial_amount" > 0),
	CONSTRAINT "debt_remaining_valid" CHECK ("debts"."remaining_amount" >= 0 AND "debts"."remaining_amount" <= "debts"."initial_amount")
);
--> statement-breakpoint
CREATE TABLE "receivable_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"receivable_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"ledger_entry_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"payment_date" date NOT NULL,
	"note" text,
	"idempotency_key" text,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_payment_positive" CHECK ("receivable_payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"debtor_name" text NOT NULL,
	"counterparty_user_id" uuid,
	"initial_amount" bigint NOT NULL,
	"remaining_amount" bigint NOT NULL,
	"interest_rate" numeric(7, 4) DEFAULT '0',
	"start_date" date NOT NULL,
	"due_date" date,
	"status" "obligation_status" DEFAULT 'active' NOT NULL,
	"affects_wallet" boolean DEFAULT true NOT NULL,
	"wallet_id" uuid,
	"exclude_from_household" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receivable_initial_positive" CHECK ("receivables"."initial_amount" > 0),
	CONSTRAINT "receivable_remaining_valid" CHECK ("receivables"."remaining_amount" >= 0 AND "receivables"."remaining_amount" <= "receivables"."initial_amount")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"household_id" uuid,
	"category_id" uuid,
	"category_key" text,
	"amount" bigint NOT NULL,
	"period_type" "budget_period" DEFAULT 'monthly' NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"is_recurring" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_amount_positive" CHECK ("budgets"."amount" > 0),
	CONSTRAINT "budget_period_valid" CHECK ("budgets"."period_end" >= "budgets"."period_start"),
	CONSTRAINT "budget_scope_exclusive" CHECK (("budgets"."user_id" IS NOT NULL AND "budgets"."household_id" IS NULL AND "budgets"."category_id" IS NOT NULL AND "budgets"."category_key" IS NULL) OR ("budgets"."household_id" IS NOT NULL AND "budgets"."user_id" IS NULL AND "budgets"."category_key" IS NOT NULL AND "budgets"."category_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "household_net_worth_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_assets" bigint NOT NULL,
	"total_liabilities" bigint NOT NULL,
	"net_worth" bigint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"member_count" integer NOT NULL,
	"contributing_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_assets" bigint NOT NULL,
	"total_liabilities" bigint NOT NULL,
	"net_worth" bigint NOT NULL,
	"breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invitations" ADD CONSTRAINT "household_invitations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_savings_goal_id_savings_goals_id_fk" FOREIGN KEY ("savings_goal_id") REFERENCES "public"."savings_goals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_contributions" ADD CONSTRAINT "savings_contributions_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_rolled_from_id_deposits_id_fk" FOREIGN KEY ("rolled_from_id") REFERENCES "public"."deposits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_lots" ADD CONSTRAINT "gold_lots_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_lots" ADD CONSTRAINT "gold_lots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_lots" ADD CONSTRAINT "gold_lots_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_prices" ADD CONSTRAINT "gold_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_sales" ADD CONSTRAINT "gold_sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_sales" ADD CONSTRAINT "gold_sales_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gold_sales" ADD CONSTRAINT "gold_sales_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debts" ADD CONSTRAINT "debts_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_ledger_entry_id_ledger_entries_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_net_worth_snapshots" ADD CONSTRAINT "household_net_worth_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hi_token_uniq" ON "household_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "hi_pending_uniq" ON "household_invitations" USING btree ("household_id","email") WHERE "household_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "hi_email_pending_idx" ON "household_invitations" USING btree ("email","status") WHERE "household_invitations"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "hm_unique_membership" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "hm_user_active_idx" ON "household_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "hm_household_active_idx" ON "household_members" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hm_single_owner_idx" ON "household_members" USING btree ("household_id") WHERE "household_members"."role" = 'owner' AND "household_members"."status" = 'active';--> statement-breakpoint
CREATE INDEX "hm_sharing_idx" ON "household_members" USING btree ("household_id") WHERE "household_members"."status" = 'active' AND "household_members"."share_wealth" = true;--> statement-breakpoint
CREATE INDEX "wallets_user_active_idx" ON "wallets" USING btree ("user_id","is_archived","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_system_key_uniq" ON "categories" USING btree ("user_id","system_key") WHERE "categories"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_type_uniq" ON "categories" USING btree ("user_id","name_norm","type") WHERE "categories"."is_archived" = false;--> statement-breakpoint
CREATE INDEX "categories_user_type_idx" ON "categories" USING btree ("user_id","type","is_archived");--> statement-breakpoint
CREATE INDEX "categories_system_key_idx" ON "categories" USING btree ("system_key") WHERE "categories"."system_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ledger_wallet_idx" ON "ledger_entries" USING btree ("wallet_id","entry_date" DESC NULLS LAST) WHERE "ledger_entries"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger_entries" USING btree ("user_id","entry_date" DESC NULLS LAST) WHERE "ledger_entries"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ledger_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_source_idx" ON "ledger_entries" USING btree ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tx_link_uniq" ON "transactions" USING btree ("linked_transaction_id") WHERE "transactions"."linked_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tx_idempotency_uniq" ON "transactions" USING btree ("user_id","idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tx_user_date_idx" ON "transactions" USING btree ("user_id","transaction_date" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_user_category_date_idx" ON "transactions" USING btree ("user_id","category_id","transaction_date" DESC NULLS LAST) WHERE "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_household_date_idx" ON "transactions" USING btree ("household_id","transaction_date" DESC NULLS LAST) WHERE "transactions"."household_id" IS NOT NULL AND "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_household_member_idx" ON "transactions" USING btree ("household_id","user_id","transaction_date" DESC NULLS LAST) WHERE "transactions"."household_id" IS NOT NULL AND "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_unacknowledged_idx" ON "transactions" USING btree ("user_id","transaction_date" DESC NULLS LAST) WHERE "transactions"."acknowledged_at" IS NULL AND "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tx_note_trgm_idx" ON "transactions" USING gin ("note" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tx_user_local_date_idx" ON "transactions" USING btree ("user_id",(("transaction_date" AT TIME ZONE 'Asia/Jakarta')::date) DESC) WHERE "transactions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sc_goal_idx" ON "savings_contributions" USING btree ("savings_goal_id","contribution_date" DESC NULLS LAST) WHERE "savings_contributions"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sc_user_idx" ON "savings_contributions" USING btree ("user_id","contribution_date" DESC NULLS LAST) WHERE "savings_contributions"."voided_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sc_idempotency_uniq" ON "savings_contributions" USING btree ("user_id","idempotency_key") WHERE "savings_contributions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sg_user_status_idx" ON "savings_goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "sg_household_status_idx" ON "savings_goals" USING btree ("household_id","status") WHERE "savings_goals"."household_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assets_user_type_idx" ON "assets" USING btree ("user_id","asset_type","status");--> statement-breakpoint
CREATE INDEX "deposits_user_status_idx" ON "deposits" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "deposits_maturity_idx" ON "deposits" USING btree ("maturity_date") WHERE "deposits"."status" = 'active';--> statement-breakpoint
CREATE INDEX "gold_lots_asset_idx" ON "gold_lots" USING btree ("asset_id") WHERE "gold_lots"."remaining_grams" > 0;--> statement-breakpoint
CREATE UNIQUE INDEX "gold_prices_user_date_uniq" ON "gold_prices" USING btree ("user_id","price_date");--> statement-breakpoint
CREATE INDEX "debt_payments_debt_idx" ON "debt_payments" USING btree ("debt_id","payment_date" DESC NULLS LAST) WHERE "debt_payments"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "debts_user_status_idx" ON "debts" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "debts_due_idx" ON "debts" USING btree ("user_id","due_date") WHERE "debts"."status" IN ('active','partially_paid');--> statement-breakpoint
CREATE INDEX "receivable_payments_receivable_idx" ON "receivable_payments" USING btree ("receivable_id","payment_date" DESC NULLS LAST) WHERE "receivable_payments"."voided_at" IS NULL;--> statement-breakpoint
CREATE INDEX "receivables_user_status_idx" ON "receivables" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "receivables_due_idx" ON "receivables" USING btree ("user_id","due_date") WHERE "receivables"."status" IN ('active','partially_paid');--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_personal_uniq" ON "budgets" USING btree ("user_id","category_id","period_start") WHERE "budgets"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_household_uniq" ON "budgets" USING btree ("household_id","category_key","period_start") WHERE "budgets"."household_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "budgets_period_idx" ON "budgets" USING btree ("period_start" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "hnw_household_date_uniq" ON "household_net_worth_snapshots" USING btree ("household_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "hnw_household_idx" ON "household_net_worth_snapshots" USING btree ("household_id","snapshot_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "nw_user_date_uniq" ON "net_worth_snapshots" USING btree ("user_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "nw_user_idx" ON "net_worth_snapshots" USING btree ("user_id","snapshot_date" DESC NULLS LAST);--> statement-breakpoint
-- docs/04-database-schema.md §5: users is declared before wallets exists, so
-- this FK is added here rather than inline on the column (see
-- src/lib/db/schema/users.ts for why, and the ADD CONSTRAINT ... ON DELETE
-- SET NULL in the raw DDL that this mirrors).
ALTER TABLE "users" ADD CONSTRAINT "users_default_wallet_fk"
  FOREIGN KEY ("default_wallet_id") REFERENCES "public"."wallets"("id") ON DELETE SET NULL;