import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { normalizedRgbSimilarity } from "./helpers/png-similarity.js";

const brickPath = fileURLToPath(
  new URL("./fixtures/figma/raw-image-3.png", import.meta.url),
);
const selfBaseline = fileURLToPath(
  new URL("./baselines/figma/mypage-self.png", import.meta.url),
);
const otherBaseline = fileURLToPath(
  new URL("./baselines/figma/mypage-other-not-following.png", import.meta.url),
);
const selfActual = fileURLToPath(
  new URL("../visual/after/mypage-self.png", import.meta.url),
);
const otherActual = fileURLToPath(
  new URL("../visual/after/mypage-other-not-following.png", import.meta.url),
);
const VISUAL_THRESHOLD = 0.95;
const VISUAL_REGION = { x: 480, y: 20, width: 740, height: 1060 };

const cors = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:4173",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Headers": "Content-Type, X-XSRF-TOKEN",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const content =
  "분위기 좋은 다로베에서 화덕피자 먹고, 도보 5분 거리 재즈바 '포지티브 제로'로 이동하세요. 조명이 예뻐서 서로 더 예뻐 보이는 마법의 코스입니다. (예약 필수!)";

async function prepare(page) {
  const state = { following: false, followCalls: [] };
  await page.addInitScript(() => {
    sessionStorage.setItem("userId", "7");
    sessionStorage.setItem(
      "community.user",
      JSON.stringify({ userId: 7, nickname: "dlkfjls" }),
    );
  });
  await page.route("http://127.0.0.1:8080/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === "OPTIONS")
      return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === "/api/csrf")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "Set-Cookie": "XSRF-TOKEN=mypage-test; Path=/; SameSite=Lax",
        },
      });
    if (url.pathname === "/api/users/me")
      return route.fulfill({
        json: {
          data: {
            user_id: 7,
            email: "pulse@example.com",
            nickname: "dlkfjls",
            profile_image: "/images/profile-default.svg",
          },
        },
        headers: cors,
      });
    const profileMatch = url.pathname.match(
      /^\/api\/v2\/users\/(7|24)\/profile$/,
    );
    if (profileMatch) {
      const self = profileMatch[1] === "7";
      return route.fulfill({
        json: {
          code: "USER_PROFILE_FOUND",
          data: {
            userId: self ? 7 : 24,
            nickname: "dlkfjls",
            legacyProfileImageUrl: "/images/profile-default.svg",
            followerCount: 23000 + (!self && state.following ? 1 : 0),
            followingCount: 24,
            profileType: self
              ? "SELF"
              : state.following
                ? "OTHER_FOLLOWING"
                : "OTHER_NOT_FOLLOWING",
          },
        },
        headers: cors,
      });
    }
    const postsMatch = url.pathname.match(/^\/api\/v2\/users\/(7|24)\/posts$/);
    if (postsMatch) {
      const authorId = Number(postsMatch[1]);
      return route.fulfill({
        json: {
          data: {
            content: [
              {
                postId: 31,
                content,
                legacyImageUrl: "/images/figma-brick.jpeg",
                author: {
                  userId: authorId,
                  nickname: "dlkfjls",
                  legacyProfileImageUrl: "/images/profile-default.svg",
                },
                viewCount: 342,
                likeCount: 12000,
                commentCount: 1240,
                createdAt: new Date(Date.now() - 86_400_000).toISOString(),
                liked: false,
                bookmarked: false,
              },
            ],
            page: 0,
            size: 10,
            hasNext: false,
          },
        },
        headers: cors,
      });
    }
    if (
      url.pathname === "/api/v2/users/24/followers/me" &&
      ["POST", "DELETE"].includes(method)
    ) {
      state.following = method === "POST";
      state.followCalls.push(method);
      return route.fulfill({
        status: method === "POST" ? 201 : 200,
        json: {
          data: {
            targetUserId: 24,
            profileType: state.following
              ? "OTHER_FOLLOWING"
              : "OTHER_NOT_FOLLOWING",
          },
        },
        headers: cors,
      });
    }
    if (url.pathname === "/images/figma-brick.jpeg")
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        path: brickPath,
        headers: cors,
      });
    if (url.pathname === "/images/profile-default.svg")
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><circle cx="27" cy="27" r="26.25" fill="white" stroke="#e5e5e5" stroke-width="1.5"/><circle cx="27" cy="20" r="7" fill="#a1a1a1"/><path d="M14 42v-4c0-8 5-12 13-12s13 4 13 12v4" fill="#a1a1a1"/></svg>',
        headers: cors,
      });
    return route.fulfill({ status: 204, headers: cors });
  });
  return state;
}

async function waitForStableProfile(page) {
  await expect(page.getByTestId("profile-page")).toBeVisible();
  await expect(page.getByText(content)).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? undefined
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
      ),
    );
  });
}

test("Self 마이페이지는 Figma와 95% 이상 일치하고 내 피드 메뉴를 제공한다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/mypage");
  await waitForStableProfile(page);
  await expect(page.getByRole("button", { name: "팔로우" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "팔로잉" })).toHaveCount(0);
  await expect(page.getByText("2.3만명")).toBeVisible();

  await page.screenshot({ path: selfActual, animations: "disabled" });
  const similarity = normalizedRgbSimilarity(
    selfActual,
    selfBaseline,
    VISUAL_REGION,
  );
  expect(
    similarity,
    `Self Figma 유사도 ${(similarity * 100).toFixed(2)}%`,
  ).toBeGreaterThanOrEqual(VISUAL_THRESHOLD);

  const options = page
    .locator(".post-card")
    .getByRole("button", { name: "피드 옵션" });
  await expect(options).toBeVisible();
  await options.click();
  await expect(page.getByRole("menuitem", { name: "수정하기" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "삭제하기" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("Other 마이페이지는 관계 상태를 전환하고 Figma와 95% 이상 일치한다", async ({
  page,
}) => {
  const state = await prepare(page);
  await page.goto("/users/24");
  await waitForStableProfile(page);
  const follow = page.getByRole("button", { name: "팔로우" });
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".post-actions__bookmark")).toBeVisible();
  await expect(
    page.locator(".post-card").getByRole("button", { name: "피드 옵션" }),
  ).toHaveCount(0);

  await page.screenshot({ path: otherActual, animations: "disabled" });
  const similarity = normalizedRgbSimilarity(
    otherActual,
    otherBaseline,
    VISUAL_REGION,
  );
  expect(
    similarity,
    `Other Figma 유사도 ${(similarity * 100).toFixed(2)}%`,
  ).toBeGreaterThanOrEqual(VISUAL_THRESHOLD);

  await follow.click();
  await expect(page.getByRole("button", { name: "팔로잉" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "팔로잉" }).click();
  await expect(page.getByRole("button", { name: "팔로우" })).toBeVisible();
  expect(state.followCalls).toEqual(["POST", "DELETE"]);
});

test("마이페이지 내 LNB와 작성자 클릭은 본인/다른 사용자 경로를 유지한다", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/mypage");
  await waitForStableProfile(page);

  await page.getByRole("button", { name: "내 프로필 보기" }).click();
  await expect(page).toHaveURL(/\/mypage$/);
  await page
    .locator(".post-card")
    .getByRole("button", { name: "dlkfjls 프로필 보기" })
    .click();
  await expect(page).toHaveURL(/\/mypage$/);

  await page.goto("/users/24");
  await waitForStableProfile(page);
  await page
    .locator(".post-card")
    .getByRole("button", { name: "dlkfjls 프로필 보기" })
    .click();
  await expect(page).toHaveURL(/\/users\/24$/);
});
