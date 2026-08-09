import { describe, expect, it } from "vitest";
import { normalizePost } from "../../src/entities/post/model/normalizePost.js";
import { normalizeUser } from "../../src/entities/user/model/normalizeUser.js";
import { responsiveImage } from "../../src/entities/media/model/mediaModel.js";

const media = {
  mediaId: "media-1",
  status: "READY",
  variants: [
    {
      type: "POST_LANDSCAPE_1X",
      url: "https://cdn/448.webp",
      width: 448,
      height: 288,
    },
    {
      type: "POST_LANDSCAPE_3X",
      url: "https://cdn/1344.webp",
      width: 1344,
      height: 864,
    },
  ],
};

describe("Media V2 정규화와 responsive source", () => {
  it("V2 media를 legacy URL보다 우선하고 legacy만 있으면 fallback한다", () => {
    expect(
      normalizePost({ media: [media], legacyImageUrl: "/legacy.jpg" }).imageUrl,
    ).toBe("https://cdn/448.webp");
    expect(normalizePost({ legacyImageUrl: "/legacy.jpg" }).imageUrl).toBe(
      "/legacy.jpg",
    );
  });

  it("width descriptor srcset을 오름차순으로 만든다", () => {
    const post = normalizePost({ media: [media] });
    const responsive = responsiveImage(post.media[0], 448);
    expect(responsive.srcSet).toBe(
      "https://cdn/448.webp 448w, https://cdn/1344.webp 1344w",
    );
  });

  it("프로필 Media의 160 variant를 legacy profile보다 우선한다", () => {
    const user = normalizeUser({
      legacyProfileImageUrl: "/legacy-profile.png",
      profileMedia: {
        mediaId: "profile-1",
        variants: [
          {
            type: "PROFILE_SMALL",
            url: "https://cdn/34.webp",
            width: 34,
            height: 34,
          },
          {
            type: "PROFILE_MEDIUM",
            url: "https://cdn/160.webp",
            width: 160,
            height: 160,
          },
        ],
      },
    });
    expect(user.profileImage).toBe("https://cdn/160.webp");
  });
});
