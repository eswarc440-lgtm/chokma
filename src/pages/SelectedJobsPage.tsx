import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, RefreshCw, Target, Trash2, ExternalLink } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { isSafeHttpUrl } from '../lib/utils';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ProgressBar,
  StatusText,
  Surface,
} from '../components/ui/Primitives';

export function SelectedJobsPage({ embedded = false }: { embedded?: boolean }) {
  const {
    jobs,
    selectedJobs,
    roadmapItems,
    courses,
    dailyTasks,
    removeSelectedJob,
    generatePlanForSelectedJob,
  } = useApp();
  const navigate = useNavigate();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Each selected target job maintains its own skill gap analysis, learning roadmap, and application status.
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate('/jobs/recommended')}>
            Add Another Target Job
          </Button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              My Selected Jobs
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Each target job tracks its own independent skill gap analysis, learning roadmap, progress, and application status without altering your core profile.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/jobs/recommended')}>
            Add Another Target Job
          </Button>
        </div>
      )}

      {selectedJobs.length === 0 ? (
        <Surface>
          <EmptyState
            icon={Target}
            title="No selected target jobs yet"
            description="Select one or more jobs from Recommended Jobs to generate dedicated skill gap comparisons and personalized learning roadmaps."
            action={
              <Button size="sm" onClick={() => navigate('/jobs/recommended')}>
                Browse Recommended Jobs
              </Button>
            }
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {selectedJobs.map((sel) => {
            const fullJob = jobs.find((j) => j.id === sel.jobId);
            const relMilestones = roadmapItems.filter((r) => r.selectedJobId === sel.id);
            const relCourses = courses.filter((c) => c.selectedJobId === sel.id);
            const relTasks = dailyTasks.filter((t) => t.selectedJobId === sel.id);

            return (
              <Surface key={sel.id} className="p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/jobs/${sel.jobId}`)}
                        className="text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer"
                      >
                        {sel.jobTitle}
                      </button>
                      <StatusText
                        tone={sel.eligibilityPassed ? 'success' : 'warning'}
                        label={sel.eligibilityPassed ? 'Eligible Track' : 'Check Eligibility'}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{sel.company}</span>
                      <span aria-hidden="true">·</span>
                      <span>{sel.location || 'India'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{sel.jobType || 'Full-time'}</span>
                      <span aria-hidden="true">·</span>
                      <span>Status: {sel.applicationStatus}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {fullJob && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={regeneratingId === sel.id}
                        onClick={async () => {
                          setRegeneratingId(sel.id);
                          try {
                            await generatePlanForSelectedJob(sel, fullJob);
                          } finally {
                            setRegeneratingId(null);
                          }
                        }}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${regeneratingId === sel.id ? 'animate-spin' : ''}`} />
                        {regeneratingId === sel.id ? 'Generating...' : 'Regenerate Roadmap'}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => navigate(`/jobs/${sel.jobId}`)}>
                      Open 6-Tab Workspace
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${sel.jobTitle}`}
                      onClick={() => setConfirmRemoveId(sel.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  </div>
                </div>

                {/* Comparison metrics grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-200/80 dark:border-slate-800">
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Job Match Score</p>
                    <p className="text-xl font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400 mt-0.5">
                      {sel.matchScore}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Learning Progress</p>
                    <p className="text-xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                      {sel.learningProgress}%
                    </p>
                    <ProgressBar value={sel.learningProgress} tone="emerald" className="mt-1.5" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Roadmap Assets</p>
                    <p className="text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 mt-1.5">
                      {relMilestones.length} phases · {relCourses.length} courses · {relTasks.length} tasks
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Official Posting</p>
                    {isSafeHttpUrl(sel.officialUrl) ? (
                      <a
                        href={sel.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline mt-1.5"
                      >
                        Employer Portal <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </div>
                </div>

                {/* Skill gap summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                      Matched ({sel.matchedSkills?.length || 0})
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      {sel.matchedSkills?.length ? sel.matchedSkills.join(' · ') : 'Verify skills via projects or assessments to populate.'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                      Partial &amp; Unverified ({(sel.partialSkills?.length || 0) + (sel.unverifiedSkills?.length || 0)})
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      {[...(sel.partialSkills || []), ...(sel.unverifiedSkills || [])].join(' · ') || 'None'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-400 mb-1">
                      Missing Gaps ({sel.missingSkills?.length || 0})
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      {sel.missingSkills?.length ? sel.missingSkills.join(' · ') : 'No missing skills!'}
                    </p>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmRemoveId)}
        onClose={() => setConfirmRemoveId(null)}
        onConfirm={() => {
          if (confirmRemoveId) removeSelectedJob(confirmRemoveId);
        }}
        title="Remove target job?"
        message="This removes the role from My Selected Jobs. Your candidate profile and skills will remain unchanged."
        confirmLabel="Remove"
      />
    </div>
  );
}
