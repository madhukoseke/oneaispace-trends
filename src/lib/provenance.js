// How a record reached the catalogue, and who stood behind it.
//
// "Official" is decided by the first-party publisher registry (exact host plus a
// matching source identity), never by a keyword in the record's text: a
// TechCrunch article about OpenAI is third-party coverage, not OpenAI content.
// Research records carry a Research label unless their first-party status is
// established by the registry.
//
// Every label here is provenance only. None of them says that a claim inside the
// record is true.

import { firstPartyPublisher } from "./publishers";

const KINDS = {
  official: {
    label: "Official",
    hint: "Published by the organisation itself on its own site. Provenance only - not independently verified.",
  },
  researcher: {
    label: "Research",
    hint: "Paper or preprint attributed to its authors. Provenance only - not independently verified.",
  },
  community: {
    label: "Community",
    hint: "Community or open-source source. Provenance only - not independently verified.",
  },
  press: {
    label: "Press",
    hint: "Third-party publication. Provenance only - not independently verified.",
  },
  other: {
    label: "Source",
    hint: "Third-party source. Provenance only - not independently verified.",
  },
};

// Channels that are not themselves a first-party publisher.
const CHANNELS = {
  arxiv: "researcher",
  "hacker-news": "community",
  github: "community",
  "techcrunch-ai": "press",
};

export function isResearchItem(item) {
  if (!item) return false;
  return item.format === "research" || item.source_key === "arxiv";
}

export function itemProvenance(item) {
  const publisher = firstPartyPublisher(item);
  if (publisher) {
    return {
      kind: "official",
      label: KINDS.official.label,
      hint: `Published by ${publisher.name} itself. Provenance only - not independently verified.`,
      publisher: publisher.name,
    };
  }

  if (isResearchItem(item)) return { ...KINDS.researcher, publisher: "" };

  const kind = CHANNELS[String((item && item.source_key) || "").toLowerCase()] || "other";
  return { ...KINDS[kind], publisher: "" };
}