import ExcelJS from "exceljs";
import type { PostExportRow } from "./csv";

export async function toXLSX(rows: PostExportRow[], sheetName = "Posts"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HashPulse";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { header: "Platform", key: "platform", width: 10 },
    { header: "Posted At", key: "postedAt", width: 20 },
    { header: "Username", key: "authorUsername", width: 18 },
    { header: "Display Name", key: "authorDisplayName", width: 22 },
    { header: "Followers", key: "followers", width: 12 },
    { header: "Text", key: "text", width: 60 },
    { header: "URL", key: "url", width: 40 },
    { header: "Likes", key: "likeCount", width: 10 },
    { header: "Retweets", key: "retweetCount", width: 10 },
    { header: "Replies", key: "replyCount", width: 10 },
    { header: "Quotes", key: "quoteCount", width: 10 },
    { header: "Impressions", key: "impressionCount", width: 12 },
    { header: "Hashtags", key: "hashtags", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E293B" },
  };
  ws.getRow(1).font = { bold: true, color: { argb: "FFE2E8F0" } };

  for (const r of rows) ws.addRow(r);

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
