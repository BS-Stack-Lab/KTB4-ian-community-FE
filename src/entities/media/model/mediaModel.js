import { apiAssetUrl } from "../../../shared/config/env.js";

export function normalizeMedia(raw) {
  if (!raw) return null;
  return {
    mediaId: raw.mediaId ?? raw.media_id,
    status: raw.status,
    frame: raw.frame,
    mediaRevision: raw.mediaRevision ?? raw.media_revision ?? 1,
    transformVersion: raw.transformVersion ?? raw.transform_version ?? 1,
    errorCode: raw.errorCode ?? raw.error_code ?? null,
    variants: (raw.variants || [])
      .map((variant) => ({
        type: variant.type,
        url: variant.url,
        width: Number(variant.width),
        height: Number(variant.height),
        mimeType: variant.mimeType ?? variant.mime_type ?? "image/webp",
        fileSize: variant.fileSize ?? variant.file_size ?? 0,
      }))
      .filter((variant) => variant.url && variant.width > 0)
      .sort((left, right) => left.width - right.width),
  };
}

export function preferredVariant(media, targetWidth = 448) {
  const variants = media?.variants || [];
  return (
    variants.find((variant) => variant.width >= targetWidth) ||
    variants.at(-1) ||
    null
  );
}

export function responsiveImage(media, targetWidth = 448) {
  const preferred = preferredVariant(media, targetWidth);
  if (!preferred) return null;
  return {
    src: apiAssetUrl(preferred.url, null),
    srcSet: media.variants
      .map((variant) => `${apiAssetUrl(variant.url, null)} ${variant.width}w`)
      .join(", "),
  };
}
