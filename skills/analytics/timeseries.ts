import type { TimeseriesPoint } from "@/lib/types";

export interface TSPost {
  postedAt: Date | string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  authorFollowers?: number;
}

export function dailyTimeseries(posts: TSPost[]): TimeseriesPoint[] {
  const buckets = new Map<string, TSPost[]>();
  for (const p of posts) {
    const date = new Date(p.postedAt).toISOString().slice(0, 10);
    const bucket = buckets.get(date) ?? [];
    bucket.push(p);
    buckets.set(date, bucket);
  }

  const points: TimeseriesPoint[] = [];
  for (const [date, bucket] of buckets) {
    let likes = 0;
    let impressions = 0;
    let erSum = 0;
    let erCount = 0;
    for (const p of bucket) {
      likes += p.likeCount;
      impressions += p.impressionCount;
      const engage = p.likeCount + p.retweetCount + p.replyCount + p.quoteCount;
      const denom =
        p.impressionCount && p.impressionCount > 0
          ? p.impressionCount
          : p.authorFollowers && p.authorFollowers > 0
            ? p.authorFollowers
            : 0;
      if (denom > 0) {
        erSum += engage / denom;
        erCount++;
      }
    }
    points.push({
      date,
      postCount: bucket.length,
      totalLikes: likes,
      totalImpressions: impressions,
      avgER: erCount > 0 ? erSum / erCount : 0,
    });
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}
