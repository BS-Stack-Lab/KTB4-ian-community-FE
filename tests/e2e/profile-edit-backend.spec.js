import { expect, test } from "./fixtures.js";

test("실제 Backend에서 닉네임을 변경하고 새로고침 후 다시 조회한다", async ({
  page,
}) => {
  const suffix = `${Date.now()}`.slice(-9);
  const nickname = `원래${suffix.slice(-4)}`;
  const changedNickname = `변경${suffix.slice(-4)}`;
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/signup");
  await page.getByLabel("이메일").fill(`profile-${suffix}@example.com`);
  await page.getByLabel("비밀번호", { exact: true }).fill("Signup123!");
  await page.getByLabel("비밀번호 확인").fill("Signup123!");
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);

  await page.getByRole("button", { name: "프로필 편집", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "프로필 편집" });
  await dialog.getByLabel("닉네임").fill(changedNickname);
  const nicknameResponse = page.waitForResponse(
    (response) =>
      /\/api\/users\/\d+\/nickname$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "저장하기" }).click();
  expect((await nicknameResponse).status()).toBe(204);
  await expect(dialog).toBeHidden();
  await expect(page.locator(".lnb-user")).toContainText(changedNickname);
  await expect(
    page.locator(".lnb-user").getByAltText(`${changedNickname} 프로필`),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator(".lnb-user")).toContainText(changedNickname);
  await expect(
    page.locator(".lnb-user").getByAltText(`${changedNickname} 프로필`),
  ).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
