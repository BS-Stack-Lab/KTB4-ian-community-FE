# 마이페이지·팔로우 API 명세

## 1. 기준과 호환 원칙

이 명세는 현재 Backend의 다음 규칙을 유지한다.

- 인증: HttpOnly Access/Refresh Token Cookie
- CSRF: Spring SPA CSRF Cookie와 `X-XSRF-TOKEN` Header
- 신규 조회 API: `/api/v2`
- 목록: 0부터 시작하는 `Slice`, 기본·최대 `size=10`
- 게시글 응답: 기존 `PostV2Response`
- 프로필 이미지: 기존 Media V2 응답과 legacy URL fallback
- 오류: `ApiResponse<Void>`의 `code`, `message`, `data`

Frontend `httpClient`는 `{ code, message, data }` 응답의 `data`를 반환한다.
따라서 API client 함수와 normalize 함수에는 아래 envelope 안쪽 값이 전달된다.

## 2. 공통 규칙

### 요청

- Base URL: 기존 `apiBaseUrl()`
- Content-Type: body가 있는 요청은 `application/json`
- 인증이 필요한 모든 요청은 `credentials: include`
- `POST`, `DELETE`는 기존 `httpClient`가 CSRF Cookie를 확보한 뒤 Header를
  추가한다.
- `{userId}`는 1 이상의 `Long`이다.
- `page`는 0 이상, `size`는 1~10이다.

### 성공 envelope

```json
{
  "code": "USER_PROFILE_FOUND",
  "message": "사용자 프로필을 조회했습니다.",
  "data": {}
}
```

### 실패 envelope

```json
{
  "code": "USER_NOT_FOUND",
  "message": "사용자를 찾을 수 없습니다.",
  "data": null
}
```

### ProfileType

| 값                    | 판정                                         | Frontend Header           |
| --------------------- | -------------------------------------------- | ------------------------- |
| `SELF`                | 인증 사용자 ID와 대상 사용자 ID가 같음       | Self, 관계 변경 버튼 없음 |
| `OTHER_FOLLOWING`     | 다른 사용자이며 `user_follows` 관계가 존재함 | Other / Following         |
| `OTHER_NOT_FOLLOWING` | 다른 사용자이며 관계가 없음                  | Other / NotFollowing      |

`profileType`은 count projection이 아니라 authoritative `user_follows`를
조회해 계산한다.

## 3. DTO

### UserProfileResponse

```json
{
  "userId": 24,
  "nickname": "dlkfjls",
  "profileMedia": null,
  "legacyProfileImageUrl": "/images/profile-default.svg",
  "followerCount": 23000,
  "followingCount": 24,
  "profileType": "OTHER_NOT_FOLLOWING",
  "countUpdatedAt": "2026-08-16T14:20:31.123456"
}
```

| 필드                    | 타입              | Nullable | 설명                             |
| ----------------------- | ----------------- | -------- | -------------------------------- |
| `userId`                | number            | 아니요   | 프로필 대상 사용자 ID            |
| `nickname`              | string            | 아니요   | 현재 `users.nickname`, 최대 10자 |
| `profileMedia`          | `MediaResponse`   | 예       | 기존 Media V2 프로필 이미지      |
| `legacyProfileImageUrl` | string            | 예       | Media V2가 없을 때만 제공        |
| `followerCount`         | number            | 아니요   | 비동기 projection의 팔로워 수    |
| `followingCount`        | number            | 아니요   | 비동기 projection의 팔로잉 수    |
| `profileType`           | `ProfileType`     | 아니요   | 인증 사용자 기준 Header 상태     |
| `countUpdatedAt`        | ISO 8601 datetime | 예       | projection 마지막 갱신 시각      |

`profileMedia`가 존재하면 `legacyProfileImageUrl`은 `null`이다. projection 행이
아직 없으면 두 count는 0, `countUpdatedAt`은 `null`로 반환한다. 배포 migration은
활성 사용자 projection을 먼저 backfill해 정상 운영에서 이 상태를 최소화한다.

### FollowStatusResponse

```json
{
  "targetUserId": 24,
  "profileType": "OTHER_FOLLOWING"
}
```

카운트는 비동기 갱신되므로 관계 변경 응답에 포함하지 않는다. Frontend는
카운트를 낙관적으로 표시하고 프로필 조회로 재검증한다.

### PostV2Response

사용자별 피드는 현재 `/api/v2/posts`와 같은 DTO를 그대로 사용한다.

```json
{
  "postId": 31,
  "content": "프로필 피드 본문",
  "author": {
    "userId": 24,
    "nickname": "dlkfjls",
    "profileMedia": null,
    "legacyProfileImageUrl": "/images/profile-default.svg"
  },
  "media": [],
  "legacyImageUrl": null,
  "likeCount": 12,
  "commentCount": 3,
  "viewCount": 42,
  "createdAt": "2026-08-16T14:20:31.123456",
  "updatedAt": "2026-08-16T14:20:31.123456",
  "liked": false,
  "bookmarked": true,
  "comments": []
}
```

`liked`와 `bookmarked`는 프로필 대상이 아니라 인증 사용자를 기준으로 한다.

## 4. Endpoint 요약

| Method   | Path                                  | 설명                          | 인증 | CSRF   |
| -------- | ------------------------------------- | ----------------------------- | ---- | ------ |
| `GET`    | `/api/v2/users/{userId}/profile`      | 공개 프로필 요약과 관계 상태  | 필요 | 불필요 |
| `GET`    | `/api/v2/users/{userId}/posts`        | 대상 사용자의 피드 Slice      | 필요 | 불필요 |
| `POST`   | `/api/v2/users/{userId}/followers/me` | 인증 사용자가 대상을 팔로우   | 필요 | 필요   |
| `DELETE` | `/api/v2/users/{userId}/followers/me` | 인증 사용자가 대상을 언팔로우 | 필요 | 필요   |

팔로워·팔로잉 목록 endpoint는 이번 범위에 포함하지 않는다.

## 5. 프로필 조회

```http
GET /api/v2/users/24/profile
```

### 성공

- Status: `200 OK`
- Code: `USER_PROFILE_FOUND`
- Data: `UserProfileResponse`

```json
{
  "code": "USER_PROFILE_FOUND",
  "message": "사용자 프로필을 조회했습니다.",
  "data": {
    "userId": 24,
    "nickname": "dlkfjls",
    "profileMedia": null,
    "legacyProfileImageUrl": "/images/profile-default.svg",
    "followerCount": 23000,
    "followingCount": 24,
    "profileType": "OTHER_FOLLOWING",
    "countUpdatedAt": "2026-08-16T14:20:31.123456"
  }
}
```

### 처리 규칙

1. 인증 사용자와 대상 사용자가 존재하고 탈퇴하지 않았는지 확인한다.
2. 같은 ID면 `SELF`를 반환하고 관계 조회를 생략한다.
3. 다른 ID면 `user_follows` 존재 여부로 Other 상태를 정한다.
4. count projection을 left join하고 없는 값은 0으로 처리한다.
5. email과 계정 변경 시각은 반환하지 않는다.

## 6. 사용자별 피드 조회

```http
GET /api/v2/users/24/posts?page=0&size=10
```

### 성공

- Status: `200 OK`
- Code: 다음 Slice가 있으면 기존 `POST_LIST_FOUND`, 마지막이면 기존
  `NO_MORE_POSTS`
- Data: 기존 `SliceResponse<PostV2Response>`

```json
{
  "code": "NO_MORE_POSTS",
  "message": "더 이상 조회할 피드가 없습니다.",
  "data": {
    "content": [],
    "page": 0,
    "size": 10,
    "hasNext": false,
    "message": "더 이상 조회할 피드가 없습니다."
  }
}
```

### 처리 규칙

- 대상 사용자가 없으면 `USER_NOT_FOUND`, 탈퇴했으면
  `USER_ALREADY_DELETED`를 반환한다.
- `post_deleted=false`만 반환한다.
- 정렬은 `createdAt DESC, postId DESC`다.
- `size + 1` 조회로 `hasNext`를 계산하며 total count는 계산하지 않는다.
- 기존 `PostControllerV2`의 Media, like, bookmark mapping을 재사용한다.
- 목록에서는 기존 동작대로 `comments=[]`를 반환한다.

## 7. 팔로우

```http
POST /api/v2/users/24/followers/me
X-XSRF-TOKEN: {cookie value}
```

Body는 없다.

### 성공

| 조건             | Status        | Code                | 응답 `profileType` |
| ---------------- | ------------- | ------------------- | ------------------ |
| 관계를 새로 생성 | `201 Created` | `FOLLOW_CREATED`    | `OTHER_FOLLOWING`  |
| 이미 팔로우 중   | `200 OK`      | `ALREADY_FOLLOWING` | `OTHER_FOLLOWING`  |

```json
{
  "code": "FOLLOW_CREATED",
  "message": "사용자를 팔로우했습니다.",
  "data": {
    "targetUserId": 24,
    "profileType": "OTHER_FOLLOWING"
  }
}
```

### 처리 규칙

- 관계 insert와 count outbox insert를 같은 transaction에 저장한다.
- 이미 존재하는 관계에는 새 outbox 이벤트를 만들지 않는다.
- 동시 insert의 UNIQUE 충돌은 관계를 재조회하고 `ALREADY_FOLLOWING`으로
  변환한다.
- 응답 시점에 count projection 갱신 완료를 기다리지 않는다.

## 8. 언팔로우

```http
DELETE /api/v2/users/24/followers/me
X-XSRF-TOKEN: {cookie value}
```

### 성공

| 조건           | Status   | Code             | 응답 `profileType`    |
| -------------- | -------- | ---------------- | --------------------- |
| 관계를 삭제    | `200 OK` | `FOLLOW_DELETED` | `OTHER_NOT_FOLLOWING` |
| 이미 관계 없음 | `200 OK` | `NOT_FOLLOWING`  | `OTHER_NOT_FOLLOWING` |

```json
{
  "code": "FOLLOW_DELETED",
  "message": "사용자 팔로우를 취소했습니다.",
  "data": {
    "targetUserId": 24,
    "profileType": "OTHER_NOT_FOLLOWING"
  }
}
```

관계가 실제로 삭제된 경우에만 count outbox 이벤트를 만든다. 이미 관계가 없는
요청은 멱등 성공이며 이벤트를 만들지 않는다.

## 9. 오류

| HTTP  | Code                      | 현재/추가 | 조건                                         |
| ----- | ------------------------- | --------- | -------------------------------------------- |
| `400` | `INVALID_REQUEST`         | 현재      | 잘못된 path/query 값                         |
| `401` | `UNAUTHORIZED`            | 현재      | 인증 정보 없음                               |
| `401` | `EXPIRED_ACCESS_TOKEN`    | 현재      | Access Token 만료, `httpClient` refresh 대상 |
| `403` | `FORBIDDEN`               | 현재      | 권한 없는 요청                               |
| `404` | `USER_NOT_FOUND`          | 현재      | 대상 사용자 없음                             |
| `409` | `USER_ALREADY_DELETED`    | 현재      | 대상 사용자가 soft delete됨                  |
| `409` | `SELF_FOLLOW_NOT_ALLOWED` | 추가      | UI를 우회해 본인을 대상으로 관계 변경 요청   |
| `429` | `TOO_MANY_REQUESTS`       | 현재      | 관계 변경 rate limit 초과                    |
| `500` | `INTERNAL_SERVER_ERROR`   | 현재      | 처리하지 못한 서버 오류                      |

Frontend `errorMessages.js`에는 `USER_ALREADY_DELETED`와
`SELF_FOLLOW_NOT_ALLOWED` 사용자 메시지를 추가한다. Self 화면의 정상 동작에서는
`SELF_FOLLOW_NOT_ALLOWED`가 발생하지 않는다.

## 10. 카운트 일관성 계약

- 관계 mutation의 성공 응답은 관계 상태에 대해 강한 정합성을 가진다.
- `followerCount`와 `followingCount`는 비동기 projection이므로 잠시 이전 값일
  수 있다.
- projection은 관계 변경 outbox를 기반으로 사용자 ID별 절대 COUNT를 다시
  계산한다.
- 동일 이벤트가 재처리되어도 증감이 아니라 절대값 upsert이므로 결과가
  중복되지 않는다.
- `countUpdatedAt`은 클라이언트 재검증과 운영 지연 관찰에 사용한다.
- 주기적 reconciliation이 authoritative relation과 projection 차이를 보정한다.

## 11. Frontend API 연결

```js
userApi.profile(userId, { signal });
userApi.follow(userId);
userApi.unfollow(userId);
postApi.byUser(userId, { page, size, signal });
```

- 모든 함수는 기존 `httpClient`를 사용한다.
- query는 `URLSearchParams` 또는 현재 list 함수와 동일한 안전한 숫자 조합으로
  만든다.
- ProfilePage는 API envelope를 다시 벗기지 않는다. `httpClient`가 반환한
  `data`를 바로 normalize한다.
- Route가 바뀌면 이전 profile/posts 요청의 `AbortController`를 취소한다.
