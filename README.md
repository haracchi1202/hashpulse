# HashPulse

X (Twitter) & Instagram のハッシュタグ分析 SaaS。

設計の全体像は [`ARCHITECTURE.md`](./ARCHITECTURE.md) を参照。

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- TailwindCSS + shadcn/ui
- Prisma + Supabase Postgres
- Clerk Auth
- Recharts
- X API v2 / Instagram Graph API

## Quickstart

### 1. 依存インストール

```bash
cd hashpulse
npm install
```

### 2. 環境変数

```bash
cp .env.example .env.local
# 各 KEY を埋める
```

必須 (MVP):
- `DATABASE_URL` / `DIRECT_URL` (Supabase)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` (Clerk)
- `X_BEARER_TOKEN` (X API v2)

Instagram は `IG_USE_MOCK=true` のままで OK。

### 3. DB マイグレーション

```bash
npm run db:push       # 初回 (schema を直接適用)
npm run db:generate   # Prisma Client 再生成
```

### 4. 開発サーバ起動

```bash
npm run dev
# http://localhost:3000
```

## ディレクトリ

```
hashpulse/
├── app/         # Next.js App Router (UI + API Routes)
├── skills/      # 責務別ロジック層 (外部API + pure logic)
├── components/  # UI primitives + dashboard widgets
├── lib/         # 共通 util
└── prisma/      # schema.prisma
```

詳細は `ARCHITECTURE.md` の Section 2 参照。

## MVP 動作確認

1. `/sign-up` でアカウント作成
2. `/dashboard` で検索フォームから `#筋トレ AND #増量` を実行
3. X API v2 が呼ばれて DB に保存され、KPI と日別チャートが表示される

## 開発フェーズ

現状は **Phase 0 (Setup)** 完了済み。次は:
- Phase 1: 全KPI + influencer ranking + 投稿一覧 表示
- Phase 2: CSV/XLSX export + 保存検索 UI + Cron
- Phase 3: Instagram 実 API + a11y + E2E

詳細は `ARCHITECTURE.md` の Section 8 / 11 参照。
