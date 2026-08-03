import { route } from "@/lib/api";
import { requireAuth } from "@/lib/session";
import { getContentAssetFile } from "@/server/content/visuals";
import { getProductionAssetFile } from "@/server/content/media";

type Context = { params: Promise<{ assetId: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const auth = await requireAuth(request);
  const { assetId } = await context.params;
  const { asset, bytes } = assetId.startsWith("cpa_")
    ? await getProductionAssetFile(auth, assetId)
    : await getContentAssetFile(auth, assetId);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const extension = asset.mimeType === "image/jpeg"
    ? "jpg"
    : asset.mimeType === "image/png"
      ? "png"
      : asset.mimeType === "image/svg+xml"
        ? "svg"
      : asset.mimeType === "video/mp4"
        ? "mp4"
        : "webp";
  const range = !download && asset.mimeType === "video/mp4" ? request.headers.get("range") : null;
  let body = bytes;
  let status = 200;
  const headers: Record<string, string> = {};
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/u);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    const suffixLength = !match[1] && match[2] ? Number(match[2]) : null;
    const requestedStart = match[1] ? Number(match[1]) : suffixLength === null ? Number.NaN : Math.max(0, bytes.length - suffixLength);
    const requestedEnd = match[1] && match[2] ? Number(match[2]) : bytes.length - 1;
    const start = Math.max(0, requestedStart);
    const end = Math.min(bytes.length - 1, requestedEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= bytes.length) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    }
    body = bytes.subarray(start, end + 1);
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
    headers["Accept-Ranges"] = "bytes";
  }
  return new Response(new Uint8Array(body), {
    status,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(body.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="semforge-${asset.kind}.${extension}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
});
