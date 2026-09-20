import { useCallback, useEffect, useRef, useState } from "react";

// Responsibilities:
// - Load a vault-scoped dataset whenever its drawer becomes active or the
//   vault changes, and expose loading state plus a manual refresh.
// Contracts:
// - A response from an older vault or an earlier refresh is discarded.
// - Errors go to `onError` and the previous data stays on screen.
// - `empty` and `onError` are read through refs so callers can pass literals
//   and inline handlers without retriggering loads.

type VaultDrawerDataOptions<T> = {
  active: boolean;
  vaultRoot: string;
  empty: T;
  load: (vaultRoot: string) => Promise<T>;
  onError: (message: string) => void;
};

export function useVaultDrawerData<T>({
  active,
  vaultRoot,
  empty,
  load,
  onError,
}: VaultDrawerDataOptions<T>) {
  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const emptyRef = useRef(empty);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    if (!vaultRoot) {
      setData(emptyRef.current);
      return;
    }

    setLoading(true);
    try {
      const result = await load(vaultRoot);
      if (request === requestRef.current) {
        setData(result);
      }
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === requestRef.current) {
        setLoading(false);
      }
    }
  }, [load, vaultRoot]);

  useEffect(() => {
    if (active) {
      void refresh();
    }
  }, [active, refresh]);

  return { data, loading, refresh };
}
