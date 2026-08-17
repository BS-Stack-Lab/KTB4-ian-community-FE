import { expect, test } from "./fixtures.js";

test("실제 Backend에서 피드를 생성하고 새로고침 후 다시 조회한다", async ({
  page,
}) => {
  const suffix = `${Date.now()}`.slice(-9);
  const nickname = `작성${suffix.slice(-4)}`;
  const content = `실제 Backend 피드 ${suffix}`;
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/signup");
  await page.getByLabel("이메일").fill(`feed-${suffix}@example.com`);
  await page.getByLabel("비밀번호", { exact: true }).fill("Signup123!");
  await page.getByLabel("비밀번호 확인").fill("Signup123!");
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);

  await page.getByRole("button", { name: "피드 게시하기" }).click();
  await page.getByLabel("피드 본문").fill(content);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v2/posts/me/async-media" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "피드 게시", exact: true }).click();
  expect((await responsePromise).status()).toBe(202);
  await expect(page.getByText(content)).toBeVisible();

  await page.reload();
  await expect(page.getByText(content)).toBeVisible();
  const createdCard = page.locator(".post-card").filter({ hasText: content });
  expect(
    await createdCard
      .locator(".post-card__content")
      .evaluate((element) => getComputedStyle(element).userSelect),
  ).not.toBe("none");
  await createdCard.getByText(content, { exact: true }).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);
  expect(consoleErrors).toEqual([]);
});
