// GitHub provider: public repository search results with their real metadata.
// Cumulative stars only - the API exposes no star history, so no growth is implied.
import { GITHUB_SEARCHES, USER_AGENT } from "../sources.ts";
import { clip, stripHtml } from "../normalize.ts";

export const githubProvider = {
  key: "github",
  label: "GitHub",
  defaultTrend: "developer-tools",
  async fetchItems() {
    const items = [];
    for (const search of GITHUB_SEARCHES) {
      const url =
        `https://api.github.com/search/repositories?q=${encodeURIComponent(search.query)}` +
        `&sort=${search.sort}&order=desc&per_page=${search.perPage}`;
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`GitHub search responded ${response.status}`);
      const payload = await response.json();

      for (const repo of payload.items || []) {
        if (!repo.full_name || !repo.html_url) continue;
        items.push({
          title: repo.full_name,
          excerpt: clip(stripHtml(repo.description || ""), 200),
          canonical_url: repo.html_url,
          source: "GitHub",
          source_key: "github",
          format: "project",
          creator: repo.owner ? repo.owner.login : "",
          published_at: repo.pushed_at || repo.created_at,
          thumbnail_url: `https://opengraph.githubassets.com/1/${repo.full_name}`,
          media_kind: "landscape",
          metric_label: "stars",
          metric_value: Number(repo.stargazers_count) || 0,
          metrics: {
            stars: Number(repo.stargazers_count) || 0,
            forks: Number(repo.forks_count) || 0,
            open_issues: Number(repo.open_issues_count) || 0,
            language: repo.language || "",
            license: repo.license ? repo.license.spdx_id : "",
            created_at: repo.created_at || "",
            pushed_at: repo.pushed_at || "",
            topics: (repo.topics || []).slice(0, 6),
          },
          provenance_url: repo.html_url,
          provenance_label: "Repository",
        });
      }
    }
    return items;
  },
};