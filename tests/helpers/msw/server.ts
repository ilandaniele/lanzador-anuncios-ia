import { FetchInterceptor } from "@mswjs/interceptors/fetch";
import {
  defineNetwork,
  InMemoryHandlersController,
  InterceptorSource,
} from "msw/experimental";

// msw/node pulls ClientRequestInterceptor, which reads a wasm file from disk at
// import time and cannot run in workerd. Workers only use global fetch, so the
// network is built from the fetch interceptor alone.
export const server = defineNetwork({
  sources: [new InterceptorSource({ interceptors: [new FetchInterceptor()] })],
  handlers: new InMemoryHandlersController([]),
  onUnhandledFrame: "error",
});
