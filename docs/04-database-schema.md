# 04 — Database Schema

Neon PostgreSQL + Drizzle ORM. DDL ditulis sebagai SQL untuk kejelasan; implementasinya memakai `drizzle-orm/pg-core`, migrasi dihasilkan `drizzle-kit`.

## 1. Konvensi

| Aspek | Aturan |
|-------|--------|
| Primary key | `UUID` v7, dibuat di aplikasi (`uuidv7()`) — terurut waktu, tidak memecah locality index B-tree |
| Uang | `BIGINT`, satuan minor skala 2 (sen). Tidak pernah `float`/`real`/`double` |
| Nama | Kolom `snake_case`; tabel jamak `snake_case` |
| Timestamp | `TIMESTAMPTZ NOT NULL DEFAULT now()` |
| Soft delete | `deleted_at` pada entitas config; `voided_at` pada catatan finansial |
| Enum | Postgres `ENUM` — mencegah nilai tak sah di level DB |
| FK | Eksplisit, `ON DELETE` dipilih sengaja per relasi |
| Household | `household_id` **selalu nullable** dan tidak pernah menyatakan kepemilikan |

### Tiga aturan yang mengikat seluruh skema

1. **Tidak ada tabel finansial yang dimiliki household.** Tidak ada `wallets.household_id`, tidak ada `household_wallets`, tidak ada kolom saldo di `households`.
2. **Tidak ada tabel izin lintas-user.** Tidak ada `wallet_access` atau padanannya. Berbagi hanya lewat dua mekanisme di [03 §5](03-domain-model.md#5-model-berbagi).
3. **Tepat satu operasi boleh menulis ke dompet milik user lain:** mencatat transfer ke sesama anggota household, ke dompet penerima yang dipilih pengirim dari daftar yang terlihat, teratribusi lewat `created_by`, dan dapat di-void sepihak oleh pemiliknya. `ledger_entries.user_id` tetap selalu pemilik wallet.

## 2. Enum

```sql
CREATE TYPE wallet_type       AS ENUM ('cash','bank','ewallet','credit_card');
CREATE TYPE transaction_type  AS ENUM ('income','expense','transfer');
CREATE TYPE category_type     AS ENUM ('income','expense');
CREATE TYPE entry_source      AS ENUM (
  'transaction','opening_balance','adjustment',
  'savings_contribution','savings_withdrawal',
  'debt_disbursement','debt_payment',
  'receivable_disbursement','receivable_payment',
  'gold_purchase','gold_sale',
  'deposit_placement','deposit_withdrawal','deposit_interest'
);
CREATE TYPE savings_status    AS ENUM ('active','completed','archived');
CREATE TYPE asset_type        AS ENUM ('gold','deposit','property','vehicle','other');
CREATE TYPE asset_status      AS ENUM ('active','disposed');
CREATE TYPE deposit_status    AS ENUM ('active','matured','withdrawn');
CREATE TYPE payout_schedule   AS ENUM ('at_maturity','monthly');
CREATE TYPE obligation_status AS ENUM ('active','partially_paid','paid','written_off');
CREATE TYPE budget_period     AS ENUM ('monthly','custom');

-- Household
CREATE TYPE household_role    AS ENUM ('owner','member');
CREATE TYPE membership_status AS ENUM ('active','pending','removed');
CREATE TYPE invitation_status AS ENUM ('pending','accepted','expired','revoked');
```

> Enum yang **sengaja tidak ada**: `transfer_kind`, `transfer_status`, `wallet_permission`, `contribution_mode`. Masing-masing dihapus bersama fitur yang memerlukannya — lihat [16-decision-log](16-decision-log.md#adr-023--transfer-antar-anggota-dicatat-masing-masing).

## 3. Identitas & Preferensi

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY,
  name              TEXT,
  email             TEXT NOT NULL UNIQUE,
  email_verified    TIMESTAMPTZ,
  image             TEXT,

  default_currency  CHAR(3)     NOT NULL DEFAULT 'IDR',
  timezone          TEXT        NOT NULL DEFAULT 'Asia/Jakarta',
  locale            TEXT        NOT NULL DEFAULT 'id-ID',
  default_wallet_id UUID,
  count_receivables_as_asset BOOLEAN NOT NULL DEFAULT false,
  onboarded_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
```

Tabel `accounts`, `sessions`, `verification_tokens` mengikuti skema Auth.js Drizzle adapter.

## 4. Household

```sql
CREATE TABLE households (
  id               UUID PRIMARY KEY,
  name             TEXT NOT NULL,
  default_currency CHAR(3) NOT NULL DEFAULT 'IDR',
  timezone         TEXT    NOT NULL DEFAULT 'Asia/Jakarta',
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_archived      BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT households_name_not_blank CHECK (length(btrim(name)) > 0)
);
```

> Perhatikan yang **tidak** ada: kolom saldo, total aset, atau nilai finansial apa pun. Setiap angka household dihitung saat query dari data milik anggotanya.

```sql
CREATE TABLE household_members (
  id            UUID PRIMARY KEY,
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          household_role    NOT NULL DEFAULT 'member',
  status        membership_status NOT NULL DEFAULT 'active',

  -- Satu-satunya sakelar berbagi kekayaan. Default: tidak berbagi.
  share_wealth  BOOLEAN NOT NULL DEFAULT false,

  joined_at     TIMESTAMPTZ,
  removed_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hm_unique_membership UNIQUE (household_id, user_id)
);

CREATE INDEX hm_user_active_idx      ON household_members (user_id, status);
CREATE INDEX hm_household_active_idx ON household_members (household_id, status);

-- Setiap household harus punya tepat satu owner aktif
CREATE UNIQUE INDEX hm_single_owner_idx
  ON household_members (household_id)
  WHERE role = 'owner' AND status = 'active';

-- Anggota yang berbagi kekayaan — dipakai agregasi net worth household
CREATE INDEX hm_sharing_idx ON household_members (household_id)
  WHERE status = 'active' AND share_wealth = true;
```

`hm_unique_membership` memakai `UNIQUE` penuh sehingga keanggotaan yang pernah `removed` menghalangi baris duplikat — bergabung kembali memperbarui baris yang ada.

```sql
CREATE TABLE household_invitations (
  id            UUID PRIMARY KEY,
  household_id  UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          household_role NOT NULL DEFAULT 'member',
  invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash    TEXT NOT NULL,              -- SHA-256; token asli hanya di email
  status        invitation_status NOT NULL DEFAULT 'pending',
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hi_email_lower CHECK (email = lower(email))
);

CREATE UNIQUE INDEX hi_token_uniq ON household_invitations (token_hash);
CREATE UNIQUE INDEX hi_pending_uniq
  ON household_invitations (household_id, email) WHERE status = 'pending';
CREATE INDEX hi_email_pending_idx
  ON household_invitations (email, status) WHERE status = 'pending';
```

**Token disimpan ter-hash.** Kalau database bocor, token asli tidak dapat direkonstruksi.

## 5. Dompet

```sql
CREATE TABLE dompet (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- kepemilikan, tetap
  name        TEXT NOT NULL,
  type        wallet_type NOT NULL,
  balance     BIGINT NOT NULL DEFAULT 0,   -- CACHE. Kebenaran: ledger_entries
  currency    CHAR(3) NOT NULL DEFAULT 'IDR',
  icon        TEXT NOT NULL DEFAULT 'dompet',
  color       TEXT NOT NULL DEFAULT 'slate',
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Pengecualian dari kekayaan keluarga; hanya berlaku bila share_wealth aktif
  exclude_from_household BOOLEAN NOT NULL DEFAULT false,

  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT wallets_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT wallets_cc_non_positive CHECK (type <> 'credit_card' OR balance <= 0)
);

CREATE INDEX wallets_user_active_idx ON dompet (user_id, is_archived, sort_order);

ALTER TABLE users
  ADD CONSTRAINT users_default_wallet_fk
  FOREIGN KEY (default_wallet_id) REFERENCES dompet(id) ON DELETE SET NULL;
```

> Tidak ada `household_id`, dan **tidak ada tabel izin yang menempel pada dompet**. Dompet dimiliki tepat satu user selamanya, dan tidak ada mekanisme memberi orang lain akses baca ke isinya.

## 6. Kategori

```sql
CREATE TABLE categories (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name        TEXT NOT NULL,
  name_norm   TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,  -- untuk keunikan
  type        category_type NOT NULL,

  -- Kunci kanonis kategori bawaan. NULL untuk kategori kustom.
  -- Inilah yang membuat agregasi household eksak.
  system_key  TEXT,

  icon        TEXT NOT NULL DEFAULT 'tag',
  color       TEXT NOT NULL DEFAULT 'slate',
  is_archived BOOLEAN NOT NULL DEFAULT false,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT categories_no_self_parent CHECK (id <> parent_id),
  -- Kategori bawaan tidak boleh punya parent; hierarki hanya untuk kategori kustom
  CONSTRAINT categories_system_no_parent CHECK (system_key IS NULL OR parent_id IS NULL)
);

-- Satu kategori bawaan per kunci per user
CREATE UNIQUE INDEX categories_user_system_key_uniq
  ON categories (user_id, system_key) WHERE system_key IS NOT NULL;

CREATE UNIQUE INDEX categories_user_name_type_uniq
  ON categories (user_id, name_norm, type) WHERE is_archived = false;

CREATE INDEX categories_user_type_idx  ON categories (user_id, type, is_archived);
CREATE INDEX categories_system_key_idx ON categories (system_key)
  WHERE system_key IS NOT NULL;
```

**`system_key` menggantikan pencocokan nama.** Laporan dan budget household mengelompokkan lewat kolom ini, sehingga "Makan & Minum" milik Wahid dan milik Istri berkumpul secara eksak. Mengganti nama kategori bawaan tidak merusak agregasi.

Kategori kustom (`system_key IS NULL`) tetap ditampilkan di laporan household sebagai barisnya sendiri disertai nama pemiliknya — tidak dilebur, tidak dibuang, dan tidak dicocokkan secara kabur.

Trigger `enforce_category_depth()` membatasi kedalaman ke satu tingkat:

```sql
CREATE FUNCTION enforce_category_depth() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Kategori hanya boleh satu tingkat kedalaman';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER categories_depth_check
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION enforce_category_depth();
```

### Katalog kanonis

Daftar `system_key` didefinisikan di kode (`src/lib/db/seed/categories.ts`), bukan di database, dan di-seed identik untuk setiap pengguna baru. Isinya ada di [03 §7.1](03-domain-model.md#71-katalog-kanonis).

Menambah kategori bawaan di masa depan berarti menambah entri ke katalog **dan** migrasi yang menyisipkannya untuk pengguna yang sudah ada. Kunci yang sudah dirilis tidak pernah diubah atau dipakai ulang.

## 7. Transaksi & Ledger

```sql
CREATE TABLE transactions (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- kepemilikan
  household_id      UUID REFERENCES households(id) ON DELETE SET NULL,     -- TAG konteks
  type              transaction_type NOT NULL,
  category_id       UUID REFERENCES categories(id) ON DELETE RESTRICT,
  amount            BIGINT NOT NULL,          -- selalu positif; tanda ada di ledger
  transaction_date  TIMESTAMPTZ NOT NULL,
  note              TEXT,

  -- Transfer ke anggota household: lawan transaksi dan tautan dua sisi.
  -- Keduanya NULL untuk transaksi biasa dan transfer antar dompet sendiri.
  counterparty_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  -- Siapa yang menulis baris ini. Sama dengan user_id kecuali pada sisi
  -- penerima transfer antar anggota, yang ditulis pengirim.
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  acknowledged_at  TIMESTAMPTZ,   -- diisi saat pemilik melihatnya di Aktivitas

  idempotency_key   TEXT,
  voided_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tx_amount_positive CHECK (amount > 0),
  CONSTRAINT tx_category_rule CHECK (
    (type =  'transfer' AND category_id IS NULL) OR
    (type <> 'transfer' AND category_id IS NOT NULL)
  ),
  -- Lawan transaksi hanya bermakna pada transfer, dan tidak boleh diri sendiri
  CONSTRAINT tx_counterparty_rule CHECK (
    counterparty_user_id IS NULL
    OR (type = 'transfer' AND counterparty_user_id <> user_id)
  ),
  -- Menautkan hanya mungkin bila ada lawan transaksi
  CONSTRAINT tx_link_requires_counterparty CHECK (
    linked_transaction_id IS NULL OR counterparty_user_id IS NOT NULL
  ),
  CONSTRAINT tx_no_self_link CHECK (linked_transaction_id <> id),
  -- Baris yang ditulis orang lain hanya sah pada transfer antar anggota
  CONSTRAINT tx_created_by_rule CHECK (
    created_by = user_id
    OR (type = 'transfer' AND counterparty_user_id = created_by)
  )
);

-- Satu transaksi hanya boleh ditautkan sekali
CREATE UNIQUE INDEX tx_link_uniq ON transactions (linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX tx_idempotency_uniq
  ON transactions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX tx_user_date_idx
  ON transactions (user_id, transaction_date DESC, id DESC) WHERE voided_at IS NULL;

CREATE INDEX tx_user_category_date_idx
  ON transactions (user_id, category_id, transaction_date DESC) WHERE voided_at IS NULL;

-- Agregasi household
CREATE INDEX tx_household_date_idx
  ON transactions (household_id, transaction_date DESC)
  WHERE household_id IS NOT NULL AND voided_at IS NULL;

CREATE INDEX tx_household_member_idx
  ON transactions (household_id, user_id, transaction_date DESC)
  WHERE household_id IS NOT NULL AND voided_at IS NULL;

-- Aktivitas: baris yang ditulis orang lain dan belum dilihat pemiliknya
CREATE INDEX tx_unacknowledged_idx
  ON transactions (user_id, transaction_date DESC)
  WHERE acknowledged_at IS NULL AND voided_at IS NULL;

CREATE INDEX tx_note_trgm_idx ON transactions USING gin (note gin_trgm_ops);
```

> **Tidak ada `transfer_group_id`, dan tidak ada tabel `transfer_groups`.** Untuk transfer antar dompet sendiri, kedua ledger entry sudah terhubung lewat `transaction_id`. Untuk transfer ke anggota, penghubungnya adalah `linked_transaction_id` antar dua baris transaksi yang masing-masing **dimiliki** orangnya sendiri — meski keduanya ditulis pengirim.

> `tx_created_by_rule` mempersempit pengecualian aturan 1.3 ke satu bentuk saja. Baris yang `created_by <> user_id` hanya sah bila ia sisi penerima sebuah transfer antar anggota. Bentuk lain ditolak database, bukan hanya oleh kode.

```sql
CREATE TABLE ledger_entries (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id      UUID NOT NULL REFERENCES dompet(id) ON DELETE RESTRICT,
  amount         BIGINT NOT NULL,   -- BERTANDA: negatif = keluar, positif = masuk
  source         entry_source NOT NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE RESTRICT,
  source_id      UUID,              -- id polimorfik: debt_payment, gold_lot, dst.
  entry_date     TIMESTAMPTZ NOT NULL,
  voided_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ledger_amount_nonzero CHECK (amount <> 0)
);

CREATE INDEX ledger_wallet_idx ON ledger_entries (wallet_id, entry_date DESC)
  WHERE voided_at IS NULL;
CREATE INDEX ledger_user_idx   ON ledger_entries (user_id, entry_date DESC)
  WHERE voided_at IS NULL;
CREATE INDEX ledger_tx_idx     ON ledger_entries (transaction_id);
CREATE INDEX ledger_source_idx ON ledger_entries (source, source_id);
```

> `ON DELETE RESTRICT` pada `wallet_id` dan `transaction_id` disengaja. Catatan finansial tidak boleh lenyap karena penghapusan induk yang tidak sengaja. Satu-satunya cascade yang diizinkan berasal dari `users`, dan itu hanya pada penghapusan akun yang dikonfirmasi eksplisit.

**Invarian struktural yang penting:** `ledger_entries.user_id` selalu sama dengan `wallets.user_id` untuk `wallet_id`-nya. Tidak ada jalur kode yang boleh melanggarnya, dan job rekonsiliasi memeriksanya.

### Index ekspresi untuk agregasi harian

```sql
CREATE INDEX tx_user_local_date_idx ON transactions (
  user_id, ((transaction_date AT TIME ZONE 'Asia/Jakarta')::date) DESC
) WHERE voided_at IS NULL;
```

Index ekspresi menuntut zona waktu literal (IMMUTABLE). Selama MVP semua pengguna dan household dianggap `Asia/Jakarta`. Untuk multi-timezone, ganti dengan kolom tersimpan `local_date DATE` yang diisi di lapisan aplikasi saat menulis.

## 8. Savings

```sql
CREATE TABLE savings_goals (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- pembuat
  household_id   UUID REFERENCES households(id) ON DELETE SET NULL,     -- NULL = pribadi
  name           TEXT NOT NULL,
  target_amount  BIGINT NOT NULL,
  current_amount BIGINT NOT NULL DEFAULT 0,   -- CACHE dari savings_contributions
  target_date    DATE,
  status         savings_status NOT NULL DEFAULT 'active',
  icon           TEXT NOT NULL DEFAULT 'target',
  color          TEXT NOT NULL DEFAULT 'emerald',
  exclude_from_household BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sg_target_positive CHECK (target_amount > 0),
  CONSTRAINT sg_current_nonneg  CHECK (current_amount >= 0)
);

CREATE INDEX sg_user_status_idx      ON savings_goals (user_id, status);
CREATE INDEX sg_household_status_idx ON savings_goals (household_id, status)
  WHERE household_id IS NOT NULL;

CREATE TABLE savings_contributions (
  id                UUID PRIMARY KEY,
  savings_goal_id   UUID NOT NULL REFERENCES savings_goals(id) ON DELETE RESTRICT,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- kontributor
  wallet_id         UUID NOT NULL REFERENCES dompet(id) ON DELETE RESTRICT,

  -- NOT NULL: inilah yang membuat penghitungan ganda mustahil secara struktural
  ledger_entry_id   UUID NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,

  amount            BIGINT NOT NULL,   -- + kontribusi, − penarikan
  contribution_date TIMESTAMPTZ NOT NULL,
  note              TEXT,
  idempotency_key   TEXT,
  voided_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT sc_amount_nonzero CHECK (amount <> 0)
);

CREATE INDEX sc_goal_idx ON savings_contributions (savings_goal_id, contribution_date DESC)
  WHERE voided_at IS NULL;
CREATE INDEX sc_user_idx ON savings_contributions (user_id, contribution_date DESC)
  WHERE voided_at IS NULL;
CREATE UNIQUE INDEX sc_idempotency_uniq
  ON savings_contributions (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```

`ledger_entry_id NOT NULL` adalah constraint terpenting pada modul savings. Ia memaksa setiap kenaikan angka tabungan berpasangan dengan penurunan saldo dompet, sehingga tidak ada cara menambah pos tabungan tanpa uangnya benar-benar berpindah.

## 9. Aset

```sql
CREATE TABLE assets (
  id            UUID PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  asset_type    asset_type NOT NULL,
  status        asset_status NOT NULL DEFAULT 'active',
  cached_value  BIGINT NOT NULL DEFAULT 0,   -- CACHE, diturunkan per jenis
  cached_at     TIMESTAMPTZ,
  exclude_from_household BOOLEAN NOT NULL DEFAULT false,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assets_user_type_idx ON assets (user_id, asset_type, status);
```

### 9.1 Emas

```sql
CREATE TABLE gold_lots (
  id                      UUID PRIMARY KEY,
  asset_id                UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight_grams            NUMERIC(18,4) NOT NULL,
  remaining_grams         NUMERIC(18,4) NOT NULL,
  purchase_price_per_gram BIGINT NOT NULL,
  purchase_date           DATE NOT NULL,
  gold_form               TEXT,
  ledger_entry_id         UUID REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gold_weight_positive CHECK (weight_grams > 0),
  CONSTRAINT gold_remaining_valid CHECK (remaining_grams >= 0
                                     AND remaining_grams <= weight_grams)
);

CREATE INDEX gold_lots_asset_idx ON gold_lots (asset_id) WHERE remaining_grams > 0;

CREATE TABLE gold_prices (
  id                     UUID PRIMARY KEY,
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price_date             DATE NOT NULL,
  sell_price_per_gram    BIGINT NOT NULL,   -- harga saat kita MEMBELI
  buyback_price_per_gram BIGINT NOT NULL,   -- harga saat kita MENJUAL → valuasi
  source                 TEXT NOT NULL DEFAULT 'manual',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT gold_price_positive  CHECK (sell_price_per_gram > 0
                                     AND buyback_price_per_gram > 0),
  CONSTRAINT gold_buyback_lte_sell CHECK (buyback_price_per_gram <= sell_price_per_gram)
);

CREATE UNIQUE INDEX gold_prices_user_date_uniq ON gold_prices (user_id, price_date);

CREATE TABLE gold_sales (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  weight_grams    NUMERIC(18,4) NOT NULL,
  price_per_gram  BIGINT NOT NULL,
  proceeds        BIGINT NOT NULL,
  cost_basis      BIGINT NOT NULL,
  realized_gain   BIGINT NOT NULL,
  sale_date       DATE NOT NULL,
  ledger_entry_id UUID NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 9.2 Deposito

```sql
CREATE TABLE deposits (
  id                   UUID PRIMARY KEY,
  asset_id             UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_name            TEXT NOT NULL,
  principal            BIGINT NOT NULL,
  interest_rate_annual NUMERIC(7,4) NOT NULL,
  tax_rate             NUMERIC(5,4) NOT NULL DEFAULT 0.2000,  -- PPh final 20%
  start_date           DATE NOT NULL,
  maturity_date        DATE NOT NULL,
  payout_schedule      payout_schedule NOT NULL DEFAULT 'at_maturity',
  aro_enabled          BOOLEAN NOT NULL DEFAULT false,
  aro_include_interest BOOLEAN NOT NULL DEFAULT false,
  status               deposit_status NOT NULL DEFAULT 'active',
  wallet_id            UUID REFERENCES dompet(id) ON DELETE RESTRICT,
  rolled_from_id       UUID REFERENCES deposits(id) ON DELETE SET NULL,
  -- task 17 additions:
  idempotency_key             TEXT,  -- createDeposit's create-once guard
  withdrawal_idempotency_key  TEXT,  -- withdrawDeposit's — a SEPARATE column, see note below
  last_interest_payment_date  DATE,  -- cursor for `monthly` payout's next accrual period
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT deposit_principal_positive CHECK (principal > 0),
  CONSTRAINT deposit_dates_valid        CHECK (maturity_date > start_date),
  CONSTRAINT deposit_rate_sane          CHECK (interest_rate_annual BETWEEN 0 AND 100),
  CONSTRAINT deposit_tax_sane           CHECK (tax_rate BETWEEN 0 AND 1)
);

CREATE INDEX deposits_user_status_idx ON deposits (user_id, status);
CREATE INDEX deposits_maturity_idx    ON deposits (maturity_date) WHERE status = 'active';
CREATE UNIQUE INDEX deposits_idempotency_uniq ON deposits (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX deposits_withdrawal_idempotency_uniq ON deposits (user_id, withdrawal_idempotency_key) WHERE withdrawal_idempotency_key IS NOT NULL;
```

`withdrawDeposit` gets its OWN idempotency column rather than reusing `idempotency_key`: it `UPDATE`s the same row `createDeposit` `INSERT`ed, so overwriting `idempotency_key` at withdrawal time would destroy the creation's dedup key permanently. This is belt-and-suspenders alongside the natural `WHERE status IN ('active','matured')` guard (a deposit can only ever be withdrawn once regardless) — the unique-violation → re-select path lets a retried withdrawal request return the exact prior success response, same shape as `savings.ts`'s `contribute`/`withdraw` — see src/lib/services/deposits.ts.

## 10. Hutang & Piutang

```sql
CREATE TABLE debts (
  id               UUID PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creditor_name    TEXT NOT NULL,
  counterparty_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  initial_amount   BIGINT NOT NULL,
  remaining_amount BIGINT NOT NULL,           -- CACHE dari debt_payments
  interest_rate    NUMERIC(7,4) DEFAULT 0,
  start_date       DATE NOT NULL,
  due_date         DATE,
  status           obligation_status NOT NULL DEFAULT 'active',
  affects_wallet   BOOLEAN NOT NULL DEFAULT true,
  wallet_id        UUID REFERENCES dompet(id) ON DELETE RESTRICT,
  exclude_from_household BOOLEAN NOT NULL DEFAULT false,
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT debt_initial_positive CHECK (initial_amount > 0),
  CONSTRAINT debt_remaining_valid  CHECK (remaining_amount >= 0
                                      AND remaining_amount <= initial_amount)
);

CREATE INDEX debts_user_status_idx ON debts (user_id, status);
CREATE INDEX debts_due_idx ON debts (user_id, due_date)
  WHERE status IN ('active','partially_paid');

CREATE TABLE debt_payments (
  id              UUID PRIMARY KEY,
  debt_id         UUID NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id       UUID NOT NULL REFERENCES dompet(id) ON DELETE RESTRICT,
  ledger_entry_id UUID NOT NULL REFERENCES ledger_entries(id) ON DELETE RESTRICT,
  amount          BIGINT NOT NULL,
  payment_date    DATE NOT NULL,
  note            TEXT,
  idempotency_key TEXT,
  voided_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT debt_payment_positive CHECK (amount > 0)
);

CREATE INDEX debt_payments_debt_idx ON debt_payments (debt_id, payment_date DESC)
  WHERE voided_at IS NULL;
```

`receivables` dan `receivable_payments` identik strukturnya, dengan `debtor_name` menggantikan `creditor_name` dan tanda ledger entry terbalik.

## 11. Budget

```sql
CREATE TABLE budgets (
  id             UUID PRIMARY KEY,
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,        -- NULL bila household
  household_id   UUID REFERENCES households(id) ON DELETE CASCADE,   -- NULL bila pribadi
  category_id    UUID REFERENCES categories(id) ON DELETE CASCADE,   -- budget pribadi
  category_key   TEXT,                                               -- budget household
  amount         BIGINT NOT NULL,
  period_type    budget_period NOT NULL DEFAULT 'monthly',
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  is_recurring   BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT budget_amount_positive CHECK (amount > 0),
  CONSTRAINT budget_period_valid    CHECK (period_end >= period_start),

  -- Tepat satu cakupan: pribadi (category_id) ATAU household (category_key)
  CONSTRAINT budget_scope_exclusive CHECK (
    (user_id IS NOT NULL AND household_id IS NULL
      AND category_id IS NOT NULL AND category_key IS NULL) OR
    (household_id IS NOT NULL AND user_id IS NULL
      AND category_key IS NOT NULL AND category_id IS NULL)
  )
);

CREATE UNIQUE INDEX budgets_personal_uniq
  ON budgets (user_id, category_id, period_start) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX budgets_household_uniq
  ON budgets (household_id, category_key, period_start) WHERE household_id IS NOT NULL;

CREATE INDEX budgets_period_idx ON budgets (period_start DESC);
```

`category_key` merujuk `categories.system_key`, bukan `categories.id` — sebuah budget household "makan & minum" mencocokkan kategori bawaan bersangkutan milik anggota mana pun, secara eksak.

Budget household hanya dapat dibuat untuk kategori bawaan. Kategori kustom tidak dapat dicocokkan lintas anggota; ia tetap tampil di laporan sebagai barisnya sendiri, tetapi tidak dianggarkan bersama.

## 12. Net Worth Snapshot

```sql
CREATE TABLE net_worth_snapshots (
  id                UUID PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  total_assets      BIGINT NOT NULL,
  total_liabilities BIGINT NOT NULL,
  net_worth         BIGINT NOT NULL,
  breakdown         JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nw_user_date_uniq ON net_worth_snapshots (user_id, snapshot_date);
CREATE INDEX nw_user_idx ON net_worth_snapshots (user_id, snapshot_date DESC);

CREATE TABLE household_net_worth_snapshots (
  id                 UUID PRIMARY KEY,
  household_id       UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  snapshot_date      DATE NOT NULL,
  total_assets       BIGINT NOT NULL,
  total_liabilities  BIGINT NOT NULL,
  net_worth          BIGINT NOT NULL,
  breakdown          JSONB NOT NULL,   -- {perAnggota[], perKategori}
  member_count       INTEGER NOT NULL,
  contributing_count INTEGER NOT NULL, -- anggota dengan share_wealth aktif
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX hnw_household_date_uniq
  ON household_net_worth_snapshots (household_id, snapshot_date);
CREATE INDEX hnw_household_idx
  ON household_net_worth_snapshots (household_id, snapshot_date DESC);
```

`breakdown.perAnggota` menyimpan rincian per anggota, karena itulah tampilan utama kekayaan keluarga — lihat [03 §14.2](03-domain-model.md#142-household).

## 13. Ekstensi

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- pencarian catatan transaksi
```

## 14. Strategi Migrasi

**Belum ada implementasi dan belum ada data produksi.** Seluruh skema di dokumen ini — termasuk tabel household — adalah bagian dari **migrasi awal**, bukan migrasi tambahan di atas skema lama. Tidak ada backfill, tidak ada jendela kompatibilitas ganda.

**Aturan yang berlaku sejak migrasi pertama:**

1. Migrasi selalu di-commit ke repo. Tidak pernah `drizzle-kit push` ke database selain lokal.
2. Migrasi bersifat aditif secara default; menghapus kolom dilakukan dua tahap.
3. Setiap migrasi harus dapat berjalan tanpa downtime. Tidak ada `SET NOT NULL` pada tabel besar tanpa `NOT VALID` + `VALIDATE CONSTRAINT` terpisah.
4. Migrasi berjalan **sebelum** deploy aplikasi, di build step, memakai `DATABASE_URL_UNPOOLED`.
5. Neon branching dipakai untuk menguji setiap migrasi terhadap struktur data nyata sebelum merge.

**Urutan pengembangan skema** (mengikuti [15-roadmap](15-roadmap.md)):

| Tahap | Tabel |
|-------|-------|
| 1 | `users`, Auth.js, `dompet`, `categories` (+ seeder katalog) |
| 2 | `ledger_entries`, `transactions` |
| 3 | `households`, `household_members`, `household_invitations` |
| 4 | Kolom `household_id`, `share_wealth`, `exclude_from_household`, `counterparty_user_id` |
| 5 | `budgets`, `savings_goals`, `savings_contributions` |
| 6 | `assets`, `gold_*`, `deposits`, `debts`, `receivables` |
| 7 | `net_worth_snapshots`, `household_net_worth_snapshots` |

**Seed** kategori bawaan dan dompet "Tunai" dibuat kode aplikasi saat login pertama, bukan SQL seed — seed ini per-user, bukan global.

## 15. Ringkasan Strategi Index

| Query | Index |
|-------|-------|
| Riwayat transaksi pribadi | `tx_user_date_idx` |
| Filter per kategori | `tx_user_category_date_idx` |
| Pencarian catatan | `tx_note_trgm_idx` (GIN trigram) |
| Laporan household per periode | `tx_household_date_idx` (parsial) |
| Rincian pengeluaran per anggota | `tx_household_member_idx` (parsial) |
| Aktivitas belum dilihat | `tx_unacknowledged_idx` (parsial) |
| Saldo dompet dari ledger | `ledger_wallet_idx` |
| Household milik user | `hm_user_active_idx` |
| Anggota yang berbagi kekayaan | `hm_sharing_idx` (parsial) |
| Undangan tertunda per email | `hi_email_pending_idx` (parsial) |
| Agregasi kategori bawaan lintas anggota | `categories_system_key_idx` (parsial) |
| Deposito jatuh tempo (cron) | `deposits_maturity_idx` (parsial) |
| Tren net worth household | `hnw_household_idx` |

Semua index yang menyaring baris ter-void atau berstatus tertentu memakai index **parsial** — lebih kecil, dan cocok persis dengan bentuk query yang benar-benar dijalankan.
