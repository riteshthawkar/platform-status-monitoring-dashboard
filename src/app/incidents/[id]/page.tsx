"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Loader2, Send, ShieldCheck, UserRound, Wrench } from "lucide-react";
import { Incident, IncidentAssignment, IncidentUpdate, MaintenanceWindow, ServiceOwner, TeamMember } from "@/types";

interface IncidentDetailResponse {
  incident: Incident;
  updates: IncidentUpdate[];
  assignments: IncidentAssignment[];
  service: {
    id: string;
    name: string;
    group: string;
    url: string;
    description: string;
  } | null;
  serviceOwner: ServiceOwner | null;
  activeMaintenance: MaintenanceWindow | null;
  teamMembers: TeamMember[];
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const incidentId = params?.id;
  const [data, setData] = useState<IncidentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Incident["status"]>("investigating");
  const [submitting, setSubmitting] = useState(false);
  const [ownerMemberId, setOwnerMemberId] = useState("");
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  async function fetchIncident() {
    if (!incidentId) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      setStatus(json.incident.status);
      setOwnerMemberId(
        json.incident.ownerMemberId
          ? String(json.incident.ownerMemberId)
          : json.serviceOwner?.memberId
            ? String(json.serviceOwner.memberId)
            : ""
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchIncident();
  }, [incidentId]);

  const statusColor = useMemo(() => {
    switch (data?.incident.status) {
      case "resolved":
        return "var(--color-operational)";
      case "monitoring":
        return "var(--color-maintenance)";
      case "identified":
        return "var(--color-degraded)";
      default:
        return "var(--color-down)";
    }
  }, [data?.incident.status]);

  async function submitUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "update",
          incidentId: data.incident.id,
          message,
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage("");
      await fetchIncident();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function resolveIncident() {
    if (!data) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "resolve",
          incidentId: data.incident.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchIncident();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveOnCallOwner() {
    if (!data) return;
    setOwnerSaving(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "assign-owner",
          incidentId: data.incident.id,
          memberId: ownerMemberId ? parseInt(ownerMemberId, 10) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchIncident();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOwnerSaving(false);
    }
  }

  async function acknowledgeCurrentIncident() {
    if (!data || !ownerMemberId) return;
    setAcknowledging(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "acknowledge",
          incidentId: data.incident.id,
          memberId: parseInt(ownerMemberId, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchIncident();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAcknowledging(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <div className="text-center">
          <p className="text-sm mb-2" style={{ color: "var(--color-down)" }}>Failed to load incident</p>
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>{error || "Unknown error"}</p>
          <Link href="/" className="text-xs underline" style={{ color: "var(--foreground)" }}>
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="max-w-[980px] mx-auto px-6 py-6">
        <header className="flex items-center justify-between mb-8" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
          <div className="flex items-center gap-4">
            <Link
              href={data.service?.group ? `/projects/${data.service.group}` : "/"}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
              style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {data.service?.group ? "Project" : "Projects"}
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold">{data.incident.title}</h1>
                <span
                  className="text-[10px] uppercase px-1.5 py-0.5 rounded"
                  style={{ color: statusColor, background: `color-mix(in srgb, ${statusColor} 10%, transparent)` }}
                >
                  {data.incident.status}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                Incident #{data.incident.id} · {data.service?.name || data.incident.serviceId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.incident.status !== "resolved" && (
              <button
                onClick={acknowledgeCurrentIncident}
                disabled={acknowledging || !ownerMemberId || !!data.incident.acknowledgedAt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
                style={{
                  background: data.incident.acknowledgedAt ? "color-mix(in srgb, var(--color-operational) 14%, transparent)" : "var(--background-secondary)",
                  color: data.incident.acknowledgedAt ? "var(--color-operational)" : "var(--foreground)",
                  border: data.incident.acknowledgedAt ? "1px solid color-mix(in srgb, var(--color-operational) 28%, transparent)" : "1px solid var(--border)",
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {data.incident.acknowledgedAt ? "Acknowledged" : acknowledging ? "Acknowledging..." : "Acknowledge"}
              </button>
            )}
            {data.incident.status !== "resolved" && (
              <button
                onClick={resolveIncident}
                disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Resolve
              </button>
            )}
          </div>
        </header>

        {error && (
          <div
            className="mb-4 px-3 py-2 rounded-md text-xs"
            style={{
              color: "var(--color-down)",
              background: "color-mix(in srgb, var(--color-down) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-down) 15%, transparent)",
            }}
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-[1.2fr_0.8fr] gap-6">
          <section className="space-y-6">
            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                Incident Overview
              </h2>
              <p className="text-sm leading-6" style={{ color: "var(--foreground)" }}>
                {data.incident.description || "No detailed incident description yet."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{
                    color: data.incident.acknowledgedAt ? "var(--color-operational)" : "var(--color-degraded)",
                    background: data.incident.acknowledgedAt
                      ? "color-mix(in srgb, var(--color-operational) 10%, transparent)"
                      : "color-mix(in srgb, var(--color-degraded) 10%, transparent)",
                  }}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {data.incident.acknowledgedAt
                    ? `Acknowledged by ${data.incident.acknowledgedByName || "team member"}`
                    : "Awaiting acknowledgement"}
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                  style={{
                    color: data.incident.ownerMemberName ? "var(--foreground)" : "var(--muted)",
                    background: "var(--background-secondary)",
                  }}
                >
                  <UserRound className="w-3 h-3" />
                  {data.incident.ownerMemberName ? `On-call: ${data.incident.ownerMemberName}` : "On-call owner unassigned"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--muted-2)" }}>
                <span>Created {new Date(data.incident.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                <span>&middot;</span>
                <span>Updated {new Date(data.incident.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                {data.incident.acknowledgedAt && (
                  <>
                    <span>&middot;</span>
                    <span>Acknowledged {new Date(data.incident.acknowledgedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </>
                )}
                {data.incident.resolvedAt && (
                  <>
                    <span>&middot;</span>
                    <span>Resolved {new Date(data.incident.resolvedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                Timeline
              </h2>
              <div className="space-y-3">
                {data.updates.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--muted)" }}>No timeline updates yet.</p>
                ) : (
                  data.updates.map((update) => (
                    <div key={update.id} className="rounded-md p-3" style={{ background: "var(--background-secondary)" }}>
                      <div className="flex items-center gap-2 mb-1 text-[11px]" style={{ color: "var(--muted-2)" }}>
                        <Clock className="w-3 h-3" />
                        {new Date(update.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        <span>&middot;</span>
                        <span style={{ color: statusColor }}>{update.status}</span>
                      </div>
                      <p className="text-sm" style={{ color: "var(--foreground)" }}>{update.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                Add Update
              </h2>
              <form onSubmit={submitUpdate} className="space-y-3">
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share investigation progress, mitigation steps, or resolution details..."
                  className="w-full px-3 py-2 rounded-md text-xs resize-none outline-none"
                  style={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                />
                <div className="flex items-center justify-between gap-3">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Incident["status"])}
                    className="text-xs px-3 py-2 rounded-md outline-none"
                    style={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                  >
                    <option value="investigating">Investigating</option>
                    <option value="identified">Identified</option>
                    <option value="monitoring">Monitoring</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-40"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    Post Update
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
                <UserRound className="w-3.5 h-3.5" />
                On-Call Ownership
              </h2>
              <div className="space-y-3">
                <select
                  value={ownerMemberId}
                  onChange={(e) => setOwnerMemberId(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-md outline-none"
                  style={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                >
                  <option value="">Unassigned</option>
                  {data.teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} ({member.role})
                    </option>
                  ))}
                </select>
                <button
                  onClick={saveOnCallOwner}
                  disabled={ownerSaving || ownerMemberId === String(data.incident.ownerMemberId ?? "")}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-40"
                  style={{ background: "var(--background-secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                >
                  {ownerSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserRound className="w-3.5 h-3.5" />}
                  {ownerSaving ? "Saving..." : "Update On-Call Owner"}
                </button>
                <p className="text-[11px] leading-5" style={{ color: "var(--muted)" }}>
                  The on-call owner is the active responder for this incident and is included in prolonged escalation routing.
                </p>
              </div>
            </div>

            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                Service Context
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-[11px]" style={{ color: "var(--muted-2)" }}>Service</div>
                  <div>{data.service?.name || data.incident.serviceId}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: "var(--muted-2)" }}>Primary Owner</div>
                  <div>{data.serviceOwner?.memberName || "Unassigned"}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: "var(--muted-2)" }}>On-Call Owner</div>
                  <div>{data.incident.ownerMemberName || "Unassigned"}</div>
                </div>
                <div>
                  <div className="text-[11px]" style={{ color: "var(--muted-2)" }}>Acknowledgement</div>
                  <div>
                    {data.incident.acknowledgedAt
                      ? `${data.incident.acknowledgedByName || "Team member"} · ${new Date(data.incident.acknowledgedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                      : "Not acknowledged"}
                  </div>
                </div>
                {data.service?.url && (
                  <a href={data.service.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: "var(--muted)" }}>
                    Open endpoint
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: "var(--muted)" }}>
                Assignments
              </h2>
              {data.assignments.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  No assignments yet. Use the <Link href="/team" className="underline">team page</Link> to assign this incident.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-md p-3" style={{ background: "var(--background-secondary)" }}>
                      <div className="text-sm">{assignment.assigneeName}</div>
                      <div className="text-[11px] mt-1" style={{ color: "var(--muted-2)" }}>
                        {assignment.status.replace("_", " ")}
                        {assignment.deadline && ` · Due ${new Date(assignment.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.activeMaintenance && (
              <div className="rounded-lg p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <h2 className="text-[11px] font-medium uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: "var(--muted)" }}>
                  <Wrench className="w-3.5 h-3.5" style={{ color: "var(--color-maintenance)" }} />
                  Active Maintenance
                </h2>
                <div className="text-sm">{data.activeMaintenance.title}</div>
                <div className="text-[11px] mt-1" style={{ color: "var(--muted-2)" }}>
                  Until {new Date(data.activeMaintenance.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                {data.activeMaintenance.notes && (
                  <p className="text-[11px] mt-2" style={{ color: "var(--muted)" }}>{data.activeMaintenance.notes}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
