import TabRow from "./TabRow";

// Topics are the trend's own children and only appear when they hold items.
export default function TopicTabs({ topics, value, onChange, total }) {
  const tabs = [
    { value: "", slug: "overview", label: "Overview", count: total },
    ...topics.map((topic) => ({ value: topic.slug, label: topic.name, count: topic.item_count })),
  ];

  return <TabRow label="Topics in this trend" tabs={tabs} value={value} onChange={onChange} />;
}