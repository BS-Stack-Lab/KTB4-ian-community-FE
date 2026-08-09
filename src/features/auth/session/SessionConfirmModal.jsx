import { useEffect, useRef, useState } from "react";
import { userApi } from "../../../entities/user/api/userApi.js";
import { Button } from "../../../shared/ui/Button.jsx";
import { Modal } from "../../../shared/ui/Modal.jsx";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

export function SessionConfirmModal({ action, userId, onCancel, onComplete }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  useReloadBlocker("session-mutation", pending);

  useEffect(() => {
    if (!action) return;
    setPending(false);
    setError("");
    pendingRef.current = false;
  }, [action]);

  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (action === "delete") await userApi.remove(userId);
      else await userApi.logout();
      onComplete();
    } catch (cause) {
      setError(cause.message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const deleting = action === "delete";
  return (
    <Modal
      open={Boolean(action)}
      title={deleting ? "회원탈퇴 확인" : "로그아웃 확인"}
      onClose={pending ? undefined : onCancel}
      className="session-confirm-modal"
    >
      <div className="confirm">
        <h2>{deleting ? "회원탈퇴 하실건가요?" : "로그아웃 하시겠어요?"}</h2>
        <div>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            취소
          </Button>
          <Button loading={pending} onClick={confirm}>
            확인
          </Button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </Modal>
  );
}
