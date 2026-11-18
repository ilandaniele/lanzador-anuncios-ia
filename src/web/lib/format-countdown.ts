const SECONDS_PER_MINUTE = 60;

export const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
