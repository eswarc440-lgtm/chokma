import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Check,
  ExternalLink,
  Loader2,
  Send,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { calculateJobMatch } from '../utils/matchingEngine';
import { sendAssistantMessage } from '../services/api';
import { isSafeHttpUrl } from '../lib/utils';
import {
  Button,
  ProgressBar,
  SegmentedTabs,
  StatusText,
  Surface,
} from '../components/ui/Primitives';

type DetailsTab = 'overview' | 'skills' | 'matching' | 'roadmap' | 'guide' | 'ai';

export function JobDetailsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const {
    profile,
    skills,
    jobs,
    selectedJobs,
    roadmapItems,
    applications,
    matchingWeights,
    selectTargetJob,
    generatePlanForSelectedJob,
    upsertApplication,
    buildAssistantContext,
  } = useApp();

  const [tab, setTab] = useState<DetailsTab>('overview');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiReplies, setAiReplies] = useState<Array<{ q: string; a: string; agent: string }>>([]);
  const [askingAi, setAskingAi] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);

  const job = useMemo(() => jobs.find((j) => j.id === jobId) || jobs[0], [jobs, jobId]);
  const selectedRecord = useMemo(
    () => selectedJobs.find((s) => s.jobId === job?.id),
    [selectedJobs, job]
  );
  const existingApp = useMemo(
    () => applications.find((a) => a.jobId === job?.id),
    [applications, job]
  );

  const breakdown = useMemo(
    () => (job ? calculateJobMatch(job, profile, skills, matchingWeights) : null),
    [job, profile, skills, matchingWeights]
  );

  const jobRoadmap = useMemo(
    () => (selectedRecord ? roadmapItems.filter((r) => r.selectedJobId === selectedRecord.id) : []),
    [roadmapItems, selectedRecord]
  );

  if (!job || !breakdown) return null;

  const handleAskJobAi = async (customPrompt?: string) => {
    const q = (customPrompt ?? aiQuestion).trim();
    if (!q || askingAi) return;
    setAskingAi(true);
    setAiQuestion('');
    try {
      const res = await sendAssistantMessage({
        message: `Regarding the ${job.title} role at ${job.company} (Current match: ${breakdown.overallScore}%, Missing skills: ${breakdown.missingSkills.join(', ')}, Unverified skills: ${breakdown.unverifiedSkills.join(', ')}): ${q}`,
        history: [],
        userContext: buildAssistantContext(),
      });
      setAiReplies((prev) => [...prev, { q, a: res.reply, agent: res.agentUsed }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not reach AI agent');
    } finally {
      setAskingAi(false);
    }
  };

  const handleTrackApplication = async () => {
    await upsertApplication({
      id: existingApp?.id,
      jobId: job.id,
      jobTitle: job.title,
      company: job.company,
      location: job.location,
      officialUrl: job.officialUrl,
      status: existingApp ? existingApp.status : 'Ready to Apply',
      deadline: job.deadline || '',
      nextAction: 'Submit application on official employer career portal',
      notes: existingApp?.notes || 'Opened from Job Details Application Guide.',
    });
    toast.success('Tracked in Application Tracker');
    navigate('/applications');
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </button>

      {/* Top Role Summary */}
      <Surface className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {job.title}
            </h1>
            {job.isSampleListing && (
              <span className="text-xs text-slate-400 dark:text-slate-500">· Sample Reference Listing</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-800 dark:text-slate-200">{job.company}</span>
            <span aria-hidden="true">·</span>
            <span>{job.location}</span>
            <span aria-hidden="true">·</span>
            <span>{job.jobType}</span>
            <span aria-hidden="true">·</span>
            <span>{job.workMode}</span>
            <span aria-hidden="true">·</span>
            <span>{job.experienceLevel}</span>
            {job.salaryRange && (
              <>
                <span aria-hidden="true">·</span>
                <span>{job.salaryRange}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="text-right pr-2">
            <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
              {breakdown.overallScore}%
            </p>
            <p className="text-[11px] text-slate-500">Evidence Match</p>
          </div>
          <Button
            variant={selectedRecord ? 'secondary' : 'primary'}
            onClick={() => (selectedRecord ? setTab('roadmap') : selectTargetJob(job))}
          >
            {selectedRecord ? (
              <>
                <Check className="w-4 h-4" />
                Selected Target Role
              </>
            ) : (
              'Select Target Job'
            )}
          </Button>
          {isSafeHttpUrl(job.officialUrl) && (
            <a
              href={job.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-9 px-4 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap"
            >
              Official Portal
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </Surface>

      {/* 6 Organized Tabs */}
      <SegmentedTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: '1. Overview' },
          { id: 'skills', label: '2. Required Skills', count: job.requiredSkills.length },
          { id: 'matching', label: '3. Skill Matching' },
          { id: 'roadmap', label: '4. Learning Roadmap', count: jobRoadmap.length },
          { id: 'guide', label: '5. Application Guide' },
          { id: 'ai', label: '6. Ask AI' },
        ]}
      />

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <Surface className="p-6 space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Role Description</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
              {job.description}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-200/80 dark:border-slate-800">
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Core Responsibilities
              </h3>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4 leading-relaxed">
                {job.responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Qualifications &amp; Preferred Skills
              </h3>
              <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4 leading-relaxed">
                {job.qualifications.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              {job.preferredSkills.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 pt-2">
                  <strong className="font-medium text-slate-800 dark:text-slate-200">Preferred extras:</strong>{' '}
                  {job.preferredSkills.join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-4">
            <span>Source: {job.source}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">Posted: {job.postedDate}</span>
            <span>·</span>
            <span className="font-mono tabular-nums">Last Verified: {job.lastVerifiedDate}</span>
          </div>
        </Surface>
      )}

      {/* TAB 2: REQUIRED SKILLS */}
      {tab === 'skills' && (
        <Surface className="p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4">Skill</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Requirement Tier</th>
                  <th className="py-2.5 px-3 text-right">Target Proficiency</th>
                  <th className="py-2.5 pl-3 text-right">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {job.requiredSkills.map((rs) => (
                  <tr key={rs.name}>
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">{rs.name}</td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{rs.category}</td>
                    <td className="py-3 px-3">
                      <StatusText
                        tone={rs.importance === 'mandatory' ? 'danger' : rs.importance === 'important' ? 'info' : 'neutral'}
                        label={rs.importance.charAt(0).toUpperCase() + rs.importance.slice(1)}
                        icon={false}
                      />
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                      {Math.round(rs.minProficiency * 100)}%
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums text-slate-500">
                      {rs.weight}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {/* TAB 3: EXPLAINABLE SKILL MATCHING */}
      {tab === 'matching' && (
        <div className="space-y-6">
          <Surface className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Explainable Weighted Score Breakdown
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {breakdown.disclaimer}
                </p>
              </div>
              <span className="text-xl font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
                {breakdown.overallScore}% Total
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {[
                ['Technical Skills', breakdown.technicalSkillsScore, matchingWeights.technicalSkillsWeight],
                ['Project Relevance', breakdown.projectRelevanceScore, matchingWeights.projectRelevanceWeight],
                ['Education', breakdown.educationScore, matchingWeights.educationWeight],
                ['Experience', breakdown.experienceScore, matchingWeights.experienceWeight],
                ['Certifications', breakdown.certificationsScore, matchingWeights.certificationsWeight],
              ].map(([label, val, wt]) => (
                <div key={String(label)} className="space-y-1.5">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">{label}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {val}%
                    </span>
                  </div>
                  <ProgressBar value={Number(val)} tone="indigo" />
                  <p className="text-[11px] font-mono text-slate-400">Weight: {wt}%</p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Eligibility Check</p>
              {breakdown.eligibilityNotes.map((note, idx) => (
                <p key={idx} className="text-slate-600 dark:text-slate-400">
                  • {note}
                </p>
              ))}
            </div>
          </Surface>

          <Surface className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Skill-by-Skill Comparison
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4">Required Skill</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Your Evidence</th>
                    <th className="py-2.5 px-3 text-right">Target</th>
                    <th className="py-2.5 pl-4">Explanation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {breakdown.skillComparisons.map((row) => (
                    <tr key={row.skillName}>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        {row.skillName}
                      </td>
                      <td className="py-3 px-3">
                        <StatusText
                          tone={
                            row.status === 'matched'
                              ? 'success'
                              : row.status === 'partial'
                              ? 'info'
                              : row.status === 'unverified'
                              ? 'warning'
                              : 'danger'
                          }
                          label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {Math.round(row.candidateLevel * 100)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500">
                        {Math.round(row.requiredLevel * 100)}%
                      </td>
                      <td className="py-3 pl-4 text-slate-600 dark:text-slate-400">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Surface>
        </div>
      )}

      {/* TAB 4: LEARNING ROADMAP */}
      {tab === 'roadmap' && (
        <Surface className="p-6 space-y-5">
          {!selectedRecord ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Select this job to generate a personalized gap roadmap
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                The Learning Planner Agent will build ordered milestones, official courses, daily tasks, and hands-on projects targeting your {breakdown.missingSkills.length} missing and {breakdown.unverifiedSkills.length} unverified skills.
              </p>
              <Button size="sm" onClick={() => selectTargetJob(job)}>
                Select Job &amp; Generate Roadmap
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Personalized Roadmap for {job.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {selectedRecord.roadmapSummary}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generatingPlan}
                    onClick={async () => {
                      setGeneratingPlan(true);
                      try {
                        await generatePlanForSelectedJob(selectedRecord, job);
                      } finally {
                        setGeneratingPlan(false);
                      }
                    }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generatingPlan ? 'animate-spin' : ''}`} />
                    Refresh Plan
                  </Button>
                  <Button size="sm" onClick={() => navigate('/learning/roadmap')}>
                    Open Learning Workspace
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {jobRoadmap.map((item) => (
                  <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-indigo-700 dark:text-indigo-400">
                        Phase {item.phaseOrder} · {item.targetSkill} · {item.durationHours}h
                      </p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.description}</p>
                    </div>
                    <StatusText
                      tone={item.status === 'completed' ? 'success' : item.status === 'in_progress' ? 'info' : 'neutral'}
                      label={item.status.replace('_', ' ')}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </Surface>
      )}

      {/* TAB 5: APPLICATION GUIDE */}
      {tab === 'guide' && (
        <Surface className="p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Official Employer Application Guide
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chokma redirects you to the official employer career portal. Opening the link never falsely marks an application as submitted.
            </p>
          </div>
          <ol className="space-y-3 text-xs text-slate-700 dark:text-slate-300 list-decimal pl-5 leading-relaxed">
            <li>
              Confirm your top required skills ({job.requiredSkills.slice(0, 4).map((s) => s.name).join(', ')}) have evidence or assessment verification in your Chokma profile.
            </li>
            <li>
              Tailor your resume summary to highlight relevant troubleshooting, cloud, or software projects matching {job.company}&apos;s responsibilities.
            </li>
            <li>
              Open the official employer application page below and complete the employer&apos;s official application workflow.
            </li>
            <li>
              Return to Chokma and log your application date, deadline, and status in the Application Tracker.
            </li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {isSafeHttpUrl(job.officialUrl) && (
              <a
                href={job.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 text-sm font-medium rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white inline-flex items-center gap-2"
              >
                Open Official {job.company} Careers
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <Button variant="outline" onClick={handleTrackApplication}>
              {existingApp ? `View in Tracker (${existingApp.status})` : 'Log in Application Tracker'}
            </Button>
          </div>
        </Surface>
      )}

      {/* TAB 6: ASK AI */}
      {tab === 'ai' && (
        <Surface className="p-6 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Bot className="w-4 h-4 text-violet-600" />
            <span>Ask Chokma AI about {job.title} ({job.company})</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              'Why is my match score at its current level?',
              'What top 3 skills should I verify first for this role?',
              'Give me 3 likely technical interview questions for this role.',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleAskJobAi(q)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {aiReplies.map((item, idx) => (
              <div key={idx} className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Q: {item.q}</p>
                <p className="text-[11px] font-medium text-violet-700 dark:text-violet-400">{item.agent}</p>
                <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
                  {item.a}
                </div>
              </div>
            ))}
            {askingAi && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Consulting Skill Gap Analyst &amp; Learning Planner...</span>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskJobAi();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder={`Ask about ${job.title} skills, roadmap, or interviews...`}
              className="flex-1 h-9 px-3 text-sm rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
            />
            <Button type="submit" disabled={askingAi || !aiQuestion.trim()}>
              <Send className="w-3.5 h-3.5" />
              Ask
            </Button>
          </form>
        </Surface>
      )}
    </div>
  );
}
