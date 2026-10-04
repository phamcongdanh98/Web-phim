import { expect, test } from "@playwright/test";
import { creds, login } from "./helpers";

test.describe("đăng nhập", () => {
  test("chưa đăng nhập bị chuyển về /login (trang và admin)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("trang login không có đăng ký và báo lỗi khi sai mật khẩu", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
    await expect(page.getByText(/đăng ký/i)).toHaveCount(0);
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Mật khẩu").fill("wrong-password");
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await expect(page.locator("form [role=alert]")).toContainText(/không đúng|quá nhiều/);
  });

  test("API từ chối khi chưa đăng nhập", async ({ request }) => {
    expect((await request.get("/api/stream/123e4567-e89b-42d3-a456-426614174000")).status()).toBe(401);
    expect((await request.put("/api/progress/123e4567-e89b-42d3-a456-426614174000", { data: { positionSeconds: 1, durationSeconds: 2 } })).status()).toBe(401);
  });

  test("user thường không vào được /admin", async ({ page }) => {
    test.skip(!creds.user.email, "cần E2E_USER_EMAIL / E2E_USER_PASSWORD");
    await login(page, creds.user);
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin/);
  });
});
