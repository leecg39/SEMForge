import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface FrozenMarketingSnapshot {
  id: string;
  reportType: string;
  rangeFrom: string;
  rangeTo: string;
  createdAt: Date;
  payload: unknown;
  provenance: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metric(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(parsed) : "Unavailable";
}

export async function renderMarketingSnapshotPdf(snapshot: FrozenMarketingSnapshot): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`SEMForge ${snapshot.reportType}`);
  document.setAuthor("SEMForge");
  document.setCreator("SEMForge deterministic snapshot renderer");
  document.setProducer("SEMForge");
  document.setCreationDate(snapshot.createdAt);
  document.setModificationDate(snapshot.createdAt);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const page = document.addPage([595.28, 841.89]);
  const payload = record(snapshot.payload);
  const data = record(payload.data);
  const overview = record(data.overview);
  const provenance = record(snapshot.provenance);
  let y = 786;
  page.drawText("SEMForge Marketing Intelligence", { x: 48, y, size: 21, font: bold, color: rgb(0.11, 0.12, 0.12) });
  y -= 28;
  page.drawText(`${snapshot.reportType} | ${snapshot.rangeFrom} - ${snapshot.rangeTo}`, { x: 48, y, size: 10, font, color: rgb(0.38, 0.4, 0.39) });
  y -= 38;
  const rows: Array<[string, string]> = [
    ["Search clicks", metric(overview.clicks)], ["Search impressions", metric(overview.impressions)],
    ["GA4 sessions", metric(overview.sessions)], ["Engaged sessions", metric(overview.engagedSessions)],
    ["Key events", metric(overview.keyEvents)], ["Revenue", metric(overview.revenue)],
  ];
  for (const [label, value] of rows) {
    page.drawRectangle({ x: 48, y: y - 9, width: 499, height: 31, color: rgb(0.97, 0.975, 0.973) });
    page.drawText(label, { x: 60, y, size: 10, font, color: rgb(0.35, 0.37, 0.36) });
    page.drawText(value, { x: 400, y, size: 11, font: bold, color: rgb(0.11, 0.12, 0.12) });
    y -= 38;
  }
  y -= 20;
  page.drawText("Data provenance", { x: 48, y, size: 13, font: bold });
  y -= 22;
  const sources = Array.isArray(provenance.source) ? provenance.source.map(String).join(", ") : "Unavailable";
  const meta = [
    `Sources: ${sources}`,
    `Fetched at: ${String(provenance.fetchedAt ?? "Unavailable")}`,
    `Cache: ${String(provenance.cache ?? "Unavailable")}`,
    `Measurement: ${String(provenance.measurement ?? "Unavailable")}`,
    "GSC attribution is inferred unless UTM, gclid, CRM source, or an explicit campaign binding exists.",
  ];
  for (const line of meta) { page.drawText(line.slice(0, 100), { x: 48, y, size: 9, font, color: rgb(0.35, 0.37, 0.36) }); y -= 16; }
  page.drawText(`Snapshot ${snapshot.id}`, { x: 48, y: 32, size: 8, font, color: rgb(0.5, 0.52, 0.51) });
  return document.save({ useObjectStreams: false, addDefaultPage: false, objectsPerTick: 1000 });
}
