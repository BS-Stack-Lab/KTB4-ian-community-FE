import { useEffect, useState } from "react";
import {
  apiAssetUrl,
  DEFAULT_PROFILE_PATH,
} from "../../../shared/config/env.js";
import { responsiveImage } from "../../media/model/mediaModel.js";

export function UserAvatar({
  profileImage,
  profileMedia,
  nickname = "사용자",
  size = 34,
}) {
  const fallback = apiAssetUrl(DEFAULT_PROFILE_PATH);
  const responsive = responsiveImage(profileMedia, size);
  const resolvedSource = responsive?.src || apiAssetUrl(profileImage);
  const [source, setSource] = useState(() => resolvedSource);
  const [didFallback, setDidFallback] = useState(false);
  useEffect(() => {
    setSource(resolvedSource);
    setDidFallback(false);
  }, [profileImage, resolvedSource]);
  return (
    <img
      className="user-avatar"
      src={source}
      srcSet={didFallback ? undefined : responsive?.srcSet}
      sizes={`${size}px`}
      alt={`${nickname} 프로필`}
      width={size}
      height={size}
      onError={(event) => {
        if (didFallback || source === fallback) {
          event.currentTarget.onerror = null;
          return;
        }
        setDidFallback(true);
        setSource(fallback);
      }}
    />
  );
}
