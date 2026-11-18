import type { CopyDto } from "../../../src/shared/schemas/copies";

export const copyDto = (overrides: Partial<CopyDto> = {}): CopyDto => ({
  id: "c1",
  productId: "p1",
  angle: "manual",
  customAngle: null,
  primaryText: "Corré sin límites",
  headline: "Livianas de verdad",
  description: "Envío gratis",
  source: "manual",
  edited: false,
  status: "saved",
  favorite: false,
  policyRisk: "none",
  policyNote: null,
  overLimit: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});
