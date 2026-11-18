const LEADING_SEPARATORS = /^[?&\s]+/;

export function finalLandingUrl(landingUrl: string, utm: string): string {
  const tags = utm.replace(LEADING_SEPARATORS, "").trim();
  if (!landingUrl || !tags) return landingUrl;
  const [base = "", ...hash] = landingUrl.split("#");
  const separator = base.includes("?") ? "&" : "?";
  const fragment = hash.length > 0 ? `#${hash.join("#")}` : "";
  return `${base}${separator}${tags}${fragment}`;
}
