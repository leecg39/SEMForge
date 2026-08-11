# P4-R1 Report Delivery Evidence

- Runtime: Node.js `v24.19.0`
- Renderer: Headless Chrome `149.0.0.0`, Skia PDF
- Artifact: `actual-korean-report.pdf`
- PDF: A4, 23 pages, 315,378 bytes, tagged, no JavaScript, not encrypted
- Font inspection: embedded/subset/Unicode `NotoSansKRThin-Regular` CID TrueType
- Text extraction: Korean title, long Korean keyword rows, partial sections, snapshot SHA-256 all extracted successfully
- Full verification: lint + typecheck + 396 tests passed
- Production build: passed with the `/api/v1/reports/[reportId]/pdf` dynamic route in the manifest
- Dependency audit: `found 0 vulnerabilities` (including development dependencies)

The PDF was produced through `createChromiumReportRenderer`, the same public renderer used by the report delivery worker.
