import type { Env } from "../../env";

type EmailEnv = Pick<Env, "SUPERADMIN_EMAIL" | "REVIEWER_EMAIL">;

const sameEmail = (configured: string | undefined, email: string) => {
  const normalized = configured?.trim().toLowerCase() ?? "";
  return normalized !== "" && normalized === email;
};

export const isSuperadminEmail = (env: EmailEnv, email: string) =>
  sameEmail(env.SUPERADMIN_EMAIL, email);

export const isReviewerEmail = (env: EmailEnv, email: string) =>
  sameEmail(env.REVIEWER_EMAIL, email);
