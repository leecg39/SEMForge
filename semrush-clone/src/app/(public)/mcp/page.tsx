import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "Semrush MCP | Semrush UI Clone" };

export default function McpPage() {
  return <DetailTemplate data={detailLandings.mcp} />;
}
