export type ServiceStatus= "healthy" | "degraded" | "down";

export interface Metrics{
    successRate: number;
    errorRate: number;
    p95Ms: number;
}
export interface Service {
  id: string;
  name: string;
  status: ServiceStatus;
  current: Metrics;
  /** 7-day normal. Doubles as the recovery target after a successful fix. */
  baseline: Metrics;
}
export interface Deployment {
  id: string;
  serviceId: string;
  version: string;
  previousVersion: string | null;
  deployedMinutesAgo: number;
  author: string;
  summary: string;
  status: "active" | "superseded" | "rolled_back";
}
export interface LogEntry {
  id: string;
  serviceId: string;
  atMinutesAgo: number;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  traceId?: string;
}
export interface Dependency {
  from: string;
  to: string;
  callsPerMin: number;
}
export interface Incident {
  id: string;
  title: string;
  status: "active" | "mitigating" | "resolved";
  startedMinutesAgo: number;
  affectedServiceIds: string[];
  resolutionSummary: string | null;
}
export interface Finding {
  id: string;
  summary: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
  recordedAt: number;
}
export type PlanAction = "rollback_deployment" | "restart_service" | "set_feature_flag";
export type PlanStatus = "awaiting_approval" | "approved" | "rejected" | "used";

export interface Plan {
  id: string;
  rootCause: string;
  rationale: string;
  action: PlanAction;
  params: Record<string, unknown>;
  risk: "low" | "medium" | "high";
  expectedRecovery: "low" | "medium" | "high";
  status: PlanStatus;
  rejectionReason?: string;
}

export interface LogFilter {
  serviceId?: string;
  level?: LogEntry["level"];
  contains?: string;
}

export interface SystemState {
  services: Service[];
  deployments: Deployment[];
  logs: LogEntry[];
  dependencies: Dependency[];
  incident: Incident;
  findings: Finding[];
  toolCalls: ToolCall[];
  plans: Plan[];
  /** Set by read tools so the human watches the agent look around. */
  focusedServiceId: string | null;
  logFilter: LogFilter | null;
  webmcp: {available: boolean; registered: string[]};
}
export interface ToolCall{
    id: string;
    tool: string;
    args: Record<string, unknown>;
    at: number;
    status: "pending" | "ok" | "error";
    note?: string;
}
