import { normalizeUser } from "./normalizeUser.js";

const PROFILE_TYPES = new Set([
  "SELF",
  "OTHER_FOLLOWING",
  "OTHER_NOT_FOLLOWING",
]);

export function normalizeUserProfile(raw = {}) {
  const user = normalizeUser(raw);
  const profileType = PROFILE_TYPES.has(raw.profileType ?? raw.profile_type)
    ? (raw.profileType ?? raw.profile_type)
    : null;

  return {
    ...user,
    followerCount: Number(raw.followerCount ?? raw.follower_count ?? 0),
    followingCount: Number(raw.followingCount ?? raw.following_count ?? 0),
    countUpdatedAt: raw.countUpdatedAt ?? raw.count_updated_at ?? null,
    profileType,
  };
}
