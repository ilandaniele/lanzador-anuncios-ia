import type { RoleRule } from "../helpers/security-probes";

export const ROLE_MATRIX: Record<string, RoleRule> = {
  "GET /api/w/:wid": "viewer",
  "PATCH /api/w/:wid": "admin",
  "DELETE /api/w/:wid": "owner",
  "GET /api/w/:wid/settings": "viewer",
  "PATCH /api/w/:wid/settings": "admin",
};
