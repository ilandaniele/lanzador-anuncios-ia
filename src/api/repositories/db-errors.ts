const hasMessage = (error: unknown, fragment: string) =>
  [error, error instanceof Error ? error.cause : undefined].some(
    (candidate) =>
      candidate instanceof Error && candidate.message.includes(fragment),
  );

export const isUniqueViolation = (error: unknown) =>
  hasMessage(error, "UNIQUE constraint failed");

export const isCheckViolation = (error: unknown, constraint: string) =>
  hasMessage(error, `CHECK constraint failed: ${constraint}`);

export const isForeignKeyViolation = (error: unknown) =>
  hasMessage(error, "FOREIGN KEY constraint failed");

export const isRaisedAbort = (error: unknown, reason: string) =>
  hasMessage(error, reason);

export async function catchRaisedAbort<T, Reason extends string>(
  work: Promise<T>,
  reason: Reason,
): Promise<T | Reason> {
  try {
    return await work;
  } catch (error) {
    if (isRaisedAbort(error, reason)) return reason;
    throw error;
  }
}
