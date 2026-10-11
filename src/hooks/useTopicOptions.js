import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// The topics that actually hold items in the category being browsed, so the topic filter
// never offers a subtopic that would return nothing. Topics are public taxonomy records;
// the lookup runs only once the filter panel is opened.
export default function useTopicOptions(slugs, enabled) {
  const key = (slugs || []).join(",");
  const [topics, setTopics] = useState([]);

  useEffect(() => {
    if (!enabled || !key) {
      setTopics([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const page = await base44.entities.Topic.filter(
          { trend_slug: { $in: key.split(",") } },
          { sort: "sort_order", limit: 60 }
        );
        if (cancelled) return;
        setTopics(
          (page.items || [])
            .filter((topic) => topic.item_count > 0)
            .map((topic) => ({
              value: topic.slug,
              label: topic.name,
              trend_slug: topic.trend_slug,
            }))
        );
      } catch (error) {
        console.error("Topic lookup failed", error);
      }
    })();
    return () => { cancelled = true; };
  }, [key, enabled]);

  return topics;
}