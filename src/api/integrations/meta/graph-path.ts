import { MetaError } from "./errors";

const GRAPH_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const DOT_SEGMENT = /^\.{1,2}$/;

const isGraphPath = (path: string) =>
  GRAPH_PATH.test(path) &&
  !path.split("/").some((segment) => DOT_SEGMENT.test(segment));

const invalidGraphPath = () =>
  new MetaError({
    kind: "param",
    code: 0,
    message: "Invalid Meta Graph path",
  });

export function assertGraphPath(path: string): string {
  if (isGraphPath(path)) return path;
  throw invalidGraphPath();
}

const GRAPH_NODE_ID = /^\d+$/;

export function assertGraphIds(ids: readonly string[]): string {
  if (ids.length > 0 && ids.every((id) => GRAPH_NODE_ID.test(id))) {
    return ids.join(",");
  }
  throw invalidGraphPath();
}
