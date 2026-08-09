import { useEffect, useId } from "react";
import { setReloadBlocker } from "./reloadSafety.js";

export function useReloadBlocker(name, blocked) {
  const instanceId = useId();
  const key = `${name}:${instanceId}`;

  useEffect(() => {
    setReloadBlocker(key, Boolean(blocked));
    return () => setReloadBlocker(key, false);
  }, [blocked, key]);
}
