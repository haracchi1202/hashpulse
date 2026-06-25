#!/usr/bin/env bash
# .env.local の各変数を Vercel の指定環境に登録する（Phase 3 自動化）。
#
# 前提:
#   1) npx vercel login   でログイン済み
#   2) npx vercel link     でこのディレクトリを Vercel プロジェクトに紐付け済み
#
# 使い方:
#   bash scripts/vercel-env-setup.sh production                          # .env.local を本番に登録
#   bash scripts/vercel-env-setup.sh production .env.production.local    # 本番用ファイルを指定して登録
#   bash scripts/vercel-env-setup.sh preview                             # プレビューに登録
#
#   第2引数で読み込む env ファイルを差し替え可能（既定 .env.local）。
#   ローカル開発用の .env.local（Clerk dev キー）を壊さず、本番用 .env.production.local
#   （pk_live/sk_live）を別管理して push するために使う。
#
# 注意:
#   - .env.local は Clerk 開発キー(pk_test/sk_test)。本番は .env.production.local に
#     pk_live/sk_live と Webhook シークレットを入れ、それを第2引数で指定すること。
#   - NEXT_PUBLIC_APP_URL は本番ドメイン(https://hashpulse.mb-j.co.jp)に更新すること。
set -euo pipefail

TARGET_ENV="${1:-production}"
ENV_FILE="${2:-$(dirname "$0")/../.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE が見つかりません" >&2
  exit 1
fi

# placeholder のまま push する事故を防ぐ
if grep -q "REPLACE_ME" "$ENV_FILE"; then
  echo "ERROR: $ENV_FILE に未置換の REPLACE_ME が残っています。本番値を入れてから実行してください。" >&2
  grep -n "REPLACE_ME" "$ENV_FILE" >&2
  exit 1
fi

echo "Vercel env (${TARGET_ENV}) に ${ENV_FILE} の変数を登録します..."
count=0
# .env.local は FD 3 で読む。こうしないと vercel コマンドがループの stdin(.env.local) を
# 消費してしまい、途中で打ち切られる（bash の典型的な落とし穴）。
while IFS= read -r line <&3 || [[ -n "$line" ]]; do
  # コメント・空行をスキップ
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue
  # KEY=VALUE を分解
  key="${line%%=*}"
  val="${line#*=}"
  # 前後の空白とクォートを除去
  key="${key//[[:space:]]/}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  [[ -z "$key" ]] && continue

  # 既存があれば上書きしたいので一度削除（存在しなくてもエラーにしない）。stdin は閉じる。
  npx vercel env rm "$key" "$TARGET_ENV" -y >/dev/null 2>&1 </dev/null || true
  printf '%s' "$val" | npx vercel env add "$key" "$TARGET_ENV" >/dev/null
  echo "  + $key"
  count=$((count + 1))
done 3< "$ENV_FILE"

echo "完了: ${count} 個の変数を ${TARGET_ENV} に登録しました（元ファイル: ${ENV_FILE}）。"
echo "次: vercel --prod で再デプロイしてください。"
