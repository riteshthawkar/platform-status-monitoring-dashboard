// ============================================================
// Platform Status Monitoring Dashboard - Type Definitions
// ============================================================

export type ServiceStatus = "operational" | "degraded" | "down" | "maintenance" | "unknown";

export type ServiceCategory =
  | "chatbot_backend"
  | "ai_agent_platform"
  | "database"
  | "external_api"
  | "infrastructure"
  | "other";

export type CheckType = "http" | "tcp" | "keyword" | "json_query";
export type ProbeTier = "core" | "llm_preflight" | "llm_generation" | "llm_synthetic";

export interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  category: ServiceCategory;
  group: string; // Product group ID (e.g., "mbzuai", "lawa-rag", "external")
  url: string;
  checkType: CheckType;
  checkIntervalSeconds: number;
  timeoutMs: number;
  expectedStatusCode?: number;
  expectedKeyword?: string; // For keyword checks
  jsonPath?: string; // For JSON query checks (e.g., "status" to check response.status)
  jsonExpectedValue?: string;
  jsonMinLength?: number;
  jsonFailureKeywords?: string[];
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "HEAD";
  body?: string;
  // Probe optimization metadata (optional; safe defaults are inferred when omitted).
  probeTier?: ProbeTier;
  tokenCostEstimate?: number;
  enabled: boolean;
  tags?: string[];
}

export interface ServiceGroup {
  id: string;
  name: string;
  shortName: string;
  description: string;
  icon: string; // Lucide icon name
  baseUrl: string;
  repo?: string;
  color: string; // Tailwind color class prefix (e.g., "indigo", "emerald")
}

export interface HealthCheckResult {
  id?: number;
  serviceId: string;
  timestamp: string;
  status: ServiceStatus;
  responseTimeMs: number;
  statusCode: number | null;
  errorMessage: string | null;
}

export interface ServiceOwner {
  serviceId: string;
  memberId: number | null;
  memberName: string | null;
  memberEmail: string | null;
  memberRole: string | null;
  updatedAt: string;
}

export interface ServiceDeployment {
  id?: number;
  serviceId: string;
  serviceName?: string;
  serviceGroup?: string;
  environment: string;
  version: string;
  commitSha: string | null;
  deployedBy: string | null;
  deployedAt: string;
  notes: string | null;
  createdAt: string;
}

export interface MaintenanceWindow {
  id?: number;
  serviceId: string;
  serviceName?: string;
  serviceGroup?: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelledAt: string | null;
  isActive?: boolean;
  isUpcoming?: boolean;
}

export interface ServiceWithStatus extends ServiceConfig {
  currentStatus: ServiceStatus;
  lastChecked: string | null;
  lastResponseTime: number | null;
  uptimePercent24h: number;
  uptimePercent7d: number;
  uptimePercent30d: number;
  recentChecks: HealthCheckResult[];
  owner: ServiceOwner | null;
  activeMaintenance: MaintenanceWindow | null;
  latestDeployment: ServiceDeployment | null;
}

export interface Incident {
  id?: number;
  serviceId: string;
  title: string;
  description: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  ownerMemberId: number | null;
  ownerMemberName?: string | null;
  ownerMemberEmail?: string | null;
  acknowledgedAt: string | null;
  acknowledgedByMemberId: number | null;
  acknowledgedByName?: string | null;
  acknowledgedByEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface IncidentUpdate {
  id?: number;
  incidentId: number;
  message: string;
  status: Incident["status"];
  createdAt: string;
}

export interface DashboardSummary {
  totalServices: number;
  operational: number;
  degraded: number;
  down: number;
  maintenance: number;
  overallStatus: ServiceStatus;
  lastUpdated: string;
}

export interface UptimeBar {
  date: string;
  status: ServiceStatus;
  uptimePercent: number;
  totalChecks: number;
  failedChecks: number;
}

// ─── Team & Assignments ─────────────────────────────────────

export interface TeamMember {
  id?: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export type AssignmentStatus = "open" | "in_progress" | "resolved";

export interface IncidentAssignment {
  id?: number;
  incidentId: number;
  assigneeId: number;
  assigneeName?: string;
  assigneeEmail?: string;
  incidentTitle?: string;
  incidentSeverity?: string;
  serviceId?: string;
  notes: string | null;
  deadline: string | null;
  status: AssignmentStatus;
  createdAt: string;
  updatedAt: string;
}
