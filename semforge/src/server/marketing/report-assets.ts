import fs from "node:fs/promises";
import path from "node:path";

function root(): string {
  return path.resolve(process.env.MARKETING_REPORT_ASSET_ROOT?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "marketing-reports"));
}

function safeKey(key: string): string {
  if (!/^mr_[a-zA-Z0-9_-]+\.pdf$/u.test(key)) throw new Error("허용되지 않은 보고서 자산 키입니다.");
  return key;
}

export async function saveMarketingReportPdf(snapshotId: string, bytes: Uint8Array): Promise<string> {
  const key = safeKey(`mr_${snapshotId}.pdf`);
  await fs.mkdir(root(), { recursive: true });
  await fs.writeFile(path.join(root(), key), bytes);
  return key;
}

export async function readMarketingReportPdf(key: string): Promise<Uint8Array> {
  return fs.readFile(path.join(root(), safeKey(key)));
}
