# HashPulse — 設計ドキュメント

X (Twitter) ＋ Instagram ハッシュタグ分析 SaaS

---

## 1. 全体アーキテクチャ

```
┌────────────────────────────────────────────────────────────────────┐
│                            Vercel Edge                              │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Next.js 15 App  │  │  API Routes     │  │  Vercel Cron     │   │
│  │  (App Router)    │  │  (Node runtime) │  │  (collector)     │   │
│  │  - RSC + Client  │  │  - REST + JSON  │  │  - 1h / 6h / 24h │   │
│  └────────┬─────────┘  └────────┬────────┘  └────────┬─────────┘   │
└───────────┼──────────────────────┼─────────────────────┼────────────┘
            │                      │                     │
   ┌────────▼─────────┐   ┌────────▼────────────┐  ┌─────▼─────────┐
   │  Clerk (Auth)    │   │  skills/ (logic)    │  │ X API v2      │
   │  - sign-in/up    │   │  - x-api            │  │ IG Graph API  │
   │  - JWT / session │   │  - instagram-api    │  └───────────────┘
   └────────┬─────────┘   │  - hashtag-parser   │
            │             │  - analytics        │
            │             │  - export           │
            │             │  - prisma           │
            │             │  - auth / cron      │
            │             └────────┬────────────┘
            │                      │
            │             ┌────────▼────────────┐
            └─────────────►  Supabase Postgres  │
                          │  (via Prisma)       │
                          └─────────────────────┘
```

**設計原則 (CLAUDE.md の skill/agent 分離思想を踏襲):**
- `skills/` = 外部API呼び出しと pure-logic を責務別に分離した薄いラッパ
- `app/` = ルーティング・UI・API Route handler だけ。skills を import するのみ。SDK を直 import しない
- `components/` = プレゼンテーション層。サーバーから渡されたデータを描画するだけ

---

## 2. フォルダ構成

```
hashpulse/
├── ARCHITECTURE.md              ← この設計書
├── README.md                    ← セットアップ手順
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json              ← shadcn/ui 設定
├── .env.example
├── .env.local                   ← (gitignore) 実際の値
├── .gitignore
│
├── prisma/
│   └── schema.prisma
│
├── app/                         ← Next.js App Router
│   ├── layout.tsx               ← ClerkProvider + ThemeProvider
│   ├── page.tsx                 ← ランディング
│   ├── globals.css
│   ├── middleware.ts            ← Clerk 認証ミドルウェア
│   │
│   ├── (auth)/                  ← 認証ページ群
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   │
│   ├── (dashboard)/             ← ログイン必須エリア
│   │   ├── layout.tsx           ← サイドナビ + ユーザーメニュー
│   │   ├── dashboard/page.tsx   ← KPI ダッシュボード
│   │   ├── search/page.tsx      ← ハッシュタグ検索フォーム
│   │   ├── posts/page.tsx       ← 投稿一覧
│   │   ├── influencers/page.tsx ← インフルエンサー一覧
│   │   └── saved/page.tsx       ← 保存済み検索条件
│   │
│   └── api/                     ← API Routes
│       ├── search/route.ts      ← POST: 検索実行 / GET: 一覧
│       ├── search/[id]/route.ts ← GET/DELETE: 個別検索
│       ├── analytics/[searchId]/route.ts  ← GET: 集計データ
│       ├── posts/route.ts       ← GET: 投稿一覧 (filter付)
│       ├── export/[searchId]/route.ts     ← GET: csv/xlsx
│       ├── cron/collect/route.ts          ← POST: cron 起動エンドポイント
│       └── webhooks/clerk/route.ts        ← POST: user.created 同期
│
├── skills/                      ← 責務別ロジック層
│   ├── x-api/                   ← X API v2 ラッパ
│   │   ├── index.ts
│   │   ├── client.ts            ← Bearer token + fetch
│   │   ├── search.ts            ← recent search + pagination
│   │   ├── rate-limit.ts        ← 429 ハンドリング + backoff
│   │   └── types.ts             ← Tweet / User 型定義
│   │
│   ├── instagram-api/           ← IG Graph API ラッパ (mock 切替可)
│   │   ├── index.ts
│   │   ├── client.ts            ← real + mock の dispatcher
│   │   ├── search.ts            ← hashtag_id → recent_media
│   │   └── types.ts
│   │
│   ├── hashtag-parser/          ← 検索構文 AST パーサ
│   │   ├── index.ts             ← public: parse() / compile()
│   │   ├── lexer.ts             ← トークナイザ
│   │   ├── parser.ts            ← Pratt parser (AND/OR/NOT/括弧)
│   │   ├── ast.ts               ← AST 型定義
│   │   └── compiler.ts          ← AST → X API クエリ文字列
│   │
│   ├── analytics/               ← 純粋ロジック (DB レコード → KPI)
│   │   ├── index.ts
│   │   ├── aggregate.ts         ← 合計 / 平均 / ER 計算
│   │   ├── influencers.ts       ← アカウント別集計 + ランキング
│   │   └── timeseries.ts        ← 日別ビン化
│   │
│   ├── export/                  ← CSV / XLSX 生成
│   │   ├── index.ts
│   │   ├── csv.ts               ← papaparse
│   │   └── xlsx.ts              ← exceljs
│   │
│   ├── auth/                    ← Clerk ラッパ
│   │   ├── index.ts
│   │   └── server.ts            ← getCurrentUser() / requireAuth()
│   │
│   ├── cron/                    ← cron handler factory
│   │   └── handler.ts
│   │
│   └── prisma/                  ← Prisma client + 共通クエリ
│       ├── index.ts             ← singleton
│       └── queries/
│           ├── searches.ts
│           ├── posts.ts
│           └── analytics.ts
│
├── components/
│   ├── ui/                      ← shadcn/ui 生成物
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── charts/                  ← Recharts ラッパ
│   │   ├── daily-volume.tsx
│   │   ├── daily-likes.tsx
│   │   ├── er-trend.tsx
│   │   └── hashtag-compare.tsx
│   ├── dashboard/
│   │   ├── kpi-card.tsx
│   │   ├── search-form.tsx
│   │   ├── influencer-table.tsx
│   │   └── post-table.tsx
│   └── shared/
│       └── theme-provider.tsx
│
└── lib/
    ├── utils.ts                 ← cn() / formatNumber()
    └── types.ts                 ← グローバル型 (DTO 等)
```

---

## 3. Prisma schema

`prisma/schema.prisma` の完全版は実コードを参照。主要テーブル:

| テーブル | 役割 |
|---|---|
| `User` | Clerk user の影。`clerkId` で紐づけ |
| `Search` | 検索条件 (クエリ式 + フィルタ). 保存検索もこのテーブル |
| `Hashtag` | 正規化されたハッシュタグ (`#筋トレ` 等) |
| `Account` | X / IG アカウントメタデータ |
| `Post` | 投稿 1 件 = 1 レコード (X/IG 共通スキーマ) |
| `Metric` | post の時系列メトリクス (snapshot 用) |
| `Snapshot` | 検索 × 日付の事前計算集計 |
| `_PostHashtags` | Post ⇔ Hashtag M:N (Prisma 暗黙 join 表) |

**正規化方針:**
- Account と Post は分離 (1アカウントが複数Post持つ → 集計時に join)
- メトリクスは時系列スナップショット式 (`Metric` table)。これで「収集時点での値」を保持し、後から差分計算もできる
- Hashtag は normalized lower-cased 文字列で UNIQUE。表示用 `displayName` を別カラムで保持

---

## 4. API 設計

| Method | Path | 用途 | Body / Query |
|---|---|---|---|
| POST | `/api/search` | 新規検索を実行して結果を DB に保存 | `{ query, platform, filters, save?: boolean }` |
| GET | `/api/search` | 自分の検索一覧 | `?saved=true&limit=20` |
| GET | `/api/search/[id]` | 個別検索の詳細 | - |
| DELETE | `/api/search/[id]` | 保存検索を削除 | - |
| GET | `/api/analytics/[searchId]` | KPI 集計 + 時系列 + Top influencer | `?groupBy=day` |
| GET | `/api/posts` | 投稿一覧 (検索ID で絞込) | `?searchId=...&sort=likes&page=1` |
| GET | `/api/export/[searchId]` | CSV / XLSX ダウンロード | `?format=csv\|xlsx` |
| POST | `/api/cron/collect` | Vercel Cron 用 (CRON_SECRET 認証) | - |
| POST | `/api/webhooks/clerk` | Clerk user.created を DB 同期 | (Svix 署名) |

**認証:**
- ユーザー API は Clerk middleware で保護 (`auth().userId` 必須)
- Cron は `Authorization: Bearer $CRON_SECRET` ヘッダ検証
- Webhook は Svix の `svix-id`/`svix-timestamp`/`svix-signature` 検証

**レスポンス形式:**
```ts
type APIResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

---

## 5. DB 設計 (補足)

**インデックス戦略:**
- `Post(searchId, postedAt)` — 時系列クエリの主軸
- `Post(authorId, postedAt)` — インフルエンサー集計
- `Post(platform, externalId)` UNIQUE — 重複 insert 防止
- `Metric(postId, capturedAt DESC)` — 最新メトリクス取得

**集計の事前計算:**
MVP では都度集計で OK。投稿数が 100k を超えたあたりで `Snapshot` テーブルに日別集計を流し込む仕組みに切替。

---

## 6. 検索構文仕様

### 文法 (EBNF)

```ebnf
expr     = or_expr ;
or_expr  = and_expr , { ("OR") , and_expr } ;
and_expr = not_expr , { ("AND") , not_expr } ;
not_expr = [ "NOT" ] , atom ;
atom     = hashtag | "(" , expr , ")" ;
hashtag  = "#" , identifier ;
identifier = (Letter | Digit | "_") + ;
```

### 評価方針

- AST → 投稿の含有判定 (in-memory) と X API クエリ文字列 への 2 way compile
- X API は `(#a #b) OR #c -#d` の syntax をサポートしているのでほぼそのまま compile 可能
- Instagram は単一タグ検索しかできないので AST から「OR の leaves をすべて単独取得 → 後処理で AND/NOT 評価」する戦略

### サンプル

入力:
```
(#筋トレ AND #増量) OR (#ダイエット NOT #PR)
```

X API クエリへの compile 後:
```
(#筋トレ #増量) OR (#ダイエット -#PR) -is:retweet lang:ja
```
(オプションフィルタは検索条件 UI からの追加分)

---

## 7. UI 設計

### デザインシステム

- **ダーク前提**: shadcn/ui の `slate` パレットを base に、accent を `cyan-400`
- **タイポ**: Inter (UI) + JetBrains Mono (数値)
- **密度**: PC アナリティクス特化 → 情報密度高め (px は詰める)
- **レイアウト**: 左サイドナビ 220px + メイン領域。dashboard は 12-col grid

### 主要画面

**(1) ハッシュタグ検索 `/search`**
```
┌─ 検索条件 ───────────────────────────────────┐
│ クエリ式: [(#筋トレ AND #増量) OR #ダイエット ] │
│ プラットフォーム: [X ▾] [IG ▾]                 │
│ 期間: [2026-04-01] - [2026-05-27]              │
│ 最低いいね: [10]   最低フォロワー: [1000]      │
│ 言語: [ja ▾]                                   │
│                            [保存] [検索実行 ▶] │
└────────────────────────────────────────────────┘
```

**(2) ダッシュボード `/dashboard?searchId=...`**
```
┌─ KPI cards (6枚) ──────────────────────────────┐
│  投稿数 | 合計いいね | 合計表示数              │
│  合計RT | 平均ER     | 平均表示数              │
└────────────────────────────────────────────────┘
┌─ 時系列 ──────────────┐ ┌─ Top Hashtags ──────┐
│ Daily Volume / Likes  │ │ #ハッシュタグ別比較 │
│ (Recharts AreaChart)  │ │ (BarChart)          │
└───────────────────────┘ └─────────────────────┘
┌─ Top Influencers (上位 10 アカウント) ────────┐
│ @user | フォロワー | 投稿 | 合計いいね | ER% │
└────────────────────────────────────────────────┘
```

**(3) 投稿一覧 `/posts`**
- DataTable (shadcn/ui) で sort / filter / paginate
- 行クリックで modal 展開 → 全文 + メトリクス + 元投稿リンク

---

## 8. 実装優先順位 (P0 = MVP)

| P | スコープ |
|---|---|
| **P0** | Clerk auth / Prisma schema / X API skill / hashtag-parser / `/api/search` / `/dashboard` / KPI cards + 1-2 charts |
| **P1** | influencer ranking / posts 一覧 / 保存検索 / CSV export |
| **P2** | Vercel Cron 定期収集 / XLSX export / ハッシュタグ比較チャート |
| **P3** | Instagram 実 API 接続 / Redis キャッシュ / RBAC (admin/viewer) |
| **P4** | Snapshot 事前集計 / アラート (閾値超過通知) / multi-tenant |

---

## 9. ClaudeCode 用 SKILL 一覧

責務別に完全分離 (CLAUDE.md ルール準拠):

| SKILL | 責務 | 主な依存 |
|---|---|---|
| **x-api-skill** | X API v2 認証・検索・ページング・レート制御 | `fetch`, X Bearer token |
| **instagram-api-skill** | IG Graph API hashtag_id 経路の検索 + mock | `fetch`, IG access token |
| **hashtag-parser-skill** | 検索構文 → AST → X クエリ / IG ノード分解 | (純粋ロジック) |
| **analytics-skill** | Post[] → KPI / 時系列 / influencer ranking | (純粋ロジック) |
| **dashboard-ui-skill** | KPI Card / Chart / Table 群の React コンポーネント | shadcn/ui, Recharts |
| **export-skill** | CSV / XLSX 出力 | papaparse, exceljs |
| **auth-skill** | Clerk wrap + RBAC ヘルパ | `@clerk/nextjs` |
| **cron-skill** | Vercel Cron handler 共通ロジック | (純粋ロジック) |
| **prisma-skill** | PrismaClient singleton + 共通クエリ | `@prisma/client` |

---

## 10. SUBAGENT 構成 (並列開発)

| Agent | 担当 | 並列度 |
|---|---|---|
| **Backend Agent** | API Routes / skills/x-api / skills/instagram-api / 認証ミドルウェア | 単独 |
| **Frontend Agent** | app/(dashboard)/* / components/* / shadcn 導入 | 単独 |
| **DB Agent** | Prisma schema / migration / skills/prisma | 単独 |
| **Analytics Agent** | skills/analytics / skills/hashtag-parser / 単体テスト | 単独 |
| **API Integration Agent** | X / IG 実 API 疎通確認 / .env 設定 / レート制御チューニング | 単独 |

並列フェーズ例:
```
Phase 1: [DB Agent] schema 確定 ─┐
                                 ├─► Phase 2: 並列開発
[Analytics Agent] AST 仕様 確定 ─┘     ├─ [Backend] API
                                       ├─ [Frontend] UI
                                       └─ [API Integration] X 疎通
                                              │
                                              ▼
                                       Phase 3: 結合・通し動作確認
```

---

## 11. 開発フェーズ

**Phase 0 — Setup (本ターン完了)**
- プロジェクト初期化 / Prisma schema / Clerk / X API skill / 1 ダッシュボード

**Phase 1 — MVP 完成 (1〜2 セッション)**
- 検索結果の DB 保存 / 全 KPI 表示 / chart 2 種 / influencer ranking
- 実 X API キーで疎通確認

**Phase 2 — 機能拡充 (2〜3 セッション)**
- CSV/XLSX export / 保存検索 UI / Vercel Cron / 投稿一覧

**Phase 3 — IG + 仕上げ**
- Instagram 実 API 接続 / ダークモード調整 / a11y / E2E test

**Phase 4 — Scale**
- Redis caching / Snapshot 事前集計 / Sentry / 観測性

---

## 12. MVP 範囲

**Yes:**
- Clerk sign-in/up
- ハッシュタグ検索フォーム (AND/OR/NOT 1 階層 + 期間 + 最低いいね/フォロワー)
- X API v2 で実検索 → Post を DB 保存
- KPI ダッシュボード (6 cards)
- Recharts 2 種 (日別投稿数 / 日別いいね)
- Top 10 influencer table

**No (Phase 2 以降):**
- Instagram 実 API
- CSV/XLSX export
- Vercel Cron 自動収集
- 保存検索の編集
- ハッシュタグ比較チャート
- RBAC

---

## 13. 将来的拡張

- **マルチテナント**: `Organization` テーブル追加 + Clerk Organizations
- **アラート**: 「#X のER が前日比 +30% 超えたら Slack 通知」
- **AI 要約**: 集めた投稿を Claude API で要約 → 「今週のトレンド」レポート自動生成
- **競合分析**: ブランド名指定 → 関連ハッシュタグ × 競合アカウント横断比較
- **広告判定**: `#PR` `#sponsored` 検出と自然投稿の比率
- **動画指標**: X / IG リール の再生数も対象に
- **TikTok 拡張**: 既存の `tiktok-thread-finder` skill と連携

---

## 14. 必要 API 一覧

| サービス | 用途 | プラン |
|---|---|---|
| **X API v2** | Tweet search / metrics | Basic (\$200/mo) 以上推奨 |
| **Instagram Graph API** | hashtag_id / recent_media | Meta Business App + Long-lived token |
| **Supabase** | Postgres + Realtime (将来) | Free tier OK で MVP |
| **Clerk** | Auth | Free tier (10k MAU) |
| **Vercel** | Hosting / Cron | Pro (\$20/mo) ← Cron 有効化 |
| **Sentry** (任意) | エラー監視 | Free tier |
| **Upstash Redis** (任意) | rate limit / cache | Free tier |

---

## 15. 環境変数一覧

`.env.example` に記載。要点:

```
# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# DB (Supabase Postgres)
DATABASE_URL="postgresql://..."     # connection pooler (pgbouncer)
DIRECT_URL="postgresql://..."        # direct connection (migration 用)

# X API v2
X_BEARER_TOKEN=
X_API_KEY=
X_API_SECRET=

# Instagram Graph API
IG_ACCESS_TOKEN=
IG_USER_ID=                          # Business アカウントの ID
IG_USE_MOCK=true                     # MVP は mock

# Cron
CRON_SECRET=                         # Vercel Cron 用ランダム文字列

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 16. 実装コード

実コードは本プロジェクト全ファイル参照。MVP として下記が動く状態でスキャフォールド済み:

- `package.json` / `tsconfig.json` / `next.config.ts` / `tailwind.config.ts`
- `prisma/schema.prisma` (8 テーブル)
- `app/layout.tsx` + Clerk + Theme
- `app/middleware.ts` (protect /dashboard, /search, /api/*)
- `app/(auth)/sign-{in,up}/...`
- `app/(dashboard)/dashboard/page.tsx`
- `app/api/search/route.ts` (POST = 実検索 + DB 保存)
- `app/api/analytics/[searchId]/route.ts` (GET = KPI + 時系列 + influencer)
- `skills/x-api/*` (本物の X API v2 クライアント)
- `skills/instagram-api/*` (mock)
- `skills/hashtag-parser/*` (lexer + parser + AST + X compiler) + unit test 可
- `skills/analytics/*` (aggregate / influencers / timeseries)
- `skills/prisma/*`
- `skills/auth/server.ts`
- `components/dashboard/{search-form,kpi-card}.tsx`
- `components/charts/daily-volume.tsx`

セットアップ手順は `README.md` 参照。
