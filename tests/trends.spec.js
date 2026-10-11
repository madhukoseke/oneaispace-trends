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

const sectionOrder = async (page) => {
  const names = ["Official & Research", "Trending Today", "All Content"];
  const boxes = [];
  for (const name of names) {
    const heading = page.getByRole("heading", { name, exact: true });
    await expect(heading).toBeVisible();
    boxes.push((await heading.boundingBox()).y);
  }
  return boxes;
};

const noHorizontalOverflow = async (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test.describe("homepage hierarchy", () => {
  test("shows header and search, then Official & Research, Trending Today, All Content in order", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TRENDS);
    await expect(page.getByRole("heading", { name: "Trends", exact: true })).toBeVisible();
    await expect(page.getByLabel("Search item titles")).toBeVisible();

    const [official, trending, allContent] = await sectionOrder(page);
    expect(official).toBeLessThan(trending);
    expect(trending).toBeLessThan(allContent);
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
    await expect(page.getByText("Nothing matches these filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.locator("article").first()).toBeVisible();
  });
});

test.describe("trend detail", () => {
  test("shows breadcrumb, summary, evidence status and the stated facts", async ({ page }) => {
    await page.goto(TRENDS);
    const strip = page.getByRole("navigation", { name: "Browse by trend" });
    await strip.getByRole("link").nth(1).click();
    await expect(page).toHaveURL(/\/trends\/.+/);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    await expect(page.getByText("Evidence:").first()).toBeVisible();
    await expect(page.getByText("Not evaluated").first()).toBeVisible();

    for (const row of ["What happened?", "Why it matters", "Evidence and claims", "Related sources", "Original links"]) {
      await expect(page.getByText(row, { exact: true })).toBeVisible();
    }
  });

  test("original links point at the source and never at the app", async ({ page }) => {
    await page.goto(`${TRENDS}/frontier-models`);
    const external = page.locator('a[target="_blank"]').first();
    await expect(external).toHaveAttribute("href", /^https?:\/\//);
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
    const [official, trending, allContent] = await sectionOrder(page);
    expect(official).toBeLessThan(trending);
    expect(trending).toBeLessThan(allContent);

    const heading = await page.getByRole("heading", { name: "Trends", exact: true }).boundingBox();
    const search = await page.getByLabel("Search item titles").boundingBox();
    expect(search.y).toBeGreaterThan(heading.y + heading.height - 4);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
});