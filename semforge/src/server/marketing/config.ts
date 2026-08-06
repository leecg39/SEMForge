export const marketingFlags = {
  ingestion: () => process.env.AIRBYTE_MARKETING_INGESTION_ENABLED === "true",
  intelligence: () => process.env.MARKETING_INTELLIGENCE_ENABLED === "true",
  selfService: () => process.env.MARKETING_SELF_SERVICE_CONNECTIONS_ENABLED === "true",
  ads: () => process.env.MARKETING_ADS_ENABLED === "true",
  crm: () => process.env.MARKETING_CRM_ENABLED === "true",
  reportPdf: () => process.env.MARKETING_REPORT_PDF_ENABLED === "true",
};
