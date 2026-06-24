#!/usr/bin/env bash
# .env.local の各変数を Vercel の指定環境に登録する（Phase 3 自動化）。
#
# 前提:
#   1) npx vercel login   でログイン済み
#   2) npx vercel link     でこのディレクトリを Vercel プロジェクトに紐付け済み
#
# 使い方:
#   bash scripts/vercel-env-setup.sh production    # 本番に登録（既定）
#   bash scripts/vercel-env-setup.sh preview       # プレビューに登録
#
# 注意:
#   - Clerk は開発キー(pk_test/sk_test)がそのまま入る。本番運用では Clerk Production の
#     pk_live/sk_live と Webhook シークレットに後で差し替えること（Phase 4）。
#   - NEXT_PUBLIC_APP_URL はデプロイ後の本番 URL に更新すること。
set -euo pipefail

TARGET_ENV="${1:-production}"
ENV_FILE="$(dirname "$0")/../.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE が見つかりません" >&2
  exit 1
fi

echo "Vercel env (${TARGET_ENV}) に .env.local の変数を登録します..."
count=0
while IFS= read -r line || [[ -n "$line" ]]; do
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

  # 既存があれば上書きしたいので一度削除（存在しなくてもエラーにしない）
  npx vercel env rm "$key" "$TARGET_ENV" -y >/dev/null 2>&1 || true
  printf '%s' "$val" | npx vercel env add "$key" "$TARGET_ENV" >/dev/null
  echo "  + $key"
  count=$((count + 1))
done < "$ENV_FILE"

echo "完了: ${count} 個の変数を ${TARGET_ENV} に登録しました。"
echo "次: Clerk を本番化したら CLERK_* と NEXT_PUBLIC_APP_URL を更新して再デプロイしてください。"
