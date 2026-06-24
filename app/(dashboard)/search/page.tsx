import { SearchForm } from "@/components/dashboard/search-form";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <div className="px-8 py-8 max-w-3xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">新規検索</h1>
        <p className="text-sm text-muted-foreground">
          ハッシュタグ検索条件を入力して X (Twitter) / Instagram / TikTok を横断分析します。
        </p>
      </header>
      <SearchForm />
    </div>
  );
}
