import { expect, test } from "./fixtures.js";

test("실제 Backend에서 Bookmark와 10개 Slice를 화면 전체 흐름으로 유지한다", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const suffix = `${Date.now()}`.slice(-9);
  const nickname = `북마크${suffix.slice(-4)}`;
  const contentPrefix = `북마크 ${suffix} Slice 게시글`;

  await page.goto("/signup");
  await page.getByLabel("이메일").fill(`bookmark-${suffix}@example.com`);
  await page.getByLabel("비밀번호", { exact: true }).fill("Signup123!");
  await page.getByLabel("비밀번호 확인").fill("Signup123!");
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByRole("button", { name: "회원가입", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);

  for (let index = 0; index < 11; index += 1) {
    const content = `${contentPrefix} ${index}`;
    await page.getByRole("button", { name: "피드 게시하기" }).click();
    await page.getByLabel("피드 본문").fill(content);
    const createResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v2/posts/me" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "피드 게시", exact: true }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole("dialog", { name: "피드 생성" })).toBeHidden();
    await expect(
      page.getByRole("article").filter({
        has: page.getByText(content, { exact: true }),
      }),
    ).toBeVisible();
  }

  const firstSliceResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v2/posts" &&
      url.searchParams.get("page") === "0" &&
      url.searchParams.get("size") === "10" &&
      response.request().method() === "GET"
    );
  });
  await page.reload();
  expect((await firstSliceResponse).status()).toBe(200);
  const currentPosts = page
    .getByRole("article")
    .filter({ hasText: contentPrefix });
  await expect(currentPosts).toHaveCount(10);
  await expect(currentPosts).toHaveCount(11);

  const target = page.getByRole("article").filter({
    has: page.getByText(`${contentPrefix} 10`, { exact: true }),
  });
  await target.getByRole("button", { name: "피드 옵션" }).click();
  const saveResponse = page.waitForResponse(
    (response) =>
      /\/api\/posts\/\d+\/bookmarks$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
  );
  await target.getByRole("menuitem", { name: "저장하기" }).click();
  expect((await saveResponse).status()).toBe(200);

  await page.reload();
  const restored = page.getByRole("article").filter({
    has: page.getByText(`${contentPrefix} 10`, { exact: true }),
  });
  await restored.getByRole("button", { name: "피드 옵션" }).click();
  await expect(
    restored.getByRole("menuitem", { name: "저장 취소" }),
  ).toBeVisible();
  await restored.getByRole("button", { name: "피드 옵션" }).click();

  await restored.getByText(`${contentPrefix} 10`).click();
  await expect(page).toHaveURL(/\/posts\/\d+$/);
  const detail = page.getByRole("article");
  await detail.getByRole("button", { name: "피드 옵션" }).click();
  await expect(
    detail.getByRole("menuitem", { name: "저장 취소" }),
  ).toBeVisible();

  await page.getByText("북마크", { exact: true }).click();
  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(page.getByText(`${contentPrefix} 10`)).toBeVisible();
  await page
    .getByRole("article")
    .getByRole("button", { name: "북마크" })
    .click();
  await expect(page.getByText("저장한 북마크가 없어요.")).toBeVisible();
});
