# 새 글이 위에 오지 않았습니다: 피드 최신순을 결정적으로 만드는 방법

피드 응답을 React 모델로 변환한 뒤 서버가 준 순서 그대로 렌더링하면서 최신순 정렬이 사라졌습니다. 정렬 없는 데이터베이스 조회는 저장 순서를 보장하지 않으므로, 개발 환경에서 우연히 최신순처럼 보여도 운영 환경과 페이지 경계에서는 순서가 바뀔 수 있습니다.

## 정렬은 명시하지 않으면 계약이 아닙니다

문제의 핵심은 `findAllByPostDeletedFalse(Pageable)`였습니다. 메서드 이름에 정렬 조건이 없고 요청에도 `Sort`가 없으면 DB 실행 계획이 반환 순서를 결정합니다. 특히 Slice 페이지네이션에서는 중간에 새 글이 추가되거나 동일한 생성 시각을 가진 글이 있을 때 중복과 누락까지 생길 수 있습니다.

서버 조회 메서드에 최신순을 명시하고, 생성 시각이 같을 때 사용할 보조 키로 `postId`를 추가했습니다.

```java
@EntityGraph(attributePaths = "authorUser")
Slice<Post> findAllByPostDeletedFalseOrderByCreatedAtDescPostIdDesc(
        Pageable pageable
);
```

```java
public Slice<Post> getPosts(Pageable pageable) {
    return postRepository
            .findAllByPostDeletedFalseOrderByCreatedAtDescPostIdDesc(pageable);
}
```

`createdAt DESC`만으로는 같은 시각의 두 게시물 순서가 비결정적입니다. `postId DESC`를 함께 사용하면 모든 요청에서 동일한 정렬 기준을 만들 수 있습니다.

## 프론트엔드에도 방어적인 정렬을 복구했습니다

정렬의 주 책임은 페이지를 나누는 서버에 있습니다. 다만 프론트에서도 API fixture, 오래된 서버, 여러 Slice 병합 과정에서 순서가 흐트러지지 않도록 `sortPostsByLatest`를 적용했습니다.

```js
function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortPostsByLatest(posts) {
  return [...posts].sort((left, right) => {
    const createdAtDifference =
      timestamp(right.createdAt) - timestamp(left.createdAt);

    return createdAtDifference !== 0
      ? createdAtDifference
      : Number(right.postId) - Number(left.postId);
  });
}
```

초기 조회뿐 아니라 다음 Slice를 합칠 때도 같은 기준을 적용했습니다.

```js
function appendUnique(current, next) {
  const unique = new Map(current.map((post) => [post.postId, post]));
  next.forEach((post) => unique.set(post.postId, post));
  return sortPostsByLatest([...unique.values()]);
}

setPosts((current) =>
  replace ? sortPostsByLatest(next) : appendUnique(current, next),
);
```

`Map`으로 ID 중복을 먼저 제거한 뒤 정렬하기 때문에 재요청이나 Slice 경계에서 같은 게시물이 다시 들어와도 카드가 중복되지 않습니다.

## 왜 화면 정렬만으로는 부족합니까?

서버가 20개의 데이터를 무작위 순서로 두 페이지에 나눠 보낸 뒤, 브라우저가 각 페이지 결과만 정렬한다고 생각해 보겠습니다. 실제 최신 글이 2페이지에 들어가면 1페이지를 보고 있는 사용자는 그 글을 볼 수 없습니다. 전체 집합을 나누기 전에 서버가 정렬해야 페이지네이션 자체가 올바릅니다.

따라서 이번 구현은 다음처럼 책임을 나눴습니다.

```text
DB/백엔드  : 전체 결과를 createdAt DESC, postId DESC로 정렬한 뒤 Slice 생성
프론트엔드 : 받은 Slice를 병합·중복 제거하고 같은 기준으로 화면 순서 보정
```

## 테스트로 동률까지 고정했습니다

백엔드 통합 테스트에서는 일부 게시물의 `createdAt`을 같은 값으로 설정하고 첫 번째와 두 번째 응답의 `post_id` 순서를 확인했습니다.

```java
.andExpect(jsonPath("$.data.content[0].post_id")
        .value(savedPosts.get(1).getPostId()))
.andExpect(jsonPath("$.data.content[1].post_id")
        .value(savedPosts.get(0).getPostId()));
```

이 검증은 단순히 “대략 최신순”이 아니라 동률에서도 결정적인 순서가 유지된다는 계약을 남깁니다.

## 회고

정렬은 표현 계층의 사소한 가공처럼 보이지만 페이지네이션에서는 데이터 일관성의 일부입니다. 화면에서 한 번 `sort`를 호출하는 것으로 끝내지 않고, 서버 정렬·동률 기준·중복 제거·테스트를 하나로 묶어야 했습니다. 특히 정렬 조건은 기억이나 DB의 우연한 반환 순서가 아니라 저장소 메서드 이름과 테스트에 명시해야 오래 유지됩니다.
