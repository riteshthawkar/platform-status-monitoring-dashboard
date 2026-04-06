"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Trash2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Mail,
  UserPlus,
  ClipboardList,
  Loader2,
  X,
  Bell,
  Pencil,
  Check,
  Send,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { TeamMember, IncidentAssignment, Incident, MaintenanceWindow, ServiceOwner } from "@/types";

interface ManagedService {
  serviceId: string;
  serviceName: string;
  serviceGroup: string;
  description: string;
  owner: ServiceOwner | null;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<IncidentAssignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [serviceOwnership, setServiceOwnership] = useState<ManagedService[]>([]);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "engineer" });
  const [assignForm, setAssignForm] = useState({ incidentId: "", assigneeId: "", notes: "", deadline: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({
    serviceId: "",
    title: "",
    startsAt: "",
    endsAt: "",
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
      const [teamRes, assignRes, incidentRes, ownersRes, maintenanceRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/assignments"),
        fetch("/api/incidents?active=true"),
        fetch("/api/service-owners"),
        fetch("/api/maintenance"),
      ]);
      const teamData = await teamRes.json();
      const assignData = await assignRes.json();
      const incidentData = await incidentRes.json();
      const ownersData = await ownersRes.json();
      const maintenanceData = await maintenanceRes.json();

      setMembers(teamData.members || []);
      setAssignments(assignData.assignments || []);
      setIncidents(incidentData.incidents || []);
      setServiceOwnership(ownersData.services || []);
      setMaintenanceWindows(maintenanceData.windows || []);
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
      case "open": return <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--color-down)" }} />;
      case "in_progress": return <Clock className="w-3.5 h-3.5" style={{ color: "var(--color-degraded)" }} />;
      case "resolved": return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--color-operational)" }} />;
      default: return null;
    }
  };

  const statusBadgeStyle = (status: string) => {
    const colors: Record<string, string> = {
      open: "var(--color-down)",
      in_progress: "var(--color-degraded)",
      resolved: "var(--color-operational)",
    };
    const c = colors[status] || "var(--muted)";
    return {
      color: c,
      background: `color-mix(in srgb, ${c} 10%, transparent)`,
    };
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "var(--color-down)";
      case "major": return "var(--color-degraded)";
      case "minor": return "var(--color-maintenance)";
      default: return "var(--muted)";
    }
  };

  const maintenanceStatus = (window: MaintenanceWindow) => {
    if (window.isActive) return "active";
    if (window.isUpcoming) return "scheduled";
    return "completed";
  };

  const maintenanceStatusStyle = (window: MaintenanceWindow) => {
    const status = maintenanceStatus(window);
    if (status === "active") {
      return {
        color: "var(--color-maintenance)",
        background: "color-mix(in srgb, var(--color-maintenance) 10%, transparent)",
      };
    }

    return {
      color: "var(--color-degraded)",
      background: "color-mix(in srgb, var(--color-degraded) 10%, transparent)",
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Toast notification */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-md text-xs font-medium shadow-lg transition-all"
          style={{
            background: "var(--card)",
            border: `1px solid ${toast.type === "success" ? "color-mix(in srgb, var(--color-operational) 30%, transparent)" : "color-mix(in srgb, var(--color-down) 30%, transparent)"}`,
            color: toast.type === "success" ? "var(--color-operational)" : "var(--color-down)",
          }}
        >
          {toast.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {toast.message}
        </div>
      )}

      <div className="max-w-[1000px] mx-auto px-6 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "16px" }}>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
              style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Dashboard
            </Link>
            <div className="flex items-center gap-2.5">
              <Users className="w-[18px] h-[18px]" style={{ color: "var(--accent)" }} />
              <h1 className="text-sm font-semibold">Team & Operations</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAddMember(true); setFormError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              <UserPlus className="w-3.5 h-3.5" /> Add Member
            </button>
            <button
              onClick={() => { setShowAssign(true); setFormError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-30"
              style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
              disabled={members.length === 0 || incidents.length === 0}
              title={members.length === 0 ? "Add team members first" : incidents.length === 0 ? "No active incidents to assign" : ""}
            >
              <ClipboardList className="w-3.5 h-3.5" /> Assign Incident
            </button>
            <button
              onClick={() => { setShowMaintenance(true); setFormError(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
            >
              <Wrench className="w-3.5 h-3.5" /> Schedule Maintenance
            </button>
          </div>
        </header>

        {/* Add Member Modal */}
        {showAddMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
            <div
              className="w-full max-w-[420px] rounded-lg p-5"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <UserPlus className="w-4 h-4" style={{ color: "var(--accent)" }} /> Add Team Member
                </h2>
                <button onClick={() => setShowAddMember(false)}>
                  <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
                </button>
              </div>
              {formError && (
                <div
                  className="mb-4 px-3 py-2 rounded-md text-xs"
                  style={{
                    color: "var(--color-down)",
                    background: "color-mix(in srgb, var(--color-down) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-down) 15%, transparent)",
                  }}
                >
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
                    className="flex-1 px-3 py-2 rounded-md text-xs transition-colors"
                    style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {submitting ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Incident Modal */}
        {showAssign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
            <div
              className="w-full max-w-[420px] rounded-lg p-5"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" style={{ color: "var(--color-degraded)" }} /> Assign Incident
                </h2>
                <button onClick={() => setShowAssign(false)}>
                  <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
                </button>
              </div>
              {formError && (
                <div
                  className="mb-4 px-3 py-2 rounded-md text-xs"
                  style={{
                    color: "var(--color-down)",
                    background: "color-mix(in srgb, var(--color-down) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-down) 15%, transparent)",
                  }}
                >
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
                    className="flex-1 px-3 py-2 rounded-md text-xs transition-colors"
                    style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {submitting ? "Assigning..." : "Assign & Notify"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showMaintenance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
            <div
              className="w-full max-w-[460px] rounded-lg p-5"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[13px] font-semibold flex items-center gap-2">
                  <Wrench className="w-4 h-4" style={{ color: "var(--color-maintenance)" }} /> Schedule Maintenance
                </h2>
                <button onClick={() => setShowMaintenance(false)}>
                  <X className="w-4 h-4" style={{ color: "var(--muted)" }} />
                </button>
              </div>
              {formError && (
                <div
                  className="mb-4 px-3 py-2 rounded-md text-xs"
                  style={{
                    color: "var(--color-down)",
                    background: "color-mix(in srgb, var(--color-down) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-down) 15%, transparent)",
                  }}
                >
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
                <div className="grid grid-cols-2 gap-3">
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
                    className="flex-1 px-3 py-2 rounded-md text-xs transition-colors"
                    style={{ color: "var(--muted)", border: "1px solid var(--border)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-3 py-2 rounded-md text-xs font-medium disabled:opacity-40 transition-colors"
                    style={{ background: "var(--accent)", color: "#fff" }}
                  >
                    {submitting ? "Scheduling..." : "Schedule"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Team Members Section */}
        <section className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-wider mb-2.5" style={{ color: "var(--muted)" }}>
            Team Members
            <span className="ml-1.5 font-normal" style={{ color: "var(--muted-2)" }}>{members.length}</span>
          </h2>
          {members.length === 0 ? (
            <div
              className="rounded-lg p-10 text-center"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <Users className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--muted-2)" }} />
              <p className="text-xs" style={{ color: "var(--muted)" }}>No team members yet. Add someone to get started.</p>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {/* Table header */}
              <div
                className="grid gap-4 px-4 py-2 text-[11px] font-medium uppercase tracking-wider"
                style={{
                  gridTemplateColumns: "1fr 1.2fr 80px 80px 40px",
                  color: "var(--muted-2)",
                  background: "var(--background-secondary)",
                  borderBottom: "1px solid var(--border)",
                }}
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
                    className="grid gap-4 px-4 py-2.5 items-center transition-colors"
                    style={{
                      gridTemplateColumns: "1fr 1.2fr 80px 80px 40px",
                      background: "var(--card)",
                      borderBottom: i < members.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--card)"; }}
                  >
                    <span className="text-[13px] font-medium truncate">{member.name}</span>
                    <span className="text-xs flex items-center gap-1 truncate" style={{ color: "var(--muted)" }}>
                      <Mail className="w-3 h-3 flex-shrink-0" /> {member.email}
                    </span>
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded capitalize w-fit"
                      style={{
                        color: "var(--accent)",
                        background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                      }}
                    >
                      {member.role}
                    </span>
                    <span className="text-xs" style={{ color: memberAssignments.length > 0 ? "var(--color-degraded)" : "var(--muted-2)" }}>
                      {memberAssignments.length > 0 ? `${memberAssignments.length} open` : "—"}
                    </span>
                    <button
                      onClick={() => deleteMember(member.id!)}
                      className="p-1 rounded-md transition-colors"
                      style={{ color: "var(--muted-2)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-down)";
                        e.currentTarget.style.background = "color-mix(in srgb, var(--color-down) 8%, transparent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--muted-2)";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-wider mb-2.5" style={{ color: "var(--muted)" }}>
            Service Ownership
            <span className="ml-1.5 font-normal" style={{ color: "var(--muted-2)" }}>{serviceOwnership.length}</span>
          </h2>
          <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div
              className="grid gap-4 px-4 py-2 text-[11px] font-medium uppercase tracking-wider"
              style={{
                gridTemplateColumns: "1.2fr 90px 1fr",
                color: "var(--muted-2)",
                background: "var(--background-secondary)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span>Service</span>
              <span>Group</span>
              <span>Owner</span>
            </div>
            {serviceOwnership.map((service, index) => (
              <div
                key={service.serviceId}
                className="grid gap-4 px-4 py-2.5 items-center"
                style={{
                  gridTemplateColumns: "1.2fr 90px 1fr",
                  background: "var(--card)",
                  borderBottom: index < serviceOwnership.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{service.serviceName}</div>
                  <div className="text-[11px] truncate" style={{ color: "var(--muted-2)" }}>
                    {service.description}
                  </div>
                </div>
                <span className="text-[11px] uppercase" style={{ color: "var(--muted)" }}>
                  {service.serviceGroup}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={service.owner?.memberId ?? ""}
                    onChange={(e) => saveServiceOwner(service.serviceId, e.target.value)}
                    className="w-full text-xs px-2.5 py-2 rounded-md outline-none"
                    style={{
                      background: "var(--background-secondary)",
                      border: "1px solid var(--border)",
                      color: "var(--foreground)",
                    }}
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
                    <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: "var(--muted)" }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-[11px] font-medium uppercase tracking-wider mb-2.5" style={{ color: "var(--muted)" }}>
            Maintenance Windows
            <span className="ml-1.5 font-normal" style={{ color: "var(--muted-2)" }}>{maintenanceWindows.length}</span>
          </h2>
          {maintenanceWindows.length === 0 ? (
            <div
              className="rounded-lg p-10 text-center"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <Wrench className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--muted-2)" }} />
              <p className="text-xs" style={{ color: "var(--muted)" }}>No scheduled or active maintenance windows.</p>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {maintenanceWindows.map((window, index) => (
                <div
                  key={window.id}
                  className="flex items-start gap-3 px-4 py-3"
                  style={{
                    background: "var(--card)",
                    borderBottom: index < maintenanceWindows.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div className="mt-0.5">
                    <Wrench className="w-4 h-4" style={{ color: "var(--color-maintenance)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium">{window.title}</span>
                      <span
                        className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded"
                        style={maintenanceStatusStyle(window)}
                      >
                        {maintenanceStatus(window)}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {window.serviceName} ({window.serviceGroup})
                    </p>
                    <div className="text-[11px] mt-1.5" style={{ color: "var(--muted-2)" }}>
                      {new Date(window.startsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      {" "}to{" "}
                      {new Date(window.endsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                    {window.notes && (
                      <p className="text-[11px] mt-1" style={{ color: "var(--muted-2)" }}>
                        {window.notes}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => cancelMaintenance(window.id!)}
                    disabled={maintenanceActionId === window.id}
                    className="p-1 rounded-md transition-colors disabled:opacity-40"
                    style={{ color: "var(--muted-2)" }}
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

        {/* Assignments Section */}
        <section>
          <h2 className="text-[11px] font-medium uppercase tracking-wider mb-2.5" style={{ color: "var(--muted)" }}>
            Incident Assignments
            <span className="ml-1.5 font-normal" style={{ color: "var(--muted-2)" }}>{assignments.length}</span>
          </h2>
          {assignments.length === 0 ? (
            <div
              className="rounded-lg p-10 text-center"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <ClipboardList className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--muted-2)" }} />
              <p className="text-xs" style={{ color: "var(--muted)" }}>No assignments yet. Assign an incident to a team member above.</p>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {assignments.map((assignment, i) => (
                <div
                  key={assignment.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    background: "var(--card)",
                    borderBottom: i < assignments.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--card-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--card)"; }}
                >
                  <div className="mt-0.5">{statusIcon(assignment.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link href={`/incidents/${assignment.incidentId}`} className="text-[13px] font-medium hover:underline">
                        Incident #{assignment.incidentId}
                      </Link>
                      <span className="text-[10px] font-medium uppercase" style={{ color: severityColor(assignment.incidentSeverity || "") }}>
                        {assignment.incidentSeverity}
                      </span>
                    </div>
                    <Link href={`/incidents/${assignment.incidentId}`} className="text-xs mb-1.5 block hover:underline" style={{ color: "var(--muted)" }}>
                      {assignment.incidentTitle}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--muted-2)" }}>
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
                            className="flex-1 px-2 py-1.5 rounded-md text-xs resize-none outline-none"
                            style={{ background: "var(--background-secondary)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                            autoFocus
                          />
                          <button
                            onClick={() => saveNotes(assignment.id!)}
                            className="p-1 rounded-md"
                            style={{ color: "var(--color-operational)" }}
                            title="Save notes"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingNotes(null)}
                            className="p-1 rounded-md"
                            style={{ color: "var(--muted-2)" }}
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 group/notes">
                          <span className="text-[11px] italic" style={{ color: "var(--muted-2)" }}>
                            {assignment.notes ? `"${assignment.notes}"` : "No notes"}
                          </span>
                          <button
                            onClick={() => {
                              setEditingNotes(assignment.id!);
                              setEditNotesValue(assignment.notes || "");
                            }}
                            className="p-0.5 rounded opacity-0 group-hover/notes:opacity-100 transition-opacity"
                            style={{ color: "var(--muted)" }}
                            title="Edit notes"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    <span
                      className="text-[11px] font-medium px-1.5 py-0.5 rounded capitalize"
                      style={statusBadgeStyle(assignment.status)}
                    >
                      {assignment.status.replace("_", " ")}
                    </span>
                    {assignment.status !== "resolved" && (
                      <select
                        value={assignment.status}
                        onChange={(e) => updateAssignmentStatus(assignment.id!, e.target.value)}
                        className="text-[11px] px-1.5 py-1 rounded-md outline-none cursor-pointer"
                        style={{
                          background: "var(--background-secondary)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                        }}
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
                        className="p-1 rounded-md transition-colors disabled:opacity-40"
                        style={{ color: "var(--color-degraded)" }}
                        title="Send reminder email"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "color-mix(in srgb, var(--color-degraded) 10%, transparent)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
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
                      className="p-1 rounded-md transition-colors"
                      style={{ color: "var(--muted-2)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--color-down)";
                        e.currentTarget.style.background = "color-mix(in srgb, var(--color-down) 8%, transparent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--muted-2)";
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-14 pt-6 text-center" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-[11px]" style={{ color: "var(--muted-2)" }}>
            Platform Status Dashboard | Team, Ownership, Maintenance, and Incident Assignment Management
          </p>
        </footer>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      <div
        className="[&>input]:w-full [&>select]:w-full [&>textarea]:w-full
                    [&>input]:px-3 [&>select]:px-3 [&>textarea]:px-3
                    [&>input]:py-2 [&>select]:py-2 [&>textarea]:py-2
                    [&>input]:rounded-md [&>select]:rounded-md [&>textarea]:rounded-md
                    [&>input]:text-xs [&>select]:text-xs [&>textarea]:text-xs
                    [&>input]:outline-none [&>select]:outline-none [&>textarea]:outline-none"
        style={{
          // @ts-expect-error -- CSS custom props
          "--field-bg": "var(--background-secondary)",
          "--field-border": "var(--border)",
          "--field-color": "var(--foreground)",
        }}
      >
        <style>{`
          .field-wrapper > input, .field-wrapper > select, .field-wrapper > textarea {
            background: var(--background-secondary);
            border: 1px solid var(--border);
            color: var(--foreground);
          }
        `}</style>
        <div className="field-wrapper">
          {children}
        </div>
      </div>
    </div>
  );
}
