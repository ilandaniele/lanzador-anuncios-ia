import type { D1Migration } from "cloudflare:test";
import type { Env as WorkerEnv } from "../src/api/env";
import type * as MainModule from "../src/api/index";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
    interface GlobalProps {
      mainModule: typeof MainModule;
    }
  }
}
