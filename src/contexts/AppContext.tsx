import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  ApplicationStatus,
  AssessmentAttempt,
  CandidateSkill,
  ChatMessage,
  Conversation,
  CourseRecord,
  CourseStatus,
  DailyTask,
  DEFAULT_MATCHING_WEIGHTS,
  EvidenceSource,
  JobApplication,
  JobListing,
  MatchingWeights,
  PracticalProject,
  RoadmapItem,
  SelectedJob,
  UserProfile,
  VerificationStatus,
} from '../types';
import { CURATED_SAMPLE_JOBS } from '../data/curatedJobs';
import { findCatalogCourseForSkill } from '../data/courseCatalog';
import { calculateJobMatch, calculateProfileCompleteness } from '../utils/matchingEngine';
import { clampNumber, makeSafeId, sanitizeStr } from '../lib/utils';
import { canAccessWorkspace, resolveAuthIdentifier } from '../lib/authIdentifier';
import {
  localDemoLogin,
  localLoginAccount,
  localLogoutAccount,
  localRegisterAccount,
  LocalAuthUser,
} from '../lib/localAuthSession';
import { buildDemoWorkspace, DemoPersonaId } from '../data/demoPersonas';
import { generateRoadmapWithAgent, sendAssistantMessage } from '../services/api';

const ADMIN_EMAIL = 'santhoshosanthosho19@gmail.com';

interface AppContextValue {
  user: User | null;
  authLoading: boolean;
  isAdmin: boolean;
  isLocalSession: boolean;
  localMessagesByConv: Record<string, ChatMessage[]>;
  profile: UserProfile | null;
  skills: CandidateSkill[];
  jobs: JobListing[];
  selectedJobs: SelectedJob[];
  roadmapItems: RoadmapItem[];
  courses: CourseRecord[];
  dailyTasks: DailyTask[];
  practicalProjects: PracticalProject[];
  assessments: AssessmentAttempt[];
  applications: JobApplication[];
  conversations: Conversation[];
  matchingWeights: MatchingWeights;
  savedJobIds: string[];
  toggleSavedJob: (jobId: string) => void;
  // Auth actions
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, pass: string) => Promise<void>;
  signInAsDemoPersona: (personaId: DemoPersonaId) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshUserAuth: () => Promise<boolean>;
  signOut: () => Promise<void>;
  // Profile & Skills
  updateProfileFields: (patch: Partial<UserProfile>) => Promise<void>;
  upsertSkill: (skill: {
    id?: string;
    name: string;
    category: string;
    proficiencyLevel: number;
    evidenceSource: EvidenceSource;
    verificationStatus: VerificationStatus;
    evidenceNotes?: string;
  }) => Promise<void>;
  deleteSkill: (skillId: string) => Promise<void>;
  // Jobs & Selected Jobs
  selectTargetJob: (job: JobListing) => Promise<SelectedJob | null>;
  removeSelectedJob: (selectedJobId: string) => Promise<void>;
  generatePlanForSelectedJob: (selectedJob: SelectedJob, job: JobListing) => Promise<void>;
  recalculateSelectedJobs: () => Promise<void>;
  // Learning & Outcomes
  updateRoadmapItemStatus: (itemId: string, status: RoadmapItem['status']) => Promise<void>;
  updateCourseRecord: (
    courseId: string,
    patch: { status: CourseStatus; progressPercent: number; certificateUrl?: string; evidenceNotes?: string }
  ) => Promise<void>;
  updateDailyTask: (
    taskId: string,
    patch: { status: DailyTask['status']; evidenceNotes?: string; evidenceUrl?: string }
  ) => Promise<void>;
  updatePracticalProject: (
    projectId: string,
    patch: {
      status: PracticalProject['status'];
      githubRepoUrl?: string;
      evidenceNotes?: string;
      aiReviewFeedback?: string;
      aiReviewScore?: number;
    }
  ) => Promise<void>;
  recordAssessmentResult: (payload: {
    selectedJobId: string;
    targetSkill: string;
    title: string;
    questionsCount: number;
    scorePercent: number;
    passed: boolean;
    explanationsSummary: string;
  }) => Promise<void>;
  // Applications
  upsertApplication: (app: {
    id?: string;
    jobId: string;
    jobTitle: string;
    company: string;
    location?: string;
    officialUrl: string;
    status: ApplicationStatus;
    dateApplied?: string;
    deadline?: string;
    interviewDate?: string;
    nextAction?: string;
    notes?: string;
  }) => Promise<void>;
  deleteApplication: (applicationId: string) => Promise<void>;
  // AI Assistant
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (conversationId: string) => Promise<void>;
  askAssistant: (
    conversationId: string,
    message: string,
    history: ChatMessage[],
    language?: string
  ) => Promise<{ agentUsed: string; reply: string }>;
  // Admin
  saveMatchingWeights: (weights: MatchingWeights) => Promise<void>;
  publishAdminJob: (job: Omit<JobListing, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  // Helper
  buildAssistantContext: () => Record<string, unknown>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLocalSession, setIsLocalSession] = useState(false);
  const [localMessagesByConv, setLocalMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [skills, setSkills] = useState<CandidateSkill[]>([]);
  const [firestoreJobs, setFirestoreJobs] = useState<JobListing[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<SelectedJob[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [practicalProjects, setPracticalProjects] = useState<PracticalProject[]>([]);
  const [assessments, setAssessments] = useState<AssessmentAttempt[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [matchingWeights, setMatchingWeights] = useState<MatchingWeights>(DEFAULT_MATCHING_WEIGHTS);
  const [savedJobIds, setSavedJobIds] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem('chokma-saved-jobs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const isLocalSessionRef = React.useRef(false);
  isLocalSessionRef.current = isLocalSession;

  const isAdmin = Boolean(!isLocalSession && user?.email === ADMIN_EMAIL && user?.emailVerified);

  const toggleSavedJob = useCallback((jobId: string) => {
    setSavedJobIds((prev) => {
      const next = prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId];
      window.localStorage.setItem('chokma-saved-jobs', JSON.stringify(next));
      return next;
    });
  }, []);

  // Deduplicated jobs list combining Firestore verified jobs + clearly marked Sample Reference Catalog
  const jobs = useMemo(() => {
    const map = new Map<string, JobListing>();
    for (const j of CURATED_SAMPLE_JOBS) {
      map.set(j.id, j);
    }
    for (const fj of firestoreJobs) {
      map.set(fj.id, fj);
    }
    return Array.from(map.values()).filter((j) => j.status === 'active');
  }, [firestoreJobs]);

  const buildInitialProfileData = useCallback(
    (uid: string, email: string, displayName: string): UserProfile => ({
      uid,
      email: sanitizeStr(email || 'student@example.com', 254),
      displayName: sanitizeStr(displayName || 'Student', 120),
      phone: '',
      college: '',
      university: '',
      degree: 'B.Tech',
      department: 'Computer Science & Engineering',
      graduationYear: '2026',
      cgpa: '',
      currentAcademicYear: 'Final Year',
      location: 'India',
      careerObjective:
        'Transition into a high-impact cloud or software engineering role backed by verified skills and portfolio projects.',
      role: 'student',
      portfolioUrl: '',
      linkedinUrl: '',
      githubUsername: '',
      credlyUrl: '',
      leetcodeUrl: '',
      hackerrankUrl: '',
      preferences: {
        preferredCompanies: ['Amazon', 'Google', 'Microsoft', 'IBM', 'Deloitte'],
        preferredRoles: ['Cloud Support Associate', 'Software Engineer'],
        preferredLocations: ['Bengaluru', 'Hyderabad', 'Remote'],
        preferredCountries: ['India'],
        jobType: 'Both',
        workMode: 'Any',
        minSalary: '',
        experienceLevel: '0–1 Years (Freshers)',
        preferredIndustries: ['Cloud Computing', 'Software Engineering'],
        dailyLearningMinutes: 60,
      },
      education: [],
      experience: [],
      projects: [],
      certifications: [],
      resumes: [],
      profileCompleteness: 32,
    }),
    []
  );

  const resetWorkspaceState = useCallback(() => {
    setProfile(null);
    setSkills([]);
    setSelectedJobs([]);
    setRoadmapItems([]);
    setCourses([]);
    setDailyTasks([]);
    setPracticalProjects([]);
    setAssessments([]);
    setApplications([]);
    setConversations([]);
    setLocalMessagesByConv({});
  }, []);

  const activateLocalAuthUser = useCallback(
    (localUser: LocalAuthUser) => {
      const syntheticUser = {
        uid: localUser.uid,
        email: localUser.email,
        displayName: localUser.displayName,
        emailVerified: true,
      } as unknown as User;
      setIsLocalSession(true);
      isLocalSessionRef.current = true;
      setUser(syntheticUser);
      setProfile(buildInitialProfileData(localUser.uid, localUser.email, localUser.displayName));
      setAuthLoading(false);
    },
    [buildInitialProfileData]
  );

  // Ensure user profile exists on first sign-in (Firestore mode)
  const initializeUserProfile = useCallback(
    async (firebaseUser: User, preferredName?: string) => {
      const profileRef = doc(db, 'users', firebaseUser.uid);
      try {
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          const displayName = sanitizeStr(
            preferredName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Student',
            120
          );
          const base = buildInitialProfileData(
            firebaseUser.uid,
            firebaseUser.email || 'student@example.com',
            displayName
          );
          await setDoc(profileRef, {
            ...base,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (preferredName && snap.data()?.displayName !== sanitizeStr(preferredName, 120)) {
          await updateDoc(profileRef, {
            displayName: sanitizeStr(preferredName, 120),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${firebaseUser.uid}`);
      }
    },
    [buildInitialProfileData]
  );

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsLocalSession(false);
        isLocalSessionRef.current = false;
        setUser(firebaseUser);
        if (canAccessWorkspace(firebaseUser)) {
          await initializeUserProfile(firebaseUser);
        }
      } else if (!isLocalSessionRef.current) {
        setUser(null);
        resetWorkspaceState();
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, [initializeUserProfile, resetWorkspaceState]);

  // Real-time Firestore listeners (only for Firebase-authenticated sessions)
  useEffect(() => {
    if (!user || !canAccessWorkspace(user) || isLocalSession) return;
    const uid = user.uid;
    const unsubs: Array<() => void> = [];

    // 1. User profile doc
    unsubs.push(
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
      )
    );

    // 2. Skills subcollection
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'skills'), where('userId', '==', uid)),
        (snap) => {
          setSkills(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CandidateSkill));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/skills`)
      )
    );

    // 3. Selected jobs subcollection
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'selected_jobs'), where('userId', '==', uid)),
        (snap) => {
          setSelectedJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SelectedJob));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/selected_jobs`)
      )
    );

    // 4. Roadmap items
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'roadmap_items'), where('userId', '==', uid)),
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RoadmapItem);
          list.sort((a, b) => (a.phaseOrder || 0) - (b.phaseOrder || 0));
          setRoadmapItems(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/roadmap_items`)
      )
    );

    // 5. Courses
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'courses'), where('userId', '==', uid)),
        (snap) => {
          setCourses(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CourseRecord));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/courses`)
      )
    );

    // 6. Daily tasks
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'daily_tasks'), where('userId', '==', uid)),
        (snap) => {
          setDailyTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DailyTask));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/daily_tasks`)
      )
    );

    // 7. Practical projects
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'practical_projects'), where('userId', '==', uid)),
        (snap) => {
          setPracticalProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PracticalProject));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/practical_projects`)
      )
    );

    // 8. Assessments
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'assessments'), where('userId', '==', uid)),
        (snap) => {
          setAssessments(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AssessmentAttempt));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/assessments`)
      )
    );

    // 9. Applications
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'applications'), where('userId', '==', uid)),
        (snap) => {
          setApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JobApplication));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/applications`)
      )
    );

    // 10. Conversations
    unsubs.push(
      onSnapshot(
        query(collection(db, 'users', uid, 'conversations'), where('userId', '==', uid)),
        (snap) => {
          setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Conversation));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/conversations`)
      )
    );

    // 11. Active global Firestore jobs (admin-published verified listings)
    unsubs.push(
      onSnapshot(
        query(collection(db, 'jobs'), where('status', '==', 'active')),
        (snap) => {
          setFirestoreJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as JobListing));
        },
        (err) => console.warn('Optional global jobs listener:', err.message)
      )
    );

    // 12. Admin matching weights
    unsubs.push(
      onSnapshot(
        doc(db, 'admin_settings', 'matching_weights'),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data() as MatchingWeights;
            setMatchingWeights({
              technicalSkillsWeight: d.technicalSkillsWeight ?? 40,
              projectRelevanceWeight: d.projectRelevanceWeight ?? 20,
              educationWeight: d.educationWeight ?? 15,
              experienceWeight: d.experienceWeight ?? 15,
              certificationsWeight: d.certificationsWeight ?? 10,
            });
          }
        },
        (err) => console.warn('Default matching weights active:', err.message)
      )
    );

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [user, isLocalSession]);

  // Auth methods
  const signInWithGoogle = async () => {
    await localLogoutAccount();
    setIsLocalSession(false);
    isLocalSessionRef.current = false;
    await signInWithPopup(auth, googleProvider);
    toast.success('Signed in with Google');
  };

  const signInWithEmail = async (identifier: string, pass: string) => {
    const { firebaseEmail, isUsername, displayUsername } = resolveAuthIdentifier(identifier);
    if (isUsername) {
      const res = await localLoginAccount({ username: displayUsername, password: pass });
      activateLocalAuthUser(res.user);
      toast.success(`Signed in as ${res.user.displayName}`);
      return;
    }
    await signInWithEmailAndPassword(auth, firebaseEmail, pass);
    toast.success('Signed in successfully');
  };

  const registerWithEmail = async (name: string, identifier: string, pass: string) => {
    const { firebaseEmail, isUsername, displayUsername } = resolveAuthIdentifier(identifier);
    const finalDisplayName = name.trim() || displayUsername;
    if (isUsername) {
      const res = await localRegisterAccount({
        username: displayUsername,
        password: pass,
        displayName: finalDisplayName,
      });
      activateLocalAuthUser(res.user);
      toast.success(`Account "${res.user.displayName}" created! Welcome to Chokma.`);
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth, firebaseEmail, pass);
    if (finalDisplayName) {
      await updateProfile(cred.user, { displayName: finalDisplayName });
    }
    try {
      await sendEmailVerification(cred.user);
      toast.success('Account created! Please check your inbox and verify your email to unlock your workspace.');
    } catch {
      toast.success('Account created! Please verify your email address.');
    }
  };

  const signInAsDemoPersona = async (personaId: DemoPersonaId) => {
    const res = await localDemoLogin(personaId);
    const seed = buildDemoWorkspace(personaId, res.user.uid, res.user.email);
    const syntheticUser = {
      uid: res.user.uid,
      email: res.user.email,
      displayName: res.user.displayName,
      emailVerified: true,
    } as unknown as User;
    setIsLocalSession(true);
    isLocalSessionRef.current = true;
    setUser(syntheticUser);
    setProfile(seed.profile);
    setSkills(seed.skills);
    setSelectedJobs(seed.selectedJobs);
    setRoadmapItems(seed.roadmapItems);
    setCourses(seed.courses);
    setDailyTasks(seed.dailyTasks);
    setPracticalProjects(seed.practicalProjects);
    setAssessments([]);
    setApplications(seed.applications);
    setConversations([]);
    setLocalMessagesByConv({});
    setAuthLoading(false);
    toast.success(`Signed in as demo user ${res.user.displayName}`);
  };

  const resetPassword = async (identifier: string) => {
    const { firebaseEmail, isUsername } = resolveAuthIdentifier(identifier);
    if (isUsername) {
      throw new Error('Password reset links can only be sent to a real email address.');
    }
    await sendPasswordResetEmail(auth, firebaseEmail);
    toast.success('Password reset email sent');
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    await sendEmailVerification(auth.currentUser);
    toast.success('Verification link resent to your email');
  };

  const refreshUserAuth = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshed = auth.currentUser;
    if (canAccessWorkspace(refreshed)) {
      setUser({ ...refreshed } as User);
      await initializeUserProfile(refreshed);
      toast.success('Email verified! Welcome to Chokma.');
      return true;
    }
    toast.info('Email is not verified yet. Click the verification link in your inbox, then click Refresh.');
    return false;
  };

  const signOut = async () => {
    if (isLocalSession) {
      await localLogoutAccount();
      setIsLocalSession(false);
      isLocalSessionRef.current = false;
      setUser(null);
      resetWorkspaceState();
      toast.success('Signed out');
      return;
    }
    await firebaseSignOut(auth);
    toast.success('Signed out');
  };

  // Profile updates
  const updateProfileFields = useCallback(
    async (patch: Partial<UserProfile>) => {
      if (!user || !profile) return;
      const merged: UserProfile = { ...profile, ...patch };
      const completeness = calculateProfileCompleteness(merged, skills);
      const safePatch: Record<string, unknown> = {
        profileCompleteness: completeness,
        updatedAt: serverTimestamp(),
      };

      const allowedStringFields: Array<[keyof UserProfile, number]> = [
        ['displayName', 120],
        ['phone', 40],
        ['college', 160],
        ['university', 160],
        ['degree', 120],
        ['department', 120],
        ['graduationYear', 16],
        ['cgpa', 32],
        ['currentAcademicYear', 40],
        ['location', 120],
        ['careerObjective', 1200],
        ['portfolioUrl', 300],
        ['linkedinUrl', 300],
        ['githubUsername', 100],
        ['credlyUrl', 300],
        ['leetcodeUrl', 300],
        ['hackerrankUrl', 300],
      ];

      for (const [key, maxLen] of allowedStringFields) {
        if (key in patch) {
          const val = sanitizeStr(patch[key], maxLen);
          if (key === 'displayName' && !val) continue;
          safePatch[key] = val;
        }
      }

      if ('githubAnalysis' in patch && patch.githubAnalysis) {
        safePatch.githubAnalysis = patch.githubAnalysis;
      }
      if ('preferences' in patch && patch.preferences) {
        safePatch.preferences = patch.preferences;
      }
      if ('education' in patch && Array.isArray(patch.education)) {
        safePatch.education = patch.education.slice(0, 10);
      }
      if ('experience' in patch && Array.isArray(patch.experience)) {
        safePatch.experience = patch.experience.slice(0, 20);
      }
      if ('projects' in patch && Array.isArray(patch.projects)) {
        safePatch.projects = patch.projects.slice(0, 20);
      }
      if ('certifications' in patch && Array.isArray(patch.certifications)) {
        safePatch.certifications = patch.certifications.slice(0, 20);
      }
      if ('resumes' in patch && Array.isArray(patch.resumes)) {
        safePatch.resumes = patch.resumes.slice(0, 10);
      }

      if (isLocalSession) {
        setProfile({ ...merged, profileCompleteness: completeness });
        return;
      }

      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), safePatch);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, profile, skills, isLocalSession]
  );

  // Recalculate selected jobs match & learning progress
  const recalculateSelectedJobsWithData = useCallback(
    async (currentSkills: CandidateSkill[], currentProfile: UserProfile | null) => {
      if (!user || selectedJobs.length === 0) return;
      for (const sel of selectedJobs) {
        const jobDef = jobs.find((j) => j.id === sel.jobId);
        if (!jobDef) continue;
        const breakdown = calculateJobMatch(jobDef, currentProfile, currentSkills, matchingWeights);
        const relRoadmap = roadmapItems.filter((r) => r.selectedJobId === sel.id);
        const relCourses = courses.filter((c) => c.selectedJobId === sel.id);
        const relTasks = dailyTasks.filter((t) => t.selectedJobId === sel.id);
        const totalItems = relRoadmap.length + relCourses.length + relTasks.length;
        const weightedDone =
          relRoadmap.reduce(
            (sum, r) => sum + (r.status === 'completed' ? 1 : r.status === 'in_progress' ? 0.5 : 0),
            0
          ) +
          relCourses.reduce(
            (sum, c) =>
              sum +
              (c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending'
                ? 1
                : clampNumber(c.progressPercent || 0, 0, 100) / 100),
            0
          ) +
          relTasks.reduce(
            (sum, t) => sum + (t.status === 'completed' ? 1 : t.status === 'in_progress' ? 0.5 : 0),
            0
          );
        const learningProgress = totalItems > 0 ? Math.round((weightedDone / totalItems) * 100) : sel.learningProgress;

        if (
          sel.matchScore !== breakdown.overallScore ||
          sel.learningProgress !== learningProgress ||
          (sel.matchedSkills?.length || 0) !== breakdown.matchedSkills.length
        ) {
          const patchFields = {
            matchScore: breakdown.overallScore,
            eligibilityPassed: breakdown.eligibilityPassed,
            matchedSkills: breakdown.matchedSkills.slice(0, 30),
            partialSkills: breakdown.partialSkills.slice(0, 30),
            missingSkills: breakdown.missingSkills.slice(0, 30),
            unverifiedSkills: breakdown.unverifiedSkills.slice(0, 30),
            learningProgress,
          };
          if (isLocalSession) {
            setSelectedJobs((prev) => prev.map((s) => (s.id === sel.id ? { ...s, ...patchFields } : s)));
            continue;
          }
          try {
            await updateDoc(doc(db, 'users', user.uid, 'selected_jobs', sel.id), {
              ...patchFields,
              updatedAt: serverTimestamp(),
            });
          } catch (err) {
            console.warn('Selected job recalculation skipped:', err);
          }
        }
      }
    },
    [user, selectedJobs, jobs, matchingWeights, roadmapItems, courses, dailyTasks, isLocalSession]
  );

  const recalculateSelectedJobs = useCallback(async () => {
    await recalculateSelectedJobsWithData(skills, profile);
  }, [recalculateSelectedJobsWithData, skills, profile]);

  // Skill CRUD
  const upsertSkill = useCallback(
    async (input: {
      id?: string;
      name: string;
      category: string;
      proficiencyLevel: number;
      evidenceSource: EvidenceSource;
      verificationStatus: VerificationStatus;
      evidenceNotes?: string;
    }) => {
      if (!user) return;
      const cleanName = sanitizeStr(input.name, 80);
      if (!cleanName) return;

      const existingSkill =
        (input.id ? skills.find((s) => s.id === input.id) : undefined) ||
        skills.find((s) => s.name.toLowerCase() === cleanName.toLowerCase());

      const skillId = existingSkill?.id || makeSafeId('sk');
      const ref = doc(db, 'users', user.uid, 'skills', skillId);

      const safeData = {
        name: cleanName,
        category: sanitizeStr(input.category || 'Technical', 60) || 'Technical',
        proficiencyLevel: clampNumber(input.proficiencyLevel, 0, 1),
        evidenceSource: input.evidenceSource,
        verificationStatus: input.verificationStatus,
        evidenceNotes: sanitizeStr(input.evidenceNotes || '', 600),
        updatedAt: serverTimestamp(),
      };

      const updatedSkills = existingSkill
        ? skills.map((s) => (s.id === skillId ? { ...s, ...safeData } : s))
        : [...skills, { id: skillId, userId: user.uid, ...safeData } as CandidateSkill];

      if (isLocalSession) {
        setSkills(updatedSkills);
        if (profile) {
          const nextComp = calculateProfileCompleteness(profile, updatedSkills);
          if (nextComp !== profile.profileCompleteness) {
            setProfile({ ...profile, profileCompleteness: nextComp });
          }
        }
        await recalculateSelectedJobsWithData(updatedSkills, profile);
        return;
      }

      try {
        if (existingSkill) {
          await updateDoc(ref, safeData);
        } else {
          await setDoc(ref, {
            ...safeData,
            userId: user.uid,
            createdAt: serverTimestamp(),
          });
        }

        if (profile) {
          const nextComp = calculateProfileCompleteness(profile, updatedSkills);
          if (nextComp !== profile.profileCompleteness) {
            await updateDoc(doc(db, 'users', user.uid), {
              profileCompleteness: nextComp,
              updatedAt: serverTimestamp(),
            });
          }
        }
        await recalculateSelectedJobsWithData(updatedSkills, profile);
      } catch (err) {
        handleFirestoreError(err, existingSkill ? OperationType.UPDATE : OperationType.CREATE, `users/${user.uid}/skills/${skillId}`);
      }
    },
    [user, skills, profile, recalculateSelectedJobsWithData, isLocalSession]
  );

  const deleteSkill = useCallback(
    async (skillId: string) => {
      if (!user) return;
      if (isLocalSession) {
        setSkills((prev) => prev.filter((s) => s.id !== skillId));
        toast.success('Skill removed');
        return;
      }
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'skills', skillId));
        toast.success('Skill removed');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/skills/${skillId}`);
      }
    },
    [user, isLocalSession]
  );

  // Generate personalized roadmap, courses, tasks & practical projects for a selected job
  const generatePlanForSelectedJob = useCallback(
    async (selectedJob: SelectedJob, job: JobListing) => {
      if (!user) return;
      const breakdown = calculateJobMatch(job, profile, skills, matchingWeights);
      const targetGapSkills = [
        ...breakdown.missingSkills,
        ...breakdown.partialSkills,
        ...breakdown.unverifiedSkills,
      ].slice(0, 8);
      const fallbackSkills = targetGapSkills.length > 0 ? targetGapSkills : job.requiredSkills.slice(0, 5).map((r) => r.name);

      let aiPlan: Awaited<ReturnType<typeof generateRoadmapWithAgent>>['plan'] | null = null;
      try {
        const res = await generateRoadmapWithAgent({
          jobTitle: job.title,
          company: job.company,
          missingSkills: breakdown.missingSkills,
          partialSkills: breakdown.partialSkills,
          unverifiedSkills: breakdown.unverifiedSkills,
          dailyLearningMinutes: profile?.preferences?.dailyLearningMinutes || 60,
        });
        aiPlan = res.plan;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'AI Planner unavailable — creating structured gap roadmap from skill catalog.');
      }

      const summaryText = sanitizeStr(
        aiPlan?.roadmapSummary ||
          `Targeted ${fallbackSkills.length}-skill plan for ${job.title} at ${job.company}, prioritizing missing and unverified competencies.`,
        1000
      );

      const milestones =
        aiPlan?.milestones && aiPlan.milestones.length > 0
          ? aiPlan.milestones.slice(0, 6)
          : fallbackSkills.slice(0, 5).map((sk, idx) => ({
              title: `Master ${sk} for ${job.title}`,
              skillCategory: job.requiredSkills.find((r) => r.name === sk)?.category || 'Core Technical',
              targetSkill: sk,
              priority: (idx < 2 ? 'high' : 'medium') as 'high' | 'medium' | 'low',
              durationHours: 6 + idx * 2,
              phaseOrder: idx + 1,
              description: `Build verified hands-on fluency in ${sk} aligned with ${job.company} ${job.title} requirements.`,
              expectedOutcome: `Complete practical lab and score >= 70% on ${sk} verification assessment.`,
            }));

      const newRoadmapDocs: RoadmapItem[] = milestones.map((m, idx) => ({
        id: makeSafeId('rm'),
        userId: user.uid,
        selectedJobId: selectedJob.id,
        title: sanitizeStr(m.title, 160) || `Phase ${idx + 1}`,
        skillCategory: sanitizeStr(m.skillCategory || 'Technical', 80) || 'Technical',
        targetSkill: sanitizeStr(m.targetSkill, 80) || sanitizeStr(fallbackSkills[0], 80) || 'Core',
        priority: m.priority === 'high' || m.priority === 'low' ? m.priority : 'medium',
        durationHours: clampNumber(Number(m.durationHours) || 6, 1, 200),
        phaseOrder: clampNumber(Number(m.phaseOrder) || idx + 1, 1, 50),
        status: 'not_started',
        description: sanitizeStr(m.description || '', 800),
        expectedOutcome: sanitizeStr(m.expectedOutcome || '', 500),
      }));

      const existingCourseSkills = new Set(
        courses.filter((c) => c.selectedJobId === selectedJob.id && c.status !== 'not_started').map((c) => c.targetSkill.toLowerCase())
      );
      const newCourseDocs: CourseRecord[] = [];
      fallbackSkills.slice(0, 5).forEach((sk) => {
        if (existingCourseSkills.has(sk.toLowerCase())) return;
        const cat = findCatalogCourseForSkill(sk);
        newCourseDocs.push({
          id: makeSafeId('crs'),
          userId: user.uid,
          selectedJobId: selectedJob.id,
          title: sanitizeStr(cat.title, 180) || 'Skill Course',
          provider: sanitizeStr(cat.provider, 80) || 'Official Provider',
          officialUrl: sanitizeStr(cat.officialUrl, 400),
          targetSkill: sanitizeStr(sk, 80) || 'Core Skill',
          difficulty: cat.difficulty,
          durationLabel: sanitizeStr(cat.durationLabel, 40),
          pricingType: cat.pricingType,
          status: 'not_started',
          progressPercent: 0,
          certificateUrl: '',
          evidenceNotes: '',
        });
      });

      const tasks =
        aiPlan?.dailyTasks && aiPlan.dailyTasks.length > 0
          ? aiPlan.dailyTasks.slice(0, 5)
          : fallbackSkills.slice(0, 4).map((sk, idx) => ({
              title: `Hands-on Lab: ${sk} Diagnostics & Fundamentals`,
              description: `Focused daily practice session to close your ${sk} gap for ${job.title}.`,
              targetSkill: sk,
              estimatedMinutes: 45,
              priority: (idx === 0 ? 'high' : 'medium') as 'high' | 'medium' | 'low',
              instructions: `1. Review official ${sk} documentation.\n2. Execute 3 practical troubleshooting commands or configurations.\n3. Document your commands and takeaways as evidence below.`,
            }));

      const newTaskDocs: DailyTask[] = tasks.map((t, idx) => {
        const cat = findCatalogCourseForSkill(t.targetSkill || fallbackSkills[0] || 'Cloud');
        return {
          id: makeSafeId('tsk'),
          userId: user.uid,
          selectedJobId: selectedJob.id,
          title: sanitizeStr(t.title, 180) || `Task ${idx + 1}`,
          description: sanitizeStr(t.description || '', 800),
          targetSkill: sanitizeStr(t.targetSkill, 80) || sanitizeStr(fallbackSkills[0], 80) || 'Core',
          estimatedMinutes: clampNumber(Number(t.estimatedMinutes) || 45, 5, 480),
          priority: t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium',
          instructions: sanitizeStr(t.instructions || '', 1500),
          resourceUrl: sanitizeStr(cat.officialUrl, 400),
          status: 'pending',
          evidenceNotes: '',
          evidenceUrl: '',
        };
      });

      const hasProjects = practicalProjects.some((p) => p.selectedJobId === selectedJob.id);
      const newProjectDocs: PracticalProject[] = [];
      if (!hasProjects) {
        const projectsToCreate =
          aiPlan?.practicalProjects && aiPlan.practicalProjects.length > 0
            ? aiPlan.practicalProjects.slice(0, 2)
            : [
                {
                  title: `${job.title} Practical Lab & Troubleshooting Runbook`,
                  description: `Design, deploy, and document a verifiable hands-on project exercising ${fallbackSkills.slice(0, 3).join(', ')}.`,
                  targetSkills: fallbackSkills.slice(0, 4),
                  requirements: [
                    `Demonstrate least-privilege configuration and diagnostics for ${fallbackSkills[0] || 'core stack'}`,
                    'Include reproducible setup steps and architecture notes in a public GitHub README',
                    'Document 2 simulated failure scenarios and root-cause fixes',
                  ],
                  instructions:
                    '1. Initialize a clean GitHub repository with a structured README.\n2. Build and verify each requirement locally or in a cloud free-tier sandbox.\n3. Submit your repository URL and implementation summary for Progress & Outcomes Agent review.',
                },
              ];

        projectsToCreate.forEach((p) => {
          newProjectDocs.push({
            id: makeSafeId('prj'),
            userId: user.uid,
            selectedJobId: selectedJob.id,
            title: sanitizeStr(p.title, 180) || 'Hands-on Practical Project',
            description:
              sanitizeStr(p.description, 1000) ||
              'Build and document a verifiable portfolio project aligned to role requirements.',
            targetSkills: (p.targetSkills || fallbackSkills.slice(0, 3))
              .slice(0, 10)
              .map((s) => sanitizeStr(s, 60))
              .filter(Boolean),
            requirements: (p.requirements || [])
              .slice(0, 10)
              .map((s) => sanitizeStr(s, 200))
              .filter(Boolean),
            instructions: sanitizeStr(p.instructions || '', 2000),
            status: 'not_started',
            githubRepoUrl: '',
            evidenceNotes: '',
            aiReviewFeedback: '',
            aiReviewScore: 0,
          });
        });
      }

      if (isLocalSession) {
        setSelectedJobs((prev) =>
          prev.map((s) =>
            s.id === selectedJob.id
              ? {
                  ...s,
                  matchScore: breakdown.overallScore,
                  matchedSkills: breakdown.matchedSkills.slice(0, 30),
                  partialSkills: breakdown.partialSkills.slice(0, 30),
                  missingSkills: breakdown.missingSkills.slice(0, 30),
                  unverifiedSkills: breakdown.unverifiedSkills.slice(0, 30),
                  roadmapSummary: summaryText,
                }
              : s
          )
        );
        setRoadmapItems((prev) => [
          ...prev.filter((r) => r.selectedJobId !== selectedJob.id),
          ...newRoadmapDocs,
        ]);
        setCourses((prev) => [
          ...prev.filter((c) => !(c.selectedJobId === selectedJob.id && c.status === 'not_started')),
          ...newCourseDocs,
        ]);
        setDailyTasks((prev) => [
          ...prev.filter((t) => !(t.selectedJobId === selectedJob.id && t.status === 'pending')),
          ...newTaskDocs,
        ]);
        if (newProjectDocs.length > 0) {
          setPracticalProjects((prev) => [...prev, ...newProjectDocs]);
        }
        toast.success(`Personalized learning roadmap generated for ${job.title}`);
        return;
      }

      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid, 'selected_jobs', selectedJob.id), {
        matchScore: breakdown.overallScore,
        matchedSkills: breakdown.matchedSkills.slice(0, 30),
        partialSkills: breakdown.partialSkills.slice(0, 30),
        missingSkills: breakdown.missingSkills.slice(0, 30),
        unverifiedSkills: breakdown.unverifiedSkills.slice(0, 30),
        roadmapSummary: summaryText,
        updatedAt: serverTimestamp(),
      });

      roadmapItems
        .filter((r) => r.selectedJobId === selectedJob.id)
        .forEach((r) => batch.delete(doc(db, 'users', user.uid, 'roadmap_items', r.id)));
      courses
        .filter((c) => c.selectedJobId === selectedJob.id && c.status === 'not_started')
        .forEach((c) => batch.delete(doc(db, 'users', user.uid, 'courses', c.id)));
      dailyTasks
        .filter((t) => t.selectedJobId === selectedJob.id && t.status === 'pending')
        .forEach((t) => batch.delete(doc(db, 'users', user.uid, 'daily_tasks', t.id)));

      newRoadmapDocs.forEach(({ id, ...rest }) => {
        batch.set(doc(db, 'users', user.uid, 'roadmap_items', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      newCourseDocs.forEach(({ id, ...rest }) => {
        batch.set(doc(db, 'users', user.uid, 'courses', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      newTaskDocs.forEach(({ id, ...rest }) => {
        batch.set(doc(db, 'users', user.uid, 'daily_tasks', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      newProjectDocs.forEach(({ id, ...rest }) => {
        batch.set(doc(db, 'users', user.uid, 'practical_projects', id), {
          ...rest,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      try {
        await batch.commit();
        toast.success(`Personalized learning roadmap generated for ${job.title}`);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/roadmap_items`);
      }
    },
    [user, profile, skills, matchingWeights, roadmapItems, courses, dailyTasks, practicalProjects, isLocalSession]
  );

  // Select target job
  const selectTargetJob = useCallback(
    async (job: JobListing): Promise<SelectedJob | null> => {
      if (!user) return null;
      const already = selectedJobs.find((s) => s.jobId === job.id);
      if (already) {
        toast.info(`${job.title} is already in My Selected Jobs`);
        return already;
      }

      const breakdown = calculateJobMatch(job, profile, skills, matchingWeights);
      const id = makeSafeId('sel');
      const payload = {
        userId: user.uid,
        jobId: job.id,
        jobTitle: sanitizeStr(job.title, 140),
        company: sanitizeStr(job.company, 100),
        location: sanitizeStr(job.location, 120),
        jobType: sanitizeStr(job.jobType, 40),
        workMode: sanitizeStr(job.workMode, 40),
        officialUrl: sanitizeStr(job.officialUrl, 400),
        matchScore: breakdown.overallScore,
        eligibilityPassed: breakdown.eligibilityPassed,
        matchedSkills: breakdown.matchedSkills.slice(0, 30),
        partialSkills: breakdown.partialSkills.slice(0, 30),
        missingSkills: breakdown.missingSkills.slice(0, 30),
        unverifiedSkills: breakdown.unverifiedSkills.slice(0, 30),
        learningProgress: 0,
        applicationStatus: 'Preparing',
        roadmapSummary: `Target role selected. ${breakdown.missingSkills.length} missing and ${breakdown.unverifiedSkills.length} unverified skills identified.`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const createdObj: SelectedJob = { id, ...payload };
      if (isLocalSession) {
        setSelectedJobs((prev) => [...prev, createdObj]);
        toast.success(`Selected ${job.title} (${job.company}). Generating personalized roadmap...`);
        await generatePlanForSelectedJob(createdObj, job);
        return createdObj;
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'selected_jobs', id), payload);
        toast.success(`Selected ${job.title} (${job.company}). Generating personalized roadmap...`);
        await generatePlanForSelectedJob(createdObj, job);
        return createdObj;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/selected_jobs/${id}`);
      }
    },
    [user, selectedJobs, profile, skills, matchingWeights, generatePlanForSelectedJob, isLocalSession]
  );

  const removeSelectedJob = useCallback(
    async (selectedJobId: string) => {
      if (!user) return;
      if (isLocalSession) {
        setSelectedJobs((prev) => prev.filter((s) => s.id !== selectedJobId));
        toast.success('Removed from My Selected Jobs');
        return;
      }
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'selected_jobs', selectedJobId));
        toast.success('Removed from My Selected Jobs');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/selected_jobs/${selectedJobId}`);
      }
    },
    [user, isLocalSession]
  );

  // Auto-sync Roadmap milestones & SelectedJob learning progress from actual learning activity
  const autoSyncLearningProgress = useCallback(
    async (overrides?: {
      updatedCourse?: { id: string; status: CourseStatus; progressPercent: number };
      updatedTask?: { id: string; status: DailyTask['status'] };
      updatedProject?: { id: string; status: PracticalProject['status'] };
      passedAssessmentSkill?: string;
    }) => {
      if (!user) return;
      const nextCourses = courses.map((c) =>
        overrides?.updatedCourse && c.id === overrides.updatedCourse.id
          ? { ...c, status: overrides.updatedCourse.status, progressPercent: overrides.updatedCourse.progressPercent }
          : c
      );
      const nextTasks = dailyTasks.map((t) =>
        overrides?.updatedTask && t.id === overrides.updatedTask.id
          ? { ...t, status: overrides.updatedTask.status }
          : t
      );
      const nextProjects = practicalProjects.map((p) =>
        overrides?.updatedProject && p.id === overrides.updatedProject.id
          ? { ...p, status: overrides.updatedProject.status }
          : p
      );

      const batch = isLocalSession ? null : writeBatch(db);
      let hasWrites = false;
      const localProgressUpdates = new Map<string, number>();

      // 1. Automatically derive each RoadmapItem's status from course progress, tasks, projects & assessments
      const nextRoadmap = roadmapItems.map((item) => {
        const skillKey = (item.targetSkill || '').trim().toLowerCase();
        if (!skillKey) return item;

        const skillCourses = nextCourses.filter(
          (c) => c.targetSkill.trim().toLowerCase() === skillKey
        );
        const skillTasks = nextTasks.filter(
          (t) => t.targetSkill.trim().toLowerCase() === skillKey
        );
        const skillProjects = nextProjects.filter((p) =>
          (p.targetSkills || []).some((s) => s.trim().toLowerCase() === skillKey)
        );
        const passedAssessment =
          (overrides?.passedAssessmentSkill &&
            overrides.passedAssessmentSkill.trim().toLowerCase() === skillKey) ||
          assessments.some(
            (a) => a.passed && a.targetSkill.trim().toLowerCase() === skillKey
          );

        const hasCompletedCourse = skillCourses.some(
          (c) =>
            c.progressPercent >= 100 ||
            c.status === 'completed' ||
            c.status === 'assessment_pending' ||
            c.status === 'verified'
        );
        const hasCompletedProject = skillProjects.some(
          (p) => p.status === 'reviewed' || p.status === 'submitted'
        );
        const allTasksDone =
          skillTasks.length > 0 && skillTasks.every((t) => t.status === 'completed');

        const anyCourseProgress = skillCourses.some(
          (c) => c.progressPercent > 0 || c.status === 'in_progress'
        );
        const anyTaskActivity = skillTasks.some(
          (t) => t.status === 'in_progress' || t.status === 'completed'
        );
        const anyProjectProgress = skillProjects.some((p) => p.status === 'in_progress');

        let derivedStatus: RoadmapItem['status'] = 'not_started';
        if (passedAssessment || hasCompletedCourse || hasCompletedProject || allTasksDone) {
          derivedStatus = 'completed';
        } else if (anyCourseProgress || anyTaskActivity || anyProjectProgress) {
          derivedStatus = 'in_progress';
        }

        if (derivedStatus !== item.status) {
          if (batch) {
            batch.update(doc(db, 'users', user.uid, 'roadmap_items', item.id), {
              status: derivedStatus,
              updatedAt: serverTimestamp(),
            });
          }
          hasWrites = true;
          return { ...item, status: derivedStatus };
        }
        return item;
      });

      // 2. Automatically recalculate SelectedJob learningProgress smoothly from courses + tasks + roadmap
      for (const sel of selectedJobs) {
        const relRoadmap = nextRoadmap.filter((r) => r.selectedJobId === sel.id);
        const relCourses = nextCourses.filter((c) => c.selectedJobId === sel.id);
        const relTasks = nextTasks.filter((t) => t.selectedJobId === sel.id);
        const totalItems = relRoadmap.length + relCourses.length + relTasks.length;
        if (totalItems === 0) continue;

        const weightedDone =
          relRoadmap.reduce(
            (sum, r) => sum + (r.status === 'completed' ? 1 : r.status === 'in_progress' ? 0.5 : 0),
            0
          ) +
          relCourses.reduce(
            (sum, c) =>
              sum +
              (c.status === 'completed' || c.status === 'verified' || c.status === 'assessment_pending'
                ? 1
                : clampNumber(c.progressPercent || 0, 0, 100) / 100),
            0
          ) +
          relTasks.reduce(
            (sum, t) => sum + (t.status === 'completed' ? 1 : t.status === 'in_progress' ? 0.5 : 0),
            0
          );

        const nextProg = clampNumber(Math.round((weightedDone / totalItems) * 100), 0, 100);
        if (nextProg !== sel.learningProgress) {
          if (batch) {
            batch.update(doc(db, 'users', user.uid, 'selected_jobs', sel.id), {
              learningProgress: nextProg,
              updatedAt: serverTimestamp(),
            });
          } else {
            localProgressUpdates.set(sel.id, nextProg);
          }
          hasWrites = true;
        }
      }

      if (isLocalSession) {
        if (hasWrites) {
          setRoadmapItems(nextRoadmap);
          if (localProgressUpdates.size > 0) {
            setSelectedJobs((prev) =>
              prev.map((s) =>
                localProgressUpdates.has(s.id)
                  ? { ...s, learningProgress: localProgressUpdates.get(s.id)! }
                  : s
              )
            );
          }
        }
        return;
      }

      if (hasWrites && batch) {
        try {
          await batch.commit();
        } catch (err) {
          console.warn('Auto learning progress sync skipped:', err);
        }
      }
    },
    [user, courses, dailyTasks, practicalProjects, roadmapItems, assessments, selectedJobs, isLocalSession]
  );

  // Learning updates
  const updateRoadmapItemStatus = useCallback(
    async (itemId: string, status: RoadmapItem['status']) => {
      if (!user) return;
      if (isLocalSession) {
        setRoadmapItems((prev) => prev.map((r) => (r.id === itemId ? { ...r, status } : r)));
        return;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid, 'roadmap_items', itemId), {
          status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/roadmap_items/${itemId}`);
      }
    },
    [user, isLocalSession]
  );

  const updateCourseRecord = useCallback(
    async (
      courseId: string,
      patch: { status: CourseStatus; progressPercent: number; certificateUrl?: string; evidenceNotes?: string }
    ) => {
      if (!user) return;
      const clampedProg = clampNumber(patch.progressPercent, 0, 100);
      const safeFields = {
        status: patch.status,
        progressPercent: clampedProg,
        certificateUrl: sanitizeStr(patch.certificateUrl || '', 400),
        evidenceNotes: sanitizeStr(patch.evidenceNotes || '', 800),
      };
      if (isLocalSession) {
        setCourses((prev) => prev.map((c) => (c.id === courseId ? { ...c, ...safeFields } : c)));
        await autoSyncLearningProgress({
          updatedCourse: { id: courseId, status: patch.status, progressPercent: clampedProg },
        });
        return;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid, 'courses', courseId), {
          ...safeFields,
          updatedAt: serverTimestamp(),
        });
        await autoSyncLearningProgress({
          updatedCourse: { id: courseId, status: patch.status, progressPercent: clampedProg },
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/courses/${courseId}`);
      }
    },
    [user, autoSyncLearningProgress, isLocalSession]
  );

  const updateDailyTask = useCallback(
    async (taskId: string, patch: { status: DailyTask['status']; evidenceNotes?: string; evidenceUrl?: string }) => {
      if (!user) return;
      const safeFields = {
        status: patch.status,
        evidenceNotes: sanitizeStr(patch.evidenceNotes || '', 800),
        evidenceUrl: sanitizeStr(patch.evidenceUrl || '', 400),
      };
      if (isLocalSession) {
        setDailyTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...safeFields } : t)));
        await autoSyncLearningProgress({
          updatedTask: { id: taskId, status: patch.status },
        });
        return;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid, 'daily_tasks', taskId), {
          ...safeFields,
          updatedAt: serverTimestamp(),
        });
        await autoSyncLearningProgress({
          updatedTask: { id: taskId, status: patch.status },
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/daily_tasks/${taskId}`);
      }
    },
    [user, autoSyncLearningProgress, isLocalSession]
  );

  const updatePracticalProject = useCallback(
    async (
      projectId: string,
      patch: {
        status: PracticalProject['status'];
        githubRepoUrl?: string;
        evidenceNotes?: string;
        aiReviewFeedback?: string;
        aiReviewScore?: number;
      }
    ) => {
      if (!user) return;
      const safeFields = {
        status: patch.status,
        githubRepoUrl: sanitizeStr(patch.githubRepoUrl || '', 400),
        evidenceNotes: sanitizeStr(patch.evidenceNotes || '', 1200),
        aiReviewFeedback: sanitizeStr(patch.aiReviewFeedback || '', 2000),
        aiReviewScore: clampNumber(patch.aiReviewScore ?? 0, 0, 100),
      };
      if (isLocalSession) {
        setPracticalProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, ...safeFields } : p))
        );
        await autoSyncLearningProgress({
          updatedProject: { id: projectId, status: patch.status },
        });
        return;
      }
      try {
        await updateDoc(doc(db, 'users', user.uid, 'practical_projects', projectId), {
          ...safeFields,
          updatedAt: serverTimestamp(),
        });
        await autoSyncLearningProgress({
          updatedProject: { id: projectId, status: patch.status },
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/practical_projects/${projectId}`);
      }
    },
    [user, autoSyncLearningProgress, isLocalSession]
  );

  const recordAssessmentResult = useCallback(
    async (payload: {
      selectedJobId: string;
      targetSkill: string;
      title: string;
      questionsCount: number;
      scorePercent: number;
      passed: boolean;
      explanationsSummary: string;
    }) => {
      if (!user) return;
      const id = makeSafeId('asm');
      const safeSelectedJobId =
        (payload.selectedJobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'general';
      const assessmentRecord: AssessmentAttempt = {
        id,
        userId: user.uid,
        selectedJobId: safeSelectedJobId,
        targetSkill: sanitizeStr(payload.targetSkill, 80) || 'Core Skill',
        title: sanitizeStr(payload.title, 180) || 'Skill Verification Assessment',
        questionsCount: clampNumber(payload.questionsCount, 1, 100),
        scorePercent: clampNumber(payload.scorePercent, 0, 100),
        passed: Boolean(payload.passed),
        explanationsSummary: sanitizeStr(payload.explanationsSummary, 1500),
        status: 'completed',
      };
      try {
        if (isLocalSession) {
          setAssessments((prev) => [...prev, assessmentRecord]);
        } else {
          const { id: _ignore, ...docData } = assessmentRecord;
          await setDoc(doc(db, 'users', user.uid, 'assessments', id), {
            ...docData,
            createdAt: serverTimestamp(),
          });
        }

        // If passed >= 70%, upgrade candidate skill to Assessment Verified & recalculate job match!
        if (payload.passed) {
          const proficiency = payload.scorePercent >= 85 ? 1.0 : 0.85;
          await upsertSkill({
            name: payload.targetSkill,
            category: 'Verified Competency',
            proficiencyLevel: proficiency,
            evidenceSource: 'assessment',
            verificationStatus: 'assessment_verified',
            evidenceNotes: `Verified via ${payload.title} (${payload.scorePercent}% score).`,
          });

          // Mark matching pending courses as verified
          const matchingCourses = courses.filter(
            (c) =>
              c.targetSkill.toLowerCase() === payload.targetSkill.toLowerCase() &&
              (c.status === 'completed' || c.status === 'assessment_pending')
          );
          for (const mc of matchingCourses) {
            await updateCourseRecord(mc.id, {
              status: 'verified',
              progressPercent: 100,
              certificateUrl: mc.certificateUrl,
              evidenceNotes: mc.evidenceNotes || `Verified by assessment (${payload.scorePercent}%).`,
            });
          }
          await autoSyncLearningProgress({ passedAssessmentSkill: payload.targetSkill });
          toast.success(`${payload.targetSkill} upgraded to Assessment Verified and job match recalculated`);
        } else {
          toast.info(`Assessment recorded (${payload.scorePercent}%). Score >= 70% to verify ${payload.targetSkill}.`);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/assessments/${id}`);
      }
    },
    [user, upsertSkill, courses, updateCourseRecord, autoSyncLearningProgress, isLocalSession]
  );

  // Applications CRUD
  const upsertApplication = useCallback(
    async (input: {
      id?: string;
      jobId: string;
      jobTitle: string;
      company: string;
      location?: string;
      officialUrl: string;
      status: ApplicationStatus;
      dateApplied?: string;
      deadline?: string;
      interviewDate?: string;
      nextAction?: string;
      notes?: string;
    }) => {
      if (!user) return;
      const existing = input.id ? applications.find((a) => a.id === input.id) : undefined;
      const appId = existing?.id || makeSafeId('app');

      if (isLocalSession) {
        const safeJobId =
          (input.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || makeSafeId('extjob');
        const nextApp: JobApplication = {
          id: appId,
          userId: user.uid,
          jobId: existing?.jobId || safeJobId,
          jobTitle: sanitizeStr(input.jobTitle, 140) || existing?.jobTitle || 'Target Role',
          company: sanitizeStr(input.company, 100) || existing?.company || 'Target Company',
          location: sanitizeStr(input.location || existing?.location || '', 120),
          officialUrl: sanitizeStr(input.officialUrl || 'https://example.com', 400),
          status: input.status,
          dateApplied: sanitizeStr(input.dateApplied || '', 40),
          deadline: sanitizeStr(input.deadline || '', 40),
          interviewDate: sanitizeStr(input.interviewDate || '', 40),
          nextAction: sanitizeStr(input.nextAction || '', 240),
          notes: sanitizeStr(input.notes || '', 2000),
        };
        setApplications((prev) =>
          existing ? prev.map((a) => (a.id === appId ? nextApp : a)) : [...prev, nextApp]
        );
        const linkedSel = selectedJobs.find((s) => s.jobId === input.jobId);
        if (linkedSel) {
          setSelectedJobs((prev) =>
            prev.map((s) => (s.id === linkedSel.id ? { ...s, applicationStatus: input.status } : s))
          );
        }
        return;
      }

      const ref = doc(db, 'users', user.uid, 'applications', appId);
      try {
        if (existing) {
          await updateDoc(ref, {
            status: input.status,
            dateApplied: sanitizeStr(input.dateApplied || '', 40),
            deadline: sanitizeStr(input.deadline || '', 40),
            interviewDate: sanitizeStr(input.interviewDate || '', 40),
            nextAction: sanitizeStr(input.nextAction || '', 240),
            notes: sanitizeStr(input.notes || '', 2000),
            officialUrl: sanitizeStr(input.officialUrl || '', 400),
            updatedAt: serverTimestamp(),
          });
        } else {
          const safeJobId =
            (input.jobId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || makeSafeId('extjob');
          await setDoc(ref, {
            userId: user.uid,
            jobId: safeJobId,
            jobTitle: sanitizeStr(input.jobTitle, 140) || 'Target Role',
            company: sanitizeStr(input.company, 100) || 'Target Company',
            location: sanitizeStr(input.location || '', 120),
            officialUrl: sanitizeStr(input.officialUrl || 'https://example.com', 400),
            status: input.status,
            dateApplied: sanitizeStr(input.dateApplied || '', 40),
            deadline: sanitizeStr(input.deadline || '', 40),
            interviewDate: sanitizeStr(input.interviewDate || '', 40),
            nextAction: sanitizeStr(input.nextAction || '', 240),
            notes: sanitizeStr(input.notes || '', 2000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        // Sync selectedJob applicationStatus if linked
        const linkedSel = selectedJobs.find((s) => s.jobId === input.jobId);
        if (linkedSel) {
          await updateDoc(doc(db, 'users', user.uid, 'selected_jobs', linkedSel.id), {
            applicationStatus: input.status,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `users/${user.uid}/applications/${appId}`);
      }
    },
    [user, applications, selectedJobs, isLocalSession]
  );

  const deleteApplication = useCallback(
    async (applicationId: string) => {
      if (!user) return;
      if (isLocalSession) {
        setApplications((prev) => prev.filter((a) => a.id !== applicationId));
        toast.success('Application removed');
        return;
      }
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'applications', applicationId));
        toast.success('Application removed');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/applications/${applicationId}`);
      }
    },
    [user, isLocalSession]
  );

  // Build live student context for the Central Orchestrator
  const buildAssistantContext = useCallback(() => {
    return {
      profile: profile
        ? {
            name: profile.displayName,
            degree: profile.degree,
            department: profile.department,
            college: profile.college,
            graduationYear: profile.graduationYear,
            cgpa: profile.cgpa,
            location: profile.location,
            careerObjective: profile.careerObjective,
            profileCompleteness: profile.profileCompleteness,
            githubUsername: profile.githubUsername,
            githubTopLanguages: profile.githubAnalysis?.topLanguages || [],
            preferredCompanies: profile.preferences?.preferredCompanies || [],
            preferredRoles: profile.preferences?.preferredRoles || [],
            dailyLearningMinutes: profile.preferences?.dailyLearningMinutes || 60,
          }
        : null,
      skills: skills.map((s) => ({
        name: s.name,
        category: s.category,
        proficiency: s.proficiencyLevel,
        source: s.evidenceSource,
        verification: s.verificationStatus,
      })),
      selectedJobs: selectedJobs.map((sj) => ({
        title: sj.jobTitle,
        company: sj.company,
        matchScore: sj.matchScore,
        missingSkills: sj.missingSkills,
        partialSkills: sj.partialSkills,
        unverifiedSkills: sj.unverifiedSkills,
        learningProgress: sj.learningProgress,
        applicationStatus: sj.applicationStatus,
      })),
      recommendedJobsSample: jobs.slice(0, 6).map((j) => ({
        title: j.title,
        company: j.company,
        location: j.location,
        type: j.jobType,
        matchScore: calculateJobMatch(j, profile, skills, matchingWeights).overallScore,
        isSampleListing: j.isSampleListing,
      })),
      courses: courses.map((c) => ({
        title: c.title,
        provider: c.provider,
        targetSkill: c.targetSkill,
        status: c.status,
        progressPercent: c.progressPercent,
      })),
      dailyTasks: dailyTasks.map((t) => ({
        title: t.title,
        targetSkill: t.targetSkill,
        status: t.status,
        estimatedMinutes: t.estimatedMinutes,
      })),
      practicalProjects: practicalProjects.map((p) => ({
        title: p.title,
        status: p.status,
        aiReviewScore: p.aiReviewScore,
      })),
      assessments: assessments.map((a) => ({
        skill: a.targetSkill,
        scorePercent: a.scorePercent,
        passed: a.passed,
      })),
      applications: applications.map((a) => ({
        company: a.company,
        jobTitle: a.jobTitle,
        status: a.status,
        deadline: a.deadline,
      })),
    };
  }, [profile, skills, selectedJobs, jobs, matchingWeights, courses, dailyTasks, practicalProjects, assessments, applications]);

  const createConversation = useCallback(
    async (title = 'New career session'): Promise<string> => {
      if (!user) throw new Error('Not signed in');
      const id = makeSafeId('conv');
      const safeTitle = sanitizeStr(title, 140) || 'New career session';
      if (isLocalSession) {
        const nextConv: Conversation = {
          id,
          userId: user.uid,
          title: safeTitle,
          lastMessagePreview: '',
          activeAgent: 'Central Orchestrator',
          messageCount: 0,
        };
        setConversations((prev) => [nextConv, ...prev]);
        setLocalMessagesByConv((prev) => ({ ...prev, [id]: [] }));
        return id;
      }
      try {
        await setDoc(doc(db, 'users', user.uid, 'conversations', id), {
          userId: user.uid,
          title: safeTitle,
          lastMessagePreview: '',
          activeAgent: 'Central Orchestrator',
          messageCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/conversations/${id}`);
      }
    },
    [user, isLocalSession]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      if (isLocalSession) {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        setLocalMessagesByConv((prev) => {
          const copy = { ...prev };
          delete copy[conversationId];
          return copy;
        });
        toast.success('Conversation deleted');
        return;
      }
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'conversations', conversationId));
        toast.success('Conversation deleted');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/conversations/${conversationId}`);
      }
    },
    [user, isLocalSession]
  );

  const askAssistant = useCallback(
    async (conversationId: string, message: string, history: ChatMessage[], language?: string) => {
      if (!user) throw new Error('Not signed in');
      const cleanMessage = sanitizeStr(message, 4000);
      if (!cleanMessage) throw new Error('Please enter a message before sending.');
      const userMsgId = makeSafeId('msg');

      if (isLocalSession) {
        const userMsg: ChatMessage = {
          id: userMsgId,
          userId: user.uid,
          conversationId,
          role: 'user',
          content: cleanMessage,
          createdAt: { seconds: Math.floor(Date.now() / 1000) },
        };
        setLocalMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []), userMsg],
        }));

        const cleanHistory = history
          .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
          .map((m) => ({ role: m.role, content: m.content }));

        let res: Awaited<ReturnType<typeof sendAssistantMessage>>;
        try {
          res = await sendAssistantMessage({
            message: cleanMessage,
            history: cleanHistory,
            userContext: buildAssistantContext(),
            language: language && language !== 'Auto-Detect' ? language : undefined,
          });
        } catch (err) {
          setLocalMessagesByConv((prev) => ({
            ...prev,
            [conversationId]: (prev[conversationId] || []).filter((m) => m.id !== userMsgId),
          }));
          throw err;
        }

        const assistantMsgId = makeSafeId('msg');
        const safeReply =
          sanitizeStr(res.reply, 8000) ||
          'I could not generate a detailed reply right now. Please try rephrasing your question.';
        const safeAgent = sanitizeStr(res.agentUsed, 80) || 'Central Orchestrator';
        const convTitle =
          history.length === 0 ? sanitizeStr(cleanMessage.slice(0, 64), 140) : undefined;

        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          userId: user.uid,
          conversationId,
          role: 'assistant',
          content: safeReply,
          agentUsed: safeAgent,
          createdAt: { seconds: Math.floor(Date.now() / 1000) + 1 },
        };
        setLocalMessagesByConv((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] || []), assistantMsg],
        }));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  title: convTitle || c.title,
                  lastMessagePreview: sanitizeStr(safeReply, 220),
                  activeAgent: safeAgent,
                  messageCount: clampNumber(history.length + 2, 0, 5000),
                }
              : c
          )
        );
        return { ...res, reply: safeReply, agentUsed: safeAgent };
      }

      try {
        await setDoc(doc(db, 'users', user.uid, 'conversations', conversationId, 'messages', userMsgId), {
          userId: user.uid,
          conversationId,
          role: 'user',
          content: cleanMessage,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/conversations/${conversationId}/messages/${userMsgId}`);
      }

      const cleanHistory = history
        .filter((m) => typeof m.content === 'string' && m.content.trim().length > 0)
        .map((m) => ({ role: m.role, content: m.content }));

      let res: Awaited<ReturnType<typeof sendAssistantMessage>>;
      try {
        res = await sendAssistantMessage({
          message: cleanMessage,
          history: cleanHistory,
          userContext: buildAssistantContext(),
          language: language && language !== 'Auto-Detect' ? language : undefined,
        });
      } catch (err) {
        // Roll back the orphaned user message so failed turns never leave consecutive user turns
        try {
          await deleteDoc(
            doc(db, 'users', user.uid, 'conversations', conversationId, 'messages', userMsgId)
          );
        } catch {
          // Ignore rollback cleanup failure
        }
        throw err;
      }

      const assistantMsgId = makeSafeId('msg');
      const safeReply =
        sanitizeStr(res.reply, 8000) ||
        'I could not generate a detailed reply right now. Please try rephrasing your question.';
      const safeAgent = sanitizeStr(res.agentUsed, 80) || 'Central Orchestrator';
      const convTitle =
        history.length === 0 ? sanitizeStr(cleanMessage.slice(0, 64), 140) : undefined;

      try {
        await setDoc(doc(db, 'users', user.uid, 'conversations', conversationId, 'messages', assistantMsgId), {
          userId: user.uid,
          conversationId,
          role: 'assistant',
          content: safeReply,
          agentUsed: safeAgent,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/conversations/${conversationId}/messages/${assistantMsgId}`);
      }

      try {
        const convUpdate: Record<string, unknown> = {
          lastMessagePreview: sanitizeStr(safeReply, 220),
          activeAgent: safeAgent,
          messageCount: clampNumber(history.length + 2, 0, 5000),
          updatedAt: serverTimestamp(),
        };
        if (convTitle) {
          convUpdate.title = convTitle;
        }
        await updateDoc(doc(db, 'users', user.uid, 'conversations', conversationId), convUpdate);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/conversations/${conversationId}`);
      }

      return { ...res, reply: safeReply, agentUsed: safeAgent };
    },
    [user, buildAssistantContext, isLocalSession]
  );

  // Admin actions
  const saveMatchingWeights = useCallback(
    async (weights: MatchingWeights) => {
      if (!user || !isAdmin) throw new Error('Admin privileges required.');
      const ref = doc(db, 'admin_settings', 'matching_weights');
      try {
        await setDoc(ref, {
          technicalSkillsWeight: clampNumber(weights.technicalSkillsWeight, 0, 100),
          projectRelevanceWeight: clampNumber(weights.projectRelevanceWeight, 0, 100),
          educationWeight: clampNumber(weights.educationWeight, 0, 100),
          experienceWeight: clampNumber(weights.experienceWeight, 0, 100),
          certificationsWeight: clampNumber(weights.certificationsWeight, 0, 100),
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
        toast.success('Matching algorithm weights saved');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'admin_settings/matching_weights');
      }
    },
    [user, isAdmin]
  );

  const publishAdminJob = useCallback(
    async (job: Omit<JobListing, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!user || !isAdmin) throw new Error('Admin privileges required.');
      const id = makeSafeId('job');
      try {
        await setDoc(doc(db, 'jobs', id), {
          ...job,
          title: sanitizeStr(job.title, 140),
          company: sanitizeStr(job.company, 100),
          location: sanitizeStr(job.location, 120),
          description: sanitizeStr(job.description, 4000),
          officialUrl: sanitizeStr(job.officialUrl, 400),
          source: sanitizeStr(job.source, 120),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success(`Published ${job.title} to job catalog`);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `jobs/${id}`);
      }
    },
    [user, isAdmin]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        isAdmin,
        isLocalSession,
        localMessagesByConv,
        profile,
        skills,
        jobs,
        selectedJobs,
        roadmapItems,
        courses,
        dailyTasks,
        practicalProjects,
        assessments,
        applications,
        conversations,
        matchingWeights,
        savedJobIds,
        toggleSavedJob,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        signInAsDemoPersona,
        resetPassword,
        resendVerificationEmail,
        refreshUserAuth,
        signOut,
        updateProfileFields,
        upsertSkill,
        deleteSkill,
        selectTargetJob,
        removeSelectedJob,
        generatePlanForSelectedJob,
        recalculateSelectedJobs,
        updateRoadmapItemStatus,
        updateCourseRecord,
        updateDailyTask,
        updatePracticalProject,
        recordAssessmentResult,
        upsertApplication,
        deleteApplication,
        createConversation,
        deleteConversation,
        askAssistant,
        saveMatchingWeights,
        publishAdminJob,
        buildAssistantContext,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
