import Papa from "papaparse";

export interface PostExportRow {
  platform: string;
  postedAt: string;
  authorUsername: string;
  authorDisplayName: string;
  followers: number;
  text: string;
  url: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  impressionCount: number;
  hashtags: string;
}

export function toCSV(rows: PostExportRow[]): string {
  return Papa.unparse(rows, {
    header: true,
    quotes: true,
    newline: "\r\n",
  });
}
