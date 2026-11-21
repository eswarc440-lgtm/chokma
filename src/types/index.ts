export type UserRole = 'student' | 'admin' | 'employer';

export type EvidenceSource = 'claimed' | 'resume' | 'github' | 'course' | 'project' | 'assessment';
export type VerificationStatus = 'claimed' | 'evidence_supported' | 'assessment_verified';
export type SkillMatchStatus = 'matched' | 'partial' | 'missing' | 'unverified';

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startYear: string;
  endYear: string;
  grade: string;
}

export interface ExperienceEntry {
  id: string;
  role: string;
  organization: string;
  duration: string;
  description: string;
}

export interface ProfileProjectEntry {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  repoUrl?: string;
  liveUrl?: string;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  issueDate: string;
  credentialUrl?: string;
}

export interface ResumeRecord {
  id: string;
  fileName: string;
  fileSizeKb: number;
  uploadedAt: string;
  version: number;
  extractedSummary: string;
  extractedSkills: string[];
  rawTextPreview: string;
}

export interface GitHubRepoSummary {
  name: string;
  description: string;
  language: string;
  stars: number;
  updatedAt: string;
  url: string;
}

export interface GitHubAnalysis {
  username: string;
  profileUrl: string;
  publicRepos: number;
  followers: number;
  topLanguages: string[];
  analyzedAt: string;
  summary: string;
  repos: GitHubRepoSummary[];
}

export interface CareerPreferences {
  preferredCompanies: string[];
  preferredRoles: string[];
  preferredLocations: string[];
  preferredCountries: string[];
  jobType: 'Full-time' | 'Internship' | 'Both';
  workMode: 'Remote' | 'Hybrid' | 'On-site' | 'Any';
  minSalary?: string;
  experienceLevel: string;
  preferredIndustries: string[];
  dailyLearningMinutes: number;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  college?: string;
  university?: string;
  degree?: string;
  department?: string;
  graduationYear?: string;
  cgpa?: string;
  currentAcademicYear?: string;
  location?: string;
  careerObjective?: string;
  role: UserRole;
  portfolioUrl?: string;
  linkedinUrl?: string;
  githubUsername?: string;
  credlyUrl?: string;
  leetcodeUrl?: string;
  hackerrankUrl?: string;
  githubAnalysis?: GitHubAnalysis;
  preferences?: CareerPreferences;
  education?: EducationEntry[];
  experience?: ExperienceEntry[];
  projects?: ProfileProjectEntry[];
  certifications?: CertificationEntry[];
  resumes?: ResumeRecord[];
  profileCompleteness: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CandidateSkill {
  id: string;
  userId: string;
  name: string;
  category: string;
  proficiencyLevel: number; // 0 | 0.4 | 0.6 | 0.8 | 1.0
  evidenceSource: EvidenceSource;
  verificationStatus: VerificationStatus;
  evidenceNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RequiredJobSkill {
  name: string;
  category: string;
  importance: 'mandatory' | 'important' | 'preferred';
  weight: number; // 1 - 3
  minProficiency: number; // 0.4 - 0.8
}

export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  jobType: 'Full-time' | 'Internship';
  workMode: 'Remote' | 'Hybrid' | 'On-site';
  experienceLevel: string;
  salaryRange?: string;
  description: string;
  responsibilities: string[];
  qualifications: string[];
  requiredSkills: RequiredJobSkill[];
  preferredSkills: string[];
  officialUrl: string;
  source: string;
  isSampleListing: boolean;
  status: 'active' | 'expired';
  postedDate: string;
  deadline?: string;
  lastVerifiedDate: string;
}

export interface SkillComparisonRow {
  skillName: string;
  category: string;
  importance: 'mandatory' | 'important' | 'preferred';
  requiredLevel: number;
  candidateLevel: number;
  status: SkillMatchStatus;
  evidenceSource: EvidenceSource | 'none';
  verificationStatus: VerificationStatus | 'none';
  note: string;
}

export interface MatchBreakdown {
  overallScore: number;
  eligibilityPassed: boolean;
  eligibilityNotes: string[];
  technicalSkillsScore: number;
  projectRelevanceScore: number;
  educationScore: number;
  experienceScore: number;
  certificationsScore: number;
  matchedSkills: string[];
  partialSkills: string[];
  missingSkills: string[];
  unverifiedSkills: string[];
  skillComparisons: SkillComparisonRow[];
  disclaimer: string;
}

export interface SelectedJob {
  id: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  company: string;
  location?: string;
  jobType?: string;
  workMode?: string;
  officialUrl?: string;
  matchScore: number;
  eligibilityPassed: boolean;
  matchedSkills?: string[];
  partialSkills?: string[];
  missingSkills?: string[];
  unverifiedSkills?: string[];
  learningProgress: number;
  applicationStatus: string;
  roadmapSummary?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoadmapItem {
  id: string;
  userId: string;
  selectedJobId: string;
  title: string;
  skillCategory?: string;
  targetSkill: string;
  priority: 'high' | 'medium' | 'low';
  durationHours: number;
  phaseOrder: number;
  status: 'not_started' | 'in_progress' | 'completed';
  description?: string;
  expectedOutcome?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type CourseStatus = 'not_started' | 'in_progress' | 'completed' | 'assessment_pending' | 'verified';

export interface CourseRecord {
  id: string;
  userId: string;
  selectedJobId: string;
  title: string;
  provider: string;
  officialUrl: string;
  targetSkill: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  durationLabel?: string;
  pricingType: 'Free' | 'Paid' | 'Free Trial';
  status: CourseStatus;
  progressPercent: number;
  certificateUrl?: string;
  evidenceNotes?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DailyTask {
  id: string;
  userId: string;
  selectedJobId: string;
  title: string;
  description?: string;
  targetSkill: string;
  estimatedMinutes: number;
  priority: 'high' | 'medium' | 'low';
  instructions?: string;
  resourceUrl?: string;
  status: 'pending' | 'in_progress' | 'completed';
  evidenceNotes?: string;
  evidenceUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PracticalProject {
  id: string;
  userId: string;
  selectedJobId: string;
  title: string;
  description: string;
  targetSkills?: string[];
  requirements?: string[];
  instructions?: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'reviewed';
  githubRepoUrl?: string;
  evidenceNotes?: string;
  aiReviewFeedback?: string;
  aiReviewScore?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuizQuestion {
  id: string;
  type: 'technical' | 'scenario';
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AssessmentAttempt {
  id: string;
  userId: string;
  selectedJobId: string;
  targetSkill: string;
  title: string;
  questionsCount: number;
  scorePercent: number;
  passed: boolean;
  explanationsSummary?: string;
  status: 'completed';
  createdAt?: unknown;
}

export type ApplicationStatus =
  | 'Interested'
  | 'Preparing'
  | 'Ready to Apply'
  | 'Applied'
  | 'Assessment Scheduled'
  | 'Interview Scheduled'
  | 'Selected'
  | 'Rejected'
  | 'On Hold';

export interface JobApplication {
  id: string;
  userId: string;
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
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  lastMessagePreview?: string;
  activeAgent?: string;
  messageCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  agentUsed?: string;
  createdAt?: unknown;
}

export interface MatchingWeights {
  technicalSkillsWeight: number;
  projectRelevanceWeight: number;
  educationWeight: number;
  experienceWeight: number;
  certificationsWeight: number;
}

export const DEFAULT_MATCHING_WEIGHTS: MatchingWeights = {
  technicalSkillsWeight: 40,
  projectRelevanceWeight: 20,
  educationWeight: 15,
  experienceWeight: 15,
  certificationsWeight: 10,
};

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'Interested',
  'Preparing',
  'Ready to Apply',
  'Applied',
  'Assessment Scheduled',
  'Interview Scheduled',
  'Selected',
  'Rejected',
  'On Hold',
];
