import { expect, test } from "@playwright/test";
import { creds, login } from "./helpers";

test.describe("admin", () => {
  test.skip(!creds.admin.email, "cần E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("admin tạo phim mới", async ({ page }) => {
    await login(page, creds.admin);
    await page.goto("/admin/movies/new");
    const title = `E2E Phim ${Date.now()}`;
    await page.getByLabel("Tên phim *").fill(title);
    await page.getByRole("button", { name: "Tạo phim" }).click();
    await expect(page).toHaveURL(/\/admin\/movies\/[0-9a-f-]{36}\/episodes/);
    await page.goto(`/admin/movies?q=${encodeURIComponent(title)}`);
    await expect(page.getByText(title)).toBeVisible();
    // cleanup: delete the movie (library only)
    await page.getByTitle("Xóa").first().click();
    await page.getByRole("button", { name: "Xóa", exact: true }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });
});
