// @TASK P4-R1-T1 - Chromium and Noto Sans KR PDF renderer
// @SPEC docs/planning/06-tasks.md#p4-r1-t1--한글-pdf이메일객체-저장소
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

import puppeteer from "puppeteer-core";

import { renderReportHtml } from "@/server/reports/rendering/html";
import { loadReportLogo } from "@/server/reports/rendering/logo";
import type { WeeklyReportSnapshot } from "@/server/reports/types";

const require = createRequire(import.meta.url);

export interface RenderedReportPdf {
  readonly pdf: Uint8Array;
  readonly html: string;
  readonly snapshotSha256: string;
}

export interface ReportPdfRenderer {
  render(snapshot: WeeklyReportSnapshot): Promise<RenderedReportPdf>;
}

export interface ChromiumReportRendererOptions {
  readonly executablePath?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly launchTimeoutMs?: number;
}

function defaultExecutablePath(): string {
  if (process.env.CHROMIUM_EXECUTABLE_PATH?.trim()) return process.env.CHROMIUM_EXECUTABLE_PATH.trim();
  if (process.platform === "darwin") {
    return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  }
  return "/usr/bin/chromium";
}

async function notoSansKrDataUri(): Promise<string> {
  const cssPath = require.resolve("@fontsource/noto-sans-kr/korean-400.css");
  const fontPath = path.join(path.dirname(cssPath), "files", "noto-sans-kr-korean-400-normal.woff2");
  const font = await readFile(fontPath);
  return `data:font/woff2;base64,${font.toString("base64")}`;
}

export function createChromiumReportRenderer(
  options: ChromiumReportRendererOptions = {},
): ReportPdfRenderer {
  return {
    async render(snapshot) {
      const [fontDataUri, logoDataUri] = await Promise.all([
        notoSansKrDataUri(),
        loadReportLogo(snapshot.brand.logoUrl, { fetch: options.fetch }),
      ]);
      const rendered = renderReportHtml(snapshot, { fontDataUri, logoDataUri });
      const browser = await puppeteer.launch({
        executablePath: options.executablePath ?? defaultExecutablePath(),
        headless: true,
        timeout: options.launchTimeoutMs ?? 30_000,
        args: ["--disable-background-networking", "--disable-default-apps", "--disable-sync"],
      });
      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30_000);
        await page.setContent(rendered.html, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => document.fonts.ready);
        const pdf = await page.pdf({
          format: "A4",
          preferCSSPageSize: true,
          printBackground: true,
          tagged: true,
          outline: true,
        });
        return { ...rendered, pdf };
      } finally {
        await browser.close();
      }
    },
  };
}
