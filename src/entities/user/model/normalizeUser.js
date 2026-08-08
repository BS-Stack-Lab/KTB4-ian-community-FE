import {
  normalizeMedia,
  preferredVariant,
} from "../../media/model/mediaModel.js";

export function normalizeUser(raw = {}) {
  const profileMedia = normalizeMedia(
    raw.profileMedia ?? raw.profile_media ?? null,
  );
  const mediaImage = preferredVariant(profileMedia, 160)?.url;
  return {
    userId: raw.userId ?? raw.user_id ?? null,
    email: raw.email ?? "",
    nickname: raw.nickname ?? raw.authorName ?? raw.author_name ?? "알 수 없음",
    profileImage:
      mediaImage ??
      raw.legacyProfileImageUrl ??
      raw.legacy_profile_image_url ??
      raw.profileImage ??
      raw.profile_image ??
      null,
    profileMedia,
  };
}
