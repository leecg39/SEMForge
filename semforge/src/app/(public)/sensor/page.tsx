import { ToolTemplate } from "@/components/templates/ToolTemplate";
import { sensorTool } from "@/data/misc";

export const metadata = { title: "Sensor | SEMForge" };

export default function SensorPage() {
  return <ToolTemplate data={sensorTool} />;
}
