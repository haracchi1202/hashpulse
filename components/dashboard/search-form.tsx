"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SearchForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("(#筋トレ AND #増量) OR #ダイエット");
  // 既定で X / Instagram / TikTok をすべて収集対象にする（横断分析が目的のため）。不要なら各チェックを外す。
  const [platforms, setPlatforms] = useState<{ x: boolean; ig: boolean; tiktok: boolean }>({ x: true, ig: true, tiktok: true });
  const [minLikes, setMinLikes] = useState<string>("");
  const [minFollowers, setMinFollowers] = useState<string>("");
  const [lang, setLang] = useState<"" | "ja" | "en">("ja");
  // 収集対象期間（YYYY-MM-DD）。空欄なら期間指定なし（従来動作）。
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [save, setSave] = useState(false);
  const [saveName, setSaveName] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const selected = [
      ...(platforms.x ? ["X"] : []),
      ...(platforms.ig ? ["INSTAGRAM"] : []),
      ...(platforms.tiktok ? ["TIKTOK"] : []),
    ];
    if (selected.length === 0) {
      setError("プラットフォームを選択してください");
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError("開始日は終了日より前の日付にしてください");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            platforms: selected,
            filters: {
              minLikes: minLikes ? Number(minLikes) : undefined,
              minFollowers: minFollowers ? Number(minFollowers) : undefined,
              lang: lang || undefined,
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            },
            save,
            name: save && saveName ? saveName : undefined,
            // X(twitterapi)は 1ページ20件をページ送りで集めるため、大きすぎると
            // Vercel 時間予算(210s)内に終わらず 0 件になる。実用上十分な件数に抑える。
            maxResults: 300,
          }),
        });
        // 収集はサーバ側でバックグラウンド実行されるため、ここではすぐに searchId が返る。
        // ゲートウェイが HTML を返すケースに備え JSON 解析を保護する。
        let json: { ok?: boolean; data?: { searchId?: string }; error?: { message?: string } } | null = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        if (!res.ok || !json?.ok) {
          setError(json?.error?.message ?? `検索の開始に失敗しました (HTTP ${res.status})`);
          return;
        }
        if (!json.data?.searchId) {
          setError("検索を開始しましたが結果IDを取得できませんでした。");
          return;
        }
        // RUNNING 状態のダッシュボードへ即遷移。収集の進捗はダッシュボード側がポーリングする。
        router.push(`/dashboard?searchId=${json.data.searchId}`);
        router.refresh();
      } catch {
        setError("ネットワークエラーが発生しました。時間をおいて再実行してください。");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border border-border bg-card/40 p-5">
      <div className="space-y-2">
        <Label htmlFor="query">クエリ式 (#タグ / キーワード / AND / OR / NOT / 括弧)</Label>
        <Input
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="うるぷくシール / (#筋トレ AND #増量) OR #ダイエット"
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          #なしの普通のキーワードも検索できます（例: うるぷくシール）。X はそのまま全文検索、Instagram はキーワードを自動で #タグ化して検索します。
        </p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">AND（両方を含む）:</span>{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">きぬた歯科 ドロップシール</code>{" "}
            または <code className="rounded bg-muted px-1 py-0.5 font-mono">#筋トレ AND #増量</code>
            <span className="ml-1">（スペース区切りでも AND になります）</span>
          </li>
          <li>
            <span className="font-medium text-foreground">OR（どちらかを含む）:</span>{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">#猫 OR #犬</code>
          </li>
          <li>
            <span className="font-medium text-foreground">NOT（除外）:</span>{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">#猫 NOT PR</code>
          </li>
          <li>
            <span className="font-medium text-foreground">括弧でグループ化:</span>{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">(#筋トレ AND #増量) OR #ダイエット</code>
          </li>
          <li className="text-muted-foreground/80">
            ※ AND / OR / NOT は前後にスペースが必要です。括弧は半角 ( ) のみ対応。
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>プラットフォーム</Label>
          <div className="flex gap-3 text-sm pt-1">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={platforms.x}
                onChange={(e) => setPlatforms((p) => ({ ...p, x: e.target.checked }))}
              />
              X
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={platforms.ig}
                onChange={(e) => setPlatforms((p) => ({ ...p, ig: e.target.checked }))}
              />
              Instagram
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={platforms.tiktok}
                onChange={(e) => setPlatforms((p) => ({ ...p, tiktok: e.target.checked }))}
              />
              TikTok
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="minLikes">最低いいね数</Label>
          <Input id="minLikes" type="number" min={0} value={minLikes} onChange={(e) => setMinLikes(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="minFollowers">最低フォロワー数</Label>
          <Input id="minFollowers" type="number" min={0} value={minFollowers} onChange={(e) => setMinFollowers(e.target.value)} placeholder="0" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lang">言語</Label>
          <select
            id="lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as "" | "ja" | "en")}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">指定なし</option>
            <option value="ja">日本語</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>収集対象期間（任意）</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="startDate"
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-auto"
            aria-label="開始日"
          />
          <span className="text-sm text-muted-foreground">〜</span>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-auto"
            aria-label="終了日"
          />
          {(startDate || endDate) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              クリア
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          空欄なら期間指定なしで収集します。期間を広げると取得に時間がかかり、時間制限（1回あたり最大約210秒）やページ上限により古い投稿へ到達する前に打ち切られる場合があります。
          X は全期間、Instagram / TikTok は新しい投稿を優先して収集します。
        </p>
      </div>

      <div className="flex items-end gap-3 pt-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          この検索条件を保存
        </label>
        {save ? (
          <Input
            placeholder="保存名 (例: 筋トレ系)"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="max-w-xs"
          />
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "検索中…" : "検索実行"}
        </Button>
      </div>
    </form>
  );
}
