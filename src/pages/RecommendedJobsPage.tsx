import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark,
  BookmarkCheck,
  Briefcase,
  Building2,
  Check,
  ClipboardPlus,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import {
  LiveJobOpening,
  LiveJobSearchResponse,
  searchRealWorldJobsWithGoogle,
} from '../services/api';
import { isSafeHttpUrl } from '../lib/utils';
import { calculateJobMatch } from '../utils/matchingEngine';
import { Button, EmptyState, Input, Select, Surface } from '../components/ui/Primitives';

const QUICK_SEARCH_PRESETS = [
  { label: 'Amazon Cloud Support', query: 'Cloud Support Associate', company: 'Amazon', location: 'Bengaluru, India' },
  { label: 'Google SWE Intern', query: 'Software Engineer', company: 'Google', location: 'India' },
  { label: 'Microsoft Cloud / Azure', query: 'Cloud Engineer', company: 'Microsoft', location: 'Hyderabad, India' },
  { label: 'Deloitte Cybersecurity', query: 'Cloud Security Analyst', company: 'Deloitte', location: 'India' },
  { label: 'Remote Full-Stack Roles', query: 'Full Stack Developer', company: '', location: 'Remote' },
];

export function RecommendedJobsPage({ embedded = false }: { embedded?: boolean }) {
  const {
    profile,
    skills,
    jobs,
    selectedJobs,
    applications,
    matchingWeights,
    savedJobIds,
    toggleSavedJob,
    selectTargetJob,
    upsertApplication,
  } = useApp();
  const navigate = useNavigate();

  // Live Google Search state
  const [liveQuery, setLiveQuery] = useState(
    profile?.preferences?.preferredRoles?.[0] || 'Cloud Support Associate'
  );
  const [liveCompany, setLiveCompany] = useState(
    profile?.preferences?.preferredCompanies?.[0] || ''
  );
  const [liveLocation, setLiveLocation] = useState(
    profile?.preferences?.preferredLocations?.[0] || 'India'
  );
  const [liveJobType, setLiveJobType] = useState('All');
  const [liveSearching, setLiveSearching] = useState(false);
  const [liveResult, setLiveResult] = useState<LiveJobSearchResponse | null>(null);
  const [liveSort, setLiveSort] = useState<'default' | 'company' | 'title'>('default');
  const [trackingOpeningId, setTrackingOpeningId] = useState<string | null>(null);

  // Catalog filter & sort state
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [jobTypeFilter, setJobTypeFilter] = useState('All');
  const [workModeFilter, setWorkModeFilter] = useState('All');
  const [minMatch, setMinMatch] = useState(0);
  const [sortBy, setSortBy] = useState<'relevance' | 'company' | 'eligibility' | 'recency'>('relevance');
  const [onlySaved, setOnlySaved] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const companies = useMemo(() => {
    const set = new Set(jobs.map((j) => j.company));
    return ['All', ...Array.from(set).sort()];
  }, [jobs]);

  const preferredSet = useMemo(
    () => new Set((profile?.preferences?.preferredCompanies || []).map((c) => c.toLowerCase())),
    [profile]
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs
      .map((job) => ({
        job,
        match: calculateJobMatch(job, profile, skills, matchingWeights),
        isPreferred: preferredSet.has(job.company.toLowerCase()),
      }))
      .filter(({ job, match }) => {
        if (onlySaved && !savedJobIds.includes(job.id)) return false;
        if (companyFilter !== 'All' && job.company !== companyFilter) return false;
        if (jobTypeFilter !== 'All' && job.jobType !== jobTypeFilter) return false;
        if (workModeFilter !== 'All' && job.workMode !== workModeFilter) return false;
        if (match.overallScore < minMatch) return false;
        if (q) {
          const hay = `${job.title} ${job.company} ${job.location} ${job.requiredSkills.map((s) => s.name).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'company') {
          return a.job.company.localeCompare(b.job.company);
        }
        if (sortBy === 'recency') {
          return b.job.postedDate.localeCompare(a.job.postedDate);
        }
        if (sortBy === 'eligibility') {
          if (a.match.eligibilityPassed !== b.match.eligibilityPassed) {
            return a.match.eligibilityPassed ? -1 : 1;
          }
          return b.match.overallScore - a.match.overallScore;
        }
        if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
        return b.match.overallScore - a.match.overallScore;
      });
  }, [
    jobs,
    profile,
    skills,
    matchingWeights,
    preferredSet,
    search,
    companyFilter,
    jobTypeFilter,
    workModeFilter,
    minMatch,
    sortBy,
    onlySaved,
    savedJobIds,
  ]);

  const sortedLiveOpenings = useMemo(() => {
    if (!liveResult?.openings) return [];
    const list = [...liveResult.openings];
    if (liveSort === 'company') {
      list.sort((a, b) => a.company.localeCompare(b.company));
    } else if (liveSort === 'title') {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [liveResult, liveSort]);

  const handleSelect = async (job: typeof jobs[number]) => {
    setSelectingId(job.id);
    try {
      await selectTargetJob(job);
    } finally {
      setSelectingId(null);
    }
  };

  const handleLiveGoogleSearch = async (overrides?: {
    query?: string;
    company?: string;
    location?: string;
  }) => {
    const q = (overrides?.query ?? liveQuery).trim();
    const comp = (overrides?.company ?? liveCompany).trim();
    const loc = (overrides?.location ?? liveLocation).trim();
    if (!q && !comp) {
      toast.info('Enter a target role, skill, or company name to search live openings.');
      return;
    }
    setLiveSearching(true);
    try {
      const data = await searchRealWorldJobsWithGoogle({
        query: q || 'Software Engineer',
        company: comp,
        location: loc,
        jobType: liveJobType === 'All' ? '' : liveJobType,
      });
      setLiveResult(data);
      toast.success(
        `Found ${data.openings.length} live hiring signals & ${data.sources.length} verified Google Search sources`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Live Google Search failed. Please try again.');
    } finally {
      setLiveSearching(false);
    }
  };

  const handleTrackLiveOpening = async (opening: LiveJobOpening) => {
    setTrackingOpeningId(opening.id);
    try {
      const safeUrl = isSafeHttpUrl(opening.careerUrl)
        ? opening.careerUrl
        : `https://www.google.com/search?q=${encodeURIComponent(`${opening.company} ${opening.title} careers`)}`;
      await upsertApplication({
        jobId: opening.id,
        jobTitle: opening.title,
        company: opening.company,
        location: opening.location,
        officialUrl: safeUrl,
        status: 'Interested',
        nextAction: `Review role requirements & apply via ${opening.company} careers portal`,
        notes: `${opening.availabilityStatus}. ${opening.summary}`.slice(0, 600),
      });
      toast.success(`Added "${opening.title}" at ${opening.company} to Applications`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save application');
    } finally {
      setTrackingOpeningId(null);
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Job Intelligence &amp; Live Search
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Search live real-world company openings using Google Search grounding, or compare against your matched career catalog.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={onlySaved ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setOnlySaved((v) => !v)}
            >
              <Bookmark className="w-3.5 h-3.5" />
              Saved ({savedJobIds.length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/jobs/selected')}>
              My Selected Jobs ({selectedJobs.length})
            </Button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* LIVE GOOGLE SEARCH — REAL-WORLD COMPANIES & HIRING AVAILABILITY       */}
      {/* ===================================================================== */}
      <Surface className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Real-World Job &amp; Company Availability Search (Google Search Grounded)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live web search for active company career portals, hiring availability, and entry-level roles
              </p>
            </div>
          </div>
          {liveResult && (
            <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {liveResult.openings.length} openings · {liveResult.sources.length} verified web sources
            </span>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLiveGoogleSearch();
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5"
        >
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              value={liveQuery}
              onChange={(e) => setLiveQuery(e.target.value)}
              placeholder="Role or skill (e.g. Cloud Engineer, React)"
              className="pl-9"
              aria-label="Live search role or skill"
            />
          </div>
          <div className="lg:col-span-3 relative">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              value={liveCompany}
              onChange={(e) => setLiveCompany(e.target.value)}
              placeholder="Company (optional, e.g. Amazon)"
              className="pl-9"
              aria-label="Live search company"
            />
          </div>
          <div className="lg:col-span-2 relative">
            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              value={liveLocation}
              onChange={(e) => setLiveLocation(e.target.value)}
              placeholder="Location (e.g. India)"
              className="pl-9"
              aria-label="Live search location"
            />
          </div>
          <div className="lg:col-span-1">
            <Select
              value={liveJobType}
              onChange={(e) => setLiveJobType(e.target.value)}
              aria-label="Live search job type"
            >
              <option value="All">Any</option>
              <option value="Full-time">Full-time</option>
              <option value="Internship">Intern</option>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <Button type="submit" variant="primary" className="w-full" disabled={liveSearching}>
              {liveSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {liveSearching ? 'Searching...' : 'Search Web'}
            </Button>
          </div>
        </form>

        {/* Quick 1-click company & role search suggestions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Quick searches:</span>
          {QUICK_SEARCH_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={liveSearching}
              onClick={() => {
                setLiveQuery(preset.query);
                setLiveCompany(preset.company);
                setLiveLocation(preset.location);
                void handleLiveGoogleSearch(preset);
              }}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Live Google Search Results */}
        {liveResult && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 rounded-xl p-4">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                  Live Hiring Availability Overview
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {liveResult.hiringOverview}
                </p>
              </div>
              {sortedLiveOpenings.length > 1 && (
                <Select
                  aria-label="Sort live search openings"
                  className="w-40 h-8 text-xs shrink-0"
                  value={liveSort}
                  onChange={(e) => setLiveSort(e.target.value as 'default' | 'company' | 'title')}
                >
                  <option value="default">Sort: Relevance</option>
                  <option value="company">Sort: Company A–Z</option>
                  <option value="title">Sort: Role A–Z</option>
                </Select>
              )}
            </div>

            {sortedLiveOpenings.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {sortedLiveOpenings.map((op) => {
                  const alreadyTracked = applications.some(
                    (a) =>
                      a.jobId === op.id ||
                      (a.company.toLowerCase() === op.company.toLowerCase() &&
                        a.jobTitle.toLowerCase() === op.title.toLowerCase())
                  );
                  return (
                    <div
                      key={op.id}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {op.title}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              <strong className="font-medium text-slate-800 dark:text-slate-200">
                                {op.company}
                              </strong>{' '}
                              · {op.location} · {op.workMode} · {op.jobType}
                            </p>
                          </div>
                        </div>

                        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                          {op.availabilityStatus}
                        </p>

                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {op.summary}
                        </p>

                        {op.keySkills.length > 0 && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                            Key skills:{' '}
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {op.keySkills.join(' · ')}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                        {isSafeHttpUrl(op.careerUrl) ? (
                          <a
                            href={op.careerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
                          >
                            Official Career Portal
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">Verify on company careers site</span>
                        )}

                        <Button
                          size="sm"
                          variant={alreadyTracked ? 'secondary' : 'outline'}
                          disabled={trackingOpeningId === op.id}
                          onClick={() =>
                            alreadyTracked
                              ? navigate('/applications')
                              : void handleTrackLiveOpening(op)
                          }
                        >
                          {alreadyTracked ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              Tracked
                            </>
                          ) : (
                            <>
                              <ClipboardPlus className="w-3.5 h-3.5" />
                              {trackingOpeningId === op.id ? 'Saving...' : 'Track Opening'}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Verified Google Search Grounding Citations */}
            {liveResult.sources.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Verified Google Search Sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {liveResult.sources.map((src, i) =>
                    isSafeHttpUrl(src.uri) ? (
                      <a
                        key={`${src.uri}-${i}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                      >
                        <span className="truncate max-w-[220px]">{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : null
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Surface>

      {/* Transparency notice for Curated Reference Catalog */}
      <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Match percentages reflect weighted skill and profile evidence alignment — not hiring probability. Select any role below to unlock its 3D roadmap, video courses, and verification assessments.
        </p>
      </div>

      {/* Filters & Sorting Bar for Catalog */}
      <Surface className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter catalog by role, company, or skill..."
              className="pl-9"
              aria-label="Search jobs"
            />
          </div>
          <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} aria-label="Filter by company">
            {companies.map((c) => (
              <option key={c} value={c}>
                {c === 'All' ? 'All Companies' : c}
              </option>
            ))}
          </Select>
          <Select value={jobTypeFilter} onChange={(e) => setJobTypeFilter(e.target.value)} aria-label="Filter by job type">
            <option value="All">All Types</option>
            <option value="Full-time">Full-time</option>
            <option value="Internship">Internship</option>
          </Select>
          <Select value={workModeFilter} onChange={(e) => setWorkModeFilter(e.target.value)} aria-label="Filter by work mode">
            <option value="All">All Modes</option>
            <option value="Remote">Remote</option>
            <option value="Hybrid">Hybrid</option>
            <option value="On-site">On-site</option>
          </Select>
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort jobs">
            <option value="relevance">Sort: Best Match</option>
            <option value="company">Sort: Company A–Z</option>
            <option value="eligibility">Sort: Eligibility</option>
            <option value="recency">Sort: Recency</option>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <label htmlFor="min-match-range" className="text-slate-600 dark:text-slate-400">
              Minimum match: <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">{minMatch}%</span>
            </label>
            <input
              id="min-match-range"
              type="range"
              min={0}
              max={90}
              step={5}
              value={minMatch}
              onChange={(e) => setMinMatch(Number(e.target.value))}
              className="w-32 accent-indigo-600"
            />
          </div>
          <div className="flex items-center gap-3">
            {embedded && (
              <Button
                variant={onlySaved ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setOnlySaved((v) => !v)}
              >
                <Bookmark className="w-3.5 h-3.5" />
                Saved ({savedJobIds.length})
              </Button>
            )}
            <span className="font-mono tabular-nums text-slate-500">
              Showing {filteredJobs.length} of {jobs.length} catalog roles
            </span>
          </div>
        </div>
      </Surface>

      {/* Job Cards List */}
      {filteredJobs.length === 0 ? (
        <Surface>
          <EmptyState
            icon={Briefcase}
            title="No jobs match your filters"
            description="Try lowering the minimum match threshold or clearing your search filters."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setCompanyFilter('All');
                  setJobTypeFilter('All');
                  setWorkModeFilter('All');
                  setMinMatch(0);
                  setOnlySaved(false);
                }}
              >
                Reset Filters
              </Button>
            }
          />
        </Surface>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredJobs.map(({ job, match, isPreferred }) => {
            const isSelected = selectedJobs.some((s) => s.jobId === job.id);
            const isSaved = savedJobIds.includes(job.id);
            return (
              <Surface key={job.id} className="p-6 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  <div className="space-y-2.5 min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm flex items-center justify-center shrink-0">
                        {job.company.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            className="text-base font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-700 dark:hover:text-indigo-400 text-left cursor-pointer"
                          >
                            {job.title}
                          </button>
                          {isPreferred && (
                            <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400">
                              · Preferred Company
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{job.company}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.location}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.jobType}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.workMode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{job.experienceLevel}</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
                      <span className="text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                        Matched ({match.matchedSkills.length}): {match.matchedSkills.slice(0, 4).join(', ') || 'None yet'}
                      </span>
                      <span className="text-amber-700 dark:text-amber-400 font-mono tabular-nums">
                        Unverified ({match.unverifiedSkills.length})
                      </span>
                      <span className="text-red-700 dark:text-red-400 font-mono tabular-nums">
                        Missing ({match.missingSkills.length}): {match.missingSkills.slice(0, 3).join(', ') || 'None'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
                      <span>{job.isSampleListing ? 'Sample Reference Listing' : `Verified Source: ${job.source}`}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Posted {job.postedDate}</span>
                      {job.deadline && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">Deadline {job.deadline}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Verified {job.lastVerifiedDate}</span>
                    </div>
                  </div>

                  {/* Right score + actions */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-4 shrink-0 lg:min-w-[180px] border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 pt-4 lg:pt-0 lg:pl-5">
                    <div className="lg:text-right">
                      <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {match.overallScore}%
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Evidence Match Score
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSavedJob(job.id)}
                        aria-label={isSaved ? 'Remove from saved jobs' : 'Save job'}
                      >
                        {isSaved ? (
                          <BookmarkCheck className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Bookmark className="w-4 h-4" />
                        )}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/jobs/${job.id}`)}>
                        View Details
                      </Button>
                      <Button
                        variant={isSelected ? 'secondary' : 'primary'}
                        size="sm"
                        disabled={selectingId === job.id}
                        onClick={() => (isSelected ? navigate('/jobs/selected') : handleSelect(job))}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Selected
                          </>
                        ) : selectingId === job.id ? (
                          'Selecting...'
                        ) : (
                          'Select Job'
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
