import { expect, test } from "@playwright/test";
import { creds, login } from "./helpers";

// Needs a real Supabase project with at least one published movie that has an episode.
// E2E_MOVIE_SLUG = slug of that movie.
const slug = process.env.E2E_MOVIE_SLUG;

test.describe("xem phim", () => {
  test.skip(!creds.user.email || !slug, "cần E2E_USER_*, E2E_MOVIE_SLUG");

  test.beforeEach(async ({ page }) => {
    await login(page, creds.user);
  });

  test("xem trang chủ", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Trang chủ" }).first()).toBeVisible();
    await expect(page.getByTestId("movie-card").first()).toBeVisible();
  });

  test("mở phim và vào trang watch có video", async ({ page }) => {
    await page.goto(`/movie/${slug}`);
    await page.getByTestId("watch-button").click();
    await expect(page).toHaveURL(/\/watch\//);
    const video = page.getByTestId("video");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute("src", /\/api\/stream\/[0-9a-f-]{36}$/);
  });

  test("bật/tắt yêu thích không reload trang", async ({ page }) => {
    await page.goto(`/movie/${slug}`);
    const btn = page.getByTestId("favorite-button");
    const before = await btn.getAttribute("aria-pressed");
    await btn.click();
    await expect(btn).not.toHaveAttribute("aria-pressed", before!);
    await page.goto("/favorites");
    await page.goto(`/movie/${slug}`);
    await page.getByTestId("favorite-button").click(); // restore
  });
});
