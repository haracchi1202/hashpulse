"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "RUNNING" | "DONE" | "ERROR";

interface Props {
  searchId: string;
  /** サーバ側で読み取った初期 status。RUNNING のときのみポーリングを開始する。 */
  initialStatus: Status;
}

/**
 * 非同期収集（/api/search の after()）の進捗バナー。
 * RUNNING の間 /api/search/[id]/status を一定間隔でポーリングし、
 * DONE/ERROR に変わったら router.refresh() でサーバコンポーネントを再描画して結果を反映する。
 */
export function CollectionStatus({ searchId, initialStatus }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initialStatus);
  const [postCount, setPostCount] = useState<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number | null>(null);

  // ポーリングの上限（保険）。サーバ側の自己修復(STALE_MS=360s)が ERROR に倒すのが通常だが、
  // 万一それも届かない場合に無限ポーリングを止める。
  const POLL_TIMEOUT_SEC = 450;

  useEffect(() => {
    if (status !== "RUNNING") return;

    let stopped = false;
    startedAt.current = performance.now();

    // 経過秒カウンタ（体感のため）。上限を超えたらポーリングを止めて案内を出す。
    const tick = setInterval(() => {
      if (startedAt.current != null) {
        const sec = Math.floor((performance.now() - startedAt.current) / 1000);
        setElapsed(sec);
        if (sec >= POLL_TIMEOUT_SEC) {
          stopped = true;
          setTimedOut(true);
          clearTimeout(timer);
          clearInterval(tick);
        }
      }
    }, 1000);

    async function poll() {
      try {
        const res = await fetch(`/api/search/${searchId}/status`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        const next: Status | undefined = json?.data?.status;
        if (typeof json?.data?.postCount === "number") setPostCount(json.data.postCount);
        if (next && next !== "RUNNING") {
          if (stopped) return;
          setStatus(next);
          // 完了：サーバコンポーネントを再描画して収集結果（KPI / グラフ / 一覧）を反映
          router.refresh();
          return; // ポーリング終了
        }
      } catch {
        // 一時的なネットワークエラーは無視して次のポーリングで再試行
      }
      if (!stopped) timer = setTimeout(poll, 3000);
    }

    let timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [status, searchId, router]);

  if (timedOut) {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
        収集に時間がかかっています。ページを再読み込みして状態を確認するか、対象プラットフォームを減らして再検索してください。
      </div>
    );
  }

  if (status === "RUNNING") {
    return (
      <div className="flex items-center gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>
          収集中… X / Instagram / TikTok から取得しています（{elapsed}秒経過）。完了すると自動で結果が表示されます。
        </span>
      </div>
    );
  }

  if (status === "ERROR") {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        収集に失敗しました。時間をおいて再検索してください。
      </div>
    );
  }

  // DONE：直後は完了を一瞬伝える（refresh で再描画されるとアンマウントされる）
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
      収集が完了しました（{postCount} 件）。結果を表示しています…
    </div>
  );
}
