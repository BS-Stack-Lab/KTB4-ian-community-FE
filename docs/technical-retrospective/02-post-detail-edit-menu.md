# 메뉴는 열리는데 수정은 되지 않았습니다: 조건부 액션과 편집 모달 연결

상세 화면에서 작성자가 옵션 메뉴를 열면 `수정하기`가 보였지만, 눌러도 메뉴만 닫히고 아무 일도 일어나지 않았습니다. 원인은 두 가지였습니다. 상세 페이지가 `onEdit`을 전달하지 않았고, `OptionMenu`는 콜백이 없어도 수정 항목을 항상 그렸습니다.

## 선택적 기능을 항상 렌더링한 것이 문제였습니다

기존 메뉴의 `run` 함수는 선택적 콜백을 안전하게 호출하기 위해 `action?.()`을 사용했습니다.

```js
function run(action) {
  action?.();
  onClose?.();
}
```

예외가 발생하지 않는다는 점에서는 안전하지만, 사용자 관점에서는 실패가 조용히 숨겨집니다. 존재하지 않는 기능을 활성 메뉴처럼 보여 줬기 때문입니다.

해결 방법은 콜백의 존재를 렌더링 조건으로 사용하는 것이었습니다.

```jsx
{onEdit && (
  <button type="button" role="menuitem" onClick={() => run(onEdit)}>
    <span>수정하기</span>
    <span className="option-menu__pencil" aria-hidden="true">
      {/* icon */}
    </span>
  </button>
)}

{onDelete && (
  <button type="button" role="menuitem" onClick={() => run(onDelete)}>
    <span>삭제하기</span>
  </button>
)}
```

이 변경으로 `OptionMenu`의 공개 계약도 명확해졌습니다. 콜백이 전달된 액션만 사용자에게 노출됩니다. 권한이 없거나 아직 구현하지 않은 기능은 비활성 버튼으로 남지 않습니다.

## 상세 페이지에 목록과 같은 편집 흐름을 연결했습니다

상세 화면에도 `EditPostModal`과 편집 대상 상태를 추가했습니다. 작성자 여부는 닉네임이 아니라 사용자 ID로 판정했습니다. 닉네임은 변경되거나 중복될 수 있지만 사용자 ID는 권한 판정에 사용할 수 있는 식별자이기 때문입니다.

```jsx
const [editingPost, setEditingPost] = useState(null);

const isOwner =
  post.author.userId != null && post.author.userId === user.userId;

<PostCard
  post={post}
  onEdit={isOwner ? () => setEditingPost(post) : undefined}
  onDelete={isOwner ? () => setDeleteOpen(true) : undefined}
/>

<EditPostModal
  open={Boolean(editingPost)}
  onClose={() => setEditingPost(null)}
  post={editingPost}
  onUpdated={load}
/>
```

`editingPost`에 값이 들어오면 모달이 열리고, 수정이 성공하면 `load`를 다시 실행해 상세 API의 최신 데이터를 화면에 반영합니다. 모달 내부의 임시 입력 상태를 상세 페이지가 직접 관리하지 않아도 되어 목록과 상세이 동일한 편집 컴포넌트를 공유할 수 있었습니다.

## UI 권한과 서버 권한은 역할이 다릅니다

작성자가 아닐 때 `onEdit`과 `onDelete`를 전달하지 않는 것은 사용자 경험을 위한 제어입니다. 이것만으로 보안이 완성되는 것은 아닙니다. 조작된 요청을 막는 최종 권한 검증은 백엔드가 계속 담당해야 합니다.

```text
프론트엔드: 실행할 수 없는 메뉴를 숨깁니다.
백엔드: 요청자가 실제 작성자인지 다시 검증합니다.
```

두 계층을 함께 두면 정상 사용자는 불필요한 실패를 겪지 않고, 악의적인 직접 API 호출도 차단할 수 있습니다.

## 검증 시나리오

옵션 메뉴 테스트는 다음 흐름으로 구성했습니다.

```js
await card.getByRole("button", { name: "피드 옵션" }).click();
await page.getByRole("menuitem", { name: "수정하기" }).click();
await expect(page.getByRole("dialog", { name: "피드 편집" })).toBeVisible();
```

추가로 작성자가 아닌 카드에는 옵션 버튼이 없는지, `onEdit` 없이 `onDelete`만 준 메뉴에는 수정 항목이 렌더링되지 않는지 확인했습니다. 실제 백엔드와 연결한 E2E에서는 `PATCH /api/posts/{postId}` 응답 이후 본문이 바뀌고, 새로고침 뒤에도 변경 내용이 유지되는지까지 검증했습니다.

## 회고

옵셔널 체이닝은 런타임 오류를 막아 주지만 잘못된 UI 계약까지 고쳐 주지는 않습니다. 실행할 수 없는 액션은 렌더링하지 않고, 실행 가능한 액션은 모달·API·재조회까지 완결해야 합니다. 이번 작업 이후 메뉴 컴포넌트를 “항목을 그리는 UI”가 아니라 “전달받은 능력만 노출하는 인터페이스”로 바라보게 되었습니다.
