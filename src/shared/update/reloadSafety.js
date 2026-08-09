const blockers = new Map();
const listeners = new Set();
let activeMutations = 0;

function notify() {
  listeners.forEach((listener) => listener());
}

export function setReloadBlocker(key, blocked) {
  const hadBlocker = blockers.has(key);
  if (blocked) blockers.set(key, true);
  else blockers.delete(key);
  if (hadBlocker !== blockers.has(key)) notify();
}

export function beginTrackedMutation() {
  activeMutations += 1;
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeMutations = Math.max(activeMutations - 1, 0);
    notify();
  };
}

export function isReloadSafe() {
  return blockers.size === 0 && activeMutations === 0;
}

export function subscribeReloadSafety(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reloadSafetyState() {
  return {
    blockerCount: blockers.size,
    activeMutations,
    safe: isReloadSafe(),
  };
}

export function resetReloadSafetyForTests() {
  blockers.clear();
  activeMutations = 0;
  notify();
}
