import type { AiProvider } from "./integrations/ai/provider";

export interface Env {
  DB: D1Database;
  AI?: Ai;
  AI_PROVIDER?: AiProvider;
  LAUNCH_WF: Workflow;
  LAUNCH_ITEM_WF: Workflow;
  JOB_WF?: Workflow;
  RL_IP: RateLimit;
  RL_USER: RateLimit;
  RL_AUTH: RateLimit;
  RL_EXP: RateLimit;
  RL_UPL: RateLimit;
  RL_POLL: RateLimit;
  RL_CLIENT_ERR: RateLimit;

  APP_ORIGIN: string;
  ENVIRONMENT: "production" | "preview" | "development";
  GRAPH_API_VERSION: string;
  META_APP_ID: string;
  META_LOGIN_CONFIG_ID: string;
  TOKEN_ENC_KEY_CURRENT: number;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_PICKER_API_KEY: string;
  GOOGLE_PROJECT_NUMBER: string;
  EMAIL_FROM: string;
  WORKERS_AI_TEXT_MODEL: string;
  WORKERS_AI_CHAT_MODEL: string;
  WORKERS_AI_VISION_MODEL: string;
  WORKERS_AI_DAILY_NEURON_CAP: number;
  SUPERADMIN_EMAIL: string;

  META_APP_SECRET: string;
  TOKEN_ENC_KEY_V1: string;
  GOOGLE_CLIENT_SECRET: string;
  RESEND_API_KEY: string;
  E2E_SECRET?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_CODE?: string;
}
