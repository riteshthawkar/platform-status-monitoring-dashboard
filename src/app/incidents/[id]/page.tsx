"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Loader2, Send, ShieldCheck, UserRound, Wrench } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Incident, IncidentAssignment, IncidentUpdate, MaintenanceWindow, ServiceOwner, TeamMember } from "@/types";
import {
  accentButtonClass,
  cn,
  foregroundTextClass,
  mutedText2Class,
  mutedTextClass,
  pageClass,
  softSurfaceClass,
  subtleChipClass,
  surfaceClass,
  toneChipClasses,
  toneTextClasses,
} from "@/lib/ui";

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

type Tone = "operational" | "degraded" | "down" | "maintenance";

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
            : "",
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

  const statusTone = useMemo<Tone>(() => {
    switch (data?.incident.status) {
      case "resolved":
        return "operational";
      case "monitoring":
        return "maintenance";
      case "identified":
        return "degraded";
      default:
        return "down";
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
      <div className={cn(pageClass, "flex items-center justify-center")}>
        <Loader2 className={cn("h-5 w-5 animate-spin", mutedTextClass)} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={cn(pageClass, "flex items-center justify-center")}>
        <div className="text-center">
          <p className={cn("mb-2 text-sm", toneTextClasses.down)}>Failed to load incident</p>
          <p className={cn("mb-4 text-xs", mutedTextClass)}>{error || "Unknown error"}</p>
          <Link href="/" className={cn("text-xs underline", foregroundTextClass)}>
            Return to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={pageClass}>
      <AppHeader />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className={cn("text-lg font-semibold sm:text-xl", foregroundTextClass)}>
            Incident actions
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={data.service?.group ? `/projects/${data.service.group}` : "/"}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-2 text-xs transition-colors", softSurfaceClass, mutedTextClass)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {data.service?.group ? "Project" : "Projects"}
            </Link>
            {data.incident.status !== "resolved" && (
              <button
                onClick={acknowledgeCurrentIncident}
                disabled={acknowledging || !ownerMemberId || !!data.incident.acknowledgedAt}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium disabled:opacity-40",
                  data.incident.acknowledgedAt ? toneChipClasses.operational : cn(softSurfaceClass, foregroundTextClass),
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {data.incident.acknowledgedAt ? "Acknowledged" : acknowledging ? "Acknowledging..." : "Acknowledge"}
              </button>
            )}
            {data.incident.status !== "resolved" && (
              <button
                onClick={resolveIncident}
                disabled={submitting}
                className={cn("flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium disabled:opacity-40", accentButtonClass)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolve
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className={cn("mb-4 rounded-2xl px-3 py-2 text-xs", toneChipClasses.down)}>
            {error}
          </div>
        )}

        <section className={cn("mb-6 rounded-[28px] p-5 sm:p-6", surfaceClass)}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em]", mutedText2Class)}>
                  Incident room
                </p>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]", toneChipClasses[statusTone])}>
                  {data.incident.status}
                </span>
              </div>
              <h1 className={cn("mt-3 text-[24px] font-semibold leading-tight sm:text-[30px]", foregroundTextClass)}>
                {data.incident.title}
              </h1>
              <p className={cn("mt-2 text-sm", mutedTextClass)}>
                Incident #{data.incident.id} · {data.service?.name || data.incident.serviceId}
              </p>
            </div>

            <div className={cn("rounded-[22px] px-4 py-3", softSurfaceClass)}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className={mutedTextClass}>Current state</span>
                <span className={cn("font-semibold", toneTextClasses[statusTone])}>
                  {data.incident.status}
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6">
            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                Incident Overview
              </h2>
              <p className={cn("text-sm leading-6", foregroundTextClass)}>
                {data.incident.description || "No detailed incident description yet."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", data.incident.acknowledgedAt ? toneChipClasses.operational : toneChipClasses.degraded)}>
                  <ShieldCheck className="h-3 w-3" />
                  {data.incident.acknowledgedAt
                    ? `Acknowledged by ${data.incident.acknowledgedByName || "team member"}`
                    : "Awaiting acknowledgement"}
                </span>
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1", subtleChipClass, data.incident.ownerMemberName ? foregroundTextClass : mutedTextClass)}>
                  <UserRound className="h-3 w-3" />
                  {data.incident.ownerMemberName ? `On-call: ${data.incident.ownerMemberName}` : "On-call owner unassigned"}
                </span>
              </div>
              <div className={cn("mt-4 flex flex-wrap gap-2 text-[11px]", mutedText2Class)}>
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

            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                Timeline
              </h2>
              <div className="space-y-3">
                {data.updates.length === 0 ? (
                  <p className={cn("text-xs", mutedTextClass)}>No timeline updates yet.</p>
                ) : (
                  data.updates.map((update) => (
                    <div key={update.id} className="rounded-xl border border-white/5 bg-[var(--surface-glass-soft)] p-3">
                      <div className={cn("mb-1 flex items-center gap-2 text-[11px]", mutedText2Class)}>
                        <Clock className="h-3 w-3" />
                        {new Date(update.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        <span>&middot;</span>
                        <span className={toneTextClasses[statusTone]}>{update.status}</span>
                      </div>
                      <p className={cn("text-sm", foregroundTextClass)}>{update.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                Add Update
              </h2>
              <form onSubmit={submitUpdate} className="space-y-3">
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share investigation progress, mitigation steps, or resolution details..."
                  className={cn("w-full resize-none rounded-[20px] px-3 py-2 text-xs outline-none", softSurfaceClass, foregroundTextClass)}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as Incident["status"])}
                    className={cn("rounded-full px-3 py-2 text-xs outline-none", softSurfaceClass, foregroundTextClass)}
                  >
                    <option value="investigating">Investigating</option>
                    <option value="identified">Identified</option>
                    <option value="monitoring">Monitoring</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className={cn("flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium disabled:opacity-40", accentButtonClass)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Post Update
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside className="space-y-6">
            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                <UserRound className="h-3.5 w-3.5" />
                On-Call Ownership
              </h2>
              <div className="space-y-3">
                <select
                  value={ownerMemberId}
                  onChange={(e) => setOwnerMemberId(e.target.value)}
                  className={cn("w-full rounded-full px-3 py-2 text-xs outline-none", softSurfaceClass, foregroundTextClass)}
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
                  className={cn("flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium disabled:opacity-40", softSurfaceClass, foregroundTextClass)}
                >
                  {ownerSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRound className="h-3.5 w-3.5" />}
                  {ownerSaving ? "Saving..." : "Update On-Call Owner"}
                </button>
                <p className={cn("text-[11px] leading-5", mutedTextClass)}>
                  The on-call owner is the active responder for this incident and is included in prolonged escalation routing.
                </p>
              </div>
            </div>

            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                Service Context
              </h2>
              <div className="space-y-3 text-sm">
                <div>
                  <div className={cn("text-[11px]", mutedText2Class)}>Service</div>
                  <div>{data.service?.name || data.incident.serviceId}</div>
                </div>
                <div>
                  <div className={cn("text-[11px]", mutedText2Class)}>Primary Owner</div>
                  <div>{data.serviceOwner?.memberName || "Unassigned"}</div>
                </div>
                <div>
                  <div className={cn("text-[11px]", mutedText2Class)}>On-Call Owner</div>
                  <div>{data.incident.ownerMemberName || "Unassigned"}</div>
                </div>
                <div>
                  <div className={cn("text-[11px]", mutedText2Class)}>Acknowledgement</div>
                  <div>
                    {data.incident.acknowledgedAt
                      ? `${data.incident.acknowledgedByName || "Team member"} · ${new Date(data.incident.acknowledgedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`
                      : "Not acknowledged"}
                  </div>
                </div>
                {data.service?.url && (
                  <a href={data.service.url} target="_blank" rel="noopener noreferrer" className={cn("inline-flex items-center gap-1 text-xs hover:underline", mutedTextClass)}>
                    Open endpoint
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            <div className={cn("rounded-2xl p-5", surfaceClass)}>
              <h2 className={cn("mb-3 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                Assignments
              </h2>
              {data.assignments.length === 0 ? (
                <p className={cn("text-xs", mutedTextClass)}>
                  No assignments yet. Use the <Link href="/team" className="underline">team page</Link> to assign this incident.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-xl border border-white/5 bg-[var(--surface-glass-soft)] p-3">
                      <div className="text-sm">{assignment.assigneeName}</div>
                      <div className={cn("mt-1 text-[11px]", mutedText2Class)}>
                        {assignment.status.replace("_", " ")}
                        {assignment.deadline && ` · Due ${new Date(assignment.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {data.activeMaintenance && (
              <div className={cn("rounded-2xl p-5", surfaceClass)}>
                <h2 className={cn("mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
                  <Wrench className={cn("h-3.5 w-3.5", toneTextClasses.maintenance)} />
                  Active Maintenance
                </h2>
                <div className="text-sm">{data.activeMaintenance.title}</div>
                <div className={cn("mt-1 text-[11px]", mutedText2Class)}>
                  Until {new Date(data.activeMaintenance.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </div>
                {data.activeMaintenance.notes && (
                  <p className={cn("mt-2 text-[11px]", mutedTextClass)}>{data.activeMaintenance.notes}</p>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
