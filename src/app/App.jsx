import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./providers/AuthProvider.jsx";
import { currentRoute, navigate } from "./router/navigation.js";
import { LoginPage } from "../pages/login/LoginPage.jsx";
import { SignupPage } from "../pages/signup/SignupPage.jsx";
import { FeedPage } from "../pages/feed/FeedPage.jsx";
import { PostDetailPage } from "../pages/post-detail/PostDetailPage.jsx";
import { BookmarksPage } from "../pages/bookmarks/BookmarksPage.jsx";
import { SessionConfirmModal } from "../features/auth/session/SessionConfirmModal.jsx";
import { EditProfileModal } from "../features/user/profile/EditProfileModal.jsx";
import { EditPasswordModal } from "../features/user/password/EditPasswordModal.jsx";
import { CreatePostModal } from "../features/post/create/CreatePostModal.jsx";
import { CommunityLnb } from "./layouts/CommunityLnb.jsx";
import { AppLoadingScreen } from "../shared/ui/AppLoadingScreen.jsx";
import { NotFoundPage } from "../pages/not-found/NotFoundPage.jsx";
import { ProfilePage } from "../pages/profile/ProfilePage.jsx";
import { sameUserId } from "./router/navigation.js";

function Shell() {
  const auth = useAuth();
  const [route, setRoute] = useState(currentRoute);
  const [confirm, setConfirm] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [bookmarkRefreshKey, setBookmarkRefreshKey] = useState(0);

  useEffect(() => {
    const update = () => setRoute(currentRoute());
    addEventListener("popstate", update);
    return () => removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    if (auth.status === "initializing") return;
    if (
      auth.status === "unauthenticated" &&
      route.name !== "login" &&
      route.name !== "signup"
    )
      navigate("/login", { replace: true });
    if (
      auth.status === "authenticated" &&
      (route.name === "login" || route.name === "signup")
    )
      navigate("/feed", { replace: true });
  }, [auth.status, route.name]);
  useEffect(() => {
    if (
      auth.status === "authenticated" &&
      route.name === "profile" &&
      route.profileUserId != null &&
      sameUserId(route.profileUserId, auth.user.userId)
    )
      navigate("/mypage", { replace: true });
  }, [auth.status, auth.user?.userId, route.name, route.profileUserId]);
  if (auth.status === "initializing") return <AppLoadingScreen />;
  if (route.name === "login")
    return (
      <LoginPage
        onAuthenticated={(user) => {
          auth.authenticate(user);
          navigate("/feed", { replace: true });
        }}
        onSignup={() => navigate("/signup")}
      />
    );
  if (route.name === "signup")
    return (
      <SignupPage
        onAuthenticated={(user) => {
          auth.authenticate(user);
          navigate("/feed", { replace: true });
        }}
        onLogin={() => navigate("/login")}
      />
    );
  if (auth.status !== "authenticated") return null;
  function completeSessionAction() {
    auth.clear();
    setConfirm(null);
    navigate("/login", { replace: true });
  }
  return (
    <div className="app-shell">
      <CommunityLnb
        routeName={route.name}
        user={auth.user}
        createOpen={createOpen}
        profileOpen={profileOpen}
        passwordOpen={passwordOpen}
        onFeed={() => navigate("/feed")}
        onCreate={() => setCreateOpen(true)}
        onBookmarks={() => navigate("/bookmarks")}
        onMyPage={() => navigate("/mypage")}
        onProfile={() => setProfileOpen(true)}
        onPassword={() => setPasswordOpen(true)}
        onLogout={() => setConfirm("logout")}
      />
      {route.name === "feed" ? (
        <FeedPage
          user={auth.user}
          onNavigate={navigate}
          onCreatePost={() => setCreateOpen(true)}
          onBookmarksChanged={() =>
            setBookmarkRefreshKey((current) => current + 1)
          }
          refreshKey={feedRefreshKey}
        />
      ) : route.name === "post" ? (
        <PostDetailPage
          postId={route.postId}
          user={auth.user}
          onNavigate={navigate}
          onBookmarksChanged={() =>
            setBookmarkRefreshKey((current) => current + 1)
          }
        />
      ) : route.name === "bookmarks" ? (
        <BookmarksPage onNavigate={navigate} refreshKey={bookmarkRefreshKey} />
      ) : route.name === "profile" ? (
        <ProfilePage
          profileUserId={route.profileUserId ?? auth.user.userId}
          viewer={auth.user}
          onNavigate={navigate}
          onBack={() => {
            if (history.length > 1) history.back();
            else navigate("/feed");
          }}
          onBookmarksChanged={() =>
            setBookmarkRefreshKey((current) => current + 1)
          }
        />
      ) : (
        <NotFoundPage onFeed={() => navigate("/feed")} />
      )}
      <SessionConfirmModal
        action={confirm}
        userId={auth.user.userId}
        onCancel={() => setConfirm(null)}
        onComplete={completeSessionAction}
      />
      <EditProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        user={auth.user}
        onUpdated={auth.update}
        onDeleteAccount={() => {
          setProfileOpen(false);
          setConfirm("delete");
        }}
      />
      <EditPasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        userId={auth.user.userId}
      />
      <CreatePostModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        user={auth.user}
        onCreated={async () => {
          setFeedRefreshKey((current) => current + 1);
          if (route.name !== "feed") navigate("/feed");
        }}
      />
    </div>
  );
}
export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
