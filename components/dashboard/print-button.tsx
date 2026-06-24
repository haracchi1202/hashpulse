"use client";

// 反響レポートを PDF 出力するボタン。ブラウザの印刷ダイアログ（PDFとして保存）を使うため
// 日本語フォントもそのまま使え、追加依存が不要。印刷用 CSS（globals.css の @media print）で整形する。
export function PrintButton({ label = "PDFで出力" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
    >
      {label}
    </button>
  );
}
