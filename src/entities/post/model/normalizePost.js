import { normalizeUser } from "../../user/model/normalizeUser.js";
import {
  normalizeMedia,
  preferredVariant,
} from "../../media/model/mediaModel.js";

export function normalizePost(raw = {}) {
  const media = (raw.media || []).map(normalizeMedia).filter(Boolean);
  const mediaAttachments = (raw.mediaAttachments || raw.media_attachments || [])
    .map((attachment) => ({
      displayOrder:
        attachment.order ??
        attachment.displayOrder ??
        attachment.display_order ??
        0,
      state: attachment.state || "READY",
      media: normalizeMedia(attachment.activeMedia ?? attachment.media),
      pendingMediaId:
        attachment.pendingMediaId ?? attachment.pending_media_id ?? null,
      errorCode: attachment.errorCode ?? attachment.error_code ?? null,
      pendingFrame: attachment.pendingFrame ?? attachment.pending_frame ?? null,
    }))
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const mediaImage = preferredVariant(media[0], 448)?.url;
  return {
    postId: raw.postId ?? raw.post_id,
    content: raw.content ?? raw.title ?? "",
    imageUrl:
      mediaImage ??
      raw.legacyImageUrl ??
      raw.legacy_image_url ??
      raw.imageUrl ??
      raw.image_url ??
      null,
    media,
    mediaAttachments,
    mediaProcessing: mediaAttachments.some(
      (attachment) => attachment.state === "PROCESSING",
    ),
    mediaFailed: mediaAttachments.some(
      (attachment) => attachment.state === "FAILED",
    ),
    author: normalizeUser(raw.author ?? raw),
    likeCount: raw.likeCount ?? raw.like_count ?? 0,
    commentCount:
      raw.commentCount ?? raw.comment_count ?? raw.comment?.length ?? 0,
    viewCount: raw.viewCount ?? raw.view_count ?? 0,
    liked: Boolean(raw.liked),
    bookmarked: Boolean(raw.bookmarked ?? raw.bookmark),
    mine: Boolean(raw.mine),
    comments: raw.comments ?? raw.comment ?? [],
    createdAt: raw.createdAt ?? raw.created_at ?? null,
  };
}
