"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// 現在の検索の上位投稿についてコメント（X=リプライ / TikTok・IG=コメント）を収集するボタン。
// API コストがかかるためユーザー操作で明示的に実行する。
export function CollectCommentsButton({ searchId }: { searchId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    setErr(null);
    const res = await fetch(`/api/report/${searchId}/comments`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      setErr(json.error?.message ?? "コメント取得に失敗しました");
      return;
    }
    const d = json.data;
    setMsg(`${d.savedComments} 件のコメントを取得（対象 ${d.targetPosts} 投稿）`);
    if (d.errors?.length) setErr(d.errors.join(" / "));
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => startTransition(run)}
        disabled={isPending}
        className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60"
      >
        {isPending ? "コメント取得中…（数十秒かかる場合があります）" : "コメントを取得して分析"}
      </button>
      {msg ? <p className="text-xs text-emerald-500">{msg}</p> : null}
      {err ? (
        <p className="text-xs text-amber-500">
          一部失敗: {err}
          {/\b495\b|Maximum requests/i.test(err) ? "（データ提供元の日次上限。時間をおいて再実行してください）" : ""}
        </p>
      ) : null}
    </div>
  );
}
