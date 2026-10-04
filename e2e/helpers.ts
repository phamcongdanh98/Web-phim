import { expect, type Page } from "@playwright/test";

export const creds = {
  admin: { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD },
  user: { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD },
};

export async function login(page: Page, who: { email?: string; password?: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email!);
  await page.getByLabel("Mật khẩu").fill(who.password!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
