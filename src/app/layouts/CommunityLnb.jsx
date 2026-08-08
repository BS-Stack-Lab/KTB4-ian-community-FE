import { UserAvatar } from "../../entities/user/ui/UserAvatar.jsx";
import { lnbLogoImage } from "../../shared/assets/index.js";
import { LnbIcon } from "./LnbIcon.jsx";

function NavigationItem({
  children,
  icon,
  selected = false,
  modal = false,
  onClick,
}) {
  return (
    <button
      className={`lnb-navigation__item ${selected ? "is-selected" : ""}`}
      type="button"
      aria-current={!modal && selected ? "page" : undefined}
      aria-pressed={modal ? selected : undefined}
      onClick={onClick}
    >
      <LnbIcon name={icon} selected={selected} />
      <span>{children}</span>
    </button>
  );
}

export function CommunityLnb({
  routeName,
  user,
  createOpen,
  profileOpen,
  passwordOpen,
  onFeed,
  onCreate,
  onBookmarks,
  onProfile,
  onPassword,
  onLogout,
}) {
  const feedSelected = routeName === "feed" || routeName === "post";
  const bookmarkSelected = routeName === "bookmarks";

  return (
    <aside className="lnb" aria-label="주요 메뉴">
      <img className="lnb__logo" src={lnbLogoImage} alt="PULSE" />
      <div className="lnb__content">
        <div className="lnb__menus">
          <nav className="lnb-navigation" aria-label="커뮤니티">
            <NavigationItem
              icon="home"
              selected={feedSelected}
              onClick={onFeed}
            >
              피드
            </NavigationItem>
            <NavigationItem
              icon="plus"
              modal
              selected={createOpen}
              onClick={onCreate}
            >
              새로운 피드 작성
            </NavigationItem>
            <NavigationItem
              icon="receipt"
              selected={bookmarkSelected}
              onClick={onBookmarks}
            >
              북마크
            </NavigationItem>
          </nav>
          <section className="lnb-account" aria-labelledby="lnb-account-title">
            <span className="lnb-account__label" id="lnb-account-title">
              회원정보
            </span>
            <nav className="lnb-navigation" aria-label="회원정보">
              <NavigationItem
                icon="profile"
                modal
                selected={profileOpen}
                onClick={onProfile}
              >
                프로필 편집
              </NavigationItem>
              <NavigationItem
                icon="lock"
                modal
                selected={passwordOpen}
                onClick={onPassword}
              >
                비밀번호 변경
              </NavigationItem>
            </nav>
          </section>
        </div>
        <div className="lnb-user">
          <div className="lnb-user__identity">
            <UserAvatar
              profileImage={user.profileImage}
              profileMedia={user.profileMedia}
              nickname={user.nickname}
            />
            <strong title={user.nickname}>{user.nickname}</strong>
          </div>
          <button className="lnb-user__logout" type="button" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </div>
    </aside>
  );
}
