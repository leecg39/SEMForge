import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { domainAnalysisSnapshots } from "@/db/schema";
import type {
  AnalyticsDevice,
  DomainExternalAnalysis,
} from "@/lib/analytics/types";
import { newId } from "@/lib/ids";

function parseSnapshot(value: string): DomainExternalAnalysis | null {
  try {
    const parsed = JSON.parse(value) as DomainExternalAnalysis;
    if (!parsed || typeof parsed !== "object" || !parsed.providers || !parsed.capturedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getDomainExternalAnalysis(input: {
  domain: string;
  countryCode: string;
  device: AnalyticsDevice;
}): Promise<DomainExternalAnalysis | null> {
  const [row] = await db
    .select({ externalJson: domainAnalysisSnapshots.externalJson })
    .from(domainAnalysisSnapshots)
    .where(
      and(
        eq(domainAnalysisSnapshots.domain, input.domain),
        eq(domainAnalysisSnapshots.countryCode, input.countryCode.toUpperCase()),
        eq(domainAnalysisSnapshots.device, input.device),
      ),
    )
    .limit(1);
  return row ? parseSnapshot(row.externalJson) : null;
}

export async function saveDomainExternalAnalysis(
  analysis: DomainExternalAnalysis,
): Promise<void> {
  const now = new Date();
  await db
    .insert(domainAnalysisSnapshots)
    .values({
      id: newId("das"),
      domain: analysis.domain,
      countryCode: analysis.countryCode,
      device: analysis.device,
      externalJson: JSON.stringify(analysis),
      capturedAt: new Date(analysis.capturedAt),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        domainAnalysisSnapshots.domain,
        domainAnalysisSnapshots.countryCode,
        domainAnalysisSnapshots.device,
      ],
      set: {
        externalJson: JSON.stringify(analysis),
        capturedAt: new Date(analysis.capturedAt),
        updatedAt: now,
      },
    });
}
