import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  ExternalLink,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { APPLICATION_STATUSES, ApplicationStatus, JobApplication } from '../types';
import { isSafeHttpUrl, makeSafeId } from '../lib/utils';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  Select,
  StatusText,
  Surface,
  Textarea,
} from '../components/ui/Primitives';

function statusTone(status: ApplicationStatus): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'Selected') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Interview Scheduled' || status === 'Assessment Scheduled' || status === 'Applied') return 'info';
  if (status === 'Ready to Apply' || status === 'On Hold') return 'warning';
  return 'neutral';
}

export function ApplicationsPage({ embedded = false }: { embedded?: boolean }) {
  const { applications, upsertApplication, deleteApplication } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ApplicationStatus>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<JobApplication | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    jobTitle: '',
    company: '',
    location: '',
    officialUrl: '',
    status: 'Interested' as ApplicationStatus,
    dateApplied: '',
    deadline: '',
    interviewDate: '',
    nextAction: '',
    notes: '',
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      jobTitle: '',
      company: '',
      location: '',
      officialUrl: '',
      status: 'Interested',
      dateApplied: '',
      deadline: '',
      interviewDate: '',
      nextAction: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEdit = (app: JobApplication) => {
    setEditing(app);
    setForm({
      jobTitle: app.jobTitle,
      company: app.company,
      location: app.location || '',
      officialUrl: app.officialUrl,
      status: app.status,
      dateApplied: app.dateApplied || '',
      deadline: app.deadline || '',
      interviewDate: app.interviewDate || '',
      nextAction: app.nextAction || '',
      notes: app.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.jobTitle.trim() || !form.company.trim()) return;
    await upsertApplication({
      id: editing?.id,
      jobId: editing?.jobId || makeSafeId('extjob'),
      jobTitle: form.jobTitle.trim(),
      company: form.company.trim(),
      location: form.location.trim(),
      officialUrl: form.officialUrl.trim() || 'https://careers.google.com',
      status: form.status,
      dateApplied: form.dateApplied,
      deadline: form.deadline,
      interviewDate: form.interviewDate,
      nextAction: form.nextAction,
      notes: form.notes,
    });
    toast.success(editing ? 'Application updated' : 'Application added to tracker');
    setModalOpen(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false;
      if (q && !`${a.jobTitle} ${a.company} ${a.notes || ''} ${a.nextAction || ''}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [applications, search, statusFilter]);

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track employer portal submissions, deadlines, interviews, and next actions across all opportunities.
          </p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Record Application
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Application Tracker
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Track official employer portal submissions, deadlines, interviews, and follow-ups. Chokma opens official links directly without auto-submitting on your behalf.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Record Application
          </Button>
        </div>
      )}

      {/* Status Pipeline Summary */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {APPLICATION_STATUSES.map((st) => {
          const count = applications.filter((a) => a.status === st).length;
          const active = statusFilter === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(active ? 'All' : st)}
              className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-600 dark:border-indigo-500'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {count}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{st}</p>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Controls */}
      <Surface className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, role, or notes..."
            className="pl-9"
            aria-label="Search applications"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Filter by status"
            className="w-48"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'All' | ApplicationStatus)}
          >
            <option value="All">All Statuses ({applications.length})</option>
            {APPLICATION_STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </Select>
        </div>
      </Surface>

      {/* Applications Table */}
      <Surface>
        {filtered.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No applications recorded"
            description="Open an official employer application link from Job Details or record an application manually to track deadlines and interviews."
            action={
              <Button size="sm" onClick={openCreate}>
                Record First Application
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5">Company &amp; Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Applied</th>
                  <th className="py-3 px-3">Deadline</th>
                  <th className="py-3 px-3">Next Action</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{app.jobTitle}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {app.company} {app.location ? `· ${app.location}` : ''}
                      </p>
                      {app.notes && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                          {app.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-3">
                      <Select
                        aria-label={`Change status for ${app.jobTitle}`}
                        className="h-8 text-xs w-40"
                        value={app.status}
                        onChange={async (e) => {
                          await upsertApplication({
                            ...app,
                            status: e.target.value as ApplicationStatus,
                          });
                          toast.success(`Status updated to ${e.target.value}`);
                        }}
                      >
                        {APPLICATION_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </Select>
                      <div className="mt-1">
                        <StatusText tone={statusTone(app.status)} label={app.status} />
                      </div>
                    </td>
                    <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {app.dateApplied || '—'}
                    </td>
                    <td className="py-3.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {app.deadline || '—'}
                    </td>
                    <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 max-w-[220px] truncate">
                      {app.nextAction || (app.interviewDate ? `Interview: ${app.interviewDate}` : '—')}
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="inline-flex items-center gap-1">
                        {isSafeHttpUrl(app.officialUrl) && (
                          <a
                            href={app.officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open official employer portal"
                            className="p-1.5 rounded-md text-slate-500 hover:text-indigo-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(app)}
                          aria-label={`Edit ${app.jobTitle}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteId(app.id)}
                          aria-label={`Delete ${app.jobTitle}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Application Record' : 'Record Job Application'}
        description="Maintain accurate dates, official links, and interview notes."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="app-company">Company</FieldLabel>
              <Input
                id="app-company"
                required
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="e.g. Amazon"
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-title">Job title</FieldLabel>
              <Input
                id="app-title"
                required
                value={form.jobTitle}
                onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                placeholder="e.g. Cloud Support Associate"
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-loc">Location</FieldLabel>
              <Input
                id="app-loc"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Bengaluru, India"
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-status">Pipeline status</FieldLabel>
              <Select
                id="app-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ApplicationStatus })}
              >
                {APPLICATION_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="app-applied">Date applied</FieldLabel>
              <Input
                id="app-applied"
                type="date"
                value={form.dateApplied}
                onChange={(e) => setForm({ ...form, dateApplied: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-deadline">Application deadline</FieldLabel>
              <Input
                id="app-deadline"
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-interview">Interview date (optional)</FieldLabel>
              <Input
                id="app-interview"
                type="date"
                value={form.interviewDate}
                onChange={(e) => setForm({ ...form, interviewDate: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel htmlFor="app-url">Official employer URL</FieldLabel>
              <Input
                id="app-url"
                type="url"
                required
                value={form.officialUrl}
                onChange={(e) => setForm({ ...form, officialUrl: e.target.value })}
                placeholder="https://www.amazon.jobs/..."
              />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="app-next">Next action</FieldLabel>
            <Input
              id="app-next"
              value={form.nextAction}
              onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
              placeholder="e.g. Complete IAM assessment before applying"
            />
          </div>
          <div>
            <FieldLabel htmlFor="app-notes">Notes</FieldLabel>
            <Textarea
              id="app-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Referral details, recruiter contact, interview topics..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Record</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) deleteApplication(deleteId);
        }}
        title="Delete application record?"
        message="This permanently removes the application entry from your tracker."
      />
    </div>
  );
}
