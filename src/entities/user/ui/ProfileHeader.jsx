import { profileBackIcon } from "../../../shared/assets/index.js";
import { formatCount } from "../../../shared/lib/formatCount.js";
import { UserAvatar } from "./UserAvatar.jsx";

export function ProfileHeader({
  profile,
  onBack,
  onToggleFollow,
  followPending = false,
}) {
  const self = profile.profileType === "SELF";
  const following = profile.profileType === "OTHER_FOLLOWING";

  return (
    <header className="profile-header" aria-labelledby="profile-page-title">
      <div className="profile-header__back-row">
        <button
          className="profile-header__back"
          type="button"
          aria-label="뒤로가기"
          onClick={onBack}
        >
          <img src={profileBackIcon} alt="" aria-hidden="true" />
        </button>
      </div>
      <div className="profile-header__content">
        <div className="profile-header__main">
          <div className="profile-header__identity">
            <UserAvatar
              profileImage={profile.profileImage}
              profileMedia={profile.profileMedia}
              nickname={profile.nickname}
              size={51}
            />
            <h1 className="profile-header__nickname" id="profile-page-title">
              {profile.nickname}
            </h1>
          </div>
          {!self && (
            <button
              className={`profile-header__follow-button ${following ? "is-following" : ""}`}
              type="button"
              aria-pressed={following}
              aria-busy={followPending}
              disabled={followPending}
              onClick={onToggleFollow}
            >
              {following ? "팔로잉" : "팔로우"}
            </button>
          )}
        </div>
        <dl className="profile-header__stats">
          <div>
            <dt className="profile-header__stat-label">팔로워</dt>
            <dd className="profile-header__stat-count">
              {formatCount(profile.followerCount)}명
            </dd>
          </div>
          <div>
            <dt className="profile-header__stat-label">팔로잉</dt>
            <dd className="profile-header__stat-count">
              {formatCount(profile.followingCount)}명
            </dd>
          </div>
        </dl>
      </div>
    </header>
  );
}
