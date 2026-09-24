# MyMoney

Personal finance & wealth management web app for Indonesian users. Mobile-first, deployed on Vercel + Neon PostgreSQL.

Full product & technical spec: [docs/README.md](docs/README.md). Implementation plan: [tasks/plan.md](tasks/plan.md).

## Run locally

Requires **Node.js 24** or newer (`.nvmrc` pins 24 — `nvm use` picks it up). CI and Vercel both run 24.x; see [docs/13-deployment-vercel.md](docs/13-deployment-vercel.md) §2.

```bash
npm install
cp .env.example .env   # then fill in real values (see docs/11-tech-architecture.md §8)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run verify   # typecheck + lint + test
npm run build
npm run test:e2e
```

## Scripts

| Script                                          | Purpose                                         |
| ----------------------------------------------- | ----------------------------------------------- |
| `npm run dev`                                   | Start the dev server                            |
| `npm run build`                                 | Production build                                |
| `npm run lint` / `lint:fix`                     | ESLint (`--max-warnings=0`)                     |
| `npm run typecheck`                             | `tsc --noEmit`                                  |
| `npm run format` / `format:check`               | Prettier                                        |
| `npm run test` / `test:watch` / `test:coverage` | Vitest                                          |
| `npm run test:e2e`                              | Playwright                                      |
| `npm run verify`                                | typecheck + lint + test — run before every push |
| `npm run db:generate`                           | Generate a Drizzle migration from the schema    |
| `npm run db:migrate`                            | Apply migrations (`DATABASE_URL_UNPOOLED`)      |
| `npm run db:studio`                             | Drizzle Studio                                  |

## Tech stack

Next.js (App Router) · TypeScript (strict, `noUncheckedIndexedAccess`) · Tailwind CSS v4 · Radix UI · Drizzle ORM + Neon PostgreSQL · Auth.js v5 · Zod · Vitest · Playwright · Vercel.

See [docs/11-tech-architecture.md](docs/11-tech-architecture.md) for the full stack, folder structure, and module boundary rules.
