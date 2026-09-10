import { useEffect, useState } from "react";

// UI preferences the browser remembers: sidebar and panel state, panel
// width. SSR renders the default; the stored value applies after mount.
export function usePersistedState<T extends string | number | boolean>(
  key: string,
  initial: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`openmuse:${key}`);
      if (stored !== null) setValue(JSON.parse(stored) as T);
    } catch {
      /* private mode or no storage */
    }
  }, [key]);
  const update = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(`openmuse:${key}`, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  return [value, update];
}
