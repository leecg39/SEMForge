import { DetailTemplate } from "@/components/templates/DetailTemplate";
import { detailLandings } from "@/data/misc";

export const metadata = { title: "SEMForge MCP | SEMForge" };

export default function McpPage() {
  return <DetailTemplate data={detailLandings.mcp} />;
}
