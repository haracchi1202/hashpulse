# 再開ガイド

中断時点: **Phase 2 全タスク 実装＋ヘッドレス通し検証 完了**（2026-06-17）

## Phase 2 ヘッドレス通し検証（2026-06-17 実施・成功）

- `scripts/smoke-phase2.ts` を実 IG API で実行 → **実API収集 → DB保存 → Snapshot自動生成 → 比較集計 まで全段成功**
  - SMOKE #AI / SMOKE #cat（INSTAGRAM, SIX_HOURLY, saved）を作成、各 posts=25 / errors=none / snaps=1
  - 比較集計ロジック（/api/analytics/compare 相当）も2件分一致を確認
- ⚠️ 判明した制約: IG ハッシュタグ検索は直近投稿のみ返すため **timeseries=1日 / impressionCount=0 / ER=0%**（RESUME 制約#4 のとおり。他人投稿は IMP 取得不可）。比較チャートの複数日ライン目視には日次 cron 蓄積が要る。
- 残るブラウザ目視（dev server + ログイン要）: /compare の実チャート描画。上記 SMOKE 2件が seed 済みなので選択するだけで確認可能。
- DB 補足: Supabase 無料枠は無アクセスで自動 pause される。復帰後 pooler(Supavisor) のテナント登録に**復帰後1〜3分のラグ**あり（REST/DNS が先に復活、pooler は遅れて `tenant not found` を返す）。数分待てば解消。

## いまの状態

- Phase 0 + 1 + UI 通し検証 全て完了
- Phase 2 タスク #1 (IG 実 API) **完了・実 API 疎通成功**:
  - `skills/instagram-api/client.ts` の `realIGSearch` を Graph API v22.0 で実装
  - `scripts/smoke-ig.ts` で実 API テスト成功（`#AI` で 15 件取得・5.7s）
  - `.env.local`: `IG_USER_ID=17841400166601131`（IG=@haracchi1202 / FBページ「ハラっち」連携）, `IG_USE_MOCK=false`
  - Meta App: `app_id=1306992114524687`（"claude"）、スコープ7種付与済
- ✅ **IG 長期トークン適用済**: App Secret で fb_exchange_token 交換し約60日有効トークンへ差し替え（発行 2026-06-16 → **失効目安 2026-08-15 頃**）。
  - 再交換コマンド: `GET oauth/access_token?grant_type=fb_exchange_token&client_id=1306992114524687&client_secret={APP_SECRET}&fb_exchange_token={token}`
  - 約60日で切れるため、本番では自動リフレッシュ or 定期再発行を検討

## 次にやる Phase 2 タスク（優先順）

1. ~~ハッシュタグ比較チャート~~ ✅ **完了（2026-06-16）**
   - `app/api/analytics/compare/route.ts`: `?searchIds=` 最大6件、検索ごとに aggregateKPI + dailyTimeseries を返す
   - `components/charts/hashtag-compare-chart.tsx`: 日付和集合でマージした Recharts マルチライン（connectNulls）
   - `components/dashboard/hashtag-compare.tsx`: 複数選択 + メトリクス切替（投稿数/いいね/表示数/ER）+ KPI比較表
   - `app/(dashboard)/compare/page.tsx` + nav に「比較」追加 / `lib/types.ts` に `CompareItem`
   - `tsc --noEmit` OK / `next build` OK
   - ⚠️ 未確認: ブラウザ実画面での動作（dev server + ログイン必要）。実データ2件以上で線が重なるか要目視。
2. ~~Vercel Cron 本実装~~ ✅ **完了（2026-06-16）**
   - `skills/collect/index.ts`: 収集+永続化コアを抽出（`/api/search` と cron で共有）。query パースは例外、API失敗はプラットフォーム単位で `errors` に積んで続行、完了時 `lastRunAt` 更新
   - `app/api/search/route.ts`: 上記 `runCollection` を使うようリファクタ（重複~120行削除）
   - `app/api/cron/collect/route.ts`: GET（Vercel Cron は GET で叩く）+ POST 両対応。`CRON_SECRET` Bearer 認証。cadence 別間隔（HOURLY/SIX_HOURLY/DAILY）+ 5分グレースで due 判定し直列再収集。`maxDuration=300`
   - `tsc` OK / `next build` OK
   - ⚠️ vercel.json の cron は `0 */6 * * *`（6h毎）。HOURLY cadence を真に毎時回すにはスケジュール変更が必要（Vercel Hobby は daily のみ・Pro で高頻度可）。
   - ⚠️ 未確認: 実 cron 発火・実データでの再収集。ローカル手動確認は `curl -X POST localhost:3000/api/cron/collect -H "Authorization: Bearer $CRON_SECRET"`
3. ~~Snapshot 事前集計~~ ✅ **完了（2026-06-16）**
   - `skills/snapshot/index.ts`: `generateSnapshots(searchId)`。Post から日別集計を `Snapshot` に upsert（[searchId,date] ユニーク）。ER は `dailyTimeseries` 再利用、totalRetweets のみ別集計。消えた日付の Snapshot は deleteMany で整合
   - `skills/collect/index.ts`: `runCollection` 末尾で `generateSnapshots` を呼ぶ（cron/手動検索どちらでも自動生成、失敗は errors に積んで収集自体は成功扱い）
   - `tsc` OK / `next build` OK
   - ⚠️ 読み取り側は未接続: dashboard/compare/analytics は現状まだ raw Post から都度集計（正しく動作）。Snapshot を読む高速化は将来タスク。Snapshot に totalReplies / avgLikes は無いため、KPI 全項目を賄うには列追加 or 派生計算が必要。
   - ⚠️ 未確認: 実データでの Snapshot 生成内容

## Phase 2 完了状態（2026-06-16）

- ✅ #1 IG 実 API / #2 比較チャート / #3 Vercel Cron / #4 Snapshot 事前集計 すべて実装・ビルド通過
- 残る目視確認（dev server + ログイン要）: 比較画面の表示、cron 手動トリガ、Snapshot 中身
- 次フェーズ候補: Snapshot 読み取り接続による高速化 / saved 検索の cadence 設定 UI / X Pro tier 検討

## 次セッション開始時にやる

### 選択 A: IG 実 API テストまで進める

1. **Meta Developers でアプリ作成** (`developers.facebook.com`)
2. Facebook Page を作成し、**IG Business / Creator アカウント** と連携
3. Graph API Explorer で長期アクセストークン取得
   - 必要スコープ: `instagram_basic`, `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`
4. `.env.local` を編集:
   ```
   IG_ACCESS_TOKEN=<長期トークン>
   IG_USER_ID=<IG Business Account の Graph API ID>
   IG_USE_MOCK=false
   ```
5. 疎通確認:
   ```powershell
   cd C:\Users\hara\OneDrive\デスクトップ\AI関連\claudecodelp\hashpulse
   npx tsx --env-file=.env.local scripts/smoke-ig.ts ddtpro
   ```
   → エラーなく投稿が取得できれば実 API OK

### 選択 B: トークン取得が後回しなら、先に他の Phase 2 タスクへ

優先順:
1. ハッシュタグ比較チャート (`components/dashboard/hashtag-compare.tsx`)
2. Vercel Cron 本実装 (`app/api/cron/collect/route.ts` を saved 検索で自動再収集)
3. Snapshot 事前集計 (`Snapshot` テーブルを cron で生成)

## 動作確認方法

```powershell
cd C:\Users\hara\OneDrive\デスクトップ\AI関連\claudecodelp\hashpulse
npm run dev
# ブラウザで http://localhost:3000 → ログイン済セッションで dashboard
# 検索: `#AI` (X) → 数十件取得確認
```

## 各 SNS のリサーチ（収集）条件

`runCollection`（`skills/collect`）が `query` をパースし、プラットフォームごとに以下の条件で収集する。クエリ構文は共通（`hashtag-parser`: AND / OR / NOT / 括弧 / #タグ / #なし素キーワード=TERM）。

### X (Twitter)
`X_SEARCH_PROVIDER` でプロバイダ切替（既定 `official`）。

| 項目 | `official`（X API v2） | `twitterapi`（twitterapi.io） |
|---|---|---|
| 対象期間 | **直近7日のみ**（`/tweets/search/recent`） | **全期間**（advanced_search、7日制限なし） |
| 期間指定 | `startTime`/`endTime`（ISO 8601、7日内のみ有効） | `since_time`/`until_time`（Unix秒、任意期間） |
| 1ページ件数 / ページング | 10〜100件/page、`maxPages`（collect は 2） | 約20件/page、合計 `maxResults` 上限まで（安全弁250page） |
| TERM（#なし語） | **ダブルクォートでフレーズ完全一致**（形態素分割の部分一致を防ぐ） | 同左（クォート付与） |
| RT 除外 | `-is:retweet`（既定で除外） | `-filter:retweets`（既定で除外） |
| 言語 | `lang:xx`（filters.lang） | 同左 |
| 指標 | public_metrics（like/RT/reply/quote/impression） | like/RT/reply/quote/viewCount(=impression)/bookmark |
| レート | Bearer 認証 | 無料枠 5秒/req（`TWITTERAPI_IO_MIN_INTERVAL_MS`） |
| 後処理 | `minLikes`/`minFollowers` は取得後フィルタ | 同左 |

- ⚠️ `organic_metrics` は自分の投稿のみ（他人投稿で付けると Field Authorization Error）。public_metrics のみ使用。

### Instagram（ハッシュタグ検索のみ）
`IG_PROVIDER` でプロバイダ切替（既定 `graph`）。**Reels（ショート動画）を拾うには `ensembledata` を使う。**

| 項目 | `graph`（公式 Graph API） | `ensembledata`（第三者・推奨） |
|---|---|---|
| 認証 | `IG_USE_MOCK=false` + `IG_ACCESS_TOKEN` + `IG_USER_ID` | `ENSEMBLEDATA_TOKEN`（TikTok と共用） |
| エンドポイント | `ig_hashtag_search`→`hashtag_id`→`top_media`/`recent_media` | `/apis/instagram/hashtag/posts`（`name`/`cursor`/`get_author_info`/`token`） |
| **Reels（動画）** | **取りこぼす**（写真/動画のみ・Reels は安定して返らない） | **取得可**（`GraphVideo`＝動画/Reels を含む。実測 59件中25件が動画） |
| 投稿者情報 | 他人投稿は不可（username=`unknown_ig` / followers=undefined） | **取得可**（owner.username / followers） |
| 本文(caption) | 取得しない（大量データエラー回避）→ AND/NOT はタグ集合のみで判定 | 取得可（再生数=video_view_count→impression も） |
| 取得元/期間 | `top_media`（全期間サンプル）＋`recent_media`（**直近24h**） | `top_posts`＋`recent_posts`、nextCursor でページング |
| 期間指定 | クライアント側で `timestamp` フィルタ | クライアント側で `taken_at_timestamp` フィルタ |

- **検索方式はどちらも Hashtag Search のみ**（**キーワード検索不可**）。#なし素キーワードは `termsToTags` で自動 #タグ化して検索する。
- ⚠️ `graph` の API 制約（←「1週間以内」の正体）: 1つの IG ユーザーで **直近7日ローリングに最大30ユニークタグ**まで。`ensembledata` にはこの制約なし。
- 実装: `skills/instagram-api/{index(プロバイダ分岐), client(graph), ensembledata(新規)}.ts`。後処理は両者とも `minLikes` フィルタ ＋ タグ集合に対する `evaluate`（AND/NOT）、複数タグ重複は externalId で排除。
- スモーク: `IG_PROVIDER=ensembledata npx tsx --env-file=.env.local scripts/smoke-ig.ts 猫`（EnsembleData は日次リクエスト上限あり。超過時 HTTP 495）。
- **検証済み（2026-06-24）**: 実レスポンス（#猫 59件中25件が動画）に対し正規化を確認。Reels の再生数は **`play_count`** に入る（`video_view_count` は静止画では null だった）ため、impressionCount は `play_count ?? video_view_count` で取得。`scripts/verify-ig-ensemble.ts` が `tests/fixtures/ig_hashtag_posts.json` を使い fetch スタブでオフライン検証（クォータ非消費）→ Reels 3件が再生数つきで取得を確認。

### TikTok（EnsembleData 経由）
`ENSEMBLEDATA_TOKEN` 必須。`TIKTOK_SEARCH_MODE` でモード切替（既定 `keyword`）。

| 項目 | `keyword`（既定・広く取る） | `hashtag`（チャレンジ投稿限定） |
|---|---|---|
| エンドポイント | `/tt/keyword/search`（`period=0`=全期間） | `/tt/hashtag/posts` |
| 対象期間 | 全期間（`startTime`/`endTime` で create_time をクライアント側フィルタ） | 同左 |
| フレーズ一致 | プロバイダはクォート未対応でトークン分割するため、**`evaluateContent` で本文＋タグへのフレーズ完全一致を後処理**（うる/ぷく/シール の断片収集を除外） | `evaluate` で #タグ一致を後処理 |
| ページング / 上限 | 最大250page × 20件（=最大5000件）、`limit` 到達で打ち切り | 同左 |
| レート | `TIKTOK_MIN_INTERVAL_MS`（既定1200ms）、429 は最大3リトライ | 同左 |
| 指標マッピング | play_count→impression / digg→like / share→retweet枠 / collect→quote枠(保存) / comment→reply | 同左 |
| 後処理 | `minLikes` フィルタ | 同左 |

## 反響レポート（投稿内容ベースの評価）

- `skills/reaction/index.ts` — SNS反響リサーチ (`/opt/claudecodelp/SNS反響リサーチ` の `backend/services/classify.py`) を TS 移植。ルールベースで polarity(positive/negative/neutral) ＋ 情緒タグ ＋ トピックを判定（**API キー不要**）。`analyzeReactions(posts)` が感情割合・情緒タグ/トピック分布・SNS別・所見・代表投稿(ポジ/ネガ TOP)・エンゲージ集計を返す。
- `app/(dashboard)/report/page.tsx`（nav「反響レポート」）— 上記をサーバ側で集計して表示。`tests/reaction.test.ts` 12件 OK。
- ⚠️ 現状は **投稿本文のみ**を評価（`Post.text`）。コメント本文は未収集（`Comment` モデル無し）。コメント分析は別途 収集レイヤ追加が必要（X リプライ / IG・TikTok は EnsembleData のコメント API）。

## コメントの反響分析（投稿＋コメント）

- `Comment` モデル追加（`prisma db push` 済み。Post 1:N、platform+externalId 一意）。
- `skills/comments/index.ts` — コメント収集。X=twitterapi.io `/twitter/tweet/replies`（tweetId、429 はバックオフ再試行）、TikTok=EnsembleData `/tt/post/comments`（aweme_id）、IG=`/instagram/post/comments`（media_id）。`collectComments(targets,{perPost})` は媒体別失敗を errors に積み、495 の媒体は以降スキップ。
- `POST /api/report/[searchId]/comments` — エンゲージ上位 `COMMENTS_TOP_POSTS`(既定8) 投稿 × `COMMENTS_PER_POST`(既定30) を取得・upsert。`components/dashboard/collect-comments-button.tsx` から実行。
- `/report` に「コメントの反響」セクション — 保存済みコメントを `analyzeReactions` で集計（感情割合・情緒タグ・所見・代表コメント）。
- **検証済み（2026-06-24）**: X リプライ実取得 OK（うるぷくシール: 13件保存、ポジ5/中立8、情緒「かわいい」）。TikTok/IG コメントは本日 EnsembleData 495 のため未検証（クォータ回復後にボタン実行で取得可。シェイプは防御的パースで吸収）。

## 既定の収集対象 / リサーチ範囲表示

- 検索フォーム（`components/dashboard/search-form.tsx`）の既定プラットフォームを **X/IG/TikTok すべて ON** に変更（以前は X のみ→TikTok が収集から漏れていた）。
- リサーチ範囲（対象期間）は `lib/research-scope.ts` に一元化し、ランディング `/` と **ダッシュボード `/dashboard`** の両方で表示（`components/dashboard/research-scope.tsx`）。ログイン後は `/` を見ないため dashboard 側にも出すのが必須だった。IG は「全期間」ではなく「人気 + 最新」（hashtag 検索は日付範囲指定不可）。

## 収集エラーの可視化（日次上限アラート）

- `Search.lastErrors Json?` を追加（`prisma db push` 済み）。`runCollection` が収集後に `errors[]`（"TikTok: EnsembleData 495: …" 等）を保存する。
- ダッシュボードが `latest.lastErrors` を読み、**HTTP 495 / "Maximum requests limit"** を検出したら赤いアラート「データ提供元の日次上限に達しました」を、対象媒体名つきで表示。その他のエラーは黄色、エラー未捕捉で0件の媒体はフォールバック注記。
- TikTok / Instagram(ensembledata) は同じ `ENSEMBLEDATA_TOKEN` を共有 → 検証で使い切ると当日 495。X(twitterapi) は別系統で無関係。

## 詰まりポイント (再開時に思い出すべき)

1. **Prisma 接続リセット問題**: dev server を長時間動かすと Supabase Postgres 接続がリセットされ、それ以降 `/api/search` 等が 404 を返す。発生時は dev server プロセス kill + `.next` 削除 + `npm run dev` で復活。
2. **X API は直近7日のみ**: `/tweets/search/recent` 制限。全期間は Pro tier ($200/月) で `/search/all` 必要。
3. ~~**X 検索でキーワード混在を取りこぼす**~~ ✅ **解決（2026-06-17）**: #なしの素キーワード(TERM)を検索式で許可。`skills/hashtag-parser` の lexer/ast/parser/compiler に TERM ノードを追加（`うるぷくシール`, `#猫 AND うるぷくシール`, `#猫 NOT PR` 等が通る）。X は TERM をフルテキスト検索語としてそのまま投げる。実 API で `うるぷくシール`→14件取得を確認。tests/hashtag-parser.test.ts 20件 OK / tsc OK。
   - ⚠️ IG はタグ検索のみのため、キーワードのみクエリは収集対象外（`runCollection` が errors に「IG: キーワードのみのクエリは…」を積む）。#タグを1つ以上含むクエリなら IG も従来どおり動く（TERM は IG 後処理 evaluate では常に true）。
   - ⚠️ `result.errors`（IG 非対応の注意）はフロント search-form では現状リダイレクトで握りつぶし。X 結果は正常表示。将来 warning 表示を足すなら search-form.tsx。
3b. ~~**TikTok keyword 検索がフレーズをトークン分割して過剰収集**~~ ✅ **解決（2026-06-24）**: EnsembleData の `/tt/keyword/search` はクォート未対応で「うるぷくシール」を「うる/ぷく/シール」に分割し、断片を含むだけの投稿まで返していた。`skills/hashtag-parser/compiler.ts` に `evaluateContent(node, {text, hashtags})` を追加（term=本文+タグへの NFKC正規化フレーズ完全一致、hashtag=タグ一致、AND/OR/NOT/group 対応）。`skills/collect` の TikTok keyword モードで元 AST を本文評価して過剰分を除外（他のワードでも同様に効く）。X はクォートで API 側一致するため対象外。tests/hashtag-parser.test.ts 32件 OK / tsc OK。
4. **IG Hashtag Search 制約**: 直近7日 + 直近24時間に検索した最大30タグまで。他人投稿の username/followers/IMP は権限上取得不可 (`authorUsername="unknown_ig"` 固定 / `impressionCount=0`)。
5. **Clerk Bearer Token URL エンコード**: X Bearer Token は `%2B`, `%3D` 含むエンコード済形式のまま `Authorization: Bearer` ヘッダへ。デコード厳禁。
6. **organic_metrics は禁忌**: 他人ツイートでは `tweet.fields` から外す (Field Authorization Error)。`public_metrics` だけで十分。

## セキュリティ TODO (未完)

- [ ] Clerk Secret Key (`sk_test_WBv0K...`) をローテーション
- [ ] Supabase DB パスワード (`akanehotaru1025`) をローテーション
- [ ] X API キー ローテーション

## ファイル位置

- 設計書: `ARCHITECTURE.md`
- 環境変数: `.env.local` (gitignore 済)
- SubAgent 定義: `.claude/agents/*.md` (5体: backend / frontend / analytics / db / api-integration)
- X スモークテスト: `npx tsx --env-file=.env.local scripts/smoke-x.ts "#キーワード"`
- IG スモークテスト: `npx tsx --env-file=.env.local scripts/smoke-ig.ts ddtpro`
- X クエリバリエーション比較: `npx tsx --env-file=.env.local scripts/smoke-x-variants.ts`

## 最近の検証メモ (2026-05-28〜29)

- X 検索 `DDT 三井アウトレットパーク`: x.com UI で 224件 / うち 157件が DDT プロレス関連 / 67件はウマ娘コラボ・乃木坂46・一般ショッピング等の無関係。HashPulse の `#DDTPRO AND #三井アウトレットパーク` クエリだと 0 件（イベントは 47日前 + ハッシュタグ厳密一致のため）。
- DDT 関連157件の合計: 投稿 157 / IMP 531,727 / いいね 9,777 / RT 1,532
- @ddtpro 公式が圧倒的: 32投稿 / 4,402いいね / 320,498 IMP (全体の約60%)
