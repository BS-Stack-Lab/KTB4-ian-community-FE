# 픽셀은 맞았지만 버튼은 죽어 있었습니다: 상호작용 중심 UI 테스트로 전환하기

기존 상세 화면 테스트는 크기, 색상, 간격, 반응형 레이아웃, 포커스처럼 눈에 보이는 값을 세밀하게 확인했습니다. 덕분에 Figma와의 차이는 잘 잡았지만, 정작 하트를 눌렀을 때 요청이 나가는지와 수정 메뉴가 모달을 여는지는 검증하지 못했습니다.

시각적 정확성과 기능적 정확성은 서로 대체할 수 없었습니다.

## 먼저 화면별 액션 인벤토리를 만들었습니다

테스트 코드를 쓰기 전에 사용자가 누를 수 있는 요소를 나열했습니다.

| 화면 | 액션 | 요청 | 성공 후 UI | 실패 후 UI |
| --- | --- | --- | --- | --- |
| 피드 | 좋아요 | `POST /likes` | 아이콘·숫자 갱신 | 이전 상태 복구 |
| 상세 | 좋아요 | `POST /likes` | 아이콘·숫자 갱신 | 이전 상태 복구 |
| 피드/상세 | 북마크 | `POST` 또는 `DELETE /bookmarks` | 저장 아이콘 전환 | 이전 상태 복구 |
| 작성자 카드 | 수정하기 | `PATCH /posts/{id}` | 본문 갱신 | 오류 표시·입력 유지 |
| 작성자 카드 | 삭제하기 | `DELETE /posts/{id}` | 목록 제거 또는 이동 | 카드 유지 |

이 표를 기준으로 “렌더링 여부 → 요청 → 서버 응답 → 화면 변화 → 실패 복구”를 하나의 시나리오로 검증했습니다.

## 네트워크와 UI를 같은 테스트에서 관찰했습니다

Playwright route에 서버 상태를 흉내 내는 작은 상태 머신을 두었습니다. 좋아요 요청이 들어오면 횟수를 기록하고 `liked`와 `likeCount`를 바꾼 뒤 응답합니다.

```js
if (url.pathname === "/api/posts/1/likes" && request.method() === "POST") {
  state.likeRequests.push({
    method: request.method(),
    csrf: request.headers()["x-xsrf-token"],
    cookie: request.headers().cookie || "",
  });

  if (state.failNextLike) {
    state.failNextLike = false;
    return route.fulfill({ status: 500 });
  }

  state.liked = !state.liked;
  state.likeCount += state.liked ? 1 : -1;

  return route.fulfill({
    json: { data: { liked: state.liked, likeCount: state.likeCount } },
  });
}
```

테스트는 아이콘만 보지 않고 단일 요청, 인증 쿠키, CSRF 헤더, 요청 중 비활성화, 서버 확정 값을 함께 확인합니다.

```js
await like.click();

await expect(like).toBeDisabled();
await expect(like).toHaveAttribute("aria-pressed", "true");
await expect(like).toHaveText("4");

expect(state.likeRequests).toHaveLength(1);
expect(state.likeRequests[0].csrf).toBe("csrf-token");
expect(state.likeRequests[0].cookie).toContain("accessToken=test-access");
```

이 검증은 “하트가 빨간색이다”보다 더 많은 계약을 보호합니다. 더블 클릭으로 요청이 중복되지 않는지, 접근성 상태가 데이터 상태와 일치하는지까지 확인할 수 있습니다.

## 실패와 재시도를 정상 흐름만큼 중요하게 다뤘습니다

낙관적 UI는 성공할 때보다 실패할 때 결함이 잘 드러납니다. 실패하도록 설정한 뒤 이전 상태로 돌아오고 버튼이 다시 활성화되는지 확인했습니다.

```js
state.failNextLike = true;
await like.click();

await expect(page.getByText("서버 오류가 발생했습니다.")).toBeVisible();
await expect(like).toHaveAttribute("aria-pressed", "true");
await expect(like).toHaveText("4");
await expect(like).toBeEnabled();

await like.click(); // 재시도
await expect(like).toHaveAttribute("aria-pressed", "false");
```

북마크에도 같은 패턴을 적용해 저장 후 새로고침해도 채워진 아이콘이 유지되는지, 삭제하면 빈 아이콘으로 돌아오는지, 실패 후 재시도가 가능한지 검증했습니다.

## 옵션 메뉴는 “열림” 이후를 테스트했습니다

메뉴의 크기와 첫 포커스만 확인하면 `수정하기`가 실제로 동작하지 않아도 테스트가 통과합니다. 따라서 클릭 이후 모달까지 이어지는지 확인했습니다.

```js
await card.getByRole("button", { name: "피드 옵션" }).click();
await page.getByRole("menuitem", { name: "수정하기" }).click();

await expect(
  page.getByRole("dialog", { name: "피드 편집" }),
).toBeVisible();
```

작성자가 아닌 경우에는 옵션 버튼 자체가 없어야 하고, 콜백이 없는 메뉴 항목도 렌더링되지 않아야 합니다. 보이는 메뉴의 모양과 노출 권한, 클릭 결과를 서로 다른 assertion으로 분리했습니다.

## 테스트 계층을 나눴습니다

모든 것을 하나의 거대한 E2E에 넣지는 않았습니다.

- UI route 테스트: 빠르게 성공·실패·롤백·접근성 상태를 검증합니다.
- 백엔드 통합 테스트: 사용자별 `liked`, 북마크 멱등성, Slice 계약을 검증합니다.
- 실제 백엔드 E2E: `PATCH`, `DELETE` 후 새로고침해도 데이터가 유지되는지 확인합니다.
- 시각 회귀 테스트: Figma 기준의 크기, 색, 간격을 계속 보호합니다.

각 계층이 다른 실패 원인을 담당하므로 테스트가 실패했을 때 문제 범위도 빠르게 좁힐 수 있습니다.

## 회고

좋은 UI 테스트는 스크린샷의 정교함만으로 완성되지 않습니다. 사용자는 픽셀이 아니라 버튼을 누르고 결과를 기다립니다. 이후부터는 화면을 검토할 때 클릭 가능한 요소를 먼저 목록화하고, 각 요소에 대해 “요청이 정확히 한 번 나가는가, 응답 후 무엇이 바뀌는가, 실패하면 복구되는가”를 기본 질문으로 삼게 되었습니다.
