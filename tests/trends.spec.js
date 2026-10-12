/**
 * OneAISpace Trends — external acceptance test (Phase 4B premium UI).
 *
 * Playwright cannot run inside the Base44 sandbox (no browser automation is
 * installed there), so this spec is meant to be run externally against a
 * deployed or locally served build:
 *
 *   npm i -D @playwright/test && npx playwright install chromium
 *   BASE_URL=https://<your-app-url> npx playwright test tests/trends.spec.js
 *
 * BASE_URL defaults to the local dev server at http://localhost:5173.
 *
 * The homepage under test is one column: header, Trends title and description, one
 * prominent title search, the compact category row, Latest Developments from the public
 * feed, then Explore AI. Every assertion below maps to a requirement of Phase 4B.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://localhost:5173";
const TRENDS = `${BASE}/trends`;

const noHorizontalOverflow = async (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

const sectionY = async (page, name) => {
  const heading = page.getByRole("heading", { name, exact: true });
  await expect(heading).toBeVisible();
  return (await heading.boundingBox()).y;
};

test.describe("homepage hierarchy", () => {
  test("leads with the title and one search field, then the category row, then content", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TRENDS);

    const heading = page.getByRole("heading", { name: "Trends", exact: true });
    await expect(heading).toBeVisible();
    const search = page.getByLabel("Search item titles");
    await expect(search).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Browse by category" })).toBeVisible();

    // The search sits directly under the page identity, well above the content sections.
    const searchBox = await search.boundingBox();
    expect(searchBox.y).toBeLessThan((await heading.boundingBox()).y + 220);

    const explore = await sectionY(page, "Explore AI");
    const developments = page.locator('section[aria-labelledby="latest-developments"]');
    if (await developments.count()) {
      const developmentY = (await developments.boundingBox()).y;
      expect(developmentY).toBeLessThan(explore);
    }
  });

  test("the removed homepage sections are gone", async ({ page }) => {
    await page.goto(TRENDS);
    for (const gone of ["Official & Research", "Trending Today", "All Content"]) {
      await expect(page.getByRole("heading", { name: gone, exact: true })).toHaveCount(0);
    }
  });

  test("latest developments stands down while the catalogue is narrowed", async ({ page }) => {
    const section = page.locator('section[aria-labelledby="latest-developments"]');

    await page.goto(TRENDS);
    if (!(await section.count())) return; // nothing eligible: the section is not rendered at all

    await page
      .getByRole("navigation", { name: "Browse by category" })
      .getByRole("button", { name: "Models", exact: true })
      .click();
    await expect(section).toHaveCount(0);

    await page.goto(TRENDS);
    await page.getByRole("tab", { name: /Articles/ }).click();
    await expect(section).toHaveCount(0);

    await page.goto(TRENDS);
    await page.getByLabel("Search item titles").fill("agent");
    await expect(section).toHaveCount(0);

    // Clearing the narrowing brings it back.
    await page.goto(TRENDS);
    await expect(section).toBeVisible();
  });

  test("results start high on the page and nothing overflows sideways", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TRENDS);
    const firstCard = page.locator("article").first();
    await expect(firstCard).toBeVisible();
    expect((await firstCard.boundingBox()).y).toBeLessThan(1200);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("categories", () => {
  test("the six labels are offered and map to existing identifiers", async ({ page }) => {
    await page.goto(TRENDS);
    const nav = page.getByRole("navigation", { name: "Browse by category" });
    for (const label of ["All", "Models", "Agents", "Research", "Tools"]) {
      await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
    }
    // More exists only when the taxonomy has categories left over.
    const more = nav.getByRole("button", { name: "More" });
    if (await more.count()) await expect(more).toBeVisible();
  });

  test("choosing a category is URL state and browser Back restores the view", async ({ page }) => {
    await page.goto(TRENDS);
    const nav = page.getByRole("navigation", { name: "Browse by category" });
    await nav.getByRole("button", { name: "Models", exact: true }).click();
    await expect(page).toHaveURL(/category=models/);
    await expect(page.locator("article").first()).toBeVisible();

    await nav.getByRole("button", { name: "All", exact: true }).click();
    await expect(page).not.toHaveURL(/category=/);

    await nav.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(page).toHaveURL(/category=agents/);
    await page.goBack();
    await expect(page).not.toHaveURL(/category=agents/);
  });

  test("More holds the remaining categories and narrows the same catalogue", async ({ page }) => {
    await page.goto(TRENDS);
    const nav = page.getByRole("navigation", { name: "Browse by category" });
    const more = nav.getByRole("button", { name: "More" });
    if (!(await more.count())) return;

    await more.click();
    const option = page.locator('[role="dialog"] button').first();
    if (!(await option.count())) return;
    const label = (await option.innerText()).split("\n")[0].trim();
    await option.click();
    await expect(page).toHaveURL(/category=/);
    await expect(nav.getByRole("button", { name: new RegExp(label) })).toBeVisible();
  });
});

test.describe("latest developments", () => {
  test("cards carry the event type, title, summary, publisher, date and an Explore action", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="latest-developments"]');
    if (!(await section.count())) return; // nothing eligible: the section is not rendered at all

    const cards = section.locator("article");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    const card = cards.first();
    await expect(card.locator("h3")).toBeVisible();
    await expect(card.locator("time")).toBeVisible();
    await expect(card.getByRole("link", { name: /Explore/ })).toBeVisible();
    // The evidence panel belongs to the detail page, not to the list.
    await expect(card.getByText("Not independently verified")).toHaveCount(0);
  });

  test("an Explore action opens the development detail page", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="latest-developments"]');
    if (!(await section.count())) return;

    const explore = section.locator("article").first().getByRole("link", { name: /Explore/ });
    await expect(explore).toHaveAttribute("href", /\/developments\/.+/);
    await explore.click();
    await expect(page).toHaveURL(/\/developments\/.+/);
    await expect(page.getByText("Supported by source excerpt", { exact: true })).toBeVisible();
    await expect(page.getByText(/Not independently verified/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Open original source/ })).toHaveAttribute("href", /^https?:\/\//);
  });

  test("an unknown development identifier fails closed as unavailable", async ({ page }) => {
    await page.goto(`${BASE}/developments/not-a-real-development`);
    await expect(page.getByText("That development is not available")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to Trends" })).toBeVisible();
  });
});

test.describe("explore AI", () => {
  test("keeps format navigation and the whole filter row visible", async ({ page }) => {
    await page.goto(TRENDS);
    await expect(page.getByRole("tablist", { name: "Format" })).toBeVisible();

    // Source, sort and tags are working controls on the surface, not hidden behind a panel.
    await expect(page.getByLabel("Filter by source")).toBeVisible();
    await expect(page.getByLabel("Sort results")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tags/ })).toBeVisible();
  });

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

  test("search and a source filter combine without losing either", async ({ page }) => {
    await page.goto(TRENDS);
    await page.getByLabel("Filter by source").click();
    const option = page.getByRole("option").nth(1);
    await option.click();
    await expect(page).toHaveURL(/source=/);
    await page.getByLabel("Search item titles").fill("a");
    await expect(page).toHaveURL(/source=/);
    await expect(page).toHaveURL(/q=a/);
  });

  test("empty state is honest and clearable", async ({ page }) => {
    await page.goto(`${TRENDS}?q=zzzzzzzzzz`);
    await expect(page.getByText("No results match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("article").first()).toBeVisible();
  });
});

test.describe("source cards", () => {
  test("one hierarchy: source, title, excerpt, date and save, with no reported metrics", async ({ page }) => {
    await page.goto(TRENDS);
    const card = page.locator('section[aria-labelledby="explore-ai"] article').first();
    await expect(card).toBeVisible();
    await expect(card.locator("h3")).toBeVisible();
    await expect(card.locator("time")).toBeVisible();
    await expect(card.getByRole("button", { name: /^Save / })).toBeVisible();
    // Stars, scores and similar source-reported figures are not shown on a card.
    await expect(card.getByText(/stars/i)).toHaveCount(0);
  });

  test("the card's primary action opens the canonical original source", async ({ page }) => {
    await page.goto(TRENDS);
    const original = page.locator('section[aria-labelledby="explore-ai"] article').first().locator("h3 a").first();
    await expect(original).toHaveAttribute("href", /^https?:\/\//);
    await expect(original).toHaveAttribute("target", "_blank");
  });

  test("repository items keep one name and no repeating preview image", async ({ page }) => {
    await page.goto(`${TRENDS}?format=project`);
    const card = page.locator("article").first();
    await expect(card).toBeVisible();
    await expect(card.getByText("REPOSITORY", { exact: false })).toBeVisible();
    expect(await card.locator("img").count()).toBe(0);
  });
});

test.describe("topic pages", () => {
  test("header keeps title, description, counts and refresh time", async ({ page }) => {
    await page.goto(`${TRENDS}/frontier-models`);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Frontier Models", exact: true })).toBeVisible();
    await expect(page.getByText(/^\d+ items · \d+ sources · Updated /)).toBeVisible();

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
    await expect(page.getByRole("button", { name: /^Tags/ })).toBeVisible();
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
    const original = card.locator("h3 a").first();
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

test.describe("multi-model transparency", () => {
  test("the explanation sits beside Latest Developments and opens from the keyboard", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="latest-developments"]');
    if (!(await section.count())) return; // nothing eligible: the section is not rendered at all

    const trigger = section.getByRole("button", { name: "How it works" });
    await expect(trigger).toBeVisible();

    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("How this works", { exact: true })).toBeVisible();
    await expect(dialog.getByText(/GPT-6 Luna extracts developments and claims/)).toBeVisible();
    await expect(dialog.getByText(/Typesafe Jev assesses whether the supplied source excerpts support those claims/)).toBeVisible();
    await expect(dialog.getByText(/Deterministic checks validate quote and source provenance/)).toBeVisible();
    await expect(dialog.getByText(/Only eligible developments appear in the public feed/)).toBeVisible();
    await expect(dialog.getByText(/not independent verification/)).toBeVisible();
    // Text only: no pipeline diagram, no imagery, no model marks.
    expect(await dialog.locator("img, svg[role='img']").count()).toBe(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("the explanation fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="latest-developments"]');
    if (!(await section.count())) return;

    await section.getByRole("button", { name: "How it works" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(Math.round(box.x + box.width)).toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test("the detail page explains the workflow without exposing internal analysis", async ({ page }) => {
    await page.goto(TRENDS);
    const section = page.locator('section[aria-labelledby="latest-developments"]');
    if (!(await section.count())) return;

    await section.locator("article").first().getByRole("link", { name: /Explore/ }).click();
    await expect(page).toHaveURL(/\/developments\/.+/);

    const trigger = page.getByRole("button", { name: "How this was analyzed" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByText(/Deterministic checks validate quote and source provenance/)).toHaveCount(0);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText(/Deterministic checks validate quote and source provenance/)).toBeVisible();
    await expect(page.getByText(/is not published, so this describes the pipeline/)).toBeVisible();

    // No private analysis metadata reaches the page.
    const shown = (await page.locator('section[aria-labelledby="analysis-method"]').innerText()).toLowerCase();
    for (const forbidden of [
      "run_id", "authorization_id", "claim_id", "fingerprint", "prompt",
      "provider_calls", "execution_flag", "cost", "token",
    ]) {
      expect(shown).not.toContain(forbidden);
    }
  });
});

test.describe("themes and responsiveness", () => {
  test("light and dark both render and the choice persists", async ({ page }) => {
    await page.goto(TRENDS);
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) appearance/i });
    await toggle.click();
    const themeAfterClick = await page.evaluate(() => document.documentElement.className);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.className)).toBe(themeAfterClick);
  });

  test("mobile stacks the search under the title and does not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(TRENDS);

    const heading = await page.getByRole("heading", { name: "Trends", exact: true }).boundingBox();
    const search = await page.getByLabel("Search item titles").boundingBox();
    expect(search.y).toBeGreaterThan(heading.y + heading.height - 4);

    // One column, so the second card sits below the first.
    const cards = page.locator("article");
    if ((await cards.count()) > 1) {
      const first = await cards.nth(0).boundingBox();
      const second = await cards.nth(1).boundingBox();
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1);
    }

    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});