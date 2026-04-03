"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
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
} from "lucide-react";
import Link from "next/link";
import { TeamMember, IncidentAssignment, Incident } from "@/types";

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [assignments, setAssignments] = useState<IncidentAssignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", email: "", role: "engineer" });
  const [assignForm, setAssignForm] = useState({ incidentId: "", assigneeId: "", notes: "", deadline: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [teamRes, assignRes, incidentRes] = await Promise.all([
        fetch("/api/team"),
        fetch("/api/assignments"),
        fetch("/api/incidents?active=true"),
      ]);
      const teamData = await teamRes.json();
      const assignData = await assignRes.json();
      const incidentData = await incidentRes.json();

      setMembers(teamData.members || []);
      setAssignments(assignData.assignments || []);
      setIncidents(incidentData.incidents || []);
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

  const statusIcon = (status: string) => {
    switch (status) {
      case "open": return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case "in_progress": return <Clock className="w-4 h-4 text-yellow-400" />;
      case "resolved": return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      default: return null;
    }
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-500/10 text-red-400 border-red-500/30";
      case "in_progress": return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      case "resolved": return "bg-green-500/10 text-green-400 border-green-500/30";
      default: return "bg-gray-500/10 text-gray-400 border-gray-500/30";
    }
  };

  const severityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-red-400";
      case "major": return "text-orange-400";
      case "minor": return "text-yellow-400";
      default: return "text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{ background: "var(--card)", color: "var(--muted)" }}
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-indigo-400" />
              <h1 className="text-2xl font-bold">Team & Assignments</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowAddMember(true); setFormError(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <UserPlus className="w-4 h-4" /> Add Member
            </button>
            <button
              onClick={() => { setShowAssign(true); setFormError(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              disabled={members.length === 0 || incidents.length === 0}
              title={members.length === 0 ? "Add team members first" : incidents.length === 0 ? "No active incidents to assign" : ""}
            >
              <ClipboardList className="w-4 h-4" /> Assign Incident
            </button>
          </div>
        </header>

        {/* Add Member Modal */}
        {showAddMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-400" /> Add Team Member
                </h2>
                <button onClick={() => setShowAddMember(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
              </div>
              {formError && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{formError}</div>}
              <form onSubmit={addMember} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Name</label>
                  <input
                    type="text" required value={memberForm.name}
                    onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Email</label>
                  <input
                    type="email" required value={memberForm.email}
                    onChange={(e) => setMemberForm({ ...memberForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Role</label>
                  <select
                    value={memberForm.role}
                    onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                  >
                    <option value="engineer">Engineer</option>
                    <option value="lead">Lead</option>
                    <option value="manager">Manager</option>
                    <option value="devops">DevOps</option>
                    <option value="qa">QA</option>
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowAddMember(false)}
                    className="flex-1 px-4 py-2 rounded-lg text-sm border transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors">
                    {submitting ? "Adding..." : "Add Member"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Incident Modal */}
        {showAssign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-400" /> Assign Incident
                </h2>
                <button onClick={() => setShowAssign(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
              </div>
              {formError && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{formError}</div>}
              <form onSubmit={createAssignment} className="space-y-4">
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Incident</label>
                  <select required value={assignForm.incidentId}
                    onChange={(e) => setAssignForm({ ...assignForm, incidentId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                    <option value="">Select an incident...</option>
                    {incidents.map((inc) => (
                      <option key={inc.id} value={inc.id}>
                        #{inc.id} — {inc.title} ({inc.severity})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Assign To</label>
                  <select required value={assignForm.assigneeId}
                    onChange={(e) => setAssignForm({ ...assignForm, assigneeId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                    <option value="">Select a team member...</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role}) — {m.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Deadline (optional)</label>
                  <input
                    type="datetime-local" value={assignForm.deadline}
                    onChange={(e) => setAssignForm({ ...assignForm, deadline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1" style={{ color: "var(--muted)" }}>Notes (optional)</label>
                  <textarea
                    value={assignForm.notes} rows={3}
                    onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                    style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    placeholder="Investigation notes, steps to take..."
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowAssign(false)}
                    className="flex-1 px-4 py-2 rounded-lg text-sm border transition-colors"
                    style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors">
                    {submitting ? "Assigning..." : "Assign & Notify"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Team Members Section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" /> Team Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <Users className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p style={{ color: "var(--muted)" }}>No team members yet. Add someone to get started.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => {
                const memberAssignments = assignments.filter((a) => a.assigneeId === member.id && a.status !== "resolved");
                return (
                  <div key={member.id} className="rounded-xl p-4 transition-colors"
                    style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-medium">{member.name}</h3>
                        <p className="text-sm flex items-center gap-1" style={{ color: "var(--muted)" }}>
                          <Mail className="w-3 h-3" /> {member.email}
                        </p>
                      </div>
                      <button onClick={() => deleteMember(member.id!)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 capitalize">
                        {member.role}
                      </span>
                      {memberAssignments.length > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          {memberAssignments.length} active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Assignments Section */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-400" /> Incident Assignments ({assignments.length})
          </h2>
          {assignments.length === 0 ? (
            <div className="rounded-xl p-8 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p style={{ color: "var(--muted)" }}>No assignments yet. Assign an incident to a team member above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded-xl p-4 transition-colors"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(assignment.status)}
                        <span className="font-medium">
                          Incident #{assignment.incidentId}
                        </span>
                        <span className={`text-xs ${severityColor(assignment.incidentSeverity || "")}`}>
                          {assignment.incidentSeverity?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>
                        {assignment.incidentTitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {assignment.assigneeName}
                        </span>
                        {assignment.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(assignment.deadline).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                          </span>
                        )}
                        {assignment.notes && (
                          <span className="italic">
                            &ldquo;{assignment.notes.length > 60 ? assignment.notes.slice(0, 60) + "..." : assignment.notes}&rdquo;
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${statusBadgeColor(assignment.status)}`}>
                        {assignment.status.replace("_", " ")}
                      </span>
                      {assignment.status !== "resolved" && (
                        <select
                          value={assignment.status}
                          onChange={(e) => updateAssignmentStatus(assignment.id!, e.target.value)}
                          className="text-xs px-2 py-1 rounded-lg outline-none cursor-pointer"
                          style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      )}
                      <button onClick={() => deleteAssignment(assignment.id!)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-12 text-center text-xs py-6" style={{ color: "var(--muted)" }}>
          <p>Platform Status Dashboard | Team & Incident Assignment Management</p>
        </footer>
      </div>
    </div>
  );
}
