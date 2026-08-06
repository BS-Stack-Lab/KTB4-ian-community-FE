# 전체 개수 대신 다음 페이지의 존재만 묻기: Slice 기반 피드와 선조회

피드는 전체 게시물 수보다 “지금 보여 줄 10개와 다음 묶음이 있는가”가 중요합니다. 기존 `Page` 조회는 매 요청마다 전체 개수를 계산할 수 있고, 프론트는 응답이 끝난 뒤에야 다음 데이터를 불러와 스크롤이 끊겼습니다. 조회 방식을 `Slice`로 바꾸고 사용자가 목록 끝에 도달하기 전에 다음 Slice를 선조회하도록 개선했습니다.

## Page에서 Slice로 변경했습니다

`Page`는 `totalElements`와 `totalPages`를 제공하기 위해 count 쿼리가 필요합니다. 현재 UI는 전체 페이지 수를 표시하지 않으므로 그 비용을 지불할 이유가 없었습니다.

```java
Slice<Post> findAllByPostDeletedFalseOrderByCreatedAtDescPostIdDesc(
    Pageable pageable
);
```

서비스와 컨트롤러도 `Slice<Post>`를 유지하고 화면에 필요한 최소 메타데이터만 응답합니다.

```java
public class SliceResponse<T> {
    private final List<T> content;
    private final int page;
    private final int size;
    private final boolean hasNext;
    private final String message;
}
```

Spring Data는 요청 크기보다 한 건을 더 확인해 `hasNext`를 계산하므로 전체 count 없이 다음 묶음의 존재를 판단할 수 있습니다.

## 서버가 페이지 크기와 정렬을 통제하게 했습니다

클라이언트가 `size=100`을 보내더라도 한 번에 최대 10개만 반환하도록 `Pageable`을 재구성했습니다.

```java
private Pageable limitPageSize(Pageable pageable) {
    return PageRequest.of(
        Math.max(pageable.getPageNumber(), 0),
        Math.min(Math.max(pageable.getPageSize(), 1), 10)
    );
}
```

정렬은 `createdAt DESC, postId DESC`로 저장소에 고정했습니다. Slice는 순서가 결정적이지 않으면 페이지 사이에 같은 글이 중복되거나 빠질 수 있으므로 보조 정렬 키가 필수였습니다.

목록에 필요한 작성자 관계는 `@EntityGraph`로 함께 읽고, 북마크와 좋아요 상태는 각 Slice의 게시물 ID를 모아 배치 조회했습니다. 조회 방식을 가볍게 바꾸면서 N+1이 새로 생기지 않도록 함께 정리한 것입니다.

## 프론트엔드는 Slice를 중복 없이 합쳤습니다

첫 요청은 목록을 교체하고 다음 요청부터 기존 목록에 합칩니다. 같은 ID가 다시 들어오면 `Map`이 최신 값으로 교체하고, 합친 결과는 최신순으로 다시 정렬합니다.

```js
function appendUnique(current, next) {
  const unique = new Map(current.map((post) => [post.postId, post]));

  next.forEach((post) => {
    unique.set(post.postId, post);
  });

  return sortPostsByLatest([...unique.values()]);
}
```

```js
const result = await postApi.list({
  page: targetPage,
  size: PAGE_SIZE,
});

const next = (result?.content || []).map(normalizePost);

setPosts((current) =>
  replace ? sortPostsByLatest(next) : appendUnique(current, next),
);
setHasNext(Boolean(result?.hasNext ?? result?.has_next));
```

API의 snake_case와 camelCase 차이는 `normalizePost`와 `hasNext` fallback에서 흡수해 페이지 컴포넌트가 한 가지 모델만 사용하도록 했습니다.

## 마지막 버튼이 아니라 다섯 장 앞에서 선조회했습니다

처음에는 목록 맨 아래의 “피드 더 보기” 버튼을 `IntersectionObserver`로 관찰했습니다. 사용자가 끝까지 내려온 다음 요청이 시작되므로 네트워크 지연이 그대로 보였습니다.

현재는 남은 카드가 5개가 되는 지점을 관찰 대상으로 삼습니다.

```js
const PAGE_SIZE = 10;
const PREFETCH_REMAINING = 5;

{posts.map((post, index) => {
  const isPrefetchTarget =
    hasNext && index === posts.length - PREFETCH_REMAINING;

  return (
    <PostCard
      key={post.postId}
      post={post}
      cardRef={isPrefetchTarget ? loadMoreRef : undefined}
    />
  );
})}
```

10개를 받은 첫 화면에서는 6번째 카드가 관찰 대상입니다. 사용자가 그 카드에 도달하면 2페이지를 요청하므로 남은 5개를 읽는 동안 다음 데이터가 도착할 수 있습니다.

## 중복 요청은 두 개의 ref로 막았습니다

`IntersectionObserver`는 레이아웃 변화에 따라 같은 대상에 여러 번 콜백을 보낼 수 있습니다. React state만 사용하면 상태 반영 전에 같은 페이지 요청이 중복될 여지가 있어 즉시 변경되는 ref를 사용했습니다.

```js
const loadMorePendingRef = useRef(false);
const autoLoadPageRef = useRef(null);

const observer = new IntersectionObserver(([entry]) => {
  const targetPage = page + 1;

  if (!entry.isIntersecting || autoLoadPageRef.current === targetPage) return;

  autoLoadPageRef.current = targetPage;
  load(targetPage, false);
});
```

`loadMorePendingRef`는 진행 중인 추가 요청을 막고, `autoLoadPageRef`는 같은 target page가 관찰 이벤트로 다시 요청되는 것을 막습니다. 첫 페이지를 새로 불러올 때는 `autoLoadPageRef.current = null`로 초기화합니다.

`hasNext`가 false가 되면 observer를 만들지 않기 때문에 마지막 Slice 이후 스크롤이나 탭 visibility 변화가 발생해도 재조회하지 않습니다. 버튼은 IntersectionObserver가 없는 환경과 수동 재시도를 위한 fallback으로 남겨 두었습니다.

## 테스트는 관찰 지점을 직접 통과시켰습니다

테스트 fixture는 10개, 10개, 1개의 세 Slice를 반환하고 요청된 페이지 번호를 기록합니다.

```js
await expect(page.locator(".post-card")).toHaveCount(10);
expect(state.feedRequestedPages).toEqual([0]);

await page.locator(".post-card").nth(5).scrollIntoViewIfNeeded();
await expect(page.locator(".post-card")).toHaveCount(20);
expect(state.feedRequestedPages).toEqual([0, 1]);

await page.locator(".post-card").nth(15).scrollIntoViewIfNeeded();
await expect(page.locator(".post-card")).toHaveCount(21);
expect(state.feedRequestedPages).toEqual([0, 1, 2]);
```

마지막 Slice 이후 다시 맨 아래로 스크롤하고 visibility 이벤트를 발생시켜도 요청 배열이 `[0, 1, 2]`로 유지되는지 확인했습니다.

백엔드 통합 테스트에서는 `size=100` 요청도 10개로 제한되는지, `hasNext`가 true인지, 마지막 Slice가 종료 메시지를 반환하는지 검증했습니다.

## 회고

피드 조회 방식 변경은 반환 타입을 `Page`에서 `Slice`로 바꾸는 데서 끝나지 않았습니다. 결정적 정렬, 최대 크기 제한, 응답 DTO, 중복 없는 병합, 관찰 시점, 중복 요청 방지까지 하나의 흐름으로 맞춰야 했습니다. 결과적으로 서버는 필요 없는 count를 피하고, 사용자는 목록 끝에서 기다리는 시간을 줄였으며, 테스트는 정확한 요청 페이지 순서를 계약으로 남길 수 있었습니다.
