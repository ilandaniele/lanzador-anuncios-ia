import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../helpers/msw/server";

beforeAll(() => server.enable());
afterEach(() => server.resetHandlers());
afterAll(() => server.disable());
