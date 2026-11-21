import { CURATED_SAMPLE_JOBS } from './curatedJobs';
import { findCatalogCourseForSkill } from './courseCatalog';
import { calculateJobMatch } from '../utils/matchingEngine';
import {
  AssessmentAttempt,
  CandidateSkill,
  ChatMessage,
  Conversation,
  CourseRecord,
  DailyTask,
  DEFAULT_MATCHING_WEIGHTS,
  JobApplication,
  PracticalProject,
  RoadmapItem,
  SelectedJob,
  UserProfile,
} from '../types';

export interface DemoWorkspaceSnapshot {
  profile: UserProfile;
  skills: CandidateSkill[];
  selectedJobs: SelectedJob[];
  roadmapItems: RoadmapItem[];
  courses: CourseRecord[];
  dailyTasks: DailyTask[];
  practicalProjects: PracticalProject[];
  assessments: AssessmentAttempt[];
  applications: JobApplication[];
  conversations: Conversation[];
  demoMessages: Record<string, ChatMessage[]>;
}

export function createInitialDemoWorkspace(uid: string): DemoWorkspaceSnapshot {
  const now = { seconds: Math.floor(Date.now() / 1000) };

  const profile: UserProfile = {
    uid,
    email: 'demo@users.chokma.app',
    displayName: 'Demo Student',
    phone: '',
    college: 'National Institute of Engineering',
    university: 'Visvesvaraya Technological University',
    degree: 'B.Tech',
    department: 'Computer Science & Engineering',
    graduationYear: '2026',
    cgpa: '8.6',
    currentAcademicYear: 'Final Year',
    location: 'Bengaluru, India',
    careerObjective:
      'Transition into a Cloud Engineering or Software Development role backed by verified hands-on labs, real portfolio projects, and structured skill assessments.',
    role: 'student',
    portfolioUrl: '',
    linkedinUrl: '',
    githubUsername: '',
    credlyUrl: '',
    leetcodeUrl: '',
    hackerrankUrl: '',
    preferences: {
      preferredCompanies: ['Amazon', 'Google', 'Microsoft', 'IBM', 'Deloitte'],
      preferredRoles: ['Cloud Support Associate', 'Software Engineer', 'DevOps Engineer'],
      preferredLocations: ['Bengaluru', 'Hyderabad', 'Remote'],
      preferredCountries: ['India'],
      jobType: 'Both',
      workMode: 'Any',
      minSalary: '',
      experienceLevel: '0–1 Years (Freshers)',
      preferredIndustries: ['Cloud Computing', 'Software Engineering'],
      dailyLearningMinutes: 60,
    },
    education: [
      {
        id: 'demo-edu-1',
        institution: 'National Institute of Engineering',
        degree: 'B.Tech',
        field: 'Computer Science & Engineering',
        startYear: '2022',
        endYear: '2026',
        grade: '8.6 CGPA',
      },
    ],
    experience: [
      {
        id: 'demo-exp-1',
        role: 'Cloud & Backend Intern',
        organization: 'Campus Innovation Lab',
        duration: 'May 2025 – Jul 2025',
        description:
          'Built REST APIs with Python & FastAPI, containerized services with Docker, and automated Linux health checks.',
      },
    ],
    projects: [
      {
        id: 'demo-proj-1',
        title: 'Cloud Cost & Health Telemetry Dashboard',
        description:
          'Real-time monitoring dashboard tracking service uptime, Linux container metrics, and automated alerts.',
        technologies: ['Python', 'Docker', 'Linux', 'SQL'],
      },
    ],
    certifications: [
      {
        id: 'demo-cert-1',
        name: 'AWS Cloud Practitioner Essentials',
        issuer: 'AWS Skill Builder',
        issueDate: '2025',
      },
    ],
    resumes: [],
    profileCompleteness: 78,
    createdAt: now,
    updatedAt: now,
  };

  const skills: CandidateSkill[] = [
    {
      id: 'demo-sk-1',
      userId: uid,
      name: 'Linux',
      category: 'Operating Systems',
      proficiencyLevel: 0.9,
      evidenceSource: 'assessment',
      verificationStatus: 'assessment_verified',
      evidenceNotes: 'Verified via Linux Fundamentals Assessment (85% score).',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-sk-2',
      userId: uid,
      name: 'Python',
      category: 'Programming',
      proficiencyLevel: 0.85,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Used across backend API and automation projects.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-sk-3',
      userId: uid,
      name: 'SQL',
      category: 'Databases',
      proficiencyLevel: 0.75,
      evidenceSource: 'resume',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Relational modeling and query optimization.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-sk-4',
      userId: uid,
      name: 'Git',
      category: 'DevOps',
      proficiencyLevel: 0.8,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Branching workflows and pull request reviews.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-sk-5',
      userId: uid,
      name: 'AWS Fundamentals',
      category: 'Cloud',
      proficiencyLevel: 0.55,
      evidenceSource: 'course',
      verificationStatus: 'claimed',
      evidenceNotes: 'In progress through AWS Skill Builder.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-sk-6',
      userId: uid,
      name: 'Docker',
      category: 'DevOps',
      proficiencyLevel: 0.65,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Containerized local backend microservices.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const primaryJob = CURATED_SAMPLE_JOBS[0];
  const breakdown = calculateJobMatch(primaryJob, profile, skills, DEFAULT_MATCHING_WEIGHTS);
  const selectedJobId = 'demo-sel-1';

  const selectedJobs: SelectedJob[] = [
    {
      id: selectedJobId,
      userId: uid,
      jobId: primaryJob.id,
      jobTitle: primaryJob.title,
      company: primaryJob.company,
      location: primaryJob.location,
      jobType: primaryJob.jobType,
      workMode: primaryJob.workMode,
      officialUrl: primaryJob.officialUrl,
      matchScore: breakdown.overallScore,
      eligibilityPassed: breakdown.eligibilityPassed,
      matchedSkills: breakdown.matchedSkills.slice(0, 30),
      partialSkills: breakdown.partialSkills.slice(0, 30),
      missingSkills: breakdown.missingSkills.slice(0, 30),
      unverifiedSkills: breakdown.unverifiedSkills.slice(0, 30),
      learningProgress: 42,
      applicationStatus: 'Preparing',
      roadmapSummary: `Targeted cloud readiness plan for ${primaryJob.title} at ${primaryJob.company}, focusing on AWS Fundamentals, TCP/IP Networking, and IAM security diagnostics.`,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const roadmapItems: RoadmapItem[] = [
    {
      id: 'demo-rm-1',
      userId: uid,
      selectedJobId,
      title: 'Master Linux Diagnostics & Shell Troubleshooting',
      skillCategory: 'Operating Systems',
      targetSkill: 'Linux',
      priority: 'high',
      durationHours: 6,
      phaseOrder: 1,
      status: 'completed',
      description: 'Verify system process monitoring, systemd logs, disk/memory diagnostics, and file permissions.',
      expectedOutcome: 'Score >= 70% on Linux verification assessment.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-rm-2',
      userId: uid,
      selectedJobId,
      title: 'Build Core AWS Architecture & IAM Fluency',
      skillCategory: 'Cloud',
      targetSkill: 'AWS Fundamentals',
      priority: 'high',
      durationHours: 8,
      phaseOrder: 2,
      status: 'in_progress',
      description: 'Practice EC2, S3, VPC subnets, security groups, and least-privilege IAM policies.',
      expectedOutcome: 'Complete AWS Cloud Practitioner Essentials and pass skill check.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-rm-3',
      userId: uid,
      selectedJobId,
      title: 'Troubleshoot TCP/IP, DNS & HTTP Routing',
      skillCategory: 'Networking',
      targetSkill: 'TCP/IP',
      priority: 'high',
      durationHours: 8,
      phaseOrder: 3,
      status: 'not_started',
      description: 'Diagnose packet flow, DNS resolution, TLS handshakes, and firewall rules using dig, curl, and ss.',
      expectedOutcome: 'Document 3 real network troubleshooting runbooks.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-rm-4',
      userId: uid,
      selectedJobId,
      title: 'Automate Incident Diagnostics with Python',
      skillCategory: 'Scripting',
      targetSkill: 'Python',
      priority: 'medium',
      durationHours: 6,
      phaseOrder: 4,
      status: 'not_started',
      description: 'Write reusable CLI scripts to parse server logs and flag endpoint latency spikes.',
      expectedOutcome: 'Publish automated log analyzer script to GitHub.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const awsCourse = findCatalogCourseForSkill('AWS Fundamentals');
  const netCourse = findCatalogCourseForSkill('TCP/IP');
  const linuxCourse = findCatalogCourseForSkill('Linux');

  const courses: CourseRecord[] = [
    {
      id: 'demo-crs-1',
      userId: uid,
      selectedJobId,
      title: linuxCourse.title,
      provider: linuxCourse.provider,
      officialUrl: linuxCourse.officialUrl,
      targetSkill: 'Linux',
      difficulty: linuxCourse.difficulty,
      durationLabel: linuxCourse.durationLabel,
      pricingType: linuxCourse.pricingType,
      status: 'verified',
      progressPercent: 100,
      certificateUrl: '',
      evidenceNotes: 'Completed all labs and verified via Linux assessment.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-crs-2',
      userId: uid,
      selectedJobId,
      title: awsCourse.title,
      provider: awsCourse.provider,
      officialUrl: awsCourse.officialUrl,
      targetSkill: 'AWS Fundamentals',
      difficulty: awsCourse.difficulty,
      durationLabel: awsCourse.durationLabel,
      pricingType: awsCourse.pricingType,
      status: 'in_progress',
      progressPercent: 60,
      certificateUrl: '',
      evidenceNotes: 'Finished EC2, S3, and IAM core modules.',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-crs-3',
      userId: uid,
      selectedJobId,
      title: netCourse.title,
      provider: netCourse.provider,
      officialUrl: netCourse.officialUrl,
      targetSkill: 'TCP/IP',
      difficulty: netCourse.difficulty,
      durationLabel: netCourse.durationLabel,
      pricingType: netCourse.pricingType,
      status: 'not_started',
      progressPercent: 0,
      certificateUrl: '',
      evidenceNotes: '',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const dailyTasks: DailyTask[] = [
    {
      id: 'demo-tsk-1',
      userId: uid,
      selectedJobId,
      title: 'Inspect Linux Systemd Logs & Port Listeners',
      description: 'Practice diagnosing unresponsive services with journalctl, ps, and ss.',
      targetSkill: 'Linux',
      estimatedMinutes: 30,
      priority: 'high',
      instructions: '1. Run journalctl -u nginx -n 20.\n2. Inspect open ports with ss -tulnp.\n3. Document root-cause checks.',
      resourceUrl: linuxCourse.officialUrl,
      status: 'completed',
      evidenceNotes: 'Completed diagnostic walkthrough and documented CLI outputs.',
      evidenceUrl: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-tsk-2',
      userId: uid,
      selectedJobId,
      title: 'Configure Least-Privilege AWS IAM Policy Lab',
      description: 'Draft and validate a scoped IAM policy restricting S3 bucket access to a single prefix.',
      targetSkill: 'AWS Fundamentals',
      estimatedMinutes: 45,
      priority: 'high',
      instructions: '1. Review AWS IAM policy JSON syntax.\n2. Scope Action and Resource ARNs.\n3. Verify deny precedence rules.',
      resourceUrl: awsCourse.officialUrl,
      status: 'in_progress',
      evidenceNotes: 'Drafted read-only S3 policy JSON; testing condition keys next.',
      evidenceUrl: '',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-tsk-3',
      userId: uid,
      selectedJobId,
      title: 'Trace DNS & TLS Handshake Latency with dig and curl',
      description: 'Measure DNS lookup and TLS handshake timing across public endpoints.',
      targetSkill: 'TCP/IP',
      estimatedMinutes: 35,
      priority: 'medium',
      instructions: '1. Run dig +trace example.com.\n2. Measure timings using curl -w.\n3. Summarize findings.',
      resourceUrl: netCourse.officialUrl,
      status: 'pending',
      evidenceNotes: '',
      evidenceUrl: '',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const practicalProjects: PracticalProject[] = [
    {
      id: 'demo-prj-1',
      userId: uid,
      selectedJobId,
      title: 'Cloud Support Incident Troubleshooting Runbook & VPC Lab',
      description:
        'Design a documented cloud troubleshooting runbook covering EC2 connectivity, IAM access denied errors, and DNS resolution failures.',
      targetSkills: ['AWS Fundamentals', 'Linux', 'TCP/IP'],
      requirements: [
        'Document least-privilege IAM role setup and policy verification',
        'Include reproducible network diagnostic commands for VPC & DNS issues',
        'Provide 2 simulated outage scenarios with root-cause fixes',
      ],
      instructions:
        '1. Create a structured README with architecture diagram.\n2. Document diagnostic commands and expected outputs.\n3. Submit your repository URL or notes for AI Mentor review.',
      status: 'in_progress',
      githubRepoUrl: '',
      evidenceNotes: 'Completed VPC security group checklist and Linux diagnostic steps.',
      aiReviewFeedback: '',
      aiReviewScore: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const assessments: AssessmentAttempt[] = [
    {
      id: 'demo-asm-1',
      userId: uid,
      selectedJobId,
      targetSkill: 'Linux',
      title: 'Linux Systems & Troubleshooting Verification',
      questionsCount: 5,
      scorePercent: 85,
      passed: true,
      explanationsSummary: 'Strong command of process diagnostics, permissions, and systemd log inspection.',
      status: 'completed',
      createdAt: now,
    },
  ];

  const applications: JobApplication[] = [
    {
      id: 'demo-app-1',
      userId: uid,
      jobId: primaryJob.id,
      jobTitle: primaryJob.title,
      company: primaryJob.company,
      location: primaryJob.location,
      officialUrl: primaryJob.officialUrl,
      status: 'Preparing',
      dateApplied: '',
      deadline: '2026-12-15',
      interviewDate: '',
      nextAction: 'Finish AWS Fundamentals course & TCP/IP assessment before submitting.',
      notes: 'Demo sandbox application entry — edit, update status, or add new roles to test.',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const convId = 'demo-conv-1';
  const conversations: Conversation[] = [
    {
      id: convId,
      userId: uid,
      title: 'Welcome to Chokma Demo Mode',
      lastMessagePreview:
        'Hi Demo Student! Ask me anything about your job match, 3D roadmap, or interview prep.',
      activeAgent: 'Central Orchestrator',
      messageCount: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const demoMessages: Record<string, ChatMessage[]> = {
    [convId]: [
      {
        id: 'demo-msg-1',
        userId: uid,
        conversationId: convId,
        role: 'assistant',
        content:
          'Welcome to **Chokma Demo Mode**! I have your sample Cloud Support Associate target role, 6 skills, roadmap milestones, and active courses loaded.\n\nTry asking me:\n- *"What skills should I focus on first for Amazon Cloud Support Associate?"*\n- *"Quiz me on TCP/IP networking for an interview."*\n- *"How can I improve my match score this week?"*',
        agentUsed: 'Central Orchestrator',
        createdAt: now,
      },
    ],
  };

  return {
    profile,
    skills,
    selectedJobs,
    roadmapItems,
    courses,
    dailyTasks,
    practicalProjects,
    assessments,
    applications,
    conversations,
    demoMessages,
  };
}
