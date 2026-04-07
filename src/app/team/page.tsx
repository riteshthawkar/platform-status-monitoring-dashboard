"use client";

import { Children, cloneElement, isValidElement, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Users,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  UserPlus,
  ClipboardList,
  Loader2,
  X,
  Pencil,
  Check,
  Send,
  Rocket,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { TeamMember, IncidentAssignment, Incident, MaintenanceWindow, ServiceOwner, ServiceDeployment } from "@/types";
import { getServiceById } from "@/lib/services-config";
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

interface ManagedService {
  serviceId: string;
  serviceName: string;
  serviceGroup: string;
  description: string;
  owner: ServiceOwner | null;
}

type Tone = "foreground" | "operational" | "degraded" | "down" | "maintenance";

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<IncidentAssignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [serviceOwnership, setServiceOwnership] = useState<ManagedService[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [deployments, setDeployments] = useState<ServiceDeployment[]>([]);
  const [latestDeploymentsByService, setLatestDeploymentsByService] = useState<Record<string, ServiceDeployment>>({});
  const [loading, setLoading] = useState(true);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showDeployment, setShowDeployment] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "engineer" });
  const [assignForm, setAssignForm] = useState({ incidentId: "", assigneeId: "", notes: "", deadline: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({
    serviceId: "",
    title: "",
    startsAt: "",
    endsAt: "",
    notes: "",
  });
  const [deploymentForm, setDeploymentForm] = useState({
    serviceId: "",
    environment: "production",
    version: "",
    commitSha: "",
    deployedBy: "",
    deployedAt: getLocalDateTimeValue(),
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [editNotesValue, setEditNotesValue] = useState("");
  const [sendingReminder, setSendingReminder] = useState<number | null>(null);
  const [savingOwnerId, setSavingOwnerId] = useState<string | null>(null);
  const [maintenanceActionId, setMaintenanceActionId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, assignRes, incidentRes, ownersRes, maintenanceRes, deploymentsRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/assignments"),
        fetch("/api/incidents?active=true"),
        fetch("/api/service-owners"),
        fetch("/api/maintenance"),
        fetch("/api/deployments?limit=20"),
      ]);
      const teamData = await teamRes.json();
      const assignData = await assignRes.json();
      const incidentData = await incidentRes.json();
      const ownersData = await ownersRes.json();
      const maintenanceData = await maintenanceRes.json();
      const deploymentsData = await deploymentsRes.json();

      setMembers(teamData.members || []);
      setAssignments(assignData.assignments || []);
      setIncidents(incidentData.incidents || []);
      setServiceOwnership(ownersData.services || []);
      setMaintenanceWindows(maintenanceData.windows || []);
      setDeployments(deploymentsData.deployments || []);
      setLatestDeploymentsByService(
        Object.fromEntries(
          (deploymentsData.latestDeployments || []).map((deployment: ServiceDeployment) => [deployment.serviceId, deployment])
        )
      );
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memberForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMemberForm({ name: "", email: "", role: "engineer" });
      setShowAddMember(false);
      fetchData();
    } catch (err) {
      setFormError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteMember(id: number) {
    if (!confirm("Remove this team member? Their assignments will also be deleted.")) return;
    await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchData();
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: parseInt(assignForm.incidentId),
          assigneeId: parseInt(assignForm.assigneeId),
          notes: assignForm.notes || undefined,
          deadline: assignForm.deadline || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAssignForm({ incidentId: "", assigneeId: "", notes: "", deadline: "" });
      setShowAssign(false);
      fetchData();
    } catch (err) {
      setFormError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  async function updateAssignmentStatus(id: number, status: string) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, status }),
    });
    fetchData();
  }

  async function deleteAssignment(id: number) {
    if (!confirm("Remove this assignment?")) return;
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    fetchData();
  }

  async function sendReminder(id: number) {
    setSendingReminder(id);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind", id }),
      });
      const data = await res.json();
      if (data.emailSent) {
        showToast("Reminder email sent", "success");
      } else {
        showToast("Email not configured or failed to send", "error");
      }
    } catch {
      showToast("Failed to send reminder", "error");
    } finally {
      setSendingReminder(null);
    }
  }

  async function saveNotes(id: number) {
    await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id, notes: editNotesValue }),
    });
    setEditingNotes(null);
    showToast("Notes updated", "success");
    fetchData();
  }

  async function saveServiceOwner(serviceId: string, memberId: string) {
    setSavingOwnerId(serviceId);
    try {
      const res = await fetch("/api/service-owners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          memberId: memberId ? parseInt(memberId, 10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(memberId ? "Service owner updated" : "Service owner cleared", "success");
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update owner", "error");
    } finally {
      setSavingOwnerId(null);
    }
  }

  async function createMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(maintenanceForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMaintenanceForm({ serviceId: "", title: "", startsAt: "", endsAt: "", notes: "" });
      setShowMaintenance(false);
      showToast("Maintenance window scheduled", "success");
      fetchData();
    } catch (err) {
      setFormError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  async function createDeployment(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deploymentForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeploymentForm({
        serviceId: "",
        environment: "production",
        version: "",
        commitSha: "",
        deployedBy: "",
        deployedAt: getLocalDateTimeValue(),
        notes: "",
      });
      setShowDeployment(false);
      showToast("Deployment logged", "success");
      fetchData();
    } catch (err) {
      setFormError(String(err instanceof Error ? err.message : err));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelMaintenance(id: number) {
    setMaintenanceActionId(id);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast("Maintenance window cancelled", "success");
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to cancel maintenance", "error");
    } finally {
      setMaintenanceActionId(null);
    }
  }

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertTriangle className={cn("w-3.5 h-3.5", toneTextClasses.down)} />;
      case "in_progress": return <Clock className={cn("w-3.5 h-3.5", toneTextClasses.degraded)} />;
      case "resolved": return <CheckCircle2 className={cn("w-3.5 h-3.5", toneTextClasses.operational)} />;
      default: return null;
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "open": return toneChipClasses.down;
      case "in_progress": return toneChipClasses.degraded;
      case "resolved": return toneChipClasses.operational;
      default: return cn(subtleChipClass, mutedTextClass);
    }
  };

  const severityTextClass = (severity: string) => {
    switch (severity) {
      case "critical": return toneTextClasses.down;
      case "major": return toneTextClasses.degraded;
      case "minor": return toneTextClasses.maintenance;
      default: return mutedTextClass;
    }
  };

  const maintenanceStatus = (window: MaintenanceWindow) => {
    if (window.isActive) return "active";
    if (window.isUpcoming) return "scheduled";
    return "completed";
  };

  const maintenanceStatusClass = (window: MaintenanceWindow) => {
    const status = maintenanceStatus(window);
    return status === "active" ? toneChipClasses.maintenance : toneChipClasses.degraded;
  };

  const openAssignments = assignments.filter((assignment) => assignment.status !== "resolved");
  const assignedOwners = serviceOwnership.filter((service) => service.owner?.memberId).length;
  const deploymentsLast7d = deployments.filter((deployment) => {
    const deployedAt = new Date(deployment.deployedAt).getTime();
    return deployedAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;
  }).length;

  if (loading) {
    return (
      <div className={cn(pageClass, "flex items-center justify-center")}>
        <Loader2 className={cn("w-5 h-5 animate-spin", mutedTextClass)} />
      </div>
    );
  }

  return (
    <div className={pageClass}>
      {toast && (
        <div
          className={cn(
            "fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-2xl border bg-[var(--card)] px-4 py-2.5 text-xs font-medium shadow-lg transition-all",
            toast.type === "success"
              ? "border-[color:color-mix(in_srgb,var(--color-operational)_30%,transparent)] text-[var(--color-operational)]"
              : "border-[color:color-mix(in_srgb,var(--color-down)_30%,transparent)] text-[var(--color-down)]",
          )}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {toast.message}
        </div>
      )}

      <AppHeader />

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className={cn("text-lg font-semibold sm:text-xl", foregroundTextClass)}>
            Team actions
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setShowAddMember(true); setFormError(null); }}
              className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors", softSurfaceClass, mutedTextClass)}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Member
            </button>
            <button
              onClick={() => { setShowAssign(true); setFormError(null); }}
              className={cn("inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors disabled:opacity-30", softSurfaceClass, mutedTextClass)}
              disabled={members.length === 0 || incidents.length === 0}
              title={members.length === 0 ? "Add team members first" : incidents.length === 0 ? "No active incidents to assign" : ""}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Assign
            </button>
            <button
              onClick={() => { setShowMaintenance(true); setFormError(null); }}
              className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold transition-colors", accentButtonClass)}
            >
              <Wrench className="w-3.5 h-3.5" />
              Maintenance
            </button>
            <button
              onClick={() => { setShowDeployment(true); setFormError(null); }}
              className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold transition-colors", accentButtonClass)}
            >
              <Rocket className="w-3.5 h-3.5" />
              Deployment
            </button>
          </div>
        </div>

        <section className={cn("rounded-[28px] p-5 sm:p-6", surfaceClass)}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={cn("text-[11px] font-semibold uppercase tracking-[0.22em]", mutedText2Class)}>
                Team & Ops
              </p>
              <h1 className={cn("mt-3 text-[28px] font-semibold leading-tight sm:text-[34px]", foregroundTextClass)}>
                Team coordination
              </h1>
              <p className={cn("mt-2 text-sm", mutedTextClass)}>
                People, ownership, maintenance, and assignments.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TeamSummaryStat label="Members" value={String(members.length)} tone="foreground" />
              <TeamSummaryStat label="Open assigns" value={String(openAssignments.length)} tone={openAssignments.length > 0 ? "degraded" : "foreground"} />
              <TeamSummaryStat label="Owned services" value={`${assignedOwners}/${serviceOwnership.length}`} tone={assignedOwners === serviceOwnership.length ? "operational" : "degraded"} />
              <TeamSummaryStat label="Deploys 7d" value={String(deploymentsLast7d)} tone={deploymentsLast7d > 0 ? "operational" : "foreground"} />
            </div>
          </div>
        </section>

        {showAddMember && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
            <div className={cn("my-6 w-full max-w-[420px] rounded-[24px] p-5 max-h-[calc(100vh-3rem)] overflow-y-auto", surfaceClass)}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[var(--accent)]" /> Add Team Member
                </h2>
                <button onClick={() => setShowAddMember(false)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full", softSurfaceClass, mutedTextClass)}>
                  <X className={cn("w-4 h-4", mutedTextClass)} />
                </button>
              </div>
              {formError && (
                <div className={cn("mb-4 rounded-md px-3 py-2 text-xs", toneChipClasses.down)}>
                  {formError}
                </div>
              )}
              <form onSubmit={addMember} className="space-y-3">
                <FormField label="Name">
                  <input
                    type="text" required value={memberForm.name}
                    onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                    placeholder="John Doe"
                  />
                </FormField>
                <FormField label="Email">
                  <input
                    type="email" required value={memberForm.email}
                    onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </FormField>
                <FormField label="Role">
                  <select
                    value={memberForm.role}
                    onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                  >
                    <option value="engineer">Engineer</option>
                    <option value="lead">Lead</option>
                    <option value="manager">Manager</option>
                    <option value="devops">DevOps</option>
                    <option value="qa">QA</option>
                  </select>
                </FormField>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddMember(false)}
                    className={cn("flex-1 rounded-full px-3 py-2 text-xs transition-colors", softSurfaceClass, mutedTextClass)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40", accentButtonClass)}
                  >
                    {submitting ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        )}

        {/* Assign Incident Modal */}
        {showAssign && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
            <div className={cn("my-6 w-full max-w-[420px] rounded-[24px] p-5 max-h-[calc(100vh-3rem)] overflow-y-auto", surfaceClass)}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <ClipboardList className={cn("w-4 h-4", toneTextClasses.degraded)} /> Assign Incident
                </h2>
                <button onClick={() => setShowAssign(false)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full", softSurfaceClass, mutedTextClass)}>
                  <X className={cn("w-4 h-4", mutedTextClass)} />
                </button>
              </div>
              {formError && (
                <div className={cn("mb-4 rounded-md px-3 py-2 text-xs", toneChipClasses.down)}>
                  {formError}
                </div>
              )}
              <form onSubmit={createAssignment} className="space-y-3">
                <FormField label="Incident">
                  <select
                    required value={assignForm.incidentId}
                    onChange={(e) => setAssignForm({ ...assignForm, incidentId: e.target.value })}
                  >
                    <option value="">Select an incident...</option>
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        #{inc.id} — {inc.title} ({inc.severity})
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Assign To">
                  <select
                    required value={assignForm.assigneeId}
                    onChange={(e) => setAssignForm({ ...assignForm, assigneeId: e.target.value })}
                  >
                    <option value="">Select a team member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role}) — {m.email}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Deadline (optional)">
                  <input
                    type="datetime-local" value={assignForm.deadline}
                    onChange={(e) => setAssignForm({ ...assignForm, deadline: e.target.value })}
                  />
                </FormField>
                <FormField label="Notes (optional)">
                  <textarea
                    value={assignForm.notes} rows={3}
                    onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                    placeholder="Investigation notes, steps to take..."
                    className="resize-none"
                  />
                </FormField>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAssign(false)}
                    className={cn("flex-1 rounded-full px-3 py-2 text-xs transition-colors", softSurfaceClass, mutedTextClass)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40", accentButtonClass)}
                  >
                    {submitting ? "Assigning..." : "Assign & Notify"}
                  </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        )}

        {showMaintenance && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
            <div className={cn("my-6 w-full max-w-[460px] rounded-[24px] p-5 max-h-[calc(100vh-3rem)] overflow-y-auto", surfaceClass)}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Wrench className={cn("w-4 h-4", toneTextClasses.maintenance)} /> Schedule Maintenance
                </h2>
                <button onClick={() => setShowMaintenance(false)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full", softSurfaceClass, mutedTextClass)}>
                  <X className={cn("w-4 h-4", mutedTextClass)} />
                </button>
              </div>
              {formError && (
                <div className={cn("mb-4 rounded-md px-3 py-2 text-xs", toneChipClasses.down)}>
                  {formError}
                </div>
              )}
              <form onSubmit={createMaintenance} className="space-y-3">
                <FormField label="Service">
                  <select
                    required
                    value={maintenanceForm.serviceId}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, serviceId: e.target.value })}
                  >
                    <option value="">Select a service...</option>
                    {serviceOwnership.map((service) => (
                      <option key={service.serviceId} value={service.serviceId}>
                        {service.serviceName} ({service.serviceGroup})
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Title">
                  <input
                    type="text"
                    required
                    value={maintenanceForm.title}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                    placeholder="Database migration"
                  />
                </FormField>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Starts At">
                    <input
                      type="datetime-local"
                      required
                      value={maintenanceForm.startsAt}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, startsAt: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Ends At">
                    <input
                      type="datetime-local"
                      required
                      value={maintenanceForm.endsAt}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, endsAt: e.target.value })}
                    />
                  </FormField>
                </div>
                <FormField label="Notes (optional)">
                  <textarea
                    rows={3}
                    value={maintenanceForm.notes}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })}
                    placeholder="Expected impact, rollback notes, stakeholder context..."
                    className="resize-none"
                  />
                </FormField>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowMaintenance(false)}
                    className={cn("flex-1 rounded-full px-3 py-2 text-xs transition-colors", softSurfaceClass, mutedTextClass)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40", accentButtonClass)}
                  >
                    {submitting ? "Scheduling..." : "Schedule"}
                  </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        )}

        {showDeployment && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 sm:p-6">
            <div className="flex min-h-full items-center justify-center">
              <div className={cn("my-6 w-full max-w-[520px] rounded-[24px] p-5 max-h-[calc(100vh-3rem)] overflow-y-auto", surfaceClass)}>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                    <Rocket className={cn("h-4 w-4", toneTextClasses.operational)} /> Log deployment
                  </h2>
                  <button onClick={() => setShowDeployment(false)} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full", softSurfaceClass, mutedTextClass)}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {formError && (
                  <div className={cn("mb-4 rounded-md px-3 py-2 text-xs", toneChipClasses.down)}>
                    {formError}
                  </div>
                )}
                <form onSubmit={createDeployment} className="space-y-3">
                  <FormField label="Service">
                    <select
                      required
                      value={deploymentForm.serviceId}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, serviceId: e.target.value })}
                    >
                      <option value="">Select a service...</option>
                      {serviceOwnership.map((service) => (
                        <option key={service.serviceId} value={service.serviceId}>
                          {service.serviceName} ({service.serviceGroup})
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Environment">
                      <select
                        value={deploymentForm.environment}
                        onChange={(e) => setDeploymentForm({ ...deploymentForm, environment: e.target.value })}
                      >
                        <option value="production">Production</option>
                        <option value="staging">Staging</option>
                        <option value="preview">Preview</option>
                      </select>
                    </FormField>
                    <FormField label="Version">
                      <input
                        type="text"
                        required
                        value={deploymentForm.version}
                        onChange={(e) => setDeploymentForm({ ...deploymentForm, version: e.target.value })}
                        placeholder="v1.8.3"
                      />
                    </FormField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Commit SHA">
                      <input
                        type="text"
                        value={deploymentForm.commitSha}
                        onChange={(e) => setDeploymentForm({ ...deploymentForm, commitSha: e.target.value })}
                        placeholder="7a48fb5"
                      />
                    </FormField>
                    <FormField label="Deployed by">
                      <input
                        type="text"
                        value={deploymentForm.deployedBy}
                        onChange={(e) => setDeploymentForm({ ...deploymentForm, deployedBy: e.target.value })}
                        placeholder="Ritesh"
                      />
                    </FormField>
                  </div>
                  <FormField label="Deployed at">
                    <input
                      type="datetime-local"
                      required
                      value={deploymentForm.deployedAt}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, deployedAt: e.target.value })}
                    />
                  </FormField>
                  <FormField label="Notes (optional)">
                    <textarea
                      rows={3}
                      value={deploymentForm.notes}
                      onChange={(e) => setDeploymentForm({ ...deploymentForm, notes: e.target.value })}
                      placeholder="Release summary, rollback note, linked change..."
                      className="resize-none"
                    />
                  </FormField>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowDeployment(false)}
                      className={cn("flex-1 rounded-full px-3 py-2 text-xs transition-colors", softSurfaceClass, mutedTextClass)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className={cn("flex-1 px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40", accentButtonClass)}
                    >
                      {submitting ? "Logging..." : "Log Deployment"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        <section className={cn("mb-6 mt-6 overflow-hidden rounded-[28px]", surfaceClass)}>
          <SectionHeader title="Team members" count={members.length} />
          {members.length === 0 ? (
            <EmptyState icon={<Users className={cn("w-6 h-6", mutedText2Class)} />} message="No team members" />
          ) : (
            <div className="overflow-x-auto">
              <div
                className={cn("grid min-w-[640px] grid-cols-[1fr_1.2fr_80px_80px_40px] gap-4 border-b border-[color:var(--border)] bg-[var(--surface-glass-soft)] px-4 py-2 text-[11px] font-medium uppercase tracking-wider", mutedText2Class)}
              >
                <span>Name</span>
                <span>Email</span>
                <span>Role</span>
                <span>Active</span>
                <span></span>
              </div>
              {members.map((member, i) => {
                const memberAssignments = assignments.filter((a) => a.assigneeId === member.id && a.status !== "resolved");
                return (
                  <div
                    key={member.id}
                    className={cn(
                      "grid min-w-[640px] grid-cols-[1fr_1.2fr_80px_80px_40px] items-center gap-4 px-4 py-2.5 transition-colors hover:bg-[var(--surface-glass-hover)]",
                      i < members.length - 1 && "border-b border-[color:var(--border)]",
                    )}
                  >
                    <span className="text-[13px] font-medium truncate">{member.name}</span>
                    <span className={cn("truncate text-xs", mutedTextClass)}>
                      {member.email}
                    </span>
                    <span
                      className={cn("w-fit rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", subtleChipClass, foregroundTextClass)}
                    >
                      {member.role}
                    </span>
                    <span className={cn("text-xs", memberAssignments.length > 0 ? toneTextClasses.degraded : mutedText2Class)}>
                      {memberAssignments.length > 0 ? `${memberAssignments.length} open` : "—"}
                    </span>
                    <button
                      onClick={() => deleteMember(member.id!)}
                      className={cn("rounded-md p-1 transition-colors hover:bg-[color-mix(in_srgb,var(--color-down)_8%,transparent)] hover:text-[var(--color-down)]", mutedText2Class)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className={cn("mb-6 overflow-hidden rounded-[28px]", surfaceClass)}>
          <SectionHeader title="Service registry" count={serviceOwnership.length} />
          <div className="overflow-x-auto">
            <div
              className={cn("grid min-w-[860px] grid-cols-[minmax(0,1.3fr)_110px_160px_minmax(0,1fr)] gap-4 border-b border-[color:var(--border)] bg-[var(--surface-glass-soft)] px-4 py-2 text-[11px] font-medium uppercase tracking-wider", mutedText2Class)}
            >
              <span>Service</span>
              <span>Group</span>
              <span>Latest release</span>
              <span>Owner</span>
            </div>
            {serviceOwnership.map((service, index) => {
              const serviceMeta = getServiceById(service.serviceId);
              const latestDeployment = latestDeploymentsByService[service.serviceId] ?? null;

              return (
              <div
                key={service.serviceId}
                className={cn("grid min-w-[860px] grid-cols-[minmax(0,1.3fr)_110px_160px_minmax(0,1fr)] items-center gap-4 px-4 py-2.5", index < serviceOwnership.length - 1 && "border-b border-[color:var(--border)]")}
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">{service.serviceName}</div>
                  <div className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                    {serviceMeta?.description || service.description}
                  </div>
                </div>
                <span className={cn("text-[11px] uppercase", mutedTextClass)}>
                  {service.serviceGroup}
                </span>
                <div className="min-w-0">
                  {latestDeployment ? (
                    <>
                      <div className={cn("truncate text-[12px] font-semibold", foregroundTextClass)}>
                        {latestDeployment.version}
                      </div>
                      <div className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                        {formatDateTime(latestDeployment.deployedAt)}
                      </div>
                    </>
                  ) : (
                    <span className={cn("text-[11px]", mutedTextClass)}>Not logged</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={service.owner?.memberId ?? ""}
                    onChange={(e) => saveServiceOwner(service.serviceId, e.target.value)}
                    className={cn("w-full rounded-md px-2.5 py-2 text-xs outline-none", softSurfaceClass, foregroundTextClass)}
                    disabled={savingOwnerId === service.serviceId}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} ({member.role})
                      </option>
                    ))}
                  </select>
                  {savingOwnerId === service.serviceId && (
                    <Loader2 className={cn("w-3.5 h-3.5 animate-spin flex-shrink-0", mutedTextClass)} />
                  )}
                </div>
              </div>
            )})}
          </div>
        </section>

        <section className={cn("mb-6 overflow-hidden rounded-[28px]", surfaceClass)}>
          <SectionHeader title="Recent deployments" count={deployments.length} />
          {deployments.length === 0 ? (
            <EmptyState icon={<Rocket className={cn("w-6 h-6", mutedText2Class)} />} message="No deployments logged" />
          ) : (
            <div className="overflow-x-auto">
              <div
                className={cn("grid min-w-[920px] grid-cols-[minmax(0,1.2fr)_110px_120px_110px_170px_minmax(0,1fr)] gap-4 border-b border-[color:var(--border)] bg-[var(--surface-glass-soft)] px-4 py-2 text-[11px] font-medium uppercase tracking-wider", mutedText2Class)}
              >
                <span>Service</span>
                <span>Group</span>
                <span>Version</span>
                <span>Env</span>
                <span>Deployed</span>
                <span>Notes</span>
              </div>
              {deployments.map((deployment, index) => (
                <div
                  key={deployment.id}
                  className={cn(
                    "grid min-w-[920px] grid-cols-[minmax(0,1.2fr)_110px_120px_110px_170px_minmax(0,1fr)] items-center gap-4 px-4 py-2.5",
                    index < deployments.length - 1 && "border-b border-[color:var(--border)]",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{deployment.serviceName}</div>
                    <div className={cn("mt-0.5 truncate text-[11px]", mutedTextClass)}>
                      {deployment.deployedBy || "Unknown deployer"}
                    </div>
                  </div>
                  <span className={cn("text-[11px] uppercase", mutedTextClass)}>{deployment.serviceGroup}</span>
                  <span className={cn("truncate text-[12px] font-semibold", foregroundTextClass)}>{deployment.version}</span>
                  <span className={cn("w-fit rounded-full px-2 py-1 text-[10px] font-medium uppercase", subtleChipClass, mutedTextClass)}>
                    {deployment.environment}
                  </span>
                  <span className={cn("text-[11px]", mutedTextClass)}>{formatDateTime(deployment.deployedAt)}</span>
                  <span className={cn("truncate text-[11px]", mutedTextClass)}>
                    {deployment.notes || deployment.commitSha || "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={cn("mb-6 overflow-hidden rounded-[28px]", surfaceClass)}>
          <SectionHeader title="Maintenance" count={maintenanceWindows.length} />
          {maintenanceWindows.length === 0 ? (
            <EmptyState icon={<Wrench className={cn("w-6 h-6", mutedText2Class)} />} message="No maintenance windows" />
          ) : (
            <div className="overflow-hidden">
              {maintenanceWindows.map((window, index) => (
                <div
                  key={window.id}
                  className={cn("flex items-start gap-3 px-4 py-3", index < maintenanceWindows.length - 1 && "border-b border-[color:var(--border)]")}
                >
                  <div className="mt-0.5">
                    <Wrench className={cn("w-4 h-4", toneTextClasses.maintenance)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium">{window.title}</span>
                      <span
                        className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", maintenanceStatusClass(window))}
                      >
                        {maintenanceStatus(window)}
                      </span>
                    </div>
                    <p className={cn("mt-0.5 text-xs", mutedTextClass)}>
                      {window.serviceName} ({window.serviceGroup})
                    </p>
                    <div className={cn("mt-1.5 text-[11px]", mutedText2Class)}>
                      {new Date(window.startsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      {" "}to{" "}
                      {new Date(window.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    {window.notes && (
                      <p className={cn("mt-1 text-[11px]", mutedText2Class)}>
                        {window.notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => cancelMaintenance(window.id!)}
                    disabled={maintenanceActionId === window.id}
                    className={cn("rounded-md p-1 transition-colors disabled:opacity-40", mutedText2Class)}
                  >
                    {maintenanceActionId === window.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className={cn("overflow-hidden rounded-[28px]", surfaceClass)}>
          <SectionHeader title="Incident assignments" count={assignments.length} />
          {assignments.length === 0 ? (
            <EmptyState icon={<ClipboardList className={cn("w-6 h-6", mutedText2Class)} />} message="No assignments" />
          ) : (
            <div className="overflow-hidden">
              {assignments.map((assignment, i) => (
                <div
                  key={assignment.id}
                  className={cn(
                    "flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-[var(--surface-glass-hover)] sm:flex-row sm:items-start",
                    i < assignments.length - 1 && "border-b border-[color:var(--border)]",
                  )}
                >
                  <div className="mt-0.5">{statusIcon(assignment.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link href={`/incidents/${assignment.incidentId}`} className="text-[13px] font-medium hover:underline">
                        Incident #{assignment.incidentId}
                      </Link>
                      <span className={cn("text-[10px] font-medium uppercase", severityTextClass(assignment.incidentSeverity || ""))}>
                        {assignment.incidentSeverity}
                      </span>
                    </div>
                    <Link href={`/incidents/${assignment.incidentId}`} className={cn("mb-1.5 block text-xs hover:underline", mutedTextClass)}>
                      {assignment.incidentTitle}
                    </Link>
                    <div className={cn("flex flex-wrap items-center gap-2 text-[11px]", mutedText2Class)}>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {assignment.assigneeName}
                      </span>
                      {assignment.deadline && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(assignment.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      )}
                    </div>
                    {/* Notes — inline editable */}
                    <div className="mt-1.5">
                      {editingNotes === assignment.id ? (
                        <div className="flex items-start gap-1.5">
                          <textarea
                            value={editNotesValue}
                            onChange={(e) => setEditNotesValue(e.target.value)}
                            rows={2}
                            className={cn("flex-1 resize-none rounded-md px-2 py-1.5 text-xs outline-none", softSurfaceClass, foregroundTextClass)}
                            autoFocus
                          />
                          <button
                            onClick={() => saveNotes(assignment.id!)}
                            className={cn("rounded-md p-1", toneTextClasses.operational)}
                            title="Save notes"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            className={cn("rounded-md p-1", mutedText2Class)}
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/notes">
                          <span className={cn("text-[11px] italic", mutedText2Class)}>
                            {assignment.notes ? `"${assignment.notes}"` : "No notes"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingNotes(assignment.id!);
                              setEditNotesValue(assignment.notes || "");
                            }}
                            className={cn("rounded p-0.5 opacity-0 transition-opacity group-hover/notes:opacity-100", mutedTextClass)}
                            title="Edit notes"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-1.5 sm:ml-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">
                    <span
                      className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", statusBadgeClass(assignment.status))}
                    >
                      {assignment.status.replace("_", " ")}
                    </span>
                    {assignment.status !== "resolved" && (
                      <select
                        value={assignment.status}
                        onChange={(e) => updateAssignmentStatus(assignment.id!, e.target.value)}
                        className={cn("cursor-pointer rounded-md px-1.5 py-1 text-[11px] outline-none", softSurfaceClass, foregroundTextClass)}
                      >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    )}
                    {assignment.status !== "resolved" && (
                      <button
                        onClick={() => sendReminder(assignment.id!)}
                        disabled={sendingReminder === assignment.id}
                        className={cn("rounded-md p-1 transition-colors disabled:opacity-40 hover:bg-[color-mix(in_srgb,var(--color-degraded)_10%,transparent)]", toneTextClasses.degraded)}
                        title="Send reminder email"
                      >
                        {sendingReminder === assignment.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => deleteAssignment(assignment.id!)}
                      className={cn("rounded-md p-1 transition-colors hover:bg-[color-mix(in_srgb,var(--color-down)_8%,transparent)] hover:text-[var(--color-down)]", mutedText2Class)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getLocalDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const dialogFieldClassName = "w-full rounded-xl px-3.5 py-2.5 text-xs outline-none transition-[border-color,background,box-shadow] placeholder:text-[color:var(--muted-2)] border border-[color:var(--border)] bg-[var(--surface-glass-soft)] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

function FormField({ label, children }: { label: string; children: ReactNode }) {
  const styledChildren = Children.map(children, (child) => {
    if (!isValidElement<{ className?: string }>(child)) {
      return child;
    }

    return cloneElement(child, {
      className: [dialogFieldClassName, child.props.className].filter(Boolean).join(" "),
    });
  });

  return (
    <div>
      <label className={cn("mb-1.5 block text-[11px] font-medium uppercase tracking-wider", mutedTextClass)}>
        {label}
      </label>
      <div>{styledChildren}</div>
    </div>
  );
}

function TeamSummaryStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  return (
    <div className={cn("rounded-2xl px-4 py-3", softSurfaceClass)}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", mutedText2Class)}>
        {label}
      </p>
      <p className={cn("mt-2 text-[18px] font-semibold", tone === "foreground" ? foregroundTextClass : toneTextClasses[tone])}>
        {value}
      </p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="border-b border-[color:var(--border)] px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.2em]", mutedText2Class)}>
          {title}
        </p>
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", subtleChipClass, mutedTextClass)}>
          {count}
        </span>
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div className={cn("mx-auto mb-3 flex w-fit items-center justify-center rounded-2xl p-3", subtleChipClass)}>
        {icon}
      </div>
      <p className={cn("text-sm", mutedTextClass)}>
        {message}
      </p>
    </div>
  );
}
