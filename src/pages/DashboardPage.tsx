import React, { useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  Briefcase,
  CheckCircle2,
  Clock,
  Compass,
  FileUp,
  Target,
  Play,
  BookOpen,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { calculateJobMatch } from '../utils/matchingEngine';
import { Button, EmptyState, ProgressBar, Select, StatusText, Surface } from '../components/ui/Primitives';

interface LayoutOutletContext {
  openAssistantDrawer: () => void;
}

export function DashboardPage() {
  const {
    profile,
    skills,
    jobs,
    selectedJobs,
    roadmapItems,
    courses,
    dailyTasks,
    assessments,
    applications,
    matchingWeights,
    selectTargetJob,
    updateDailyTask,
  } = useApp();
  const navigate = useNavigate();
  const { openAssistantDrawer } = useOutletContext<LayoutOutletContext>();
  const [jobSort, setJobSort] = useState<'match' | 'company' | 'newest'>('match');

  // Rank recommended jobs with live explainable match engine + user-selected sort
  const rankedJobs = useMemo(() => {
    const preferredCompanies = new Set(
      (profile?.preferences?.preferredCompanies || []).map((c) => c.toLowerCase())
    );
    return jobs
      .map((job) => ({
        job,
        match: calculateJobMatch(job, profile, skills, matchingWeights),
        isPreferred: preferredCompanies.has(job.company.toLowerCase()),
      }))
      .sort((a, b) => {
        if (jobSort === 'company') {
          return a.job.company.localeCompare(b.job.company);
        }
        if (jobSort === 'newest') {
          return b.job.postedDate.localeCompare(a.job.postedDate);
        }
        if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
        return b.match.overallScore - a.match.overallScore;
      });
  }, [jobs, profile, skills, matchingWeights, jobSort]);

  const primarySelected = selectedJobs[0];
  const topMatchScore = primarySelected
    ? primarySelected.matchScore
    : rankedJobs[0]?.match.overallScore || 0;

  const verifiedSkillsCount = skills.filter(
    (s) => s.verificationStatus === 'assessment_verified' || s.verificationStatus === 'evidence_supported'
  ).length;

  const totalLearningUnits = roadmapItems.length + courses.length + dailyTasks.length;
  const completedLearningUnits =
    roadmapItems.filter((r) => r.status === 'completed').length +
    courses.filter((c) => c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending').length +
    dailyTasks.filter((t) => t.status === 'completed').length;
  const overallLearningProgress =
    totalLearningUnits > 0 ? Math.round((completedLearningUnits / totalLearningUnits) * 100) : 0;

  const priorityTask =
    dailyTasks.find((t) => t.status === 'in_progress') ||
    dailyTasks.find((t) => t.status === 'pending' && t.priority === 'high') ||
    dailyTasks.find((t) => t.status === 'pending');

  const coursesInProgress = courses.filter((c) => c.status === 'in_progress').length;
  const completedCourses = courses.filter(
    (c) => c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending'
  ).length;

  // Application pipeline snapshot (5 key stages requested for Dashboard)
  const pipelineCounts = useMemo(
    () => [
      { label: 'Interested', count: applications.filter((a) => a.status === 'Interested').length },
      {
        label: 'Preparing',
        count: applications.filter((a) => a.status === 'Preparing' || a.status === 'Ready to Apply').length,
      },
      {
        label: 'Applied',
        count: applications.filter((a) => a.status === 'Applied' || a.status === 'Assessment Scheduled').length,
      },
      { label: 'Interview', count: applications.filter((a) => a.status === 'Interview Scheduled').length },
      { label: 'Selected', count: applications.filter((a) => a.status === 'Selected').length },
    ],
    [applications]
  );

  // One concise, personalized AI Career Insight grounded in real student data
  const aiInsight = useMemo(() => {
    if (!profile?.resumes?.length && skills.length < 3) {
      return {
        headline: 'Establish your evidence baseline first',
        body: 'Upload your PDF/DOCX resume or connect your public GitHub username so Chokma can map your real skills against target roles like Cloud Support Associate.',
        cta: 'Complete Profile',
        to: '/profile',
      };
    }
    if (selectedJobs.length === 0) {
      const top = rankedJobs[0];
      return {
        headline: `Select ${top?.job.title || 'a target role'} to unlock your roadmap`,
        body: `You currently match ${top?.match.overallScore || 0}% on ${top?.job.title || 'Cloud Support Associate'} (${top?.job.company || 'Amazon'}). Selecting it generates a personalized gap roadmap, courses, and daily tasks.`,
        cta: 'Explore Jobs',
        to: '/jobs/recommended',
      };
    }
    const firstGap = primarySelected?.missingSkills?.[0] || primarySelected?.unverifiedSkills?.[0];
    if (firstGap) {
      return {
        headline: `Prioritize verifying ${firstGap} next`,
        body: `Closing or verifying ${firstGap} for ${primarySelected.jobTitle} (${primarySelected.company}) will strengthen your evidence-backed match score and technical readiness.`,
        cta: 'Verify with Assessment',
        to: '/learning/assessments',
      };
    }
    return {
      headline: `Strong momentum on ${primarySelected?.jobTitle}`,
      body: 'Review your application guide and log your application once you submit through the official employer portal.',
      cta: 'Open Application Tracker',
      to: '/applications',
    };
  }, [profile, skills, selectedJobs, rankedJobs, primarySelected]);

  const firstName = (profile?.displayName || 'Student').split(' ')[0];

  return (
    <div className="space-y-8">
      {/* A. Welcome Section */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-slate-200/90 dark:border-slate-800">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {profile?.careerObjective ||
              'Track your career readiness, skill evidence, target jobs, and daily learning plan.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span>
              Target role:{' '}
              <strong className="font-medium text-slate-900 dark:text-slate-100">
                {primarySelected ? `${primarySelected.jobTitle} · ${primarySelected.company}` : 'Not selected yet'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>{profile?.degree || 'B.Tech'}{profile?.graduationYear ? ` · Class of ${profile.graduationYear}` : ''}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
            <FileUp className="w-3.5 h-3.5" />
            Upload Resume
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate('/jobs/recommended')}>
            <Briefcase className="w-3.5 h-3.5" />
            Live Job Search
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/learning/roadmap')}>
            <Compass className="w-3.5 h-3.5" />
            3D Roadmap Studio
          </Button>
        </div>
      </section>

      {/* B. Overview Metrics (5 crisp separated KPIs, tabular-nums, zero card nesting) */}
      <section aria-label="Career position overview">
        <Surface className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-200/80 dark:divide-slate-800">
          <div className="p-5 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Profile Completeness</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {profile?.profileCompleteness ?? 0}%
            </p>
            <ProgressBar value={profile?.profileCompleteness ?? 0} tone="indigo" label="Profile completeness" />
          </div>

          <div className="p-5 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {primarySelected ? 'Target Job Match' : 'Top Sample Match'}
            </p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {topMatchScore}%
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Evidence alignment score</p>
          </div>

          <div className="p-5 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Learning Progress</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {overallLearningProgress}%
            </p>
            <ProgressBar value={overallLearningProgress} tone="emerald" label="Learning progress" />
          </div>

          <div className="p-5 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Verified Skills</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {verifiedSkillsCount}
              <span className="text-sm font-normal text-slate-400">/{skills.length}</span>
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Evidence or assessment</p>
          </div>

          <div className="p-5 space-y-2 col-span-2 md:col-span-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">Selected Jobs</p>
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {selectedJobs.length}
            </p>
            <button
              type="button"
              onClick={() => navigate('/jobs/selected')}
              className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              View roadmaps →
            </button>
          </div>
        </Surface>
      </section>

      {/* Main 12-col Asymmetric Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Selected Target Jobs + Recommended Jobs */}
        <div className="lg:col-span-7 space-y-6">
          {/* D. Selected Target Jobs */}
          <Surface>
            <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Selected Target Jobs
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Independent skill gaps, learning progress, and application status per target role.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/jobs/selected')}>
                Manage all
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>

            {selectedJobs.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No target job selected yet"
                description="Select Cloud Support Associate or any matching role to compute skill gaps and generate your personalized roadmap."
                action={
                  <Button
                    size="sm"
                    onClick={async () => {
                      const csa = jobs.find((j) => j.id === 'job_aws_csa') || jobs[0];
                      if (csa) await selectTargetJob(csa);
                    }}
                  >
                    Select Cloud Support Associate (Demo Role)
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {selectedJobs.slice(0, 3).map((sel) => (
                  <div key={sel.id} className="px-6 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => navigate(`/jobs/${sel.jobId}`)}
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-400 text-left cursor-pointer"
                        >
                          {sel.jobTitle}
                        </button>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span>{sel.company}</span>
                          <span aria-hidden="true">·</span>
                          <span>{sel.applicationStatus}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {(sel.missingSkills?.length || 0) + (sel.unverifiedSkills?.length || 0)} gaps to close
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                          {sel.matchScore}% match
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500">
                          {sel.learningProgress}% roadmap
                        </p>
                      </div>
                    </div>
                    <ProgressBar value={sel.learningProgress} tone="indigo" label={`${sel.jobTitle} progress`} />
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* C. Recommended Jobs */}
          <Surface>
            <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Recommended Jobs
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ranked by your preferences and explainable evidence match · Sortable below.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Sort dashboard recommended jobs"
                  className="h-8 text-xs w-36"
                  value={jobSort}
                  onChange={(e) => setJobSort(e.target.value as 'match' | 'company' | 'newest')}
                >
                  <option value="match">Sort: Best Match</option>
                  <option value="company">Sort: Company A–Z</option>
                  <option value="newest">Sort: Newest</option>
                </Select>
                <Button variant="ghost" size="sm" onClick={() => navigate('/jobs/recommended')}>
                  View all
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {rankedJobs.slice(0, 4).map(({ job, match }) => {
                const alreadySelected = selectedJobs.some((s) => s.jobId === job.id);
                return (
                  <div key={job.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-400 text-left cursor-pointer"
                        >
                          {job.title}
                        </button>
                        {job.isSampleListing && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            · Sample Reference
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{job.company}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.location}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.jobType}</span>
                        <span aria-hidden="true">·</span>
                        <span>{job.workMode}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs">
                        <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                          {match.matchedSkills.length} matched
                        </span>
                        <span className="text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                          {match.unverifiedSkills.length} unverified
                        </span>
                        <span className="text-red-700 dark:text-red-400 font-mono tabular-nums">
                          {match.missingSkills.length} missing
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {match.overallScore}%
                        </span>
                        <p className="text-[11px] text-slate-500">Match</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${job.id}`)}>
                          Details
                        </Button>
                        {!alreadySelected && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => selectTargetJob(job)}
                          >
                            Select
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Surface>
        </div>

        {/* Right 5 columns: Today's Learning, AI Insight, Learning Progress, Application Tracker */}
        <div className="lg:col-span-5 space-y-6">
          {/* E. Today's Learning */}
          <Surface className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Today&apos;s Priority Task
              </h2>
              <button
                type="button"
                onClick={() => navigate('/learning/tasks')}
                className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                All tasks ({dailyTasks.length})
              </button>
            </div>

            {priorityTask ? (
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {priorityTask.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <span>Skill: {priorityTask.targetSkill}</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Clock className="w-3 h-3" />
                      {priorityTask.estimatedMinutes} min
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {priorityTask.description || 'Complete this guided practice task and record your evidence.'}
                </p>
                <div className="flex items-center justify-between pt-2">
                  <StatusText
                    tone={priorityTask.status === 'in_progress' ? 'info' : 'warning'}
                    label={priorityTask.status === 'in_progress' ? 'In Progress' : 'Ready to Start'}
                  />
                  <div className="flex items-center gap-2">
                    {priorityTask.status === 'pending' ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await updateDailyTask(priorityTask.id, { status: 'in_progress' });
                          toast.success('Task started');
                        }}
                      >
                        <Play className="w-3.5 h-3.5" />
                        Start Task
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => navigate('/learning/tasks')}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Submit Evidence
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                No pending daily tasks yet. Select a target job to automatically generate daily
                hands-on learning tasks tailored to your skill gaps.
              </p>
            )}
          </Surface>

          {/* H. AI Career Insight */}
          <Surface className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-400">
                <Bot className="w-4 h-4" />
                <span>AI Career Insight</span>
              </div>
              <button
                type="button"
                onClick={openAssistantDrawer}
                className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Open Assistant
              </button>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {aiInsight.headline}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {aiInsight.body}
            </p>
            <div className="pt-1 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(aiInsight.to)}>
                {aiInsight.cta}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Surface>

          {/* F. Learning Progress Breakdown */}
          <Surface className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Learning Progress
              </h2>
              <button
                type="button"
                onClick={() => navigate('/learning/outcomes')}
                className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Outcomes →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Roadmap Milestones</p>
                <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {roadmapItems.filter((r) => r.status === 'completed').length}/{roadmapItems.length}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Courses in Progress</p>
                <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {coursesInProgress}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Completed Courses</p>
                <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {completedCourses}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 dark:text-slate-400">Assessments Passed</p>
                <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {assessments.filter((a) => a.passed).length}/{assessments.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" variant="ghost" onClick={() => navigate('/learning/courses')}>
                <BookOpen className="w-3.5 h-3.5" />
                Courses
              </Button>
              <Button size="sm" variant="ghost" onClick={() => navigate('/learning/assessments')}>
                <ShieldCheck className="w-3.5 h-3.5" />
                Verify Skills
              </Button>
            </div>
          </Surface>

          {/* G. Application Tracker Pipeline */}
          <Surface className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Application Pipeline
              </h2>
              <button
                type="button"
                onClick={() => navigate('/applications')}
                className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Open tracker →
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              {pipelineCounts.map((stage) => (
                <div
                  key={stage.label}
                  className="py-2.5 px-1 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                >
                  <p className="text-base font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {stage.count}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {stage.label}
                  </p>
                </div>
              ))}
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}
