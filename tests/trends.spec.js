/**
 * OneAISpace Trends - external acceptance test.
 *
 * Playwright cannot run inside the Base44 sandbox (no browser automation is
 * installed there), so this spec is meant to be run externally against a
 * deployed or locally served build:
 *
 *   npm i -D @playwright/test && npx playwright install chromium
 *   BASE_URL=https://<your-app-url> npx playwright test tests/trends.spec.js
 *
 * BASE_URL defaults to the local dev server at http://localhost:5173.
 * Every assertion below maps to a stated requirement of the Phase 0 UI work.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://localhost:5173";
const TRENDS = `${BASE}/trends`;

// Positions of the homepage sections. Trending Today is only rendered when a
// development actually qualifies, so it may legitimately be absent.
const sectionPositions = async (page) => {
  const official = page.getByRole("heading", { name: "Official & Research", exact: true });
  const allContent = page.getByRole("heading", { name: "All Content", exact: true });
  await expect(official).toBeVisible();
  await expect(allContent).toBeVisible();
  const trending = page.getByRole("heading", { name: "Trending Today", exact: true });
  return {
    official: (await official.boundingBox()).y,
    trending: (await trending.count()) ? (await trending.boundingBox()).y : null,
    allContent: (await allContent.boundingBox()).y,
  };
};

// The hosts the first-party publisher registry approves. A badge may never appear
// on a card from anywhere else.
const FIRST_PARTY_HOSTS = [
  /^openai\.com$/, /^chatgpt\.com$/, /^anthropic\.com$/, /^claude\.com$/, /^deepmind\.google$/,
  /^deepmind\.com$/, /^blog\.google$/, /^research\.google$/, /^ai\.google\.dev$/, /^nvidia\.com$/,
  /^blogs\.nvidia\.com$/, /^huggingface\.co$/, /^news\.mit\.edu$/, /^bair\.berkeley\.edu$/,
  /^microsoft\.com$/, /^blogs\.microsoft\.com$/, /^ai\.meta\.com$/, /^x\.ai$/, /^mistral\.ai$/,
  /^allenai\.org$/,
];

const noHorizontalOverflow = async (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe("homepage hierarchy", () => {
  test("shows header and search, then Official & Research, Trending Today, All Content in order", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TRENDS);
    await expect(page.getByRole("heading", { name: "Trends", exact: true })).toBeVisible();
    await expect(page.getByLabel("Search item titles")).toBeVisible();

    const { official, trending, allContent } = await sectionPositions(page);
    expect(official).toBeLessThan(allContent);
    if (trending !== null) {
      expect(official).toBeLessThan(trending);
      expect(trending).toBeLessThan(allContent);
    }
  });

  test("Official & Research is capped at three cards and keeps dates and original links", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="official-and-research"]');
    const cards = section.locator("article");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeLessThanOrEqual(3);

    const card = cards.first();
    await expect(card.locator("time")).toBeVisible();
    const original = card.getByRole("link", { name: /Original/ });
    expect(await original.getAttribute("href")).toMatch(/^https?:\/\//);
    expect(await original.getAttribute("target")).toBe("_blank");
  });

  test("an Official badge only appears on a registered first-party domain", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="official-and-research"]');
    const badged = section.locator('article:has([data-provenance="Official"])');
    const count = await badged.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const href = await badged.nth(index).locator('a[href^="http"]').first().getAttribute("href");
      const host = new URL(href).hostname.replace(/^www\./, "");
      expect(FIRST_PARTY_HOSTS.some((pattern) => pattern.test(host))).toBe(true);
    }
  });

  test("third-party coverage is never badged Official", async ({ page }) => {
    await page.goto(TRENDS);
    for (const host of ["techcrunch.com", "github.com", "news.ycombinator.com"]) {
      const thirdParty = page.locator(`article:has(a[href*="${host}"])`);
      if (!(await thirdParty.count())) continue;
      expect(await thirdParty.first().locator('[data-provenance="Official"]').count()).toBe(0);
    }
  });

  test("Trending Today lists only specific developments, or is hidden entirely", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="trending-today"]');
    if (!(await section.count())) return; // nothing qualified: the section is not rendered

    const rows = section.locator("li");
    expect(await rows.count()).toBeGreaterThan(0);
    const banned = ["GPT", "AI", "LLM", "Agents", "Models", "Research"];

    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index);
      const title = (await row.locator("span").first().innerText()).trim();
      expect(banned).not.toContain(title);
      await expect(row.getByText(/signals?/)).toBeVisible();
      await expect(row.getByText("Not evaluated")).toBeVisible();
    }
  });

  test("keeps one navigation row in the header and the content-type filters inside All Content", async ({ page }) => {
    await page.goto(TRENDS);
    const formatTabs = page.getByRole("tablist", { name: "Format" });
    await expect(formatTabs).toBeVisible();
    const tabY = (await formatTabs.boundingBox()).y;
    const allContentY = (await page.getByRole("heading", { name: "All Content", exact: true }).boundingBox()).y;
    expect(tabY).toBeGreaterThan(allContentY);
  });

  test("results start high on the page and nothing overflows sideways", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TRENDS);
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible();
    expect((await firstCard.boundingBox()).y).toBeLessThan(1100);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("repository cards", () => {
  test("show one name, no repeating image preview, and a source link", async ({ page }) => {
    await page.goto(`${TRENDS}?format=project`);
    const card = page.locator("article").first();
    await expect(card).toBeVisible();
    await expect(card.getByText("REPOSITORY", { exact: false })).toBeVisible();
    // The GitHub image preview was removed: it repeated the name and description.
    expect(await card.locator("img").count()).toBe(0);
    // Concise metrics, and an explicit link back to the original repository.
    await expect(card.getByText(/stars/i)).toBeVisible();
    const source = card.getByRole("link", { name: /GitHub/i });
    expect(await source.getAttribute("href")).toMatch(/^https:\/\/github\.com\//);
  });
});

test.describe("filters and search", () => {
  test("content-type filters stay in the URL and change the results", async ({ page }) => {
    await page.goto(TRENDS);
    await page.getByRole("tab", { name: /Articles/ }).click();
    await expect(page).toHaveURL(/format=articles?/);
    expect(await page.locator("article").count()).toBeGreaterThan(0);
  });

  test("search is URL state and restores on back", async ({ page }) => {
    await page.goto(TRENDS);
    await page.getByLabel("Search item titles").fill("agent");
    await expect(page).toHaveURL(/q=agent/);
    await page.goBack();
    await expect(page).not.toHaveURL(/q=agent/);
  });

  test("empty state is honest and clearable", async ({ page }) => {
    await page.goto(`${TRENDS}?q=zzzzzzzzzz`);
    await expect(page.getByText("No results match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("article").first()).toBeVisible();
  });
});

test.describe("topic pages", () => {
  test("header keeps title, description, counts and refresh time, and drops the metadata rows", async ({ page }) => {
    await page.goto(`${TRENDS}/frontier-models`);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Frontier Models", exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ items · \d+ sources · Updated /)).toBeVisible();

    // Removed from topic pages, and not to be reintroduced.
    for (const gone of ["What happened?", "Why it matters", "Evidence and claims", "Related sources", "Original links"]) {
      await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
    }
    await expect(page.getByText(/Surging|Rising|Cooling/)).toHaveCount(0);
  });

  test("Latest Content is the primary section and keeps every filter", async ({ page }) => {
    await page.goto(`${TRENDS}/agents`);
    await expect(page.getByRole("heading", { name: "Latest Content", exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Format" })).toBeVisible();
    await expect(page.getByLabel("Filter by subtopic")).toBeVisible();
    await expect(page.getByLabel("Filter by source")).toBeVisible();
    await expect(page.getByLabel("Sort results")).toBeVisible();
    await expect(page.getByRole("button", { name: "Filters" })).toBeVisible();
  });

  test("every topic route renders the same structure with content", async ({ page }) => {
    const slugs = [
      "frontier-models", "open-models", "agents", "reasoning",
      "generative-media", "research", "developer-tools", "safety-policy", "industry",
    ];
    for (const slug of slugs) {
      await page.goto(`${TRENDS}/${slug}`);
      await expect(page.getByRole("heading", { name: "Latest Content", exact: true })).toBeVisible();
      await expect(page.locator("article").first()).toBeVisible();
      await expect(page.getByText("What happened?", { exact: true })).toHaveCount(0);
    }
  });

  test("topic filter changes stay in the URL and browser Back restores the view", async ({ page }) => {
    await page.goto(`${TRENDS}/frontier-models`);
    await page.getByLabel("Sort results").click();
    await page.getByRole("option", { name: /Sort: Newest/ }).click();
    await expect(page).toHaveURL(/sort=newest/);
    await page.goBack();
    await expect(page).not.toHaveURL(/sort=newest/);
  });

  test("cards keep their original source link and their save action", async ({ page }) => {
    await page.goto(`${TRENDS}/research`);
    const card = page.locator("article").first();
    await expect(card).toBeVisible();
    const original = card.locator('a[href^="http"]').first();
    await expect(original).toBeVisible();
    await expect(original).toHaveAttribute("target", "_blank");
    await expect(card.getByRole("button", { name: /^Save / })).toBeVisible();
  });

  test("empty filter results are honest and clearable", async ({ page }) => {
    await page.goto(`${TRENDS}/research?q=zzzzzzzzzz`);
    await expect(page.getByText("No results match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("article").first()).toBeVisible();
  });

  test("no horizontal overflow at desktop, tablet or mobile widths", async ({ page }) => {
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${TRENDS}/agents`);
      await expect(page.locator("article").first()).toBeVisible();
      expect(await noHorizontalOverflow(page)).toBe(true);
    }
  });

  test("an unknown trend states that it is not catalogued", async ({ page }) => {
    await page.goto(`${TRENDS}/not-a-real-trend`);
    await expect(page.getByText("That trend is not in the catalogue")).toBeVisible();
  });
});

test.describe("saved items", () => {
  test("save affordance is present and reports its state", async ({ page }) => {
    await page.goto(TRENDS);
    const save = page.locator('button[aria-label^="Save "]').first();
    await expect(save).toBeVisible();
    const before = await save.getAttribute("aria-pressed");
    await save.click();
    await expect
      .poll(async () => save.getAttribute("aria-pressed"), { timeout: 5000 })
      .not.toBe(before);
  });
});

test.describe("themes and responsiveness", () => {
  test("light and dark both render and the choice persists", async ({ page }) => {
    await page.goto(TRENDS);
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) theme/i });
    await toggle.click();
    const themeAfterClick = await page.evaluate(() => document.documentElement.className);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.className)).toBe(themeAfterClick);
  });

  test("mobile keeps the order, stacks the search and does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TRENDS);
    const { official, trending, allContent } = await sectionPositions(page);
    expect(official).toBeLessThan(allContent);
    if (trending !== null) expect(official).toBeLessThan(trending);

    const heading = await page.getByRole("heading", { name: "Trends", exact: true }).boundingBox();
    const search = await page.getByLabel("Search item titles").boundingBox();
    expect(search.y).toBeGreaterThan(heading.y + heading.height - 4);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});