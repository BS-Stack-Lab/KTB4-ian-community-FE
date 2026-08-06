# 10분마다 로그아웃되던 이유: JWT 갱신을 다중 탭과 운영 배포까지 연결하기

웹에서 서비스를 테스트하면 로그인 후 약 10분 뒤 보호 API가 실패하고 로그인 화면으로 돌아갔습니다. 처음에는 “Access Token의 유효 시간을 늘리면 되지 않을까?”라고 생각할 수 있지만, 실제 문제는 토큰의 수명이 아니라 갱신 흐름이 끝까지 연결되지 않은 데 있었습니다.

이번 작업은 만료 1분 전 Refresh를 한 번 호출하는 것으로 끝나지 않았습니다. 백엔드와 프론트엔드의 응답 계약을 맞추고, Refresh 실패를 보안 오류와 일시 오류로 나누고, 여러 탭이 같은 Refresh Token을 동시에 회전시키지 않도록 조정한 뒤 운영 환경에서 실제 응답까지 확인했습니다.

## 10분 만료보다 먼저 확인한 것은 계약이었습니다

기존 프론트엔드는 보호 요청에서 아래 조건을 만났을 때만 Refresh API를 호출했습니다.

```js
const expired =
  response.status === 401 && body?.message === "expired_access_token";

if (expired) {
  await refresh();
}
```

하지만 백엔드는 Access Token 예외를 `INVALID_ACCESS_TOKEN`으로 처리하고 `invalid_access_token` 메시지를 반환하는 경로가 있었습니다. 프론트가 기다리는 문자열은 끝내 오지 않았고, 갱신 없이 보호 요청만 실패했습니다.

Refresh 성공 계약에도 차이가 있었습니다. 문서와 일부 Mock은 `204 No Content`를 가정했지만 실제 백엔드는 다음처럼 새 Access Token의 만료 시각을 포함한 `200 OK`를 반환했습니다.

```http
HTTP/1.1 200 OK
Set-Cookie: accessToken=<rotated>; HttpOnly; ...
Set-Cookie: refreshToken=<rotated>; HttpOnly; ...
Content-Type: application/json

{
  "accessTokenExpiresAt": "2026-07-29T00:20:00Z"
}
```

이 메타데이터는 단순한 부가 정보가 아닙니다. 프론트가 다음 선제 갱신 타이머를 예약하는 기준입니다. 따라서 성공 계약을 다음 세 가지가 함께 충족되어야 하는 것으로 고정했습니다.

- 상태 코드는 `200 OK`입니다.
- 본문은 UTC ISO-8601 형식의 `accessTokenExpiresAt`을 포함합니다.
- Access Token과 Refresh Token은 회전된 HttpOnly Cookie로 전달합니다.

토큰 문자열은 JavaScript나 브라우저 저장소에 노출하지 않았습니다. 프론트가 공유하는 값은 만료 시각뿐입니다.

백엔드 통합 테스트도 상태 코드만 검사하지 않고 계약 전체를 검증하도록 보강했습니다.

```java
@Test
@DisplayName("Refresh 성공은 200과 만료 시각, 회전된 인증 쿠키를 반환한다")
void refreshSuccessReturnsMetadataAndRotatedCookies() throws Exception {
    User user = saveUser("refresh-success@example.com", "갱신사용자");
    TokenPair initial = tokenService.issueInitialTokens(user);

    MvcResult result = mockMvc.perform(
                    post("/api/users/refresh")
                            .with(csrf())
                            .cookie(refreshCookie(initial.refreshToken()))
            )
            .andExpect(status().isOk())
            .andExpect(cookie().exists("accessToken"))
            .andExpect(cookie().exists("refreshToken"))
            .andExpect(jsonPath("$.accessTokenExpiresAt").isString())
            .andReturn();

    assertThat(result.getResponse().getCookie("accessToken").getValue())
            .isNotEqualTo(initial.accessToken());
    assertThat(result.getResponse().getCookie("refreshToken").getValue())
            .isNotEqualTo(initial.refreshToken());
}
```

## 회전 전 Access Token도 즉시 무효화했습니다

Refresh Token을 한 번만 사용하도록 막아도 이전 Access Token이 만료될 때까지 유효하면 탈취된 토큰으로 계속 보호 API를 호출할 수 있습니다. 서명과 만료 시각만 검증하는 Stateless JWT의 특성상 서버는 “정상적으로 발급했지만 지금은 교체된 토큰”을 구분하지 못합니다.

각 로그인 세션을 Token Family로 묶고, 현재 활성 Access Token의 `jti`를 서버에 기록했습니다. Refresh가 성공하면 같은 Family의 활성 `jti`를 새 Access Token의 값으로 교체합니다.

```java
String newAccessToken = jwtTokenProvider.createAccessToken(
        user.getUserId(),
        user.getEmail(),
        List.of("USER"),
        familyId
);

Jwt newAccessJwt = jwtTokenProvider.decodeAccessToken(newAccessToken);

familySession.rotateAccessToken(
        jwtTokenProvider.getTokenId(newAccessJwt)
);
```

`JwtAuthenticationFilter`는 JWT의 서명과 만료 여부를 확인한 뒤 Token Family 저장소의 활성 상태도 검사합니다.

```java
Jwt jwt = jwtTokenProvider.decodeAccessToken(accessToken);
tokenService.validateAccessToken(jwt);
```

```java
public void validateAccessToken(Jwt accessJwt) {
    String familyId = jwtTokenProvider.getFamilyId(accessJwt);
    Long userId = jwtTokenProvider.getUserId(accessJwt);
    String accessTokenId = jwtTokenProvider.getTokenId(accessJwt);

    TokenFamilySession session = tokenFamilySessionRepository
            .findById(familyId)
            .orElseThrow(() -> new JwtException("Token Family가 없습니다."));

    if (!session.accepts(userId, accessTokenId)) {
        throw new JwtException("현재 활성 Access Token이 아닙니다.");
    }
}
```

이제 Rotation 이전 Access Token은 자체 만료 시각이 남아 있어도 `INVALID_ACCESS_TOKEN`으로 거부됩니다. 단, 다른 기기에서 로그인해 발급된 Token Family는 독립적으로 유지해 한 기기의 갱신이 다른 기기까지 로그아웃시키지 않도록 했습니다.

## 9분 15초는 타이머 지연이 아니라 상수의 회귀였습니다

Access Token의 수명은 10분이고 원래 목표는 만료 60초 전, 즉 발급 후 정확히 9분에 갱신하는 것이었습니다. 그런데 구현에서는 갱신 구간이 45초로 바뀌어 있었습니다.

```js
// 회귀가 발생한 값
const REFRESH_WINDOW_MS = 45_000;

// 의도한 값
const REFRESH_WINDOW_MS = 60_000;
```

그래서 관찰된 9분 15초는 브라우저 타이머가 15초 늦게 실행된 결과가 아니었습니다. 애초에 `10분 - 45초`를 예약하고 있었습니다. 상수를 60초로 복원하고 만료 시각을 기준으로 타이머를 계산했습니다.

```js
function scheduleRefreshTimer(expiresAt) {
  const delay = Math.max(
    Date.parse(expiresAt) - Date.now() - REFRESH_WINDOW_MS,
    0,
  );

  refreshTimer = setTimeout(() => {
    executeRefresh({ trigger: "timer" }).catch(() => {});
  }, delay);
}
```

백그라운드 탭에서는 브라우저가 타이머를 늦출 수 있습니다. 이를 별개의 예외로 두지 않고 탭이 다시 보이거나 다음 보호 요청이 시작될 때 만료 임박 여부를 다시 검사했습니다.

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    checkAccessTokenExpiry("visibility").catch(() => {});
  }
});

export async function httpClient(path, options = {}) {
  if (!NO_REFRESH_PATHS.has(path)) {
    await checkAccessTokenExpiry("request");
  }

  // 보호 API 호출
}
```

즉 타이머는 가장 빠른 갱신 수단이고, 탭 복귀와 보호 요청 직전 검사는 지연을 보정하는 안전망입니다.

## Refresh 실패는 HTTP 상태가 아니라 오류 코드로 분류했습니다

Refresh가 실패했다고 모든 사용자를 즉시 로그아웃시키면 일시적인 서버 장애나 네트워크 단절도 세션 만료가 됩니다. 반대로 위조·만료·재사용된 Refresh Token을 일시 오류처럼 취급하면 사용할 수 없는 세션을 계속 붙잡게 됩니다.

백엔드 오류 코드를 기준으로 세션을 계속 신뢰할 수 있는지 판단했습니다.

```js
const TERMINAL_REFRESH_CODES = new Set([
  "REFRESH_TOKEN_NOT_FOUND",
  "INVALID_REFRESH_TOKEN",
  "EXPIRED_REFRESH_TOKEN",
  "REFRESH_TOKEN_REUSED",
  "REFRESH_TOKEN_USER_MISMATCH",
  "REFRESH_TOKEN_FAMILY_MISMATCH",
  "USER_NOT_FOUND",
  "USER_ALREADY_DELETED",
]);

function isTerminalRefreshFailure(error) {
  return TERMINAL_REFRESH_CODES.has(error?.code?.trim().toUpperCase());
}
```

이 코드는 Refresh Token이나 사용자 세션을 더 이상 신뢰할 수 없다는 뜻이므로 인증 정보를 지우고 모든 탭에 세션 종료를 알립니다. 반면 `FORBIDDEN`, `INTERNAL_SERVER_ERROR`, 알 수 없는 코드와 네트워크 오류는 현재 보호 요청만 중단하고 세션은 유지합니다. `AbortError` 역시 요청 취소일 뿐 인증 실패가 아니므로 세션 상태를 바꾸지 않습니다.

```js
try {
  return await performRefreshRequest();
} catch (error) {
  if (isTerminalRefreshFailure(error)) {
    handleSessionFailure();
  } else if (!isAbortError(error) && !isDeferredRetry(error)) {
    recordTransientFailure(trigger, sharedExpiry);
  }

  throw error;
}
```

일시 오류는 10초 뒤 한 번만 자동 재시도합니다. 두 번째 시도도 실패하면 타이머를 반복해서 만들지 않고 탭 복귀나 다음 보호 요청 같은 새로운 외부 Trigger를 기다립니다. 장애 중 Refresh 요청이 무한히 쌓이는 것을 막으면서 사용자의 로그인 상태도 성급하게 지우지 않기 위한 선택이었습니다.

## 갱신 경로를 하나로 모았습니다

선제 타이머, 탭 복귀, 보호 요청 직전 검사, 만료 응답 뒤 재시도가 각각 Refresh API를 직접 호출하면 실패 정책이 조금씩 달라집니다. 실제로 보호 요청 직전 선제 Refresh가 실패했을 때 `handleSessionFailure()`까지 도달하지 않는 예외 경로가 생길 수 있었습니다.

모든 진입점이 `executeRefresh()`를 통과하도록 정리했습니다.

```js
async function executeRefresh({ force = false, trigger = "request" } = {}) {
  if (!refreshPromise) {
    const observedExpiry = readSharedExpiry() ?? accessTokenExpiresAt;

    refreshPromise = withRefreshLock(() =>
      runRefreshInsideLock({ force, observedExpiry, trigger }),
    ).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}
```

`refreshPromise`는 같은 탭에서 동시에 시작한 요청을 하나로 합칩니다. 실제 네트워크 호출과 오류 분류는 `runRefreshInsideLock()` 안에만 두어 어느 진입점에서 실패하더라도 같은 정책을 적용합니다.

또한 이 공유 Refresh에는 개별 보호 요청의 `AbortSignal`을 전달하지 않았습니다. 한 화면의 요청 취소가 다른 요청과 탭이 함께 기다리는 Token Rotation까지 중단시키면 안 되기 때문입니다.

## `refreshPromise`만으로는 여러 탭을 막을 수 없었습니다

JavaScript 메모리는 탭마다 분리되어 있습니다. 두 탭의 Access Token이 동시에 만료 임박 상태가 되면 각 탭에 서로 다른 `refreshPromise`가 만들어집니다.

```text
탭 A ─ Refresh Token R1 ─▶ R2로 회전
탭 B ─ Refresh Token R1 ─▶ 이미 사용한 R1 재사용 감지
                              └─ Token Family 폐기 및 재로그인
```

백엔드의 재사용 탐지는 보안상 유지해야 합니다. 그래서 백엔드를 느슨하게 만드는 대신 지원 브라우저에서 Web Locks API로 동일 Origin의 Refresh 구간을 직렬화했습니다.

```js
async function withRefreshLock(callback) {
  const locks = globalThis.navigator?.locks;

  if (typeof locks?.request !== "function") {
    return callback();
  }

  return locks.request(
    "community.auth.refresh",
    { mode: "exclusive" },
    callback,
  );
}
```

Lock을 얻었다고 바로 Refresh하지 않는 것이 핵심입니다. 대기하는 동안 앞선 탭이 이미 갱신했을 수 있으므로 공유 만료 시각을 다시 읽습니다.

```js
async function runRefreshInsideLock({ observedExpiry }) {
  const sharedExpiry = readSharedExpiry() ?? accessTokenExpiresAt;

  if (sharedExpiry !== observedExpiry && !expiringSoon(sharedExpiry)) {
    applyAccessTokenExpiresAt(sharedExpiry);
    return { accessTokenExpiresAt: sharedExpiry, refreshed: false };
  }

  return performRefreshRequest();
}
```

첫 번째 탭이 갱신에 성공하면 새 만료 시각을 `localStorage`에 기록하고 `BroadcastChannel`로 알립니다. 일시 실패의 재시도 시각과 세션 종료도 같은 방식으로 전파합니다.

```js
publishMessage({
  type: "refresh-succeeded",
  accessTokenExpiresAt: expiresAt,
});

publishMessage({ type: "refresh-retry", state: retryState });
publishMessage({ type: "session-expired" });
```

여기서 `localStorage`에 저장하는 것은 토큰이 아니라 다음 값뿐입니다.

- Access Token 만료 시각
- 일시 실패 재시도 상태
- 탭 사이 인증 상태 동기화를 위한 이벤트

Web Locks를 지원하지 않는 환경에서는 기존 탭 내부 `refreshPromise`로 폴백합니다. 이 경우 아주 드문 동시 갱신에서 백엔드가 재사용을 탐지해 재로그인이 발생할 수 있지만, 보안 정책을 완화하는 것보다 fail-closed 동작을 유지하는 편을 선택했습니다.

## 시간과 탭 경쟁 조건을 테스트로 고정했습니다

시간 기반 코드는 “대략 9분쯤”이라는 테스트로는 회귀를 막기 어렵습니다. Fake Timer로 8분 59초와 9분의 경계를 정확히 나눴습니다.

```js
it("발급 9분 시점인 만료 60초 전에 선제 Refresh한다", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-29T00:00:00Z"));
  setAccessTokenExpiresAt("2026-07-29T00:10:00Z");

  await vi.advanceTimersByTimeAsync(8 * 60_000 + 59_000);
  expect(fetch).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1_000);
  expect(fetch).toHaveBeenCalledTimes(1);
});
```

오류 정책은 종료 코드 전체를 매개변수 테스트로 통과시키고, 일시 오류는 9.999초까지 호출이 늘지 않다가 10초에 정확히 한 번 재시도하는지 확인했습니다. `AbortError`가 저장소와 화면 경로를 바꾸지 않는지도 별도로 검증했습니다.

다중 탭은 단위 테스트의 가짜 Lock만으로 끝내지 않고 Playwright에서 같은 Browser Context에 실제 페이지 두 개를 열었습니다.

```js
const firstPage = await context.newPage();
const secondPage = await context.newPage();

await Promise.all([firstPage.goto("/feed"), secondPage.goto("/feed")]);

await expect.poll(() => refreshCount).toBe(1);

await expect
  .poll(() =>
    secondPage.evaluate(() =>
      localStorage.getItem("community.accessTokenExpiresAt"),
    ),
  )
  .toBe(refreshedExpiry);
```

두 탭이 동시에 만료 임박 상태로 시작해도 Refresh 네트워크 호출은 한 번만 발생하고, 두 번째 탭도 새 만료 시각을 적용한다는 것을 사용자 환경과 가까운 수준에서 확인했습니다.

전체 검증에서는 백엔드 63개, 프론트 단위 140개, 통합 19개, Playwright UI 111개 테스트가 통과했고 프로덕션 빌드도 완료했습니다. 테스트 개수는 문서에 먼저 적어 둔 예상치가 아니라 전체 실행 결과를 기준으로 갱신했습니다.

## GitHub Push와 운영 배포는 같은 일이 아니었습니다

메인 브랜치에 커밋을 Push한 뒤 운영 반영 여부를 확인했지만 저장소에는 자동 배포 GitHub Actions가 없었습니다. “메인에 올렸다”와 “사용자가 새 코드를 받고 있다” 사이에 수동 배포 단계가 남아 있었습니다.

운영 서버에는 systemd 기반 배포와 Docker Compose 관련 파일이 함께 존재했습니다. 실제 공개 트래픽은 Nginx와 systemd 백엔드를 사용하는 Method A 경로였기 때문에, 현재 서비스 경로를 먼저 확인한 뒤 프론트 정적 자산만 배포해 변경 범위를 줄였습니다. 이번 JWT 백엔드 변경은 운영 코드가 아니라 계약 통합 테스트 보강이었고, 실제 백엔드는 이미 `200 + 만료 메타데이터 + 쿠키 회전`을 제공하고 있었기 때문입니다.

배포 환경에서 SSH와 로컬 AWS CLI를 사용할 수 없어, 인증된 AWS Systems Manager 세션에서 메인 브랜치의 특정 커밋을 고정해 내려받았습니다. “최신 main” 대신 커밋 SHA를 고정하고 번들 해시와 JWT 코드 표식을 확인해 배포 대상을 명확히 했습니다.

```bash
curl -fL "https://github.com/<owner>/<repo>/archive/<commit-sha>.tar.gz" \
  -o /tmp/community-frontend.tar.gz

sha256sum dist/app.js
grep -F "community.auth.refresh" dist/app.js
grep -F "SESSION_NOT_ACTIVE" dist/app.js

sudo /opt/community/deployment/method-a/scripts/05-deploy-frontend.sh
sudo systemctl restart nginx
sudo /opt/community/deployment/method-a/scripts/verify.sh
```

배포 스크립트는 타임스탬프 Release 디렉터리를 만들고 `current` 링크를 전환하는 방식이어서 문제가 생기면 이전 Release로 돌아갈 수 있었습니다. 배포 후에는 내부 서비스 상태와 외부 응답을 모두 확인했습니다.

```bash
curl -fsS https://<production-domain>/healthz
curl -fsS https://<production-domain>/dist/app.js | sha256sum
```

운영 Refresh API도 누락된 Refresh Token에 대해 `401 / REFRESH_TOKEN_NOT_FOUND`를 반환하는지 확인했습니다. 이때 처음에는 CSRF 쿠키 문자열을 그대로 헤더에 넣어 `403`을 받았습니다. 프론트 구현처럼 쿠키 값을 URL Decode한 뒤 `X-XSRF-TOKEN` 헤더에 넣어야 기대한 인증 오류까지 도달했습니다.

```js
const csrf = decodeURIComponent(readCookie("XSRF-TOKEN"));
headers.set("X-XSRF-TOKEN", csrf);
```

이 경험은 운영 검증 코드도 실제 클라이언트의 인코딩 규칙을 따라야 한다는 점을 보여 줬습니다. 상태 코드 하나만 보고 서버 계약이 틀렸다고 결론 내리기 전에 요청이 보안 필터의 어느 단계까지 도달했는지 확인해야 합니다.

## 회고

이번 문제의 출발점은 “10분 뒤 로그아웃된다”는 단순한 현상이었지만 원인은 한 줄이 아니었습니다. 만료 오류 문자열이 맞지 않았고, 성공 응답 문서와 실제 API가 달랐으며, 45초라는 상수 회귀가 있었고, 탭 단위 Promise를 브라우저 전체 동기화로 오해할 여지도 있었습니다.

가장 크게 배운 점은 인증 갱신을 API 한 번이 아니라 상태 전이로 봐야 한다는 것입니다. 성공하면 쿠키와 만료 메타데이터를 함께 갱신하고, 보안상 종료해야 할 실패와 복구 가능한 실패를 구분하며, 같은 사용자의 여러 탭도 하나의 Token Family를 공유한다는 사실을 고려해야 합니다.

또한 구현 완료, 테스트 통과, 메인 Push, 운영 배포는 서로 다른 완료 조건이었습니다. 코드의 시간 경계와 경쟁 조건을 테스트로 고정하고, 운영 번들의 해시와 실제 API 오류 코드까지 확인한 뒤에야 “10분 뒤 로그아웃되던 문제를 해결했다”고 말할 수 있었습니다.
