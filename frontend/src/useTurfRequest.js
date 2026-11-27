import { useEffect, useState } from 'react';
import { turfRequest } from './turfApi';

export function useTurfRequest(path, token) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    turfRequest(path, { token, signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setResult({ path, data });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ path, error });
    });
    return () => controller.abort();
  }, [path, token, attempt]);
  return { ...(result?.path === path && result), previousData: result?.data,
    reload() { setResult(null); setAttempt((count) => count + 1); } };
}
