import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { prefetchLanding } from "../../src/web/lib/prefetch-landing";
import { qk } from "../../src/web/lib/query-keys";

function spyOnPrefetch() {
  const queryClient = new QueryClient();
  const prefetch = vi
    .spyOn(queryClient, "prefetchQuery")
    .mockResolvedValue(undefined);
  return { queryClient, prefetch };
}

describe("prefetchLanding", () => {
  it("prefetches today, assets and overview on the Hoy route", () => {
    const { queryClient, prefetch } = spyOnPrefetch();

    prefetchLanding(queryClient, "/w/w1/hoy");

    const keys = prefetch.mock.calls.map(([options]) => options.queryKey);
    expect(keys).toEqual([
      qk.today("w1"),
      qk.metaAssets("w1"),
      qk.workspace("w1"),
    ]);
  });

  it.each(["/", "/login", "/w/w1/metricas", "/w/w1/hoy/extra"])(
    "prefetches nothing on %s",
    (pathname) => {
      const { queryClient, prefetch } = spyOnPrefetch();

      prefetchLanding(queryClient, pathname);

      expect(prefetch).not.toHaveBeenCalled();
    },
  );
});
