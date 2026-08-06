# 하트는 보이는데 아무 일도 일어나지 않았습니다: 상세 화면 좋아요 연결기

피드 목록에서는 좋아요가 정상적으로 동작했지만 상세 화면에서는 하트를 눌러도 네트워크 요청이 없었고 숫자와 아이콘도 그대로였습니다. API 장애가 아니라 컴포넌트 연결이 한 단계 빠진 문제였습니다.

## 문제는 버튼이 아니라 콜백 경로에 있었습니다

`PostCard`는 목록과 상세가 함께 사용하는 공용 컴포넌트입니다. 좋아요 버튼의 동작은 내부에 고정되어 있지 않고 부모가 `onLike`를 주입하는 구조였습니다. 목록은 콜백을 전달했지만 상세는 `onDelete`만 넘기고 `onLike`를 생략했습니다.

```jsx
// 수정 전의 핵심 구조
<PostCard
  post={post}
  onDelete={isOwner ? () => setDeleteOpen(true) : undefined}
/>
```

화면에 하트가 렌더링된다는 사실만 확인하면 이 결함을 놓치기 쉽습니다. 버튼을 클릭했을 때 `PostCard → PostDetailPage → postApi.like`로 이어지는 이벤트 경로가 완성되어 있는지 확인해야 했습니다.

## 목록에서 검증된 좋아요 로직을 재사용했습니다

목록에 이미 있던 `optimisticLike`와 `togglePostLike`를 상세에서도 사용했습니다. 먼저 화면을 낙관적으로 갱신하고, 서버 응답이 오면 `liked`와 `likeCount`로 확정하며, 실패하면 이전 상태로 되돌리는 방식입니다.

```js
export function optimisticLike(post) {
  return {
    ...post,
    liked: !post.liked,
    likeCount: Math.max(0, post.likeCount + (post.liked ? -1 : 1)),
  };
}

export async function togglePostLike(post) {
  const optimistic = optimisticLike(post);
  const result = await postApi.like(post.postId);

  return {
    ...optimistic,
    liked: result?.liked ?? optimistic.liked,
    likeCount: result?.likeCount ?? result?.like_count ?? optimistic.likeCount,
  };
}
```

상세 페이지에는 요청 중 중복 클릭을 막는 상태와 실패 롤백을 추가했습니다.

```jsx
const [likePending, setLikePending] = useState(false);

async function like() {
  if (likePending || !post) return;

  const before = post;
  setLikePending(true);
  setPost(optimisticLike(before));

  try {
    const updated = await togglePostLike(before);
    setPost(updated);
    setError("");
  } catch (cause) {
    setPost(before);
    setError(cause.message);
  } finally {
    setLikePending(false);
  }
}

<PostCard
  post={post}
  onLike={like}
  likePending={likePending}
/>
```

여기서 중요한 부분은 서버 응답을 무시하지 않는 것입니다. 낙관적 상태는 사용자에게 빠른 반응을 주기 위한 임시 값일 뿐, 최종 상태의 기준은 서버가 반환한 `liked`와 `likeCount`입니다.

## 목록 응답도 사용자별 좋아요 상태를 포함하게 했습니다

상세에서 좋아요를 누른 뒤 목록으로 돌아왔을 때 상태가 다시 꺼져 보이면 기능은 절반만 완성된 셈입니다. 백엔드 목록 응답에 로그인 사용자의 `liked`를 추가하고, 현재 Slice에 포함된 게시물 ID를 한 번에 조회했습니다.

```java
@Query("""
        select postLike.authorPost.postId
        from PostLike postLike
        where postLike.authorUser.userId = :userId
          and postLike.authorPost.postId in :postIds
          and postLike.authorPost.postDeleted = false
        """)
List<Long> findLikedPostIds(Long userId, Collection<Long> postIds);
```

```java
Set<Long> likedPostIds = postLikeService.findLikedPostIds(userId, postIds);

Slice<PostResponse> response = posts.map(post -> new PostResponse(
        post,
        postService.getPostImageUrl(post),
        bookmarkedPostIds.contains(post.getPostId()),
        likedPostIds.contains(post.getPostId())
));
```

게시물마다 `isLiked`를 호출하지 않고 Slice 단위로 조회했기 때문에 사용자별 상태를 추가하면서도 N+1 쿼리를 피할 수 있었습니다.

## 검증은 요청과 화면을 함께 확인했습니다

Playwright 테스트에서는 단순히 하트 색만 확인하지 않았습니다.

```js
await like.click();

await expect(like).toBeDisabled();
await expect(like).toHaveAttribute("aria-pressed", "true");
await expect(like).toHaveText("4");

expect(state.likeRequests).toHaveLength(1);
expect(state.likeRequests[0]).toMatchObject({
  method: "POST",
  csrf: "csrf-token",
});
```

요청 실패 시 이전 숫자와 아이콘으로 돌아오는지, 버튼이 다시 활성화되어 재시도할 수 있는지도 검증했습니다. 백엔드 통합 테스트에서는 같은 게시물을 좋아요한 사용자와 다른 사용자가 각각 `liked: true`, `liked: false`를 받으면서 공통 `like_count`는 동일한지 확인했습니다.

## 회고

공용 컴포넌트는 UI 중복을 줄여 주지만 필수 이벤트를 누락하기 쉽게 만들기도 합니다. 이번 결함은 “버튼이 존재하는가”가 아니라 “클릭이 API 요청과 서버 확정 상태까지 이어지는가”를 봐야 발견할 수 있었습니다. 이후에는 화면별 액션 목록을 먼저 만들고, 각 액션마다 콜백 전달·중복 클릭 방지·성공 확정·실패 롤백을 하나의 계약으로 확인하게 되었습니다.
