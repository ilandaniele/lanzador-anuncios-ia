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
