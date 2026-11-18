export const fulfilledValues = <T>(results: PromiseSettledResult<T>[]): T[] =>
  results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

export function throwFirstRejection(
  results: PromiseSettledResult<unknown>[],
): void {
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}
