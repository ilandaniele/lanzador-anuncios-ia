import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { signInCookieHeader } from "./session.mjs";

const LCP_BUDGET_MS = 2500;
const WORKSPACE_ID = "seed-workspace-a";
const SLOW_4G = {
  rttMs: 150,
  throughputKbps: 1638.4,
  cpuSlowdownMultiplier: 4,
};

const SCREENS = [
  { name: "login", path: "/login", authenticated: false },
  { name: "hoy", path: `/w/${WORKSPACE_ID}/hoy`, authenticated: true },
  {
    name: "metricas",
    path: `/w/${WORKSPACE_ID}/metricas`,
    authenticated: true,
  },
];

function parseOrigin(argument) {
  if (!argument) throw new Error("Usage: lighthouse.mjs <base-url>");
  return new URL(argument).origin;
}

async function measureLcp(chrome, url, extraHeaders) {
  const { lhr } = await lighthouse(url, {
    port: chrome.port,
    logLevel: "error",
    output: "json",
    onlyCategories: ["performance"],
    formFactor: "mobile",
    screenEmulation: {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    },
    throttlingMethod: "simulate",
    throttling: SLOW_4G,
    extraHeaders,
  });
  if (new URL(lhr.finalDisplayedUrl).pathname !== new URL(url).pathname)
    throw new Error(`${url} redirected to ${lhr.finalDisplayedUrl}`);
  const lcp = lhr.audits["largest-contentful-paint"].numericValue;
  if (lcp === undefined || lcp === null)
    throw new Error(`No LCP measured for ${url}`);
  return lcp;
}

async function main() {
  const origin = parseOrigin(process.argv[2]);
  const cookie = await signInCookieHeader(origin);
  const chrome = await launch({
    chromeFlags: ["--headless=new", "--no-sandbox"],
  });

  try {
    const results = [];
    for (const { name, path, authenticated } of SCREENS) {
      const headers = authenticated ? { Cookie: cookie } : undefined;
      const lcp = await measureLcp(chrome, `${origin}${path}`, headers);
      results.push({ name, lcp });
      console.log(`${name.padEnd(9)} LCP ${Math.round(lcp)} ms`);
    }
    const slow = results.filter(({ lcp }) => lcp >= LCP_BUDGET_MS);
    for (const { name, lcp } of slow)
      console.error(
        `FAIL ${name}: LCP ${Math.round(lcp)} ms >= ${LCP_BUDGET_MS} ms`,
      );
    process.exitCode = slow.length > 0 ? 1 : 0;
  } finally {
    await chrome.kill();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
