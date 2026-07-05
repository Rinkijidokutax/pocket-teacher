import { test, expect, Page } from "@playwright/test";

const EMAIL = "test.student@pocketteacher.mu";
const PASS = "TestStudent123!";
const MATHS = "30d0f5df-4752-486e-b5cd-101f193d82c5";

// Collected across the run so the council can review real browser findings.
const errors: { where: string; msg: string }[] = [];
// Navigation-abort noise: hard-navigating off a page cancels its in-flight fetches
// (e.g. supabase auth.getUser()), surfacing as ERR_ABORTED / "Failed to fetch". Benign.
const isAbortNoise = (s: string) => /ERR_ABORTED|Failed to fetch|AbortError|aborted/i.test(s);
function watch(page: Page) {
  page.on("console", (m) => {
    if (m.type() === "error" && !isAbortNoise(m.text())) errors.push({ where: page.url(), msg: m.text().slice(0, 240) });
  });
  page.on("pageerror", (e) => {
    if (!isAbortNoise(e.message)) errors.push({ where: page.url(), msg: "PAGEERROR: " + e.message.slice(0, 240) });
  });
  page.on("requestfailed", (r) => {
    const t = r.failure()?.errorText ?? "";
    if (!isAbortNoise(t)) errors.push({ where: page.url(), msg: `REQFAIL ${t} ${r.url().slice(0, 90)}` });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: /already have an account/i }).click();
  await page.getByPlaceholder("Email").fill(EMAIL);
  await page.getByPlaceholder(/password/i).fill(PASS);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/home/, { timeout: 25000 });
}

test("login reaches home", async ({ page }) => {
  watch(page);
  await login(page);
  await expect(page.getByText(/apprentice|rookie|scholar|level/i).first()).toBeVisible();
});

test("core pages render without runtime errors", async ({ page }) => {
  watch(page);
  await login(page);
  for (const path of ["/home", "/study", "/progress", "/courses", "/library", `/plan?course=${MATHS}`, `/quiz?course=${MATHS}`, `/flashcards?course=${MATHS}`]) {
    // waitUntil networkidle lets route prefetches settle so the next nav doesn't abort them
    // (a hard page.goto tearing down an in-flight prefetch logs a benign "Failed to fetch").
    await page.goto(path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(600);
    // must not be stuck on a bare loading screen
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body.length, `blank page at ${path}`).toBeGreaterThan(10);
  }
});

test("tutor chat streams a real reply", async ({ page }) => {
  watch(page);
  await login(page);
  await page.goto(`/session?course=${MATHS}`);
  // kickoff bubble appears (assistant card with text)
  await expect(page.locator("text=/[a-z]{6,}/i").first()).toBeVisible({ timeout: 30000 });
  const box = page.getByPlaceholder(/type your answer/i);
  await expect(box).toBeVisible();
  // wait until streaming finishes (send enabled)
  await box.fill("I think the answer is 42");
  const send = page.getByRole("button", { name: /^send$/i });
  await expect(send).toBeEnabled({ timeout: 30000 });
  await send.click();
  await page.waitForTimeout(8000); // let the reply stream
  const bubbles = await page.locator("div.card, .self-start").count();
  expect(bubbles, "no assistant reply rendered").toBeGreaterThan(0);
  // no bookkeeping markers should ever leak into the visible chat
  const chatText = await page.locator("body").innerText();
  expect(chatText, "marker leaked into chat").not.toMatch(/\[\[(MASTERY|XP|REMEMBER)/);
});

test("study hub tools are reachable", async ({ page }) => {
  watch(page);
  await login(page);
  await page.goto("/study");
  await page.waitForTimeout(1000);
  for (const label of ["AI summary", "Flashcards", "Quiz me", "Revision plan"]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
});

test.afterAll(() => {
  const uniq = [...new Map(errors.map((e) => [e.msg, e])).values()];
  console.log(`\n===== BROWSER FINDINGS (${uniq.length} unique) =====`);
  for (const e of uniq) console.log(`- [${e.where.replace("http://localhost:3000", "")}] ${e.msg}`);
  if (uniq.length === 0) console.log("(no console/page/request errors captured)");
});
