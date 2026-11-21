import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ClipboardList, Compass, Target } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { calculateJobMatch } from '../utils/matchingEngine';
import { Button, ProgressBar, Surface } from '../components/ui/Primitives';
import { DashboardLeftNav } from '../components/ui/DashboardLeftNav';
import { RecommendedJobsPage } from './RecommendedJobsPage';
import { SelectedJobsPage } from './SelectedJobsPage';
import { ApplicationsPage } from './ApplicationsPage';

export type JobIntelligenceSection = 'recommended' | 'selected' | 'applications';

const SECTION_ROUTES: Record<JobIntelligenceSection, string> = {
  recommended: '/jobs/recommended',
  selected: '/jobs/selected',
  applications: '/applications',
};

export function JobIntelligenceDashboard({
  section = 'recommended',
}: {
  section?: JobIntelligenceSection;
}) {
  const { profile, skills, jobs, selectedJobs, applications, savedJobIds, matchingWeights } = useApp();
  const navigate = useNavigate();

  const metrics = useMemo(() => {
    const topCatalogMatch =
      jobs.length > 0
        ? Math.max(...jobs.map((j) => calculateJobMatch(j, profile, skills, matchingWeights).overallScore))
        : 0;
    const avgSelectedMatch =
      selectedJobs.length > 0
        ? Math.round(selectedJobs.reduce((sum, s) => sum + (s.matchScore || 0), 0) / selectedJobs.length)
        : topCatalogMatch;
    const activeApps = applications.filter((a) => a.status !== 'Rejected').length;
    const interviews = applications.filter(
      (a) => a.status === 'Interview Scheduled' || a.status === 'Assessment Scheduled'
    ).length;

    return {
      topCatalogMatch,
      avgSelectedMatch,
      activeApps,
      interviews,
    };
  }, [jobs, profile, skills, matchingWeights, selectedJobs, applications]);

  return (
    <div className="space-y-6">
      {/* Dedicated Job Intelligence Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Job Intelligence Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Live Google Search hiring discovery, explainable job recommendations, selected target roles, and application pipeline in one workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/learning/roadmap')}
          >
            <Compass className="w-3.5 h-3.5" />
            Open Learning Outcomes
          </Button>
        </div>
      </div>

      {/* 4-KPI Job Intelligence Summary Strip */}
      <Surface className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80 dark:divide-slate-800">
        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Recommended Catalog</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {jobs.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Top alignment {metrics.topCatalogMatch}%
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Selected Target Jobs</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            {selectedJobs.length}
          </p>
          <ProgressBar value={metrics.avgSelectedMatch} tone="indigo" label="Average target job match" />
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tracked Applications</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {applications.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {metrics.activeApps} active · {metrics.interviews} interviews/tests
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Saved Opportunities</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {savedJobIds.length}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Bookmarked for review
          </p>
        </div>
      </Surface>

      {/* Left Sidebar Navigation + Active Job Intelligence Module */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <DashboardLeftNav
          title="Job Intelligence"
          active={section}
          onChange={(next) => navigate(SECTION_ROUTES[next])}
          items={[
            {
              id: 'recommended',
              label: 'Recommendations & Search',
              count: jobs.length,
              icon: <Briefcase className="w-4 h-4" />,
            },
            {
              id: 'selected',
              label: 'Selected Jobs',
              count: selectedJobs.length,
              icon: <Target className="w-4 h-4" />,
            },
            {
              id: 'applications',
              label: 'Applications',
              count: applications.length,
              icon: <ClipboardList className="w-4 h-4" />,
            },
          ]}
        />

        <div className="flex-1 min-w-0 w-full">
          {section === 'recommended' && <RecommendedJobsPage embedded />}
          {section === 'selected' && <SelectedJobsPage embedded />}
          {section === 'applications' && <ApplicationsPage embedded />}
        </div>
      </div>
    </div>
  );
}
