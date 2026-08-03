import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  contentBrandKits,
  contentPackageItems,
  contentProductionAssets,
  contentProductions,
  workspaces,
} from "@/db/schema";
import { renderVisualVariants, VISUAL_VARIANTS } from "@/server/content/visual-renderer";
import {
  productionAssetKey,
  readContentAsset,
  sha256,
  writeContentAsset,
} from "@/server/content/visual-storage";

type ImageSettings = {
  displayTitle?: string;
  showTitle?: boolean;
  titlePosition?: "top_left" | "bottom_left";
  showLogo?: boolean;
  focalX?: number;
  focalY?: number;
};

type StoredResult = {
  specification?: { altText?: string };
};

function parseObject<T extends object>(value: string | null): T {
  if (!value) return {} as T;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as T
      : {} as T;
  } catch {
    return {} as T;
  }
}

async function main() {
const packageId = process.argv[2]?.trim();
if (!packageId) throw new Error("사용법: npm run content:migrate-svg -- <packageId>");

const [target] = await db
  .select({ production: contentProductions })
  .from(contentPackageItems)
  .innerJoin(contentProductions, eq(contentProductions.id, contentPackageItems.productionId))
  .where(and(
    eq(contentPackageItems.packageId, packageId),
    eq(contentPackageItems.kind, "image"),
    eq(contentPackageItems.status, "active"),
    isNull(contentPackageItems.deletedAt),
    isNull(contentProductions.deletedAt),
  ))
  .orderBy(desc(contentPackageItems.revision))
  .limit(1);
if (!target) throw new Error("활성 이미지 제작물이 있는 콘텐츠 패키지를 찾을 수 없습니다.");

const production = target.production;
const [sourceAsset] = await db
  .select()
  .from(contentProductionAssets)
  .where(and(
    eq(contentProductionAssets.productionId, production.id),
    eq(contentProductionAssets.kind, "image_source"),
    isNull(contentProductionAssets.deletedAt),
  ))
  .limit(1);
if (!sourceAsset) throw new Error("SVG를 다시 렌더링할 이미지 원본을 찾을 수 없습니다.");

const derivatives = await db
  .select()
  .from(contentProductionAssets)
  .where(and(
    eq(contentProductionAssets.productionId, production.id),
    inArray(contentProductionAssets.kind, ["thumbnail", "open_graph"]),
    isNull(contentProductionAssets.deletedAt),
  ));
const thumbnailAsset = derivatives.find((asset) => asset.kind === "thumbnail");
const openGraphAsset = derivatives.find((asset) => asset.kind === "open_graph");
if (!thumbnailAsset || !openGraphAsset) {
  throw new Error("썸네일과 OG 자산이 모두 있어야 변환할 수 있습니다.");
}

const [[brandKit], [workspace], source] = await Promise.all([
  db.select().from(contentBrandKits).where(eq(contentBrandKits.workspaceId, production.workspaceId)).limit(1),
  db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, production.workspaceId)).limit(1),
  readContentAsset(sourceAsset.storageKey),
]);
const settings = parseObject<ImageSettings>(production.settingsJson);
const storedResult = parseObject<StoredResult>(production.resultJson);
const logo = brandKit?.logoStorageKey
  ? await readContentAsset(brandKit.logoStorageKey).catch(() => null)
  : null;
const variants = await renderVisualVariants({
  source,
  presentation: {
    displayTitle: settings.displayTitle || production.title,
    showTitle: settings.showTitle ?? true,
    titlePosition: settings.titlePosition ?? "bottom_left",
    showLogo: settings.showLogo ?? true,
    focalX: settings.focalX ?? 50,
    focalY: settings.focalY ?? 50,
  },
  brand: {
    brandName: brandKit?.brandName || workspace?.name || "SEMForge",
    primaryColor: brandKit?.primaryColor || "#ff5a1f",
    secondaryColor: brandKit?.secondaryColor || "#18181b",
    logo,
  },
});

const outputs = [
  {
    asset: thumbnailAsset,
    kind: "thumbnail" as const,
    bytes: variants.thumbnail,
    filename: "thumbnail.svg",
    ...VISUAL_VARIANTS.thumbnail,
  },
  {
    asset: openGraphAsset,
    kind: "open_graph" as const,
    bytes: variants.openGraph,
    filename: "open-graph.svg",
    ...VISUAL_VARIANTS.open_graph,
  },
].map((output) => ({
  ...output,
  storageKey: productionAssetKey({
    workspaceId: production.workspaceId,
    productionId: production.id,
    filename: output.filename,
  }),
}));

await Promise.all(outputs.map((output) => writeContentAsset(output.storageKey, output.bytes)));
const now = new Date();
db.transaction((tx) => {
  for (const output of outputs) {
    tx.update(contentProductionAssets).set({
      storageKey: output.storageKey,
      mimeType: "image/svg+xml",
      width: output.width,
      height: output.height,
      byteSize: output.bytes.length,
      sha256: sha256(output.bytes),
      altText: storedResult.specification?.altText ?? output.asset.altText,
      updatedAt: now,
      version: sql`${contentProductionAssets.version} + 1`,
    }).where(eq(contentProductionAssets.id, output.asset.id)).run();
  }
});

console.log(JSON.stringify({
  packageId,
  productionId: production.id,
  converted: outputs.map((output) => ({ kind: output.kind, filename: output.filename })),
}));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "SVG 변환에 실패했습니다.");
  process.exitCode = 1;
});
