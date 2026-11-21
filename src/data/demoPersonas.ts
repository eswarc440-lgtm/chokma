import {
  CandidateSkill,
  CourseRecord,
  DailyTask,
  JobApplication,
  PracticalProject,
  RoadmapItem,
  SelectedJob,
  UserProfile,
} from '../types';
import { CURATED_SAMPLE_JOBS } from './curatedJobs';
import { findCatalogCourseForSkill } from './courseCatalog';
import { calculateJobMatch, calculateProfileCompleteness } from '../utils/matchingEngine';
import { DEFAULT_MATCHING_WEIGHTS } from '../types';

export type DemoPersonaId = 'cloud' | 'fullstack' | 'data';

export interface DemoPersonaInfo {
  id: DemoPersonaId;
  displayName: string;
  username: string;
  roleLabel: string;
  summary: string;
  degree: string;
  department: string;
  college: string;
  location: string;
  targetJobId: string;
}

export const DEMO_PERSONAS: DemoPersonaInfo[] = [
  {
    id: 'cloud',
    displayName: 'Alex Rivera',
    username: 'alex_cloud',
    roleLabel: 'Cloud & DevOps',
    summary: 'AWS, Linux, Docker, IAM — targeting Cloud Support Associate',
    degree: 'B.Tech',
    department: 'Computer Science & Engineering',
    college: 'National Institute of Technology',
    location: 'Bengaluru, India',
    targetJobId: CURATED_SAMPLE_JOBS[0]?.id || 'sample_amazon_csa',
  },
  {
    id: 'fullstack',
    displayName: 'Priya Nair',
    username: 'priya_fullstack',
    roleLabel: 'Full-Stack Engineer',
    summary: 'React, TypeScript, Node.js, SQL — targeting Software Engineer',
    degree: 'B.E.',
    department: 'Information Technology',
    college: 'PES University',
    location: 'Hyderabad, India',
    targetJobId: CURATED_SAMPLE_JOBS[1]?.id || CURATED_SAMPLE_JOBS[0]?.id || 'sample_job_2',
  },
  {
    id: 'data',
    displayName: 'Rohan Verma',
    username: 'rohan_data',
    roleLabel: 'Data & AI Track',
    summary: 'Python, SQL, Machine Learning — targeting Data & Cloud Analyst',
    degree: 'B.Tech',
    department: 'Data Science & AI',
    college: 'VIT Vellore',
    location: 'Pune, India',
    targetJobId: CURATED_SAMPLE_JOBS[2]?.id || CURATED_SAMPLE_JOBS[0]?.id || 'sample_job_3',
  },
];

export interface DemoWorkspaceSeed {
  profile: UserProfile;
  skills: CandidateSkill[];
  selectedJobs: SelectedJob[];
  roadmapItems: RoadmapItem[];
  courses: CourseRecord[];
  dailyTasks: DailyTask[];
  practicalProjects: PracticalProject[];
  applications: JobApplication[];
}

const PERSONA_SKILLS: Record<
  DemoPersonaId,
  Array<{
    name: string;
    category: string;
    proficiencyLevel: number;
    evidenceSource: CandidateSkill['evidenceSource'];
    verificationStatus: CandidateSkill['verificationStatus'];
    evidenceNotes: string;
  }>
> = {
  cloud: [
    {
      name: 'Linux',
      category: 'Operating Systems',
      proficiencyLevel: 0.85,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Built automated systemd diagnostics and shell troubleshooting scripts.',
    },
    {
      name: 'AWS Fundamentals',
      category: 'Cloud',
      proficiencyLevel: 0.78,
      evidenceSource: 'course',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Deployed VPC, EC2, IAM roles, and S3 static hosting in sandbox.',
    },
    {
      name: 'Networking',
      category: 'Infrastructure',
      proficiencyLevel: 0.72,
      evidenceSource: 'assessment',
      verificationStatus: 'assessment_verified',
      evidenceNotes: 'Verified TCP/IP, DNS, HTTP/TLS troubleshooting concepts.',
    },
    {
      name: 'Python',
      category: 'Programming',
      proficiencyLevel: 0.8,
      evidenceSource: 'github',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Automation scripts and log parsers published on GitHub.',
    },
    {
      name: 'Docker',
      category: 'DevOps',
      proficiencyLevel: 0.55,
      evidenceSource: 'claimed',
      verificationStatus: 'claimed',
      evidenceNotes: 'Containerized local web apps with Docker Compose.',
    },
  ],
  fullstack: [
    {
      name: 'React',
      category: 'Frontend',
      proficiencyLevel: 0.88,
      evidenceSource: 'github',
      verificationStatus: 'assessment_verified',
      evidenceNotes: 'Built responsive TypeScript SPAs with hooks and routing.',
    },
    {
      name: 'TypeScript',
      category: 'Programming',
      proficiencyLevel: 0.84,
      evidenceSource: 'github',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Strict typed frontend and REST API codebases.',
    },
    {
      name: 'Node.js',
      category: 'Backend',
      proficiencyLevel: 0.76,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Express APIs with authentication and structured validation.',
    },
    {
      name: 'SQL',
      category: 'Databases',
      proficiencyLevel: 0.72,
      evidenceSource: 'course',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Relational schema design, indexing, and joins.',
    },
    {
      name: 'System Design',
      category: 'Architecture',
      proficiencyLevel: 0.52,
      evidenceSource: 'claimed',
      verificationStatus: 'claimed',
      evidenceNotes: 'Studying caching, queues, and horizontal scaling patterns.',
    },
  ],
  data: [
    {
      name: 'Python',
      category: 'Programming',
      proficiencyLevel: 0.9,
      evidenceSource: 'github',
      verificationStatus: 'assessment_verified',
      evidenceNotes: 'Pandas, NumPy, and scikit-learn analysis pipelines.',
    },
    {
      name: 'SQL',
      category: 'Databases',
      proficiencyLevel: 0.82,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Analytical window functions and cohort queries.',
    },
    {
      name: 'Machine Learning',
      category: 'AI / ML',
      proficiencyLevel: 0.74,
      evidenceSource: 'project',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Trained and evaluated classification models with cross-validation.',
    },
    {
      name: 'Data Visualization',
      category: 'Analytics',
      proficiencyLevel: 0.78,
      evidenceSource: 'course',
      verificationStatus: 'evidence_supported',
      evidenceNotes: 'Interactive KPI dashboards and exploratory notebooks.',
    },
    {
      name: 'Cloud Security',
      category: 'Cloud',
      proficiencyLevel: 0.48,
      evidenceSource: 'claimed',
      verificationStatus: 'claimed',
      evidenceNotes: 'Learning IAM least-privilege policies for data pipelines.',
    },
  ],
};

export function buildDemoWorkspace(personaId: DemoPersonaId, uid: string, email: string): DemoWorkspaceSeed {
  const persona = DEMO_PERSONAS.find((p) => p.id === personaId) || DEMO_PERSONAS[0];
  const targetJob =
    CURATED_SAMPLE_JOBS.find((j) => j.id === persona.targetJobId) || CURATED_SAMPLE_JOBS[0];

  const skills: CandidateSkill[] = PERSONA_SKILLS[persona.id].map((s, idx) => ({
    id: `demo_sk_${persona.id}_${idx + 1}`,
    userId: uid,
    ...s,
  }));

  const baseProfile: UserProfile = {
    uid,
    email,
    displayName: persona.displayName,
    phone: '+91 98765 00000',
    college: persona.college,
    university: persona.college,
    degree: persona.degree,
    department: persona.department,
    graduationYear: '2026',
    cgpa: '8.7',
    currentAcademicYear: 'Final Year',
    location: persona.location,
    careerObjective: `Secure a ${persona.roleLabel} role backed by verified skills, hands-on projects, and measurable learning outcomes.`,
    role: 'student',
    portfolioUrl: '',
    linkedinUrl: '',
    githubUsername: persona.username,
    credlyUrl: '',
    leetcodeUrl: '',
    hackerrankUrl: '',
    preferences: {
      preferredCompanies: ['Amazon', 'Google', 'Microsoft', 'IBM', 'Deloitte'],
      preferredRoles: [targetJob.title, persona.roleLabel],
      preferredLocations: ['Bengaluru', 'Hyderabad', 'Remote'],
      preferredCountries: ['India'],
      jobType: 'Both',
      workMode: 'Any',
      minSalary: '',
      experienceLevel: '0–1 Years (Freshers)',
      preferredIndustries: ['Cloud Computing', 'Software Engineering', 'AI & Data'],
      dailyLearningMinutes: 60,
    },
    education: [
      {
        id: `demo_edu_${persona.id}`,
        institution: persona.college,
        degree: persona.degree,
        field: persona.department,
        startYear: '2022',
        endYear: '2026',
        grade: '8.7 CGPA',
      },
    ],
    experience: [],
    projects: [
      {
        id: `demo_proj_${persona.id}`,
        title: `${persona.roleLabel} Capstone Portfolio`,
        description: `End-to-end production-style project demonstrating ${skills
          .slice(0, 3)
          .map((s) => s.name)
          .join(', ')}.`,
        technologies: skills.slice(0, 4).map((s) => s.name),
        repoUrl: '',
      },
    ],
    certifications: [],
    resumes: [],
    profileCompleteness: 78,
  };
  baseProfile.profileCompleteness = calculateProfileCompleteness(baseProfile, skills);

  const match = calculateJobMatch(targetJob, baseProfile, skills, DEFAULT_MATCHING_WEIGHTS);
  const selectedJobId = `demo_sel_${persona.id}_1`;

  const gapSkills = [
    ...match.missingSkills,
    ...match.partialSkills,
    ...match.unverifiedSkills,
  ].slice(0, 4);
  const planSkills =
    gapSkills.length >= 3
      ? gapSkills
      : targetJob.requiredSkills.slice(0, 4).map((r) => r.name);

  const roadmapItems: RoadmapItem[] = planSkills.map((sk, idx) => ({
    id: `demo_rm_${persona.id}_${idx + 1}`,
    userId: uid,
    selectedJobId,
    title: `Master ${sk} for ${targetJob.title}`,
    skillCategory: targetJob.requiredSkills.find((r) => r.name === sk)?.category || 'Core Technical',
    targetSkill: sk,
    priority: idx < 2 ? 'high' : 'medium',
    durationHours: 6 + idx * 2,
    phaseOrder: idx + 1,
    status: idx === 0 ? 'completed' : idx === 1 ? 'in_progress' : 'not_started',
    description: `Build verified hands-on fluency in ${sk} aligned with ${targetJob.company} ${targetJob.title} requirements.`,
    expectedOutcome: `Complete hands-on lab and score >= 70% on ${sk} verification assessment.`,
  }));

  const courses: CourseRecord[] = planSkills.map((sk, idx) => {
    const cat = findCatalogCourseForSkill(sk);
    return {
      id: `demo_crs_${persona.id}_${idx + 1}`,
      userId: uid,
      selectedJobId,
      title: cat.title,
      provider: cat.provider,
      officialUrl: cat.officialUrl,
      targetSkill: sk,
      difficulty: cat.difficulty,
      durationLabel: cat.durationLabel,
      pricingType: cat.pricingType,
      status: idx === 0 ? 'completed' : idx === 1 ? 'in_progress' : 'not_started',
      progressPercent: idx === 0 ? 100 : idx === 1 ? 45 : 0,
      certificateUrl: '',
      evidenceNotes: idx === 0 ? 'Completed all video chapters and lab exercises.' : '',
    };
  });

  const dailyTasks: DailyTask[] = planSkills.slice(0, 3).map((sk, idx) => {
    const cat = findCatalogCourseForSkill(sk);
    return {
      id: `demo_tsk_${persona.id}_${idx + 1}`,
      userId: uid,
      selectedJobId,
      title: `Hands-on Lab: ${sk} Diagnostics & Core Workflows`,
      description: `Focused practice session to close your ${sk} gap for ${targetJob.title}.`,
      targetSkill: sk,
      estimatedMinutes: 45,
      priority: idx === 0 ? 'high' : 'medium',
      instructions: `1. Review official ${sk} architecture docs.\n2. Execute 3 practical diagnostics or coding exercises.\n3. Record key takeaways as evidence.`,
      resourceUrl: cat.officialUrl,
      status: idx === 0 ? 'completed' : idx === 1 ? 'in_progress' : 'pending',
      evidenceNotes: '',
      evidenceUrl: '',
    };
  });

  const practicalProjects: PracticalProject[] = [
    {
      id: `demo_prj_${persona.id}_1`,
      userId: uid,
      selectedJobId,
      title: `${targetJob.title} Practical Runbook & Portfolio Lab`,
      description: `Build, test, and document a verifiable project exercising ${planSkills.slice(0, 3).join(', ')}.`,
      targetSkills: planSkills.slice(0, 3),
      requirements: [
        `Implement core ${planSkills[0] || 'technical'} workflow with clear architecture notes`,
        'Include reproducible setup commands in a clean README',
        'Document 2 failure modes and troubleshooting fixes',
      ],
      instructions:
        '1. Build locally or in a cloud free-tier sandbox.\n2. Document architecture and test verification.\n3. Submit your repository link for AI review.',
      status: 'in_progress',
      githubRepoUrl: '',
      evidenceNotes: '',
      aiReviewFeedback: '',
      aiReviewScore: 0,
    },
  ];

  const selectedJobs: SelectedJob[] = [
    {
      id: selectedJobId,
      userId: uid,
      jobId: targetJob.id,
      jobTitle: targetJob.title,
      company: targetJob.company,
      location: targetJob.location,
      jobType: targetJob.jobType,
      workMode: targetJob.workMode,
      officialUrl: targetJob.officialUrl,
      matchScore: match.overallScore,
      eligibilityPassed: match.eligibilityPassed,
      matchedSkills: match.matchedSkills.slice(0, 30),
      partialSkills: match.partialSkills.slice(0, 30),
      missingSkills: match.missingSkills.slice(0, 30),
      unverifiedSkills: match.unverifiedSkills.slice(0, 30),
      learningProgress: 38,
      applicationStatus: 'Preparing',
      roadmapSummary: `Active ${planSkills.length}-milestone preparation track for ${targetJob.title} at ${targetJob.company}.`,
    },
  ];

  const applications: JobApplication[] = [
    {
      id: `demo_app_${persona.id}_1`,
      userId: uid,
      jobId: targetJob.id,
      jobTitle: targetJob.title,
      company: targetJob.company,
      location: targetJob.location,
      officialUrl: targetJob.officialUrl,
      status: 'Preparing',
      dateApplied: '',
      deadline: targetJob.deadline || '',
      interviewDate: '',
      nextAction: `Complete ${planSkills[1] || 'core skill'} verification quiz before applying`,
      notes: 'Demo tracked application ready for final skill verification.',
    },
  ];

  return {
    profile: baseProfile,
    skills,
    selectedJobs,
    roadmapItems,
    courses,
    dailyTasks,
    practicalProjects,
    applications,
  };
}
