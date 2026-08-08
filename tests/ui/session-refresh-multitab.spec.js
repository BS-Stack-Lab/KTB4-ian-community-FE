import { expect, test } from "@playwright/test";

const cors = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

test("동시에 만료 임박한 두 탭은 Web Lock으로 Refresh를 한 번만 호출한다", async ({
  context,
}) => {
  const initialExpiry = new Date(Date.now() + 65_000).toISOString();
  let refreshCount = 0;
  let refreshedExpiry = null;

  await context.addInitScript((expiresAt) => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "동시탭사용자" }),
    );
    localStorage.setItem("community.accessTokenExpiresAt", expiresAt);
  }, initialExpiry);

  await context.route("http://127.0.0.1:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        status: 200,
        headers: { ...cors, "Set-Cookie": "XSRF-TOKEN=test; Path=/" },
      });
    if (url.pathname === "/api/users/refresh") {
      refreshCount += 1;
      refreshedExpiry = new Date(Date.now() + 600_000).toISOString();
      return route.fulfill({
        status: 200,
        headers: cors,
        json: { accessTokenExpiresAt: refreshedExpiry },
      });
    }
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        headers: cors,
        json: {
          userId: 7,
          email: "tabs@example.com",
          nickname: "동시탭사용자",
          profileImage: null,
        },
      });
    if (url.pathname === "/api/v2/posts")
      return route.fulfill({
        headers: cors,
        json: { data: { content: [] } },
      });
    if (url.pathname === "/images/profile-default.svg")
      return route.fulfill({
        status: 200,
        headers: cors,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
      });
    return route.fulfill({ status: 204, headers: cors });
  });

  const firstPage = await context.newPage();
  const secondPage = await context.newPage();
  await Promise.all([firstPage.goto("/feed"), secondPage.goto("/feed")]);
  await Promise.all([
    firstPage.locator(".lnb").waitFor(),
    secondPage.locator(".lnb").waitFor(),
  ]);

  await expect.poll(() => refreshCount, { timeout: 10_000 }).toBe(1);
  await expect
    .poll(() =>
      secondPage.evaluate(() =>
        localStorage.getItem("community.accessTokenExpiresAt"),
      ),
    )
    .toBe(refreshedExpiry);
  await expect(firstPage).toHaveURL(/\/feed$/);
  await expect(secondPage).toHaveURL(/\/feed$/);
});
