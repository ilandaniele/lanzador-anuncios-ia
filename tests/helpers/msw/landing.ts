import { http, HttpResponse } from "msw";

export const landingResponds = (
  url: string,
  status: number,
  location?: string,
) =>
  http.get(
    url,
    () =>
      new HttpResponse(null, {
        status,
        headers: location ? { Location: location } : {},
      }),
  );
