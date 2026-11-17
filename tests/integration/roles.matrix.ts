import type { RoleRule } from "../helpers/security-probes";

export const ROLE_MATRIX: Record<string, RoleRule> = {
  "GET /api/w/:wid": "viewer",
  "PATCH /api/w/:wid": "admin",
  "DELETE /api/w/:wid": "owner",
  "GET /api/w/:wid/settings": "viewer",
  "PATCH /api/w/:wid/settings": "admin",
  "GET /api/w/:wid/members": "viewer",
  "PATCH /api/w/:wid/members/:userId": "admin",
  "DELETE /api/w/:wid/members/:userId": { min: "admin", self: true },
  "POST /api/w/:wid/transfer-ownership": "owner",
  "GET /api/w/:wid/invitations": "admin",
  "POST /api/w/:wid/invitations": "admin",
  "DELETE /api/w/:wid/invitations/:id": "admin",
  "GET /api/w/:wid/products": "viewer",
  "POST /api/w/:wid/products": "editor",
  "GET /api/w/:wid/products/:id": "viewer",
  "PATCH /api/w/:wid/products/:id": "editor",
  "POST /api/w/:wid/products/:id/duplicate": "editor",
  "POST /api/w/:wid/products/:id/archive": "editor",
  "POST /api/w/:wid/products/:id/check-landing": "editor",
};
