import TabRow from "./TabRow";
import { FORMAT_LABELS, FORMAT_ORDER, FORMAT_TONE } from "@/lib/trends";

// Only formats that actually exist in this scope are offered.
export default function FormatTabs({ rows, value, onChange }) {
  const counts = new Map((rows || []).map((row) => [row.format, row.count]));
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);

  const tabs = [
    { value: "all", label: "All", count: total, tone: "text-brand" },
    ...FORMAT_ORDER.filter((format) => counts.get(format) > 0).map((format) => ({
      value: format,
      label: FORMAT_LABELS[format],
      count: counts.get(format),
      tone: FORMAT_TONE[format],
    })),
  ];

  return <TabRow label="Format" tabs={tabs} value={value} onChange={onChange} />;
}