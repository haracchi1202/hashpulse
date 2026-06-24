import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/utils";

interface Props {
  label: string;
  value: number;
  format?: "number" | "percent";
  hint?: string;
}

export function KpiCard({ label, value, format = "number", hint }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono font-tabular text-3xl font-semibold tracking-tight">
          {format === "percent" ? formatPercent(value) : formatNumber(value)}
        </div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
