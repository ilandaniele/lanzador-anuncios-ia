const CACHE_ORIGIN = "https://edge-cache.internal";

export async function cachedJson<T>(
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const request = new Request(`${CACHE_ORIGIN}/${key}`);
  const hit = await caches.default.match(request);
  if (hit) return hit.json<T>();
  const value = await load();
  await caches.default.put(
    request,
    Response.json(value, {
      headers: { "Cache-Control": `max-age=${ttlSeconds}` },
    }),
  );
  return value;
}
