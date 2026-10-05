// Browser storage helpers: moving a setting saved under the app's old name (Mind Gym) to its new key.

/**
 * Copies a value saved under its old key to the new one (unless the new one is already set), then drops the old key.
 * It can throw when storage is unavailable, so call it inside the same try as the read that follows.
 */
export function migrateKey(oldKey: string, newKey: string) {
  const old = localStorage.getItem(oldKey);
  if (old !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, old);
  localStorage.removeItem(oldKey);
}
