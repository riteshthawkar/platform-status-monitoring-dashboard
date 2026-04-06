import test from "node:test";
import assert from "node:assert/strict";

import {
  hasValidApiKey,
  hasValidDashboardCredentials,
  validateApiKey,
} from "../src/lib/auth";
import {
  getHostnameFromHostHeader,
  isDashboardAuthRequiredInProduction,
  isLocalHost,
  shouldRedirectToHttps,
} from "../src/lib/security";

function envWith(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("validateApiKey allows requests when no auth config is present", () => {
  withEnv(
    {
      API_KEY: undefined,
      DASHBOARD_USERNAME: undefined,
      DASHBOARD_PASSWORD: undefined,
    },
    () => {
      const request = new Request("http://example.com/api/team", { method: "POST" });
      assert.equal(validateApiKey(request), true);
    }
  );
});

test("validateApiKey accepts x-api-key when API_KEY is configured", () => {
  withEnv(
    {
      API_KEY: "secret-key",
      DASHBOARD_USERNAME: undefined,
      DASHBOARD_PASSWORD: undefined,
    },
    () => {
      const request = new Request("http://example.com/api/team", {
        method: "POST",
        headers: { "x-api-key": "secret-key" },
      });
      assert.equal(hasValidApiKey(request), true);
      assert.equal(validateApiKey(request), true);
    }
  );
});

test("validateApiKey accepts dashboard basic auth credentials", () => {
  withEnv(
    {
      API_KEY: undefined,
      DASHBOARD_USERNAME: "ops",
      DASHBOARD_PASSWORD: "super-secret",
    },
    () => {
      const token = Buffer.from("ops:super-secret").toString("base64");
      const request = new Request("http://example.com/api/team", {
        method: "POST",
        headers: { authorization: `Basic ${token}` },
      });
      assert.equal(hasValidDashboardCredentials(request), true);
      assert.equal(validateApiKey(request), true);
    }
  );
});

test("validateApiKey rejects bad credentials when auth is configured", () => {
  withEnv(
    {
      API_KEY: "secret-key",
      DASHBOARD_USERNAME: "ops",
      DASHBOARD_PASSWORD: "super-secret",
    },
    () => {
      const badBasic = Buffer.from("ops:wrong").toString("base64");
      const request = new Request("http://example.com/api/team", {
        method: "POST",
        headers: { authorization: `Basic ${badBasic}` },
      });
      assert.equal(validateApiKey(request), false);
    }
  );
});

test("security helpers identify local hosts and normalize host headers", () => {
  assert.equal(isLocalHost("localhost"), true);
  assert.equal(isLocalHost("127.0.0.1"), true);
  assert.equal(isLocalHost("example.com"), false);
  assert.equal(getHostnameFromHostHeader("example.com:3000"), "example.com");
});

test("HTTPS redirect is enforced for non-local production requests", () => {
  const env = envWith({ NODE_ENV: "production", ENFORCE_HTTPS: "true" });
  assert.equal(
    shouldRedirectToHttps({
      url: "http://status.example.com/projects/mbzuai",
      hostHeader: "status.example.com",
      forwardedProto: "http",
      pathname: "/projects/mbzuai",
      env,
    }),
    true
  );
  assert.equal(
    shouldRedirectToHttps({
      url: "http://localhost:3000/projects/mbzuai",
      hostHeader: "localhost:3000",
      forwardedProto: "http",
      pathname: "/projects/mbzuai",
      env,
    }),
    false
  );
  assert.equal(
    shouldRedirectToHttps({
      url: "http://status.example.com/api/health-status",
      hostHeader: "status.example.com",
      forwardedProto: "http",
      pathname: "/api/health-status",
      env,
    }),
    false
  );
});

test("production requires dashboard auth unless explicitly overridden", () => {
  assert.equal(
    isDashboardAuthRequiredInProduction(envWith({ NODE_ENV: "production" })),
    true
  );
  assert.equal(
    isDashboardAuthRequiredInProduction({
      ...envWith({ NODE_ENV: "production" }),
      ALLOW_INSECURE_DASHBOARD: "true",
    } as NodeJS.ProcessEnv),
    false
  );
  assert.equal(
    isDashboardAuthRequiredInProduction(envWith({ NODE_ENV: "development" })),
    false
  );
});
