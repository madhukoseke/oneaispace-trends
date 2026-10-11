// How a record reached the catalogue, taken from the source that published it.
// This is provenance only: an official channel is never treated as evidence that
// a claim inside the record is true.

const KINDS = {
  official: {
    label: "Official",
    hint: "Published by the organisation's own channel. Provenance only - not independently verified.",
  },
  researcher: {
    label: "Researcher",
    hint: "Preprint attributed to its authors. Provenance only - not independently verified.",
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

const SOURCE_KINDS = {
  openai: "official",
  deepmind: "official",
  "google-research": "official",
  "google-ai": "official",
  huggingface: "official",
  "microsoft-research": "official",
  nvidia: "official",
  "mit-news": "official",
  bair: "official",
  arxiv: "researcher",
  hackernews: "community",
  github: "community",
  "techcrunch-ai": "press",
};

export function provenanceKind(sourceKey) {
  return SOURCE_KINDS[String(sourceKey || "")] || "other";
}

export function provenanceInfo(sourceKey) {
  return KINDS[provenanceKind(sourceKey)];
}

// The two kinds the Official & Research section is built from.
export function isBriefable(sourceKey) {
  const kind = provenanceKind(sourceKey);
  return kind === "official" || kind === "researcher";
}