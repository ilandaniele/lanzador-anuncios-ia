import { createApp } from "./app";
import { scheduled } from "./scheduled";

export { JobWorkflow } from "../workflows/job-workflow";

export default { fetch: createApp().fetch, scheduled };
