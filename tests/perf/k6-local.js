import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";

const BASE_URL = __ENV.BASE_URL || "http://localhost:8787";
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const WORKSPACE_ID = "seed-workspace-a";
const PUBLIC_ENDPOINTS = ["/api/health"];
const SESSION_ENDPOINTS = ["/api/me", `/api/w/${WORKSPACE_ID}/products`];

export const options = {
  vus: 3,
  duration: "10s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

function hostOf(url) {
  const match = /^https?:\/\/([^/:]+|\[[^\]]+\])/.exec(url);
  return match ? match[1] : "";
}

export function setup() {
  if (!LOCAL_HOSTS.includes(hostOf(BASE_URL)))
    exec.test.abort(`Refusing non-local target: ${BASE_URL}`);
  const cookie = __ENV.SESSION_COOKIE;
  return cookie
    ? {
        headers: { Cookie: cookie },
        endpoints: [...PUBLIC_ENDPOINTS, ...SESSION_ENDPOINTS],
      }
    : { headers: {}, endpoints: PUBLIC_ENDPOINTS };
}

export default function ({ headers, endpoints }) {
  for (const path of endpoints) {
    const response = http.get(`${BASE_URL}${path}`, { headers });
    check(response, { [`${path} answered`]: (r) => r.status === 200 });
  }
  sleep(1);
}
