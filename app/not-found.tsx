import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold">404</h1>
        <p className="text-muted-foreground">ページが見つかりませんでした</p>
        <Link href="/" className="text-primary hover:underline text-sm">
          ホームへ戻る
        </Link>
      </div>
    </main>
  );
}
