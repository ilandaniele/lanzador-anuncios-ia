import { useEffect, useRef, useState } from "react";

export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (Object.is(value, throttled)) return;
    const wait = Math.max(0, lastUpdate.current + intervalMs - Date.now());
    const timer = setTimeout(() => {
      lastUpdate.current = Date.now();
      setThrottled(value);
    }, wait);
    return () => clearTimeout(timer);
  }, [value, throttled, intervalMs]);

  return throttled;
}
