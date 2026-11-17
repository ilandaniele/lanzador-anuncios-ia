import { MetaError } from "./errors";

const GRAPH_PATH = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;
const DOT_SEGMENT = /^\.{1,2}$/;

const isGraphPath = (path: string) =>
  GRAPH_PATH.test(path) &&
  !path.split("/").some((segment) => DOT_SEGMENT.test(segment));

export function assertGraphPath(path: string): string {
  if (isGraphPath(path)) return path;
  throw new MetaError({
    kind: "param",
    code: 0,
    message: "Invalid Meta Graph path",
  });
}
