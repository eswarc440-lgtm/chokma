import { getActiveAuthToken } from '../lib/localAuthSession';
import { GitHubAnalysis, QuizQuestion } from '../types';

async function getAuthHeaders(isJson = true): Promise<Record<string, string>> {
  const token = await getActiveAuthToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface ParsedResumeResponse {
  agent: string;
  fileName: string;
  fileSizeKb: number;
  rawTextPreview: string;
  extracted: {
    summary?: string;
    fullName?: string;
    phone?: string;
    location?: string;
    college?: string;
    university?: string;
    degree?: string;
    department?: string;
    graduationYear?: string;
    cgpa?: string;
    careerObjective?: string;
    githubUsername?: string;
    linkedinUrl?: string;
    portfolioUrl?: string;
    skills?: Array<{ name: string; category: string }>;
    education?: Array<{
      institution: string;
      degree: string;
      field: string;
      startYear: string;
      endYear: string;
      grade: string;
    }>;
    experience?: Array<{
      role: string;
      organization: string;
      duration: string;
      description: string;
    }>;
    projects?: Array<{
      title: string;
      description: string;
      technologies: string[];
    }>;
    certifications?: Array<{
      name: string;
      issuer: string;
      issueDate: string;
    }>;
  };
}

export async function parseResumeWithAgent(file: File): Promise<ParsedResumeResponse> {
  const headers = await getAuthHeaders(false);
  const formData = new FormData();
  formData.append('resume', file);
  const res = await fetch('/api/agents/resume/parse', {
    method: 'POST',
    headers,
    body: formData,
  });
  return handleResponse<ParsedResumeResponse>(res);
}

export interface GitHubAnalyzeResponse {
  agent: string;
  analysis: GitHubAnalysis;
  inferredSkills: Array<{ name: string; category: string; notes: string }>;
}

export async function analyzeGitHubWithAgent(username: string): Promise<GitHubAnalyzeResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/github/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ username }),
  });
  return handleResponse<GitHubAnalyzeResponse>(res);
}

export interface RoadmapGenerateResponse {
  agent: string;
  gapSkillsTargeted: string[];
  plan: {
    roadmapSummary?: string;
    milestones?: Array<{
      title: string;
      skillCategory: string;
      targetSkill: string;
      priority: 'high' | 'medium' | 'low';
      durationHours: number;
      phaseOrder: number;
      description: string;
      expectedOutcome: string;
    }>;
    dailyTasks?: Array<{
      title: string;
      description: string;
      targetSkill: string;
      estimatedMinutes: number;
      priority: 'high' | 'medium' | 'low';
      instructions: string;
    }>;
    practicalProjects?: Array<{
      title: string;
      description: string;
      targetSkills: string[];
      requirements: string[];
      instructions: string;
    }>;
  };
}

export async function generateRoadmapWithAgent(payload: {
  jobTitle: string;
  company: string;
  missingSkills: string[];
  partialSkills: string[];
  unverifiedSkills: string[];
  dailyLearningMinutes?: number;
}): Promise<RoadmapGenerateResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/roadmap/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<RoadmapGenerateResponse>(res);
}

export interface AssessmentGenerateResponse {
  agent: string;
  assessment: {
    title: string;
    timeLimitMinutes: number;
    questions: QuizQuestion[];
  };
}

export async function generateAssessmentWithAgent(payload: {
  targetSkill: string;
  jobTitle?: string;
}): Promise<AssessmentGenerateResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/assessment/generate', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<AssessmentGenerateResponse>(res);
}

export interface ProjectReviewResponse {
  agent: string;
  review: {
    score: number;
    evidenceSufficient: boolean;
    feedback: string;
  };
}

export async function reviewProjectWithAgent(payload: {
  title: string;
  description: string;
  requirements: string[];
  targetSkills: string[];
  githubRepoUrl?: string;
  evidenceNotes: string;
}): Promise<ProjectReviewResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/project/review', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<ProjectReviewResponse>(res);
}

export interface ChatOrchestratorResponse {
  agentUsed: string;
  reply: string;
}

export async function sendAssistantMessage(payload: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  userContext: Record<string, unknown>;
  language?: string;
}): Promise<ChatOrchestratorResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<ChatOrchestratorResponse>(res);
}

export interface TTSResponse {
  audioDataUrl: string;
  voiceName: string;
}

export async function synthesizeSpeechWithAgent(payload: {
  text: string;
  voiceName?: string;
  language?: string;
}): Promise<TTSResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/tts', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<TTSResponse>(res);
}

export interface TranscribeResponse {
  transcript: string;
}

export async function transcribeAudioWithAgent(payload: {
  audioBase64: string;
  mimeType: string;
  language?: string;
}): Promise<TranscribeResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/transcribe', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<TranscribeResponse>(res);
}

export interface PictorialStation {
  step: number;
  title: string;
  skill: string;
  icon: 'cloud' | 'terminal' | 'network' | 'shield' | 'code' | 'database' | 'rocket' | 'award' | string;
  duration: string;
  caption: string;
  deliverable: string;
}

export interface PictorialRoadmapBlueprint {
  headline: string;
  subtitle: string;
  estimatedWeeks: number;
  recommendedTheme?: string;
  accentHex?: string;
  stations: PictorialStation[];
}

export interface PictorialRoadmapResponse {
  agent: string;
  blueprint: PictorialRoadmapBlueprint;
}

export async function generatePictorialRoadmapWithAgent(payload: {
  jobTitle: string;
  company: string;
  careerGoal?: string;
  selectedSkills?: string[];
  visualStyle?: string;
  customPrompt?: string;
  editPrompt?: string;
  currentBlueprint?: PictorialRoadmapBlueprint;
  milestones: Array<{ title: string; targetSkill: string; status: string; durationHours: number }>;
  missingSkills: string[];
  matchScore: number;
}): Promise<PictorialRoadmapResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/roadmap/pictorial', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<PictorialRoadmapResponse>(res);
}

export interface LiveJobOpening {
  id: string;
  title: string;
  company: string;
  location: string;
  workMode: 'Remote' | 'Hybrid' | 'On-site';
  jobType: 'Full-time' | 'Internship';
  availabilityStatus: string;
  summary: string;
  keySkills: string[];
  careerUrl: string;
}

export interface LiveJobSearchResponse {
  agent: string;
  hiringOverview: string;
  openings: LiveJobOpening[];
  sources: Array<{ title: string; uri: string }>;
  searchedAt: string;
}

export async function searchRealWorldJobsWithGoogle(payload: {
  query?: string;
  company?: string;
  location?: string;
  jobType?: string;
}): Promise<LiveJobSearchResponse> {
  const headers = await getAuthHeaders(true);
  const res = await fetch('/api/agents/jobs/search', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return handleResponse<LiveJobSearchResponse>(res);
}
