import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  ExternalLink,
  FolderGit2,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  Map as MapIcon,
  Pause,
  Play,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Video,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import {
  generateAssessmentWithAgent,
  reviewProjectWithAgent,
} from '../services/api';
import { findCatalogCourseForSkill } from '../data/courseCatalog';
import {
  CourseRecord,
  DailyTask,
  PracticalProject,
  QuizQuestion,
} from '../types';
import { isSafeHttpUrl, formatShortDate } from '../lib/utils';
import { RoadmapPictorial } from '../components/RoadmapPictorial';
import { Roadmap3DStudio } from '../components/Roadmap3DStudio';
import {
  Button,
  EmptyState,
  FieldLabel,
  Input,
  Modal,
  ProgressBar,
  SegmentedTabs,
  Select,
  StatusText,
  Surface,
  Textarea,
  VerificationBadgeText,
} from '../components/ui/Primitives';
import { DashboardLeftNav } from '../components/ui/DashboardLeftNav';

export type LearningSection =
  | 'roadmap'
  | 'courses'
  | 'tasks'
  | 'projects'
  | 'assessments'
  | 'outcomes';

function parseTaskSteps(task: DailyTask): string[] {
  const raw = (task.instructions || '').trim();
  if (raw) {
    const lines = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
      .filter((l) => l.length > 4);
    if (lines.length >= 2) return lines.slice(0, 6);
  }
  return [
    `Review core ${task.targetSkill} documentation and mental model`,
    `Run practical ${task.targetSkill} hands-on commands or configuration checks`,
    `Verify expected output and capture a short engineering takeaway`,
  ];
}

function loadCheckedMap(key: string): Record<number, boolean> {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCheckedMap(key: string, map: Record<number, boolean>) {
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export function LearningPage({ section }: { section: LearningSection }) {
  const {
    profile,
    skills,
    jobs,
    selectedJobs,
    roadmapItems,
    courses,
    dailyTasks,
    practicalProjects,
    assessments,
    generatePlanForSelectedJob,
    updateCourseRecord,
    updateDailyTask,
    updatePracticalProject,
    recordAssessmentResult,
    upsertSkill,
    recalculateSelectedJobs,
  } = useApp();
  const navigate = useNavigate();

  const [selectedJobFilter, setSelectedJobFilter] = useState<string>('all');
  const [regenerating, setRegenerating] = useState(false);
  const [roadmapView, setRoadmapView] = useState<'3d' | 'image' | 'checklist'>('3d');
  const [roadmapSort, setRoadmapSort] = useState<'phase' | 'duration' | 'priority'>('phase');

  // Courses video player + auto-tracking state
  const [courseFilter, setCourseFilter] = useState<'all' | 'not_started' | 'in_progress' | 'completed'>('all');
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Record<number, boolean>>({});
  const [watchSeconds, setWatchSeconds] = useState(0);
  const [watchPaused, setWatchPaused] = useState(false);
  const [courseCertUrl, setCourseCertUrl] = useState('');
  const [courseNotes, setCourseNotes] = useState('');
  const [showCourseNotesBox, setShowCourseNotesBox] = useState(false);
  const lastAutoSavedPctRef = useRef<number>(0);

  // Daily Tasks guided focus session state (NO manual dropdowns)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [activeSessionTaskId, setActiveSessionTaskId] = useState<string | null>(null);
  const [taskSessionSeconds, setTaskSessionSeconds] = useState(0);
  const [taskStepChecks, setTaskStepChecks] = useState<Record<string, Record<number, boolean>>>({});
  const [taskNotesById, setTaskNotesById] = useState<Record<string, string>>({});
  const [taskUrlById, setTaskUrlById] = useState<Record<string, string>>({});

  // Projects modal & AI review
  const [submittingProject, setSubmittingProject] = useState<PracticalProject | null>(null);
  const [projRepoUrl, setProjRepoUrl] = useState('');
  const [projEvidenceNotes, setProjEvidenceNotes] = useState('');
  const [reviewingProject, setReviewingProject] = useState(false);

  // Assessments quiz runner state
  const [quizSkill, setQuizSkill] = useState('');
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<{
    title: string;
    targetSkill: string;
    selectedJobId: string;
    questions: QuizQuestion[];
    timeLeftSec: number;
  } | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<{
    title: string;
    targetSkill: string;
    scorePercent: number;
    passed: boolean;
    questions: QuizQuestion[];
    answers: Record<number, number>;
  } | null>(null);

  const activeSelectedJob = useMemo(() => {
    if (selectedJobFilter === 'all') return selectedJobs[0] || null;
    return selectedJobs.find((s) => s.id === selectedJobFilter) || selectedJobs[0] || null;
  }, [selectedJobs, selectedJobFilter]);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) || null,
    [courses, activeCourseId]
  );

  const activeCatalogMeta = useMemo(
    () => (activeCourse ? findCatalogCourseForSkill(activeCourse.targetSkill) : null),
    [activeCourse]
  );

  // Open embedded course video player & auto-start tracking immediately
  const openCoursePlayer = async (course: CourseRecord) => {
    const meta = findCatalogCourseForSkill(course.targetSkill);
    const storageKey = `chokma-course-lessons-${course.id}`;
    const saved = loadCheckedMap(storageKey);

    // Hydrate chapter checks from existing progressPercent if local map is empty
    const hasSavedAny = Object.values(saved).some(Boolean);
    const initialMap: Record<number, boolean> = hasSavedAny ? saved : {};
    if (!hasSavedAny && course.progressPercent > 0) {
      const approxDone = Math.floor((course.progressPercent / 100) * meta.lessons.length);
      for (let i = 0; i < approxDone; i++) {
        initialMap[i] = true;
      }
    }

    setCompletedLessons(initialMap);
    setCourseCertUrl(course.certificateUrl || '');
    setCourseNotes(course.evidenceNotes || '');
    setShowCourseNotesBox(false);
    setWatchSeconds(0);
    setWatchPaused(false);
    lastAutoSavedPctRef.current = course.progressPercent || 0;
    setActiveCourseId(course.id);

    // Automatically move not_started -> in_progress (10%) when student begins watching
    if (course.status === 'not_started' || course.progressPercent === 0) {
      const initialPct = Math.max(10, course.progressPercent || 0);
      lastAutoSavedPctRef.current = initialPct;
      await updateCourseRecord(course.id, {
        status: 'in_progress',
        progressPercent: initialPct,
        certificateUrl: course.certificateUrl,
        evidenceNotes: course.evidenceNotes,
      });
      toast.success(`Auto-tracking started for "${course.title}" — synced to your Roadmap`);
    }
  };

  // Auto-increment watch-time progress while the video player is open
  useEffect(() => {
    if (!activeCourse || watchPaused) return;
    const interval = window.setInterval(() => {
      setWatchSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeCourse, watchPaused]);

  // Every 25 seconds of active video watching, gently boost auto-tracked progress up to 85%
  // (final 100% triggers when all lesson chapters are completed)
  useEffect(() => {
    if (!activeCourse || watchSeconds === 0 || watchSeconds % 25 !== 0) return;
    if (activeCourse.progressPercent >= 85 || activeCourse.status === 'verified' || activeCourse.status === 'assessment_pending') {
      return;
    }
    const nextPct = Math.min(85, Math.max(activeCourse.progressPercent, lastAutoSavedPctRef.current) + 5);
    if (nextPct > lastAutoSavedPctRef.current) {
      lastAutoSavedPctRef.current = nextPct;
      void updateCourseRecord(activeCourse.id, {
        status: 'in_progress',
        progressPercent: nextPct,
        certificateUrl: courseCertUrl || activeCourse.certificateUrl,
        evidenceNotes: courseNotes || activeCourse.evidenceNotes,
      });
    }
  }, [watchSeconds, activeCourse, courseCertUrl, courseNotes, updateCourseRecord]);

  // Toggle a lesson chapter -> automatically calculates % progress and syncs Firestore + Roadmap
  const handleToggleLesson = async (lessonIndex: number) => {
    if (!activeCourse || !activeCatalogMeta) return;
    const nextMap = { ...completedLessons, [lessonIndex]: !completedLessons[lessonIndex] };
    setCompletedLessons(nextMap);
    saveCheckedMap(`chokma-course-lessons-${activeCourse.id}`, nextMap);

    const total = activeCatalogMeta.lessons.length || 4;
    const doneCount = activeCatalogMeta.lessons.filter((_, i) => Boolean(nextMap[i])).length;
    const chapterPct = Math.round((doneCount / total) * 100);
    const computedPct = doneCount === total ? 100 : Math.max(10, chapterPct);
    const isNowComplete = doneCount === total;
    const nextStatus =
      activeCourse.status === 'verified'
        ? 'verified'
        : isNowComplete
        ? 'assessment_pending'
        : 'in_progress';

    lastAutoSavedPctRef.current = computedPct;
    await updateCourseRecord(activeCourse.id, {
      status: nextStatus,
      progressPercent: computedPct,
      certificateUrl: courseCertUrl || activeCourse.certificateUrl,
      evidenceNotes: courseNotes || activeCourse.evidenceNotes,
    });

    if (isNowComplete) {
      toast.success(
        `100% of "${activeCourse.title}" completed! Roadmap synced — take the skill verification quiz to earn Assessment Verified.`
      );
    }
  };

  // Focus session timer for active daily task
  useEffect(() => {
    if (!activeSessionTaskId) return;
    const interval = window.setInterval(() => {
      setTaskSessionSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeSessionTaskId]);

  const handleStartTaskSession = async (task: DailyTask) => {
    setExpandedTaskId(task.id);
    setActiveSessionTaskId(task.id);
    setTaskSessionSeconds(0);
    setTaskStepChecks((prev) => ({
      ...prev,
      [task.id]: prev[task.id] || loadCheckedMap(`chokma-task-steps-${task.id}`),
    }));
    setTaskNotesById((prev) => ({
      ...prev,
      [task.id]: prev[task.id] ?? task.evidenceNotes ?? '',
    }));
    setTaskUrlById((prev) => ({
      ...prev,
      [task.id]: prev[task.id] ?? task.evidenceUrl ?? '',
    }));

    if (task.status === 'pending') {
      await updateDailyTask(task.id, {
        status: 'in_progress',
        evidenceNotes: task.evidenceNotes,
        evidenceUrl: task.evidenceUrl,
      });
      toast.success(`Focus session started for "${task.title}" — Roadmap auto-updated`);
    }
  };

  const handleToggleTaskStep = async (task: DailyTask, stepIdx: number) => {
    const current = taskStepChecks[task.id] || loadCheckedMap(`chokma-task-steps-${task.id}`);
    const next = { ...current, [stepIdx]: !current[stepIdx] };
    setTaskStepChecks((prev) => ({ ...prev, [task.id]: next }));
    saveCheckedMap(`chokma-task-steps-${task.id}`, next);

    // If task was still pending, auto-transition to in_progress on first step interaction
    if (task.status === 'pending') {
      await updateDailyTask(task.id, {
        status: 'in_progress',
        evidenceNotes: task.evidenceNotes,
        evidenceUrl: task.evidenceUrl,
      });
    }
  };

  const handleFinishTaskSession = async (task: DailyTask) => {
    const steps = parseTaskSteps(task);
    const checks = taskStepChecks[task.id] || {};
    const doneCount = steps.filter((_, i) => Boolean(checks[i])).length;
    const mins = Math.max(1, Math.round(taskSessionSeconds / 60));
    const userNote = (taskNotesById[task.id] || '').trim();
    const autoSummary =
      userNote ||
      `Completed ${doneCount}/${steps.length} guided lab steps in a ${mins}-minute focus session.`;

    await updateDailyTask(task.id, {
      status: 'completed',
      evidenceNotes: autoSummary,
      evidenceUrl: (taskUrlById[task.id] || '').trim(),
    });
    await recalculateSelectedJobs();
    if (activeSessionTaskId === task.id) {
      setActiveSessionTaskId(null);
      setTaskSessionSeconds(0);
    }
    toast.success(`"${task.title}" auto-completed — Roadmap & Outcomes updated`);
  };

  // Countdown timer for active assessment
  useEffect(() => {
    if (!activeQuiz) return;
    if (activeQuiz.timeLeftSec <= 0) {
      handleSubmitQuiz();
      return;
    }
    const timer = window.setInterval(() => {
      setActiveQuiz((prev) => (prev ? { ...prev, timeLeftSec: Math.max(0, prev.timeLeftSec - 1) } : null));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeQuiz?.timeLeftSec]);

  const filteredRoadmap = useMemo(() => {
    const base = roadmapItems.filter((r) =>
      selectedJobFilter === 'all' ? true : r.selectedJobId === selectedJobFilter
    );
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return [...base].sort((a, b) => {
      if (roadmapSort === 'duration') return (a.durationHours || 0) - (b.durationHours || 0);
      if (roadmapSort === 'priority') {
        return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1);
      }
      return (a.phaseOrder || 0) - (b.phaseOrder || 0);
    });
  }, [roadmapItems, selectedJobFilter, roadmapSort]);
  const filteredCourses = courses.filter((c) => {
    if (selectedJobFilter !== 'all' && c.selectedJobId !== selectedJobFilter) return false;
    if (courseFilter === 'not_started') return c.status === 'not_started';
    if (courseFilter === 'in_progress') return c.status === 'in_progress';
    if (courseFilter === 'completed') {
      return c.status === 'completed' || c.status === 'assessment_pending' || c.status === 'verified';
    }
    return true;
  });
  const filteredTasks = dailyTasks.filter((t) =>
    selectedJobFilter === 'all' ? true : t.selectedJobId === selectedJobFilter
  );
  const filteredProjects = practicalProjects.filter((p) =>
    selectedJobFilter === 'all' ? true : p.selectedJobId === selectedJobFilter
  );

  // Suggested skills for assessment dropdown
  const assessableSkills = useMemo(() => {
    const set = new Set<string>();
    selectedJobs.forEach((sj) => {
      (sj.missingSkills || []).forEach((s) => set.add(s));
      (sj.unverifiedSkills || []).forEach((s) => set.add(s));
      (sj.partialSkills || []).forEach((s) => set.add(s));
    });
    skills.forEach((s) => set.add(s.name));
    if (set.size === 0) {
      ['IAM', 'Linux', 'AWS Fundamentals', 'TCP/IP', 'Python', 'SQL', 'React'].forEach((s) => set.add(s));
    }
    return Array.from(set);
  }, [selectedJobs, skills]);

  useEffect(() => {
    if (!quizSkill && assessableSkills.length > 0) {
      setQuizSkill(assessableSkills[0]);
    }
  }, [assessableSkills, quizSkill]);

  const handleRegeneratePlan = async () => {
    if (!activeSelectedJob) return;
    const jobDef = jobs.find((j) => j.id === activeSelectedJob.jobId);
    if (!jobDef) return;
    setRegenerating(true);
    try {
      await generatePlanForSelectedJob(activeSelectedJob, jobDef);
    } finally {
      setRegenerating(false);
    }
  };

  const handleStartAssessment = async (skillOverride?: string) => {
    const target = (skillOverride || quizSkill).trim();
    if (!target) {
      toast.error('Select a skill to assess.');
      return;
    }
    setGeneratingQuiz(true);
    setQuizResult(null);
    try {
      const res = await generateAssessmentWithAgent({
        targetSkill: target,
        jobTitle: activeSelectedJob?.jobTitle || 'Cloud Support Associate',
      });
      const qs = res.assessment?.questions || [];
      if (qs.length === 0) {
        throw new Error('Assessment generator returned no questions. Please retry.');
      }
      setActiveQuiz({
        title: res.assessment.title || `${target} Skill Verification Assessment`,
        targetSkill: target,
        selectedJobId: activeSelectedJob?.id || 'general_verification',
        questions: qs,
        timeLeftSec: Math.max(300, (res.assessment.timeLimitMinutes || 8) * 60),
      });
      setCurrentQIdx(0);
      setSelectedAnswers({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate assessment');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    let correct = 0;
    const summaries: string[] = [];
    activeQuiz.questions.forEach((q, idx) => {
      const chosen = selectedAnswers[idx];
      if (chosen === q.correctIndex) {
        correct += 1;
      } else {
        summaries.push(`Q${idx + 1}: ${q.explanation}`);
      }
    });
    const scorePercent = Math.round((correct / activeQuiz.questions.length) * 100);
    const passed = scorePercent >= 70;

    setQuizResult({
      title: activeQuiz.title,
      targetSkill: activeQuiz.targetSkill,
      scorePercent,
      passed,
      questions: activeQuiz.questions,
      answers: { ...selectedAnswers },
    });

    const snapshot = activeQuiz;
    setActiveQuiz(null);

    await recordAssessmentResult({
      selectedJobId: snapshot.selectedJobId,
      targetSkill: snapshot.targetSkill,
      title: snapshot.title,
      questionsCount: snapshot.questions.length,
      scorePercent,
      passed,
      explanationsSummary:
        summaries.length > 0
          ? summaries.join(' | ').slice(0, 1400)
          : `All ${snapshot.questions.length} technical and scenario questions answered accurately.`,
    });
  };

  const handleSubmitProjectReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingProject) return;
    if (!projEvidenceNotes.trim()) {
      toast.error('Please describe your implementation and evidence before submitting.');
      return;
    }
    setReviewingProject(true);
    try {
      const reviewRes = await reviewProjectWithAgent({
        title: submittingProject.title,
        description: submittingProject.description,
        requirements: submittingProject.requirements || [],
        targetSkills: submittingProject.targetSkills || [],
        githubRepoUrl: projRepoUrl.trim(),
        evidenceNotes: projEvidenceNotes.trim(),
      });

      await updatePracticalProject(submittingProject.id, {
        status: 'reviewed',
        githubRepoUrl: projRepoUrl.trim(),
        evidenceNotes: projEvidenceNotes.trim(),
        aiReviewFeedback: reviewRes.review.feedback,
        aiReviewScore: reviewRes.review.score,
      });

      if (reviewRes.review.evidenceSufficient && submittingProject.targetSkills?.length) {
        for (const skName of submittingProject.targetSkills.slice(0, 3)) {
          const existing = skills.find((s) => s.name.toLowerCase() === skName.toLowerCase());
          if (!existing || existing.verificationStatus !== 'assessment_verified') {
            await upsertSkill({
              id: existing?.id,
              name: skName,
              category: existing?.category || 'Practical Project',
              proficiencyLevel: Math.max(existing?.proficiencyLevel || 0, 0.8),
              evidenceSource: 'project',
              verificationStatus: 'evidence_supported',
              evidenceNotes: `Demonstrated in practical project "${submittingProject.title}" (AI Review: ${reviewRes.review.score}/100).`,
            });
          }
        }
        toast.success(`Project reviewed (${reviewRes.review.score}/100) — target skills updated to Evidence Supported!`);
      } else {
        toast.info(`Project reviewed (${reviewRes.review.score}/100) — inspect feedback to strengthen evidence.`);
      }
      setSubmittingProject(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Project review failed');
    } finally {
      setReviewingProject(false);
    }
  };

  // Outcomes metrics (4 strictly separate metrics — auto-tracked smoothly from courses, tasks, roadmap & assessments)
  const outcomesData = useMemo(() => {
    const avgSkillProf =
      skills.length > 0
        ? Math.round((skills.reduce((sum, s) => sum + s.proficiencyLevel, 0) / skills.length) * 100)
        : 0;
    const totalLearning = roadmapItems.length + courses.length + dailyTasks.length;
    const weightedLearning =
      roadmapItems.reduce(
        (sum, r) => sum + (r.status === 'completed' ? 1 : r.status === 'in_progress' ? 0.5 : 0),
        0
      ) +
      courses.reduce(
        (sum, c) =>
          sum +
          (c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending'
            ? 1
            : (c.progressPercent || 0) / 100),
        0
      ) +
      dailyTasks.reduce(
        (sum, t) => sum + (t.status === 'completed' ? 1 : t.status === 'in_progress' ? 0.5 : 0),
        0
      );
    const learningProg = totalLearning > 0 ? Math.round((weightedLearning / totalLearning) * 100) : 0;
    const topMatch = selectedJobs[0]?.matchScore ?? 0;

    const skillChartData = skills.slice(0, 10).map((s) => ({
      name: s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name,
      proficiency: Math.round(s.proficiencyLevel * 100),
      status: s.verificationStatus,
    }));

    const assessmentChartData = assessments.slice(-8).map((a) => ({
      name: a.targetSkill.length > 12 ? `${a.targetSkill.slice(0, 11)}…` : a.targetSkill,
      score: a.scorePercent,
      passed: a.passed,
    }));

    return {
      profileCompleteness: profile?.profileCompleteness ?? 0,
      jobMatch: topMatch,
      avgSkillProf,
      learningProg,
      skillChartData,
      assessmentChartData,
    };
  }, [profile, skills, roadmapItems, courses, dailyTasks, selectedJobs, assessments]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Dedicated Learning Outcomes Dashboard Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200/90 dark:border-slate-800">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Learning Outcomes Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            3D interactive roadmaps, visual roadmap studio, embedded video courses, daily focus labs, practical projects, and verified skill outcomes — all auto-tracked.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {selectedJobs.length > 0 && (
            <Select
              aria-label="Filter learning by target job"
              className="w-56"
              value={selectedJobFilter}
              onChange={(e) => setSelectedJobFilter(e.target.value)}
            >
              <option value="all">All Selected Jobs ({selectedJobs.length})</option>
              {selectedJobs.map((sj) => (
                <option key={sj.id} value={sj.id}>
                  {sj.jobTitle} ({sj.company})
                </option>
              ))}
            </Select>
          )}
          {activeSelectedJob && section === 'roadmap' && (
            <Button variant="outline" size="sm" onClick={handleRegeneratePlan} disabled={regenerating}>
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Regenerating...' : 'Refresh with AI'}
            </Button>
          )}
        </div>
      </div>

      {/* 4-KPI Learning Outcomes Summary Strip (single-elevation, tabular numerals) */}
      <Surface className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80 dark:divide-slate-800">
        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Overall Learning Progress</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            {outcomesData.learningProg}%
          </p>
          <ProgressBar value={outcomesData.learningProg} tone="indigo" label="Overall learning progress" />
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Roadmap Milestones</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {filteredRoadmap.filter((r) => r.status === 'completed').length}
            <span className="text-sm font-normal text-slate-400">/{filteredRoadmap.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {filteredRoadmap.filter((r) => r.status === 'in_progress').length} in progress
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Video Courses &amp; Labs</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {courses.filter((c) => c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending').length}
            <span className="text-sm font-normal text-slate-400">/{courses.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {dailyTasks.filter((t) => t.status === 'completed').length}/{dailyTasks.length} daily tasks done
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-1.5">
          <p className="text-xs text-slate-500 dark:text-slate-400">Assessments Passed</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {assessments.filter((a) => a.passed).length}
            <span className="text-sm font-normal text-slate-400">/{assessments.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Avg skill proficiency {outcomesData.avgSkillProf}%
          </p>
        </div>
      </Surface>

      {/* Left Sidebar Navigation + Active Learning Outcomes Module */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <DashboardLeftNav
          title="Learning Outcomes"
          active={section}
          onChange={(next) => navigate(`/learning/${next}`)}
          items={[
            {
              id: 'roadmap',
              label: 'My Roadmap',
              count: filteredRoadmap.length,
              icon: <MapIcon className="w-4 h-4" />,
            },
            {
              id: 'courses',
              label: 'Courses',
              count: courses.length,
              icon: <BookOpen className="w-4 h-4" />,
            },
            {
              id: 'tasks',
              label: 'Daily Tasks',
              count: filteredTasks.length,
              icon: <CheckSquare className="w-4 h-4" />,
            },
            {
              id: 'projects',
              label: 'Practical Projects',
              count: filteredProjects.length,
              icon: <FolderGit2 className="w-4 h-4" />,
            },
            {
              id: 'assessments',
              label: 'Assessments',
              count: assessments.length,
              icon: <Award className="w-4 h-4" />,
            },
            {
              id: 'outcomes',
              label: 'Outcomes',
              icon: <ShieldCheck className="w-4 h-4" />,
            },
          ]}
        />

        <div className="flex-1 min-w-0 w-full">

      {/* ===================================================================== */}
      {/* A. MY ROADMAP (3D Three.js Studio + Create/Edit Image + Checklist)    */}
      {/* ===================================================================== */}
      {section === 'roadmap' && (
        <div className="space-y-6">
          {/* Roadmap Studio Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80">
              <button
                type="button"
                onClick={() => setRoadmapView('3d')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapView === '3d'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                3D Interactive Roadmap (Three.js)
              </button>
              <button
                type="button"
                onClick={() => setRoadmapView('image')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapView === 'image'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                Create &amp; Edit Visual Image
              </button>
              <button
                type="button"
                onClick={() => setRoadmapView('checklist')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  roadmapView === 'checklist'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ListChecks className="w-3.5 h-3.5" />
                Milestone Checklist ({filteredRoadmap.length})
              </button>
            </div>

            {filteredRoadmap.length > 1 && (
              <Select
                aria-label="Sort roadmap milestones"
                className="w-44 h-9 text-xs"
                value={roadmapSort}
                onChange={(e) => setRoadmapSort(e.target.value as 'phase' | 'duration' | 'priority')}
              >
                <option value="phase">Sort: Phase Order</option>
                <option value="priority">Sort: Highest Priority</option>
                <option value="duration">Sort: Shortest Hours</option>
              </Select>
            )}
          </div>

          {roadmapView === '3d' && (
            <Roadmap3DStudio
              selectedJob={activeSelectedJob}
              roadmapItems={filteredRoadmap}
              skills={skills}
              onOpenCourseForSkill={(skillName) => {
                const matchCourse = courses.find(
                  (c) => c.targetSkill.trim().toLowerCase() === skillName.trim().toLowerCase()
                );
                navigate('/learning/courses');
                if (matchCourse) {
                  void openCoursePlayer(matchCourse);
                }
              }}
              onVerifySkill={(skillName) => {
                setQuizSkill(skillName);
                navigate('/learning/assessments');
              }}
            />
          )}

          {roadmapView === 'image' && (
            <RoadmapPictorial
              selectedJob={activeSelectedJob}
              roadmapItems={filteredRoadmap}
              profile={profile}
              skills={skills}
            />
          )}

          <Surface>
            {filteredRoadmap.length === 0 ? (
              <EmptyState
                icon={MapIcon}
                title="No personalized roadmap yet"
                description="Select a target role like Cloud Support Associate from Recommended Jobs to automatically generate your visual pictorial roadmap."
                action={
                  <Button size="sm" onClick={() => navigate('/jobs/recommended')}>
                    Select a Target Job
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {filteredRoadmap.map((item) => {
                  const jobName = selectedJobs.find((s) => s.id === item.selectedJobId)?.jobTitle;
                  const skillKey = (item.targetSkill || '').trim().toLowerCase();
                  const linkedCourse = courses.find(
                    (c) => c.targetSkill.trim().toLowerCase() === skillKey
                  );
                  const linkedTask = dailyTasks.find(
                    (t) => t.targetSkill.trim().toLowerCase() === skillKey && t.status !== 'completed'
                  );

                  const autoHint = linkedCourse
                    ? `Course ${linkedCourse.progressPercent}%`
                    : linkedTask
                    ? `Lab ${linkedTask.status.replace('_', ' ')}`
                    : 'Auto-tracked';

                  return (
                    <div
                      key={item.id}
                      className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-4"
                    >
                      <div className="flex items-start gap-4 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg font-mono text-xs font-semibold flex items-center justify-center shrink-0 ${
                            item.status === 'completed'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400'
                              : item.status === 'in_progress'
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          0{item.phaseOrder}
                        </div>
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-indigo-700 dark:text-indigo-400">
                              {item.targetSkill}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.skillCategory || 'Technical'}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{item.priority} priority</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">{item.durationHours} hrs</span>
                            {jobName && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{jobName}</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.title}
                          </h3>
                          {item.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                          {item.expectedOutcome && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                              <strong className="font-medium text-slate-700 dark:text-slate-300">
                                Expected outcome:
                              </strong>{' '}
                              {item.expectedOutcome}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Auto-tracked status + direct action into the learning activity */}
                      <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end gap-2 shrink-0 pl-12 md:pl-0">
                        <div className="flex items-center gap-2 text-xs">
                          <StatusText
                            tone={
                              item.status === 'completed'
                                ? 'success'
                                : item.status === 'in_progress'
                                ? 'info'
                                : 'neutral'
                            }
                            label={
                              item.status === 'completed'
                                ? 'Completed (Auto)'
                                : item.status === 'in_progress'
                                ? 'In Progress (Auto)'
                                : 'Not Started'
                            }
                          />
                          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            · {autoHint}
                          </span>
                        </div>

                        {linkedCourse && linkedCourse.progressPercent < 100 ? (
                          <Button
                            size="sm"
                            variant={item.status === 'in_progress' ? 'primary' : 'outline'}
                            onClick={() => {
                              navigate('/learning/courses');
                              void openCoursePlayer(linkedCourse);
                            }}
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            {linkedCourse.progressPercent > 0 ? 'Continue Video Course' : 'Watch Video Course'}
                          </Button>
                        ) : linkedTask ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigate('/learning/tasks');
                              void handleStartTaskSession(linkedTask);
                            }}
                          >
                            <Timer className="w-3.5 h-3.5" />
                            Start Daily Lab
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setQuizSkill(item.targetSkill);
                              navigate('/learning/assessments');
                            }}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Verify Skill
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Surface>
        </div>
      )}

      {/* ===================================================================== */}
      {/* B. COURSES (Embedded Playable Videos + Automatic Progress Tracking)   */}
      {/* ===================================================================== */}
      {section === 'courses' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              active={courseFilter}
              onChange={setCourseFilter}
              tabs={[
                { id: 'all', label: 'All Courses', count: courses.length },
                { id: 'not_started', label: 'Recommended', count: courses.filter((c) => c.status === 'not_started').length },
                { id: 'in_progress', label: 'In Progress', count: courses.filter((c) => c.status === 'in_progress').length },
                {
                  id: 'completed',
                  label: 'Completed',
                  count: courses.filter((c) => c.status === 'completed' || c.status === 'assessment_pending' || c.status === 'verified').length,
                },
              ]}
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Watch embedded video lessons directly here — progress auto-tracks into your Roadmap &amp; Learning Outcomes.
            </p>
          </div>

          {filteredCourses.length === 0 ? (
            <Surface>
              <EmptyState
                icon={BookOpen}
                title="No courses in this view"
                description="Courses with embedded video lessons are curated based on your selected target job's missing skills."
                action={
                  <Button size="sm" onClick={() => navigate('/jobs/recommended')}>
                    Select Target Job
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCourses.map((course) => {
                const meta = findCatalogCourseForSkill(course.targetSkill);
                return (
                  <Surface key={course.id} className="p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-indigo-700 dark:text-indigo-400">
                          {course.provider}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {course.pricingType} · {course.difficulty} · {course.durationLabel || 'Self-paced'}
                        </span>
                      </div>

                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {course.title}
                      </h3>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <Video className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span className="truncate">
                          Embedded video lesson · {meta.videoChannel} · {meta.lessons.length} guided chapters
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                        <span>Target skill: {course.targetSkill}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                            {course.progressPercent}%
                          </span>
                          <StatusText
                            tone={
                              course.status === 'verified'
                                ? 'success'
                                : course.status === 'in_progress'
                                ? 'info'
                                : course.status === 'assessment_pending' || course.status === 'completed'
                                ? 'warning'
                                : 'neutral'
                            }
                            label={course.status.replace('_', ' ')}
                          />
                        </div>
                      </div>
                      <ProgressBar
                        value={course.progressPercent}
                        tone={course.status === 'verified' ? 'emerald' : 'indigo'}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                      {isSafeHttpUrl(course.officialUrl) ? (
                        <a
                          href={course.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-400 inline-flex items-center gap-1"
                        >
                          Official Docs <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span />
                      )}

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={
                            course.status === 'assessment_pending' || course.status === 'completed'
                              ? 'outline'
                              : 'primary'
                          }
                          onClick={() => openCoursePlayer(course)}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {course.status === 'not_started'
                            ? 'Watch Video & Start'
                            : course.status === 'in_progress'
                            ? 'Continue Video'
                            : 'Review Video'}
                        </Button>

                        {(course.status === 'assessment_pending' || course.status === 'completed') && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setQuizSkill(course.targetSkill);
                              navigate('/learning/assessments');
                            }}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Verify Skill
                          </Button>
                        )}
                      </div>
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* C. DAILY TASKS (Auto-Tracked Guided Focus Session & Step Checklist)   */}
      {/* ===================================================================== */}
      {section === 'tasks' && (
        <Surface>
          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title="No daily tasks scheduled"
              description="Select a target job to receive daily, bite-sized practical learning tasks aligned to your skill gaps."
              action={
                <Button size="sm" onClick={() => navigate('/jobs/recommended')}>
                  Explore Target Jobs
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-slate-200/80 dark:divide-slate-800">
              {filteredTasks.map((task) => {
                const expanded = expandedTaskId === task.id;
                const isRunning = activeSessionTaskId === task.id;
                const steps = parseTaskSteps(task);
                const checks = taskStepChecks[task.id] || loadCheckedMap(`chokma-task-steps-${task.id}`);
                const doneSteps = steps.filter((_, idx) => Boolean(checks[idx])).length;
                const stepPct = Math.round((doneSteps / steps.length) * 100);

                return (
                  <div key={task.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-medium text-indigo-700 dark:text-indigo-400">
                            {task.targetSkill}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="w-3 h-3" /> {task.estimatedMinutes} min
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{task.priority} priority</span>
                          {isRunning && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-400">
                                Focus timer {formatTimer(taskSessionSeconds)}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-400">{task.description}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <StatusText
                          tone={
                            task.status === 'completed'
                              ? 'success'
                              : task.status === 'in_progress'
                              ? 'info'
                              : 'neutral'
                          }
                          label={
                            task.status === 'completed'
                              ? 'Completed (Auto)'
                              : task.status === 'in_progress'
                              ? 'In Progress (Auto)'
                              : 'Ready'
                          }
                        />
                        {task.status !== 'completed' ? (
                          <Button
                            size="sm"
                            variant={isRunning ? 'outline' : 'primary'}
                            onClick={() => {
                              if (isRunning) {
                                setExpandedTaskId(expanded ? null : task.id);
                              } else {
                                void handleStartTaskSession(task);
                              }
                            }}
                          >
                            <Timer className="w-3.5 h-3.5" />
                            {isRunning
                              ? expanded
                                ? 'Hide Session'
                                : 'Show Active Session'
                              : task.status === 'in_progress'
                              ? 'Resume Focus Session'
                              : 'Start Focus Session'}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                          >
                            Review Log
                            {expanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {expanded && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4 text-xs">
                        {task.status !== 'completed' ? (
                          <>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  Guided Lab Checklist ({doneSteps}/{steps.length} steps)
                                </span>
                                <span className="font-mono tabular-nums text-slate-500">
                                  {stepPct}%
                                </span>
                              </div>
                              <ProgressBar value={stepPct} tone={stepPct === 100 ? 'emerald' : 'indigo'} />
                            </div>

                            <div className="space-y-2">
                              {steps.map((step, idx) => {
                                const checked = Boolean(checks[idx]);
                                return (
                                  <label
                                    key={idx}
                                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                                      checked
                                        ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-700 dark:text-slate-300'
                                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => void handleToggleTaskStep(task, idx)}
                                      className="mt-0.5 accent-indigo-600 rounded"
                                    />
                                    <span className={checked ? 'line-through opacity-80' : ''}>
                                      {step}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                              <div>
                                <FieldLabel htmlFor={`note-${task.id}`}>
                                  Quick engineering takeaway (optional)
                                </FieldLabel>
                                <Input
                                  id={`note-${task.id}`}
                                  placeholder="e.g. Verified IAM policy simulation & CloudWatch logs"
                                  value={taskNotesById[task.id] ?? ''}
                                  onChange={(e) =>
                                    setTaskNotesById((prev) => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                />
                              </div>
                              <div>
                                <FieldLabel htmlFor={`url-${task.id}`}>
                                  Gist / GitHub proof link (optional)
                                </FieldLabel>
                                <Input
                                  id={`url-${task.id}`}
                                  type="url"
                                  placeholder="https://github.com/..."
                                  value={taskUrlById[task.id] ?? ''}
                                  onChange={(e) =>
                                    setTaskUrlById((prev) => ({ ...prev, [task.id]: e.target.value }))
                                  }
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              {isSafeHttpUrl(task.resourceUrl) ? (
                                <a
                                  href={task.resourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-indigo-700 dark:text-indigo-400 font-medium hover:underline"
                                >
                                  Reference Documentation <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span />
                              )}

                              <Button
                                size="sm"
                                disabled={doneSteps < steps.length}
                                onClick={() => void handleFinishTaskSession(task)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {doneSteps < steps.length
                                  ? `Complete all ${steps.length} steps to finish`
                                  : 'Finish & Auto-Log Session'}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              Completed Steps
                            </p>
                            <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                              {steps.map((s, idx) => (
                                <li key={idx}>{s}</li>
                              ))}
                            </ul>
                            {task.evidenceNotes && (
                              <p className="text-emerald-700 dark:text-emerald-400 pt-1">
                                Auto-logged takeaway: {task.evidenceNotes}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      )}

      {/* ===================================================================== */}
      {/* D. PRACTICAL PROJECTS                                                 */}
      {/* ===================================================================== */}
      {section === 'projects' && (
        <div className="space-y-4">
          {filteredProjects.length === 0 ? (
            <Surface>
              <EmptyState
                icon={FolderGit2}
                title="No practical projects generated yet"
                description="Select a target role to unlock hands-on practical projects with AI engineering reviews."
                action={
                  <Button size="sm" onClick={() => navigate('/jobs/recommended')}>
                    Select Target Job
                  </Button>
                }
              />
            </Surface>
          ) : (
            filteredProjects.map((proj) => (
              <Surface key={proj.id} className="p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>Target skills: {(proj.targetSkills || []).join(' · ')}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {proj.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
                      {proj.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusText
                      tone={proj.status === 'reviewed' ? 'success' : proj.status === 'submitted' ? 'info' : 'neutral'}
                      label={proj.status.replace('_', ' ')}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        setSubmittingProject(proj);
                        setProjRepoUrl(proj.githubRepoUrl || '');
                        setProjEvidenceNotes(proj.evidenceNotes || '');
                      }}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {proj.status === 'reviewed' ? 'Resubmit Evidence' : 'Submit Evidence & Request AI Review'}
                    </Button>
                  </div>
                </div>

                {(proj.requirements?.length || proj.instructions) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                    {proj.requirements && proj.requirements.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Deliverable Requirements</p>
                        <ul className="list-disc pl-4 space-y-1 text-slate-600 dark:text-slate-400">
                          {proj.requirements.map((req, i) => (
                            <li key={i}>{req}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {proj.instructions && (
                      <div className="space-y-1.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Instructions</p>
                        <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                          {proj.instructions}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {proj.aiReviewFeedback && (
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-violet-700 dark:text-violet-400">
                        Progress &amp; Outcomes Agent Review
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        Score: {proj.aiReviewScore ?? 0}/100
                      </span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg">
                      {proj.aiReviewFeedback}
                    </p>
                  </div>
                )}
              </Surface>
            ))
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* E. ASSESSMENTS (Interactive Timed Verification Quiz Engine)           */}
      {/* ===================================================================== */}
      {section === 'assessments' && (
        <div className="space-y-6">
          {!activeQuiz && (
            <Surface className="p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Skill Verification Assessment
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pass with 70% or higher on technical and scenario questions to upgrade a skill to Assessment Verified and automatically update your Roadmap &amp; job match score.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
                <div className="flex-1 max-w-sm">
                  <FieldLabel htmlFor="quiz-skill">Target skill to verify</FieldLabel>
                  <Select
                    id="quiz-skill"
                    value={quizSkill}
                    onChange={(e) => setQuizSkill(e.target.value)}
                  >
                    {assessableSkills.map((sk) => (
                      <option key={sk} value={sk}>
                        {sk}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={() => handleStartAssessment()} disabled={generatingQuiz || !quizSkill}>
                  {generatingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  {generatingQuiz ? 'Generating 5-Question Quiz...' : 'Start Timed Assessment'}
                </Button>
              </div>
            </Surface>
          )}

          {activeQuiz && (
            <Surface className="p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                    {activeQuiz.targetSkill} · Question {currentQIdx + 1} of {activeQuiz.questions.length}
                  </p>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeQuiz.title}
                  </h2>
                </div>
                <div className="inline-flex items-center gap-1.5 font-mono tabular-nums text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Timer className="w-4 h-4 text-indigo-600" />
                  {formatTimer(activeQuiz.timeLeftSec)}
                </div>
              </div>

              <ProgressBar
                value={((currentQIdx + 1) / activeQuiz.questions.length) * 100}
                tone="indigo"
                label="Assessment question progress"
              />

              {(() => {
                const q = activeQuiz.questions[currentQIdx];
                return (
                  <div className="space-y-4">
                    <p className="text-[11px] font-medium text-slate-500 capitalize">
                      {q.type || 'technical'} question
                    </p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {q.prompt}
                    </p>
                    <div className="space-y-2.5">
                      {q.options.map((opt, oIdx) => {
                        const chosen = selectedAnswers[currentQIdx] === oIdx;
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => setSelectedAnswers((prev) => ({ ...prev, [currentQIdx]: oIdx }))}
                            className={`w-full text-left px-4 py-3 rounded-lg border text-xs transition-colors cursor-pointer ${
                              chosen
                                ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 text-slate-900 dark:text-slate-100 font-medium'
                                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="font-mono mr-2 text-slate-400">
                              {String.fromCharCode(65 + oIdx)}.
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentQIdx === 0}
                  onClick={() => setCurrentQIdx((i) => Math.max(0, i - 1))}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  {currentQIdx < activeQuiz.questions.length - 1 ? (
                    <Button size="sm" onClick={() => setCurrentQIdx((i) => i + 1)}>
                      Next Question
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleSubmitQuiz}
                      disabled={Object.keys(selectedAnswers).length < activeQuiz.questions.length}
                    >
                      Submit Assessment
                    </Button>
                  )}
                </div>
              </div>
            </Surface>
          )}

          {quizResult && (
            <Surface className="p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {quizResult.title} — Results
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {quizResult.passed
                      ? `${quizResult.targetSkill} has been upgraded to Assessment Verified in your profile.`
                      : 'Review the explanations below and retake when ready to reach 70%.'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                    {quizResult.scorePercent}%
                  </p>
                  <StatusText
                    tone={quizResult.passed ? 'success' : 'warning'}
                    label={quizResult.passed ? 'Passed · Verified' : 'Below 70% Threshold'}
                  />
                </div>
              </div>

              <div className="space-y-4">
                {quizResult.questions.map((q, idx) => {
                  const chosen = quizResult.answers[idx];
                  const isRight = chosen === q.correctIndex;
                  return (
                    <div key={idx} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-1.5 text-xs">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {idx + 1}. {q.prompt}
                        </p>
                        <StatusText tone={isRight ? 'success' : 'danger'} label={isRight ? 'Correct' : 'Incorrect'} />
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        Correct answer: <strong className="text-slate-900 dark:text-slate-100">{q.options[q.correctIndex]}</strong>
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{q.explanation}</p>
                    </div>
                  );
                })}
              </div>
            </Surface>
          )}

          <Surface className="p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recorded Assessment History
            </h3>
            {assessments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No assessments completed yet. Completed assessments are permanently recorded in Firestore.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-2 pr-4">Assessment</th>
                      <th className="py-2 px-3">Skill</th>
                      <th className="py-2 px-3 text-right">Score</th>
                      <th className="py-2 px-3">Outcome</th>
                      <th className="py-2 pl-3 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {assessments.map((a) => (
                      <tr key={a.id}>
                        <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">{a.title}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{a.targetSkill}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">{a.scorePercent}%</td>
                        <td className="py-3 px-3">
                          <StatusText tone={a.passed ? 'success' : 'warning'} label={a.passed ? 'Verified' : 'Needs Review'} />
                        </td>
                        <td className="py-3 pl-3 text-right font-mono tabular-nums text-slate-500">
                          {formatShortDate(a.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </div>
      )}

      {/* ===================================================================== */}
      {/* F. OUTCOMES & AUTO-TRACKED COURSE PROGRESS                            */}
      {/* ===================================================================== */}
      {section === 'outcomes' && (
        <div className="space-y-6">
          <Surface className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
            <div className="p-5 space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">1. Profile Completeness</p>
              <p className="text-2xl font-semibold font-mono tabular-nums">{outcomesData.profileCompleteness}%</p>
              <ProgressBar value={outcomesData.profileCompleteness} tone="indigo" />
            </div>
            <div className="p-5 space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">2. Target Job Match</p>
              <p className="text-2xl font-semibold font-mono tabular-nums">{outcomesData.jobMatch}%</p>
              <ProgressBar value={outcomesData.jobMatch} tone="indigo" />
            </div>
            <div className="p-5 space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">3. Avg Skill Proficiency</p>
              <p className="text-2xl font-semibold font-mono tabular-nums">{outcomesData.avgSkillProf}%</p>
              <ProgressBar value={outcomesData.avgSkillProf} tone="emerald" />
            </div>
            <div className="p-5 space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">4. Auto-Tracked Learning</p>
              <p className="text-2xl font-semibold font-mono tabular-nums">{outcomesData.learningProg}%</p>
              <ProgressBar value={outcomesData.learningProg} tone="emerald" />
            </div>
          </Surface>

          {/* Auto-Tracked All Courses Progress Board */}
          <Surface className="p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Auto-Tracked Course Progress
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatically synchronized whenever you watch embedded course videos or complete lesson chapters.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => navigate('/learning/courses')}>
                Open Video Courses
              </Button>
            </div>

            {courses.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a target job to enroll automatically in skill-gap video courses.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {courses.map((c) => (
                  <div
                    key={c.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                          {c.title}{' '}
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            · {c.targetSkill}
                          </span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                            {c.progressPercent}%
                          </span>
                          <StatusText
                            tone={
                              c.status === 'verified'
                                ? 'success'
                                : c.status === 'in_progress'
                                ? 'info'
                                : c.status === 'assessment_pending' || c.status === 'completed'
                                ? 'warning'
                                : 'neutral'
                            }
                            label={c.status.replace('_', ' ')}
                          />
                        </div>
                      </div>
                      <ProgressBar
                        value={c.progressPercent}
                        tone={c.status === 'verified' ? 'emerald' : 'indigo'}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0"
                      onClick={() => {
                        navigate('/learning/courses');
                        void openCoursePlayer(c);
                      }}
                    >
                      <Play className="w-3.5 h-3.5" />
                      {c.progressPercent > 0 ? 'Resume' : 'Watch'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Surface className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Skill Proficiency &amp; Verification Status
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Emerald: Assessment Verified · Indigo: Evidence Supported · Amber: Claimed
                </p>
              </div>
              {outcomesData.skillChartData.length === 0 ? (
                <p className="text-xs text-slate-500 py-12 text-center">Add or verify skills to visualize proficiency.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={outcomesData.skillChartData} margin={{ top: 8, right: 8, left: -16, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={45} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="proficiency" radius={[4, 4, 0, 0]}>
                        {outcomesData.skillChartData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={
                              entry.status === 'assessment_verified'
                                ? '#15803D'
                                : entry.status === 'evidence_supported'
                                ? '#4338CA'
                                : '#D97706'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Surface>

            <Surface className="p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Assessment Score Progression
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Passing threshold for skill verification: 70%
                </p>
              </div>
              {outcomesData.assessmentChartData.length === 0 ? (
                <p className="text-xs text-slate-500 py-12 text-center">
                  Complete a skill verification assessment to track score progression.
                </p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={outcomesData.assessmentChartData} margin={{ top: 8, right: 8, left: -16, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.4} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                        {outcomesData.assessmentChartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.passed ? '#15803D' : '#D97706'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Surface>
          </div>

          <Surface className="p-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Verified Skills &amp; Achievements
            </h3>
            {skills.filter((s) => s.verificationStatus !== 'claimed').length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No verified skills yet. Analyze GitHub, submit a practical project review, or pass an assessment.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {skills
                  .filter((s) => s.verificationStatus !== 'claimed')
                  .map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                      <div className="flex items-center gap-4">
                        <VerificationBadgeText status={s.verificationStatus} />
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {Math.round(s.proficiencyLevel * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Surface>
        </div>
      )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* EMBEDDED VIDEO COURSE PLAYER (Auto-Tracking + Interactive Chapters)   */}
      {/* ===================================================================== */}
      {activeCourse && activeCatalogMeta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Video lesson player for ${activeCourse.title}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          onClick={() => setActiveCourseId(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
                  {activeCourse.provider} · {activeCourse.targetSkill} · Auto-Tracking Active
                </p>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                  {activeCourse.title}
                </h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setWatchPaused((p) => !p)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono tabular-nums border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  title="Pause or resume watch timer"
                >
                  {watchPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  {formatTimer(watchSeconds)}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCourseId(null)}
                  aria-label="Close video player"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video + Chapters Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
              {/* Left 7 cols: Direct Embedded YouTube Video */}
              <div className="lg:col-span-7 space-y-3">
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <iframe
                    src={`https://www.youtube.com/embed/${activeCatalogMeta.youtubeVideoId}?rel=0`}
                    title={activeCourse.title}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>Video instructor: {activeCatalogMeta.videoChannel}</span>
                  {isSafeHttpUrl(activeCourse.officialUrl) && (
                    <a
                      href={activeCourse.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
                    >
                      Open Official Course Page <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {activeCatalogMeta.summary}
                </p>
              </div>

              {/* Right 5 cols: Auto-Tracked Chapter Progress */}
              <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Auto-Tracked Course Progress
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-indigo-700 dark:text-indigo-400">
                        {activeCourse.progressPercent}%
                      </span>
                    </div>
                    <ProgressBar
                      value={activeCourse.progressPercent}
                      tone={activeCourse.progressPercent >= 100 ? 'emerald' : 'indigo'}
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Checking off chapters or watching continuously automatically updates this course, your Roadmap, and Learning Outcomes.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Lesson Chapters
                    </p>
                    {activeCatalogMeta.lessons.map((lesson, idx) => {
                      const done = Boolean(completedLessons[idx]);
                      return (
                        <label
                          key={idx}
                          className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                            done
                              ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 text-slate-800 dark:text-slate-200'
                              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={done}
                            onChange={() => void handleToggleLesson(idx)}
                            className="mt-0.5 accent-indigo-600 rounded"
                          />
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                              0{idx + 1}
                            </span>
                            <span className={done ? 'line-through opacity-80' : ''}>{lesson}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Optional Study Notes & Certificate Link */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowCourseNotesBox((v) => !v)}
                      className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      {showCourseNotesBox ? 'Hide notes & certificate' : '+ Add study notes or certificate URL (optional)'}
                    </button>
                    {showCourseNotesBox && (
                      <div className="mt-2.5 space-y-2.5">
                        <Input
                          type="url"
                          placeholder="Certificate URL (https://...)"
                          value={courseCertUrl}
                          onChange={(e) => setCourseCertUrl(e.target.value)}
                        />
                        <Textarea
                          rows={2}
                          placeholder="Key takeaways from this video..."
                          value={courseNotes}
                          onChange={(e) => setCourseNotes(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await updateCourseRecord(activeCourse.id, {
                              status: activeCourse.status,
                              progressPercent: activeCourse.progressPercent,
                              certificateUrl: courseCertUrl,
                              evidenceNotes: courseNotes,
                            });
                            toast.success('Study notes saved');
                          }}
                        >
                          Save Notes
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer CTA */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => setActiveCourseId(null)}>
                    Close Player
                  </Button>
                  {activeCourse.progressPercent >= 100 && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setQuizSkill(activeCourse.targetSkill);
                        setActiveCourseId(null);
                        navigate('/learning/assessments');
                      }}
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Verify {activeCourse.targetSkill} Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Practical Project Submission Modal */}
      <Modal
        open={Boolean(submittingProject)}
        onClose={() => setSubmittingProject(null)}
        title="Submit Practical Project Evidence"
        description={submittingProject?.title}
      >
        <form onSubmit={handleSubmitProjectReview} className="space-y-4">
          <div>
            <FieldLabel htmlFor="prj-repo">GitHub Repository URL</FieldLabel>
            <Input
              id="prj-repo"
              type="url"
              placeholder="https://github.com/username/project-repo"
              value={projRepoUrl}
              onChange={(e) => setProjRepoUrl(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel htmlFor="prj-notes">Architecture &amp; Verification Evidence</FieldLabel>
            <Textarea
              id="prj-notes"
              rows={4}
              required
              placeholder="Describe how you satisfied each requirement, commands run, test cases, and troubleshooting results..."
              value={projEvidenceNotes}
              onChange={(e) => setProjEvidenceNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSubmittingProject(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={reviewingProject}>
              {reviewingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {reviewingProject ? 'AI Agent Reviewing...' : 'Submit for AI Review'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
