import { useRef, useState } from "react";
import { apiAssetUrl } from "../../../shared/config/env.js";
import { UserAvatar } from "../../user/ui/UserAvatar.jsx";
import { formatRelativeTime } from "../../../shared/lib/date.js";
import { formatCount } from "../../../shared/lib/formatCount.js";
import {
  commentIcon,
  heartFillIcon,
  heartStrokeIcon,
  lnbReceiptStrokeVector,
  lnbReceiptFillVector,
  moreDotsIcon,
} from "../../../shared/assets/index.js";
import { OptionMenu } from "../../../shared/ui/OptionMenu.jsx";
import { responsiveImage } from "../../media/model/mediaModel.js";

export function PostCard({
  post,
  cardRef,
  onOpen,
  onLike,
  likePending = false,
  onBookmark,
  bookmarkPending = false,
  onEdit,
  onDelete,
  ownerOptionsInFooter = false,
  imagePriority = false,
}) {
  const [imageOrientation, setImageOrientation] = useState("landscape");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsTriggerRef = useRef(null);
  const responsive = responsiveImage(post.media?.[0], 448);

  return (
    <article
      ref={cardRef}
      className={`post-card${
        optionsOpen && ownerOptionsInFooter
          ? " post-card--owner-options-open"
          : ""
      }`}
    >
      <div
        className="post-card__body"
        role={onOpen ? "button" : undefined}
        aria-label={onOpen ? "피드 상세 보기" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (!onOpen || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          onOpen();
        }}
      >
        <header className="post-card__header">
          <span className="identity">
            <UserAvatar
              profileImage={post.author.profileImage}
              profileMedia={post.author.profileMedia}
              nickname={post.author.nickname}
            />
            <strong>{post.author.nickname}</strong>
          </span>
          <span className="post-card__tools">
            <span className="post-card__metadata">
              조회 {formatCount(post.viewCount)}
              {post.createdAt && (
                <>
                  <span aria-hidden="true">ㆍ</span>
                  <time dateTime={post.createdAt}>
                    {formatRelativeTime(post.createdAt)}
                  </time>
                </>
              )}
            </span>
            {(onEdit || onDelete) && !ownerOptionsInFooter && (
              <button
                className="post-card__options"
                type="button"
                aria-label="피드 옵션"
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                onClick={(event) => {
                  event.stopPropagation();
                  setOptionsOpen((current) => !current);
                }}
                ref={optionsTriggerRef}
              >
                <span aria-hidden="true">
                  <img src={moreDotsIcon} alt="" />
                </span>
              </button>
            )}
            {optionsOpen && !ownerOptionsInFooter && (
              <OptionMenu
                onEdit={onEdit}
                onDelete={onDelete}
                onClose={() => setOptionsOpen(false)}
                triggerRef={optionsTriggerRef}
              />
            )}
          </span>
        </header>
        {(post.imageUrl || post.mediaProcessing || post.mediaFailed) && (
          <div className="post-card__media">
            {post.imageUrl ? (
              <img
                className={`post-card__image post-card__image--${imageOrientation}`}
                src={apiAssetUrl(post.imageUrl, null)}
                srcSet={responsive?.srcSet}
                sizes="(max-width: 448px) 100vw, 448px"
                loading={imagePriority ? "eager" : "lazy"}
                fetchPriority={imagePriority ? "high" : "auto"}
                alt="피드 첨부 이미지"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  setImageOrientation(
                    naturalHeight > naturalWidth ? "portrait" : "landscape",
                  );
                }}
              />
            ) : (
              <div
                className="post-card__image-placeholder"
                aria-hidden="true"
              />
            )}
            {(post.mediaProcessing || post.mediaFailed) && (
              <span
                className={`post-card__media-state${
                  post.mediaFailed ? " is-failed" : ""
                }`}
                role="status"
              >
                {post.mediaFailed
                  ? "이미지 처리에 실패했어요"
                  : "이미지를 처리하고 있어요"}
              </span>
            )}
          </div>
        )}
        <p className="post-card__content">{post.content}</p>
      </div>
      <footer className="post-actions">
        <button
          className="post-actions__like"
          type="button"
          aria-label="좋아요"
          aria-pressed={post.liked}
          disabled={!onLike || likePending}
          onClick={onLike}
        >
          <img src={post.liked ? heartFillIcon : heartStrokeIcon} alt="" />
          <span>{formatCount(post.likeCount)}</span>
        </button>
        <span className="post-action-label">
          <img src={commentIcon} alt="" />
          <span>{formatCount(post.commentCount)}</span>
        </span>
        {ownerOptionsInFooter ? (
          <span className="post-actions__owner-menu">
            <button
              className="post-card__options"
              type="button"
              aria-label="피드 옵션"
              aria-haspopup="menu"
              aria-expanded={optionsOpen}
              onClick={() => setOptionsOpen((current) => !current)}
              ref={optionsTriggerRef}
            >
              <span aria-hidden="true">
                <img src={moreDotsIcon} alt="" />
              </span>
            </button>
            {optionsOpen && (
              <OptionMenu
                onBookmark={onBookmark}
                bookmarked={post.bookmarked}
                bookmarkPending={bookmarkPending}
                onEdit={onEdit}
                onDelete={onDelete}
                onClose={() => setOptionsOpen(false)}
                triggerRef={optionsTriggerRef}
                placement="footer"
              />
            )}
          </span>
        ) : (
          <button
            className="post-actions__bookmark"
            type="button"
            aria-label="북마크"
            aria-pressed={post.bookmarked}
            disabled={!onBookmark || bookmarkPending}
            onClick={onBookmark}
          >
            <span className="post-actions__receipt" aria-hidden="true">
              <img
                src={
                  post.bookmarked
                    ? lnbReceiptFillVector
                    : lnbReceiptStrokeVector
                }
                alt=""
              />
            </span>
          </button>
        )}
      </footer>
    </article>
  );
}
