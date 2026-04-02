#!/usr/bin/env tsx
// ============================================================
// Service Discovery & Config Generator
// Usage: npx tsx src/scripts/add-service.ts <repo-url> <deployed-url> [group-id]
//
// Examples:
//   npx tsx src/scripts/add-service.ts https://github.com/user/my-app https://my-app.ondigitalocean.app
//   npx tsx src/scripts/add-service.ts https://github.com/user/my-app http://139.59.4.82:8080 my-platform
// ============================================================

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ─── Types ──────────────────────────────────────────────────

interface ProbeResult {
  url: string;
  path: string;
  statusCode: number;
  contentType: string;
  body: string | null;
  json: Record<string, unknown> | null;
  responseTimeMs: number;
  error: string | null;
}

interface DiscoveredEndpoint {
  path: string;
  source: "probe" | "code";
  statusCode?: number;
  checkType: "http" | "json_query" | "keyword";
  jsonPath?: string;
  jsonExpectedValue?: string;
  expectedStatusCode?: number;
  expectedKeyword?: string;
  method: "GET" | "POST";
  description: string;
  name: string;
  category: string;
  tags: string[];
  interval: number;
  critical: boolean;
}

interface RepoAnalysis {
  framework: string;
  endpoints: string[];
  hasHealthCheck: boolean;
  hasOpenAPI: boolean;
  hasDocs: boolean;
  hasMetrics: boolean;
  ports: number[];
}

// ─── Constants ──────────────────────────────────────────────

const PROBE_PATHS = [
  "/",
  "/health",
  "/health/live",
  "/health/ready",
  "/health/detailed",
  "/api",
  "/api/health",
  "/api/v1/health",
  "/status",
  "/stats",
  "/docs",
  "/openapi.json",
  "/metrics",
  "/api/status",
];

const FRAMEWORK_PATTERNS: Record<string, { files: string[]; indicator: string }> = {
  fastapi: { files: ["main.py", "app.py", "app/main.py", "src/main.py"], indicator: "FastAPI|fastapi" },
  django: { files: ["manage.py", "settings.py", "urls.py"], indicator: "django|Django" },
  nextjs: { files: ["next.config.ts", "next.config.js", "next.config.mjs"], indicator: "next" },
  express: { files: ["server.js", "server.ts", "app.js", "app.ts", "index.js"], indicator: "express" },
  flask: { files: ["app.py", "wsgi.py"], indicator: "Flask|flask" },
};

// ─── Helpers ────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractRepoName(repoUrl: string): string {
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/);
  return match?.[1] || "unknown";
}

// ─── Repo Analysis ──────────────────────────────────────────

function analyzeRepo(repoUrl: string): RepoAnalysis {
  const tmpDir = path.join("/tmp", `service-discovery-${Date.now()}`);
  const result: RepoAnalysis = {
    framework: "unknown",
    endpoints: [],
    hasHealthCheck: false,
    hasOpenAPI: false,
    hasDocs: false,
    hasMetrics: false,
    ports: [],
  };

  try {
    console.log("\n📦 Cloning repository (shallow)...");
    execSync(`git clone --depth 1 "${repoUrl}" "${tmpDir}" 2>/dev/null`, { timeout: 30000 });

    // Detect framework
    for (const [fw, config] of Object.entries(FRAMEWORK_PATTERNS)) {
      for (const file of config.files) {
        const filePath = path.join(tmpDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, "utf-8");
          if (new RegExp(config.indicator).test(content)) {
            result.framework = fw;
            break;
          }
        }
      }
      // Also check subdirectories
      if (result.framework === "unknown") {
        try {
          const found = execSync(
            `find "${tmpDir}" -maxdepth 3 -name "${config.files[0]}" 2>/dev/null | head -1`,
            { encoding: "utf-8" }
          ).trim();
          if (found) {
            const content = fs.readFileSync(found, "utf-8");
            if (new RegExp(config.indicator).test(content)) {
              result.framework = fw;
            }
          }
        } catch {
          // ignore
        }
      }
      if (result.framework !== "unknown") break;
    }

    // Scan for endpoint patterns in Python files (FastAPI/Django/Flask)
    if (["fastapi", "django", "flask"].includes(result.framework)) {
      try {
        const pyFiles = execSync(
          `find "${tmpDir}" -name "*.py" -not -path "*/venv/*" -not -path "*/.venv/*" -not -path "*/node_modules/*" 2>/dev/null`,
          { encoding: "utf-8" }
        ).trim().split("\n").filter(Boolean);

        for (const pyFile of pyFiles) {
          const content = fs.readFileSync(pyFile, "utf-8");

          // FastAPI/Flask route patterns
          const routeMatches = content.matchAll(/@(?:app|router)\.(get|post|put|delete)\s*\(\s*["']([^"']+)["']/gi);
          for (const match of routeMatches) {
            result.endpoints.push(match[2]);
          }

          // Django URL patterns
          const djangoMatches = content.matchAll(/path\s*\(\s*["']([^"']+)["']/gi);
          for (const match of djangoMatches) {
            result.endpoints.push("/" + match[1].replace(/^\//, ""));
          }

          // Health check patterns
          if (/health|healthcheck|health_check/i.test(content)) {
            result.hasHealthCheck = true;
          }
          if (/openapi|swagger/i.test(content)) {
            result.hasOpenAPI = true;
          }
          if (/metrics|prometheus/i.test(content)) {
            result.hasMetrics = true;
          }
        }
      } catch {
        // ignore
      }
    }

    // Scan for Next.js API routes
    if (result.framework === "nextjs") {
      try {
        const routeFiles = execSync(
          `find "${tmpDir}" -path "*/api/*/route.*" -o -path "*/api/*/route.*" 2>/dev/null`,
          { encoding: "utf-8" }
        ).trim().split("\n").filter(Boolean);

        for (const routeFile of routeFiles) {
          const relative = routeFile.replace(tmpDir, "").replace(/\/src/, "").replace(/\/app/, "");
          const apiPath = relative.replace(/\/route\.(ts|js|tsx|jsx)$/, "");
          result.endpoints.push(apiPath);
        }
      } catch {
        // ignore
      }
    }

    // Scan for Express routes
    if (result.framework === "express") {
      try {
        const jsFiles = execSync(
          `find "${tmpDir}" -name "*.ts" -o -name "*.js" | grep -v node_modules | head -50`,
          { encoding: "utf-8" }
        ).trim().split("\n").filter(Boolean);

        for (const jsFile of jsFiles) {
          const content = fs.readFileSync(jsFile, "utf-8");
          const routeMatches = content.matchAll(/\.(get|post|put|delete)\s*\(\s*["']([^"']+)["']/gi);
          for (const match of routeMatches) {
            result.endpoints.push(match[2]);
          }
        }
      } catch {
        // ignore
      }
    }

    // Scan for port numbers
    try {
      const allFiles = execSync(
        `grep -rn "port.*=.*[0-9]\\{4\\}" "${tmpDir}" --include="*.py" --include="*.ts" --include="*.js" --include="*.env*" --include="*.yml" --include="*.yaml" --include="Dockerfile" 2>/dev/null | head -20`,
        { encoding: "utf-8" }
      ).trim();

      const portMatches = allFiles.matchAll(/(?:port|PORT)\s*[=:]\s*(\d{4,5})/gi);
      for (const match of portMatches) {
        const port = parseInt(match[1]);
        if (port >= 1000 && port <= 65535 && !result.ports.includes(port)) {
          result.ports.push(port);
        }
      }
    } catch {
      // ignore
    }

    // Deduplicate endpoints
    result.endpoints = [...new Set(result.endpoints)];

  } catch (err) {
    console.log("⚠️  Could not clone repo — will rely on live probing only");
  } finally {
    // Cleanup
    try {
      execSync(`rm -rf "${tmpDir}" 2>/dev/null`);
    } catch {
      // ignore
    }
  }

  return result;
}

// ─── Live Probing ───────────────────────────────────────────

async function probeEndpoint(baseUrl: string, probePath: string): Promise<ProbeResult> {
  const url = baseUrl.replace(/\/$/, "") + probePath;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "StatusDashboard/1.0" },
    });

    clearTimeout(timeout);
    const responseTime = Date.now() - start;
    const contentType = response.headers.get("content-type") || "";
    let body: string | null = null;
    let json: Record<string, unknown> | null = null;

    try {
      body = await response.text();
      if (contentType.includes("json") || (body.startsWith("{") || body.startsWith("["))) {
        json = JSON.parse(body);
      }
    } catch {
      // not JSON
    }

    return { url, path: probePath, statusCode: response.status, contentType, body, json, responseTimeMs: responseTime, error: null };
  } catch (err: unknown) {
    return {
      url,
      path: probePath,
      statusCode: 0,
      contentType: "",
      body: null,
      json: null,
      responseTimeMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeAllEndpoints(baseUrl: string, extraPaths: string[]): Promise<ProbeResult[]> {
  const allPaths = [...new Set([...PROBE_PATHS, ...extraPaths])];
  console.log(`\n🔍 Probing ${allPaths.length} endpoints on ${baseUrl}...`);

  const results: ProbeResult[] = [];
  // Probe in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < allPaths.length; i += 5) {
    const batch = allPaths.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map((p) => probeEndpoint(baseUrl, p))
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── Endpoint Classification ────────────────────────────────

function classifyEndpoints(
  probeResults: ProbeResult[],
  repoAnalysis: RepoAnalysis,
  groupId: string,
): DiscoveredEndpoint[] {
  const discovered: DiscoveredEndpoint[] = [];

  for (const probe of probeResults) {
    if (probe.error || probe.statusCode === 0) continue;
    // Skip 404s and 502/503 (not a real endpoint)
    if (probe.statusCode === 404 || probe.statusCode === 502 || probe.statusCode === 503) continue;

    const ep: DiscoveredEndpoint = {
      path: probe.path,
      source: "probe",
      statusCode: probe.statusCode,
      checkType: "http",
      expectedStatusCode: probe.statusCode,
      method: "GET",
      description: "",
      name: "",
      category: "chatbot_backend",
      tags: ["production"],
      interval: 120,
      critical: false,
    };

    // Classify by path and response
    if (probe.path === "/health" || probe.path.includes("/health")) {
      ep.critical = true;
      ep.interval = 30;

      if (probe.json) {
        ep.checkType = "json_query";

        // Check for status field
        if ("status" in probe.json) {
          ep.jsonPath = "status";
          ep.jsonExpectedValue = String(probe.json.status);
        } else if ("message" in probe.json) {
          ep.jsonPath = "message";
          ep.jsonExpectedValue = String(probe.json.message);
        }

        // Check for component-level fields
        if (probe.json.components && typeof probe.json.components === "object") {
          const components = probe.json.components as Record<string, unknown>;
          for (const [key, value] of Object.entries(components)) {
            discovered.push({
              path: probe.path,
              source: "probe",
              statusCode: probe.statusCode,
              checkType: "json_query",
              jsonPath: `components.${key}`,
              jsonExpectedValue: String(value),
              expectedStatusCode: probe.statusCode,
              method: "GET",
              description: `${key} component status (${probe.path} → components.${key})`,
              name: `${formatComponentName(key)}`,
              category: "chatbot_backend",
              tags: ["production", "critical", key.includes("db") || key.includes("database") ? "database" : key.includes("pinecone") || key.includes("vector") ? "vector-db" : "component"],
              interval: 60,
              critical: true,
            });
          }
        }

        // Check for checks.*.status pattern
        if (probe.json.checks && typeof probe.json.checks === "object") {
          const checks = probe.json.checks as Record<string, Record<string, unknown>>;
          for (const [key, check] of Object.entries(checks)) {
            if (check && typeof check === "object" && "status" in check) {
              discovered.push({
                path: probe.path,
                source: "probe",
                statusCode: probe.statusCode,
                checkType: "json_query",
                jsonPath: `checks.${key}.status`,
                jsonExpectedValue: String(check.status),
                expectedStatusCode: probe.statusCode,
                method: "GET",
                description: `${formatComponentName(key)} check (${probe.path} → checks.${key}.status)`,
                name: `${formatComponentName(key)}`,
                category: key === "system" || key === "disk" ? "infrastructure" : "chatbot_backend",
                tags: ["production", "critical", inferTag(key)],
                interval: 60,
                critical: true,
              });
            }
          }
        }
      }
    }

    // Name and describe the endpoint
    if (probe.path === "/") {
      ep.name = "Root Endpoint";
      ep.description = "Basic server liveness check";
      ep.critical = true;
      ep.interval = 30;
    } else if (probe.path === "/health") {
      ep.name = "Health Check";
      ep.description = "Primary health check endpoint";
    } else if (probe.path === "/health/live") {
      ep.name = "Liveness Probe";
      ep.description = "Kubernetes-style liveness probe";
      ep.critical = true;
      ep.interval = 30;
    } else if (probe.path === "/health/ready") {
      ep.name = "Readiness Probe";
      ep.description = "Kubernetes-style readiness probe";
      ep.interval = 60;
    } else if (probe.path === "/health/detailed") {
      ep.name = "Detailed Health";
      ep.description = "Deep health check with component status";
      ep.critical = true;
      ep.interval = 60;
    } else if (probe.path === "/api" || probe.path === "/api/") {
      ep.name = "API Root";
      ep.description = "API gateway routing check";
      ep.interval = 60;
    } else if (probe.path === "/docs") {
      ep.name = "Swagger Docs";
      ep.description = "Interactive API documentation";
      ep.category = "chatbot_backend";
      ep.tags = ["production", "docs"];
      ep.interval = 300;
    } else if (probe.path === "/openapi.json") {
      ep.name = "OpenAPI Spec";
      ep.description = "OpenAPI JSON specification";
      ep.tags = ["production", "docs"];
      ep.interval = 300;
    } else if (probe.path === "/metrics") {
      ep.name = "Prometheus Metrics";
      ep.description = "Prometheus metrics export endpoint";
      ep.category = "infrastructure";
      ep.tags = ["production", "monitoring"];
      ep.interval = 60;
      if (probe.body && probe.body.includes("http_requests_total")) {
        ep.checkType = "keyword";
        ep.expectedKeyword = "http_requests_total";
      }
    } else if (probe.path === "/stats") {
      ep.name = "Stats";
      ep.description = "Service statistics and uptime info";
      ep.tags = ["production", "analytics"];
      ep.interval = 120;
    } else if (probe.path === "/status") {
      ep.name = "Status";
      ep.description = "Service status endpoint";
      ep.interval = 60;
    } else {
      // Generic endpoint
      ep.name = formatPathName(probe.path);
      ep.description = `${probe.path} endpoint`;
      ep.interval = 120;
    }

    // JSON response validation for root/api
    if (probe.json && ep.checkType === "http") {
      if ("status" in probe.json) {
        ep.checkType = "json_query";
        ep.jsonPath = "status";
        ep.jsonExpectedValue = String(probe.json.status);
      } else if ("message" in probe.json) {
        ep.checkType = "json_query";
        ep.jsonPath = "message";
        ep.jsonExpectedValue = String(probe.json.message);
      }
    }

    // Auth endpoints that return 401/422 are valid
    if (probe.statusCode === 401 || probe.statusCode === 422) {
      ep.tags.push("auth");
    }

    discovered.push(ep);
  }

  return discovered;
}

function formatComponentName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatPathName(urlPath: string): string {
  const parts = urlPath.split("/").filter(Boolean);
  return parts
    .map((p) => p.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" — ");
}

function inferTag(key: string): string {
  if (key.includes("db") || key.includes("database") || key.includes("postgres") || key.includes("mysql")) return "database";
  if (key.includes("pinecone") || key.includes("vector") || key.includes("weaviate")) return "vector-db";
  if (key.includes("redis") || key.includes("cache")) return "cache";
  if (key.includes("disk") || key.includes("system") || key.includes("memory")) return "infrastructure";
  if (key.includes("celery") || key.includes("queue") || key.includes("worker")) return "queue";
  return "component";
}

// ─── Config Generation ──────────────────────────────────────

function generateConfig(
  endpoints: DiscoveredEndpoint[],
  baseUrl: string,
  groupId: string,
  groupName: string,
  repoUrl: string,
  repoAnalysis: RepoAnalysis,
): string {
  const constName = groupId.toUpperCase().replace(/-/g, "_") + "_BASE";
  const lines: string[] = [];

  // Base URL constant
  lines.push(`const ${constName} = "${baseUrl}";`);
  lines.push("");

  // Service Group
  lines.push("// Add this to the serviceGroups array:");
  lines.push(`{`);
  lines.push(`  id: "${groupId}",`);
  lines.push(`  name: "${groupName}",`);
  lines.push(`  shortName: "${groupName.split(" ").slice(0, 2).join(" ")}",`);
  lines.push(`  description: "${groupName} — ${repoAnalysis.framework} application",`);
  lines.push(`  icon: "${inferIcon(repoAnalysis.framework)}",`);
  lines.push(`  baseUrl: ${constName},`);
  lines.push(`  repo: "${repoUrl.replace("https://", "").replace(".git", "")}",`);
  lines.push(`  color: "${pickColor(groupId)}",`);
  lines.push(`},`);
  lines.push("");

  // Services
  lines.push("// Add these to the servicesConfig array:");
  lines.push(`// ${"═".repeat(55)}`);
  lines.push(`// ${groupName} (${repoAnalysis.framework})`);
  lines.push(`// ${"═".repeat(55)}`);
  lines.push("");

  for (const ep of endpoints) {
    const serviceId = `${groupId}-${slugify(ep.name)}`;
    lines.push(`{`);
    lines.push(`  id: "${serviceId}",`);
    lines.push(`  name: "${ep.name}",`);
    lines.push(`  description: "${ep.description}",`);
    lines.push(`  category: "${ep.category}",`);
    lines.push(`  group: "${groupId}",`);
    lines.push(`  url: \`\${${constName}}${ep.path}\`,`);
    lines.push(`  checkType: "${ep.checkType}",`);
    lines.push(`  checkIntervalSeconds: ${ep.interval},`);
    lines.push(`  timeoutMs: ${ep.critical ? 15000 : 10000},`);

    if (ep.checkType === "json_query") {
      lines.push(`  expectedStatusCode: ${ep.expectedStatusCode || 200},`);
      lines.push(`  jsonPath: "${ep.jsonPath}",`);
      lines.push(`  jsonExpectedValue: "${ep.jsonExpectedValue}",`);
    } else if (ep.checkType === "keyword") {
      lines.push(`  expectedKeyword: "${ep.expectedKeyword}",`);
    } else {
      lines.push(`  expectedStatusCode: ${ep.expectedStatusCode || 200},`);
    }

    lines.push(`  method: "${ep.method}",`);
    lines.push(`  enabled: true,`);
    lines.push(`  tags: ${JSON.stringify(ep.critical ? [...ep.tags.filter(t => t !== "critical"), "critical"] : ep.tags)},`);
    lines.push(`},`);
  }

  return lines.join("\n");
}

function inferIcon(framework: string): string {
  switch (framework) {
    case "fastapi": return "Zap";
    case "django": return "Server";
    case "nextjs": return "Globe";
    case "express": return "Server";
    case "flask": return "Beaker";
    default: return "Box";
  }
}

function pickColor(groupId: string): string {
  const colors = ["indigo", "teal", "cyan", "fuchsia", "lime", "orange", "emerald", "pink"];
  let hash = 0;
  for (const ch of groupId) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Service Discovery & Config Generator          ║");
  console.log("║   Platform Status Monitoring Dashboard          ║");
  console.log("╚══════════════════════════════════════════════════╝");

  let repoUrl = process.argv[2];
  let deployedUrl = process.argv[3];
  let groupId = process.argv[4];

  if (!repoUrl) {
    repoUrl = await ask("\n📂 GitHub repo URL: ");
  }
  if (!deployedUrl) {
    deployedUrl = await ask("🌐 Deployed base URL (e.g. https://app.example.com): ");
  }

  const repoName = extractRepoName(repoUrl);
  if (!groupId) {
    const suggested = slugify(repoName);
    groupId = await ask(`🏷️  Group ID [${suggested}]: `) || suggested;
  }

  const groupName = await ask(`📛 Display name [${repoName}]: `) || repoName;

  // Step 1: Analyze repo
  console.log("\n" + "─".repeat(50));
  const repoAnalysis = analyzeRepo(repoUrl);

  console.log(`\n📊 Repo Analysis:`);
  console.log(`   Framework: ${repoAnalysis.framework}`);
  console.log(`   Endpoints found in code: ${repoAnalysis.endpoints.length}`);
  console.log(`   Health check: ${repoAnalysis.hasHealthCheck ? "✅" : "❌"}`);
  console.log(`   OpenAPI/Swagger: ${repoAnalysis.hasOpenAPI ? "✅" : "❌"}`);
  console.log(`   Metrics: ${repoAnalysis.hasMetrics ? "✅" : "❌"}`);
  if (repoAnalysis.ports.length > 0) {
    console.log(`   Ports: ${repoAnalysis.ports.join(", ")}`);
  }
  if (repoAnalysis.endpoints.length > 0) {
    console.log(`   Code endpoints: ${repoAnalysis.endpoints.slice(0, 10).join(", ")}${repoAnalysis.endpoints.length > 10 ? "..." : ""}`);
  }

  // Step 2: Live probe the deployed URL
  console.log("\n" + "─".repeat(50));
  const extraPaths = repoAnalysis.endpoints.filter(
    (ep) => !PROBE_PATHS.includes(ep) && ep.startsWith("/")
  );
  const probeResults = await probeAllEndpoints(deployedUrl, extraPaths);

  const reachable = probeResults.filter((r) => !r.error && r.statusCode !== 0);
  const respondingPaths = reachable.filter((r) => r.statusCode !== 404 && r.statusCode < 500);

  console.log(`\n📡 Probe Results:`);
  console.log(`   Total probed: ${probeResults.length}`);
  console.log(`   Reachable: ${reachable.length}`);
  console.log(`   Valid endpoints: ${respondingPaths.length}`);
  console.log("");

  for (const r of probeResults) {
    const icon = r.error ? "❌" : r.statusCode === 404 ? "⬜" : r.statusCode >= 500 ? "🟡" : "✅";
    const status = r.error ? `ERR: ${r.error.substring(0, 40)}` : `${r.statusCode}`;
    const jsonInfo = r.json ? ` [JSON: ${Object.keys(r.json).join(", ")}]` : "";
    console.log(`   ${icon} ${r.path.padEnd(25)} ${status.padEnd(10)} ${r.responseTimeMs}ms${jsonInfo}`);
  }

  // Step 3: Classify and generate config
  console.log("\n" + "─".repeat(50));
  const endpoints = classifyEndpoints(probeResults, repoAnalysis, groupId);

  if (endpoints.length === 0) {
    console.log("\n⚠️  No valid endpoints discovered. Check that the deployed URL is correct and the service is running.");
    process.exit(1);
  }

  console.log(`\n🔧 Discovered ${endpoints.length} monitorable endpoints:`);
  for (const ep of endpoints) {
    const flag = ep.critical ? "🔴" : "🔵";
    console.log(`   ${flag} ${ep.name.padEnd(30)} ${ep.checkType.padEnd(12)} ${ep.path}`);
    if (ep.jsonPath) {
      console.log(`      └─ ${ep.jsonPath} = "${ep.jsonExpectedValue}"`);
    }
  }

  // Step 4: Output config
  console.log("\n" + "═".repeat(50));
  console.log("📋 Generated Configuration");
  console.log("═".repeat(50));

  const config = generateConfig(endpoints, deployedUrl, groupId, groupName, repoUrl, repoAnalysis);
  console.log("\n" + config);

  // Step 5: Optionally write to file
  const outputPath = path.join(process.cwd(), `generated-config-${groupId}.ts`);
  fs.writeFileSync(outputPath, config, "utf-8");
  console.log(`\n✅ Config saved to: ${outputPath}`);
  console.log("\nNext steps:");
  console.log(`  1. Review the generated config in ${outputPath}`);
  console.log("  2. Add the base URL constant to src/lib/services-config.ts (top)");
  console.log("  3. Add the ServiceGroup to the serviceGroups array");
  console.log("  4. Add the ServiceConfig entries to the servicesConfig array");
  console.log("  5. Run: npm run build && npm run dev (to verify)");
  console.log("  6. Deploy: git push && ssh droplet 'cd ... && deploy/update.sh'");
}

main().catch(console.error);
