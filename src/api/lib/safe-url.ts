export type UrlRejection =
  | "invalid_url"
  | "not_https"
  | "credentials"
  | "port"
  | "ip_literal"
  | "internal_host";

export type SafeUrlResult = { url: URL } | { rejection: UrlRejection };

export interface SafeUrlOptions {
  base?: string;
  blockedHosts?: readonly string[];
}

const IPV4_HOST = /^\d{1,3}(\.\d{1,3}){3}$/;
const INTERNAL_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "corp",
  "lan",
  "home.arpa",
  "svc",
  "nip.io",
  "sslip.io",
  "localtest.me",
];

const isIpLiteral = (host: string) =>
  host.startsWith("[") || IPV4_HOST.test(host);

const hasSuffix = (host: string, suffix: string) =>
  host === suffix || host.endsWith(`.${suffix}`);

const isInternalHost = (host: string, blockedHosts: readonly string[]) =>
  !host.includes(".") ||
  host.split(".").includes("") ||
  INTERNAL_SUFFIXES.some((suffix) => hasSuffix(host, suffix)) ||
  blockedHosts.includes(host);

const rejectionFor = (
  url: URL,
  blockedHosts: readonly string[],
): UrlRejection | null => {
  if (url.protocol !== "https:") return "not_https";
  if (url.username || url.password) return "credentials";
  if (url.port) return "port";
  const host = url.hostname.replace(/\.+$/, "");
  if (isIpLiteral(host)) return "ip_literal";
  if (isInternalHost(host, blockedHosts)) return "internal_host";
  return null;
};

export function parseSafeUrl(
  raw: string,
  { base, blockedHosts = [] }: SafeUrlOptions = {},
): SafeUrlResult {
  if (!URL.canParse(raw, base)) return { rejection: "invalid_url" };
  const url = new URL(raw, base);
  const rejection = rejectionFor(url, blockedHosts);
  return rejection ? { rejection } : { url };
}
