import { useEffect, useRef, useState } from "react";
import { userApi } from "../../../entities/user/api/userApi.js";
import { backLeftIcon } from "../../../shared/assets/index.js";
import { Modal } from "../../../shared/ui/Modal.jsx";
import { validatePasswordChange } from "./validatePasswordChange.js";
import { useReloadBlocker } from "../../../shared/update/useReloadBlocker.js";

const empty = { password: "", newPassword: "", newPasswordConfirm: "" };

export function EditPasswordModal({ open, onClose, userId }) {
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState("");
  const pendingRef = useRef(false);
  const valid = Object.keys(validatePasswordChange(values)).length === 0;
  useReloadBlocker(
    "edit-password",
    open || pending
      ? pending || Object.values(values).some((value) => Boolean(value))
      : false,
  );

  useEffect(() => {
    if (!open) return;
    setValues(empty);
    setErrors({});
    setPending(false);
    setServerError("");
  }, [open]);

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    const nextErrors = validatePasswordChange(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setServerError("");
    try {
      await userApi.updatePassword(userId, {
        password: values.password,
        newPassword: values.newPassword,
        password_confirm: values.newPasswordConfirm,
      });
      setValues(empty);
      onClose();
    } catch (cause) {
      setServerError(cause.message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      title="비밀번호 변경"
      onClose={pending ? undefined : onClose}
      className="password-edit-modal"
    >
      <header className="profile-edit-header">
        <button type="button" aria-label="비밀번호 변경 닫기" onClick={onClose}>
          <img src={backLeftIcon} alt="" />
        </button>
        <strong>비밀번호 변경</strong>
      </header>
      <section className="password-editor">
        <div className="password-editor__fields">
          {[
            ["password", "현재 비밀번호", "현재 비밀번호를 입력하세요"],
            ["newPassword", "새 비밀번호", "새로운 비밀번호를 입력하세요"],
            [
              "newPasswordConfirm",
              "새 비밀번호 확인",
              "비밀번호를 한번 더 입력하세요",
            ],
          ].map(([field, label, placeholder]) => (
            <input
              key={field}
              type="password"
              aria-label={label}
              placeholder={placeholder}
              value={values[field]}
              aria-invalid={Boolean(errors[field])}
              onChange={(event) => change(field, event.target.value)}
              disabled={pending}
            />
          ))}
        </div>
        <button
          className="button button--primary"
          type="button"
          disabled={!valid || pending}
          onClick={submit}
        >
          {pending ? "변경 중" : "변경하기"}
        </button>
        {(Object.values(errors).find(Boolean) || serverError) && (
          <p className="error">
            {Object.values(errors).find(Boolean) || serverError}
          </p>
        )}
      </section>
    </Modal>
  );
}
