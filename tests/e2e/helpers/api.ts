import {
  expect,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { csrfHeaders, retryWhileRateLimited, WORKSPACE_ID } from "./session";

export const workspaceApi = (path: string, workspaceId = WORKSPACE_ID) =>
  `/api/w/${workspaceId}${path}`;

export async function getJson<T>(
  request: APIRequestContext,
  path: string,
): Promise<T> {
  const response = await retryWhileRateLimited(() => request.get(path));
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as T;
}

export const sendJson = (
  request: APIRequestContext,
  method: "post" | "put" | "patch",
  path: string,
  origin: string,
  data: object = {},
) =>
  retryWhileRateLimited(() =>
    request[method](path, { headers: csrfHeaders(origin), data }),
  );

export async function expectApiError(
  response: APIResponse,
  status: number,
  code: string,
) {
  expect(response.status()).toBe(status);
  const body = (await response.json()) as { error: { code: string } };
  expect(body.error.code).toBe(code);
}
