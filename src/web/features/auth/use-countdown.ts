import { useEffect, useState } from "react";

const TICK_MS = 1000;

export function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(seconds);
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setRemaining((current) => current - 1),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, [running]);

  return { remaining, restart: () => setRemaining(seconds) };
}
