import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import os from 'os';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import mammoth from 'mammoth';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { createServer as createViteServer } from 'vite';

// Load Firebase projectId from provisioned config for ID token verification (no IAM required)
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    if (raw.projectId && raw.projectId !== 'remixed-project-id') {
      firebaseProjectId = raw.projectId;
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
}

if (firebaseProjectId) {
  if (!getApps().length) {
    initializeApp({ projectId: firebaseProjectId });
  } else {
    getApp();
  }
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_TEXT_MODELS = ['gemini-3.1-flash-lite'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorString(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number | string }).status;
    return status ? `${status} ${err.message}` : err.message;
  }
  try {
    return typeof err === 'string' ? err : JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isTransientGeminiError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    raw.includes('500') ||
    raw.includes('502') ||
    raw.includes('503') ||
    raw.includes('504') ||
    lower.includes('unavailable') ||
    lower.includes('internal') ||
    lower.includes('overloaded') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up')
  );
}

function isModelFallbackEligible(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    isTransientGeminiError(raw) ||
    raw.includes('404') ||
    lower.includes('not_found') ||
    lower.includes('not found') ||
    lower.includes('not supported') ||
    lower.includes('model is not available')
  );
}

async function generateContentResilient(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'> & { model?: string },
  fallbackModels: string[] = FALLBACK_TEXT_MODELS
) {
  const primaryModel = params.model || MODEL_NAME;
  const candidates = [primaryModel, ...fallbackModels.filter((m) => m !== primaryModel)];
  let lastError: unknown;

  for (let mIdx = 0; mIdx < candidates.length; mIdx++) {
    const model = candidates[mIdx];
    const maxAttempts = mIdx === 0 ? 2 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await ai.models.generateContent({
          ...params,
          model,
        });
      } catch (err) {
        lastError = err;
        const raw = getErrorString(err);
        console.error(
          `[Chokma Gemini] model=${model} attempt=${attempt}/${maxAttempts} failed:`,
          raw.slice(0, 500)
        );

        // Immediately stop on authentication or explicit API key errors
        if (
          raw.includes('API_KEY_INVALID') ||
          raw.includes('API key not valid') ||
          raw.includes('PERMISSION_DENIED') ||
          raw.includes('403')
        ) {
          throw err;
        }

        if (attempt < maxAttempts && isTransientGeminiError(raw)) {
          await sleep(600 * attempt);
          continue;
        }

        if (!isModelFallbackEligible(raw)) {
          throw err;
        }
        break;
      }
    }
  }

  throw lastError;
}

function parseJsonFromGemini<T>(text: string | undefined, fallback: T): T {
  const raw = (text ?? '').trim();
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
      } catch {
        // fall through
      }
    }
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      try {
        return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
      } catch {
        // fall through
      }
    }
    return fallback;
  }
}

function buildAlternatingChatContents(
  history: unknown,
  currentMessage: string
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const normalized: Array<{ role: 'user' | 'model'; text: string }> = [];

  if (Array.isArray(history)) {
    for (const item of history.slice(-10) as Array<{ role?: string; content?: string }>) {
      const text = String(item?.content || '').trim().slice(0, 2000);
      if (!text) continue;
      const role: 'user' | 'model' = item?.role === 'assistant' || item?.role === 'model' ? 'model' : 'user';
      // Gemini requires multi-turn history to start with a user turn
      if (normalized.length === 0 && role === 'model') continue;

      const prev = normalized[normalized.length - 1];
      if (prev && prev.role === role) {
        if (prev.text !== text) {
          prev.text = `${prev.text}\n\n${text}`.slice(0, 2500);
        }
      } else {
        normalized.push({ role, text });
      }
    }
  }

  const cleanCurrent = currentMessage.trim().slice(0, 3000);
  const last = normalized[normalized.length - 1];
  if (last && last.role === 'user') {
    // Prevent two consecutive user turns (e.g., if a previous turn failed before model replied)
    if (last.text === cleanCurrent) {
      // Already matches the trailing user message
    } else {
      last.text = `${last.text}\n\n${cleanCurrent}`.slice(0, 3000);
    }
  } else {
    normalized.push({ role: 'user', text: cleanCurrent });
  }

  return normalized.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));
}

// Simple sliding-window rate limiter per user/IP
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const uid = (req as AuthenticatedRequest).uid || req.ip || 'anonymous';
    const key = `${req.path}:${uid}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);
    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (record.count >= maxRequests) {
      res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment before trying again.' });
      return;
    }
    record.count += 1;
    next();
  };
}

// =========================================================================
// SECURE SERVER-SIDE USERNAME + PASSWORD AUTH (Sign-in only, scrypt + HMAC)
// =========================================================================
interface StoredAuthRecord {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

const AUTH_STORE_FILE = path.join(os.tmpdir(), 'chokma-auth-hashes.json');
const SESSION_KEY_FILE = path.join(os.tmpdir(), 'chokma-session.key');
const LOCAL_TOKEN_PREFIX = 'ckm_';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,30}$/;
const revokedSessionJtis = new Set<string>();

function loadOrCreateSessionSecret(): Buffer {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return crypto.createHash('sha256').update(process.env.SESSION_SECRET).digest();
  }
  try {
    if (fs.existsSync(SESSION_KEY_FILE)) {
      const hex = fs.readFileSync(SESSION_KEY_FILE, 'utf-8').trim();
      if (hex.length === 64) {
        return Buffer.from(hex, 'hex');
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(SESSION_KEY_FILE, generated.toString('hex'), { mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32);
  }
}

const SERVER_SESSION_SECRET = loadOrCreateSessionSecret();
const localAuthUsers = new Map<string, StoredAuthRecord>();

function loadStoredAuthUsers(): void {
  try {
    if (!fs.existsSync(AUTH_STORE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(AUTH_STORE_FILE, 'utf-8'));
    if (Array.isArray(raw)) {
      for (const item of raw as StoredAuthRecord[]) {
        if (item?.usernameLower && item?.passwordHash && item?.salt && item?.uid) {
          localAuthUsers.set(item.usernameLower, item);
        }
      }
    }
  } catch {
    // Start with empty store if unreadable
  }
}

function saveStoredAuthUsers(): void {
  try {
    fs.writeFileSync(
      AUTH_STORE_FILE,
      JSON.stringify(Array.from(localAuthUsers.values()), null, 2),
      { mode: 0o600 }
    );
  } catch (err) {
    console.error('Failed to persist auth hash store:', err);
  }
}

loadStoredAuthUsers();

function hashPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function verifyPasswordHash(password: string, saltHex: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashPassword(password, saltHex), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function issueLocalSessionToken(user: StoredAuthRecord): string {
  const payloadObj = {
    uid: user.uid,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    jti: crypto.randomBytes(12).toString('hex'),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SERVER_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  return `${LOCAL_TOKEN_PREFIX}${payloadB64}.${sig}`;
}

function verifyLocalSessionToken(
  token: string
): { uid: string; email: string; username: string; displayName: string; jti: string } | null {
  if (!token.startsWith(LOCAL_TOKEN_PREFIX)) return null;
  const body = token.slice(LOCAL_TOKEN_PREFIX.length);
  const dotIdx = body.indexOf('.');
  if (dotIdx <= 0) return null;
  const payloadB64 = body.slice(0, dotIdx);
  const sigB64 = body.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64) return null;

  const expectedSig = crypto
    .createHmac('sha256', SERVER_SESSION_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const sigBuf = Buffer.from(sigB64);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8')) as {
      uid?: string;
      email?: string;
      username?: string;
      displayName?: string;
      jti?: string;
      exp?: number;
    };
    if (!decoded.uid || !decoded.email || !decoded.jti || !decoded.exp) return null;
    if (Date.now() > decoded.exp) return null;
    if (revokedSessionJtis.has(decoded.jti)) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      username: decoded.username || decoded.uid,
      displayName: decoded.displayName || decoded.username || 'User',
      jti: decoded.jti,
    };
  } catch {
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  uid?: string;
  userEmail?: string;
}

async function verifyFirebaseAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token || token.length > 8192) {
    res.status(401).json({ error: 'Invalid authentication token.' });
    return;
  }

  // 1. Accept signed server-side username session token
  if (token.startsWith(LOCAL_TOKEN_PREFIX)) {
    const localSession = verifyLocalSessionToken(token);
    if (!localSession) {
      res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      return;
    }
    req.uid = localSession.uid;
    req.userEmail = localSession.email;
    next();
    return;
  }

  // 2. Otherwise verify Firebase Auth ID token
  try {
    if (!firebaseProjectId || !getApps().length) {
      res.status(503).json({ error: 'Firebase project authentication is not initialized.' });
      return;
    }
    const decoded = await getAdminAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.userEmail = decoded.email;
    next();
  } catch (err) {
    console.error('Firebase token verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
  }
}

// Memory-only upload handler with strict 5MB limit and file filter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = new Set([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]);
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = new Set(['.pdf', '.docx', '.txt']);
    if (allowedMimes.has(file.mimetype) || allowedExts.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Upload a PDF, DOCX, or TXT resume (max 5 MB).'));
    }
  },
});

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = getErrorString(err);
  const lower = raw.toLowerCase();
  console.error('[Chokma API Error]', raw.slice(0, 600));

  if (
    raw.includes('API_KEY_INVALID') ||
    lower.includes('api key not valid') ||
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('403')
  ) {
    return {
      status: 403,
      message: 'AI service authentication failed. Please check the Gemini API key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'AI service quota temporarily reached. Please wait a moment and try again.',
    };
  }
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return {
      status: 503,
      message: 'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND') || lower.includes('not found')) {
    return {
      status: 502,
      message: 'The configured AI model is currently unavailable for this API key. Please try again shortly.',
    };
  }
  if (
    raw.includes('503') ||
    raw.includes('504') ||
    lower.includes('unavailable') ||
    lower.includes('overloaded') ||
    lower.includes('deadline_exceeded')
  ) {
    return {
      status: 503,
      message: 'Gemini AI service is temporarily busy. Please retry in a few seconds.',
    };
  }
  if (raw.includes('400') || raw.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      message: 'The AI agent could not process this request format. Try starting a new chat or shortening the message.',
    };
  }
  return {
    status: 500,
    message: 'AI agent request failed. Please try again.',
  };
}

function classifyOrchestratorAgent(message: string): {
  agentName: string;
  agentRole: string;
} {
  const q = message.toLowerCase();
  if (q.includes('resume') || q.includes('profile') || q.includes('github') || q.includes('cgpa') || q.includes('portfolio')) {
    return {
      agentName: 'Profile Intelligence Agent',
      agentRole: 'Candidate profile analysis, resume evidence classification, and GitHub portfolio assessment.',
    };
  }
  if (q.includes('gap') || q.includes('missing') || q.includes('match') || q.includes('compare') || q.includes('eligible')) {
    return {
      agentName: 'Skill Gap Analyst',
      agentRole: 'Explainable skill comparison (Matched, Partial, Missing, Unverified) and weighted match readiness.',
    };
  }
  if (q.includes('learn') || q.includes('roadmap') || q.includes('course') || q.includes('today') || q.includes('project') || q.includes('study') || q.includes('interview')) {
    return {
      agentName: 'Learning Planner Agent',
      agentRole: 'Gap-driven roadmaps, official course recommendations, daily tasks, and practical projects.',
    };
  }
  if (q.includes('progress') || q.includes('assessment') || q.includes('quiz') || q.includes('outcome') || q.includes('ready to apply') || q.includes('verified')) {
    return {
      agentName: 'Progress & Outcomes Agent',
      agentRole: 'Evidence verification, assessment readiness, proficiency updates, and career outcomes.',
    };
  }
  if (q.includes('job') || q.includes('company') || q.includes('role') || q.includes('recommend') || q.includes('vacancy')) {
    return {
      agentName: 'Job Intelligence Agent',
      agentRole: 'Role discovery, company preference alignment, and official application guidance.',
    };
  }
  return {
    agentName: 'Central Orchestrator',
    agentRole: 'Coordinates Profile, Job Intelligence, Skill Gap, Learning Planner, and Progress agents.',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // =========================================================================
  // USERNAME + PASSWORD AUTH ENDPOINTS (Sign-in only, scrypt hashed)
  // =========================================================================
  app.post('/api/auth/register', rateLimit(20, 60_000), (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawDisplayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 80) : '';

    if (!USERNAME_PATTERN.test(rawUsername)) {
      res.status(400).json({
        error:
          'Username must be 3–30 characters using only letters, numbers, dots, underscores, or hyphens.',
      });
      return;
    }
    if (rawPassword.length < 6 || rawPassword.length > 128) {
      res.status(400).json({ error: 'Password must be between 6 and 128 characters.' });
      return;
    }

    const usernameLower = rawUsername.toLowerCase();
    if (localAuthUsers.has(usernameLower)) {
      res.status(409).json({
        error: 'That username already exists. Switch to "Sign In" to log in.',
      });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(rawPassword, salt);
    const uid = `usr_${crypto.randomBytes(10).toString('hex')}`;
    const displayName = rawDisplayName || rawUsername;
    const record: StoredAuthRecord = {
      uid,
      username: rawUsername,
      usernameLower,
      displayName,
      email: `${usernameLower}@users.chokma.app`,
      salt,
      passwordHash,
      createdAt: new Date().toISOString(),
    };

    localAuthUsers.set(usernameLower, record);
    saveStoredAuthUsers();

    const token = issueLocalSessionToken(record);
    res.status(201).json({
      token,
      user: {
        uid: record.uid,
        username: record.username,
        displayName: record.displayName,
        email: record.email,
      },
    });
  });

  app.post('/api/auth/login', rateLimit(30, 60_000), (req: Request, res: Response) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!rawUsername || !rawPassword) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const usernameLower = rawUsername.toLowerCase();
    const record = localAuthUsers.get(usernameLower);
    if (!record || !verifyPasswordHash(rawPassword, record.salt, record.passwordHash)) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }

    const token = issueLocalSessionToken(record);
    res.json({
      token,
      user: {
        uid: record.uid,
        username: record.username,
        displayName: record.displayName,
        email: record.email,
      },
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const verified = verifyLocalSessionToken(token);
      if (verified) {
        revokedSessionJtis.add(verified.jti);
      }
    }
    res.json({ ok: true });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'chokma-careerpilot-api' });
  });

  // =========================================================================
  // AGENT 1: PROFILE INTELLIGENCE — RESUME UPLOAD & PARSING
  // =========================================================================
  app.post(
    '/api/agents/resume/parse',
    verifyFirebaseAuth,
    rateLimit(10, 60_000),
    (req, res, next) => {
      upload.single('resume')(req, res, (err) => {
        if (err) {
          res.status(400).json({ error: err.message || 'Invalid resume file upload.' });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: 'No resume file provided.' });
          return;
        }

        const ai = getGenAIClient();
        const ext = path.extname(file.originalname).toLowerCase();
        const isPdf = file.mimetype === 'application/pdf' || ext === '.pdf';
        const isDocx =
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          ext === '.docx';

        let rawTextPreview = '';
        let contents: unknown;

        const extractionPrompt = `You are the Profile Intelligence Agent for Chokma (CareerPilot).
Extract structured candidate information strictly from the provided resume document.
Rules:
- Only extract facts explicitly present in the resume. Never invent degrees, employers, dates, or certifications.
- Return empty strings or empty arrays for fields not found.
- Keep extracted skills concise (e.g., "Linux", "Python", "AWS Fundamentals", "IAM", "EC2", "SQL", "React", "Docker", "TCP/IP").
- Note: Resume keywords are evidenceSource "resume" and verificationStatus "claimed" — do not claim they are verified proficiency.`;

        if (isPdf) {
          contents = {
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: file.buffer.toString('base64'),
                },
              },
              { text: extractionPrompt },
            ],
          };
          rawTextPreview = `PDF document (${file.originalname}, ${Math.max(1, Math.round(file.size / 1024))} KB) parsed via multimodal extraction.`;
        } else if (isDocx) {
          const docxResult = await mammoth.extractRawText({ buffer: file.buffer });
          const text = docxResult.value.trim().slice(0, 25_000);
          if (!text) {
            res.status(400).json({ error: 'Could not extract readable text from the DOCX file.' });
            return;
          }
          rawTextPreview = text.slice(0, 1200);
          contents = `${extractionPrompt}\n\n--- RESUME CONTENT ---\n${text}`;
        } else {
          const text = file.buffer.toString('utf-8').trim().slice(0, 25_000);
          if (!text) {
            res.status(400).json({ error: 'The uploaded text file is empty.' });
            return;
          }
          rawTextPreview = text.slice(0, 1200);
          contents = `${extractionPrompt}\n\n--- RESUME CONTENT ---\n${text}`;
        }

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: contents as never,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                fullName: { type: Type.STRING },
                phone: { type: Type.STRING },
                location: { type: Type.STRING },
                college: { type: Type.STRING },
                university: { type: Type.STRING },
                degree: { type: Type.STRING },
                department: { type: Type.STRING },
                graduationYear: { type: Type.STRING },
                cgpa: { type: Type.STRING },
                careerObjective: { type: Type.STRING },
                githubUsername: { type: Type.STRING },
                linkedinUrl: { type: Type.STRING },
                portfolioUrl: { type: Type.STRING },
                skills: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      category: { type: Type.STRING },
                    },
                  },
                },
                education: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      institution: { type: Type.STRING },
                      degree: { type: Type.STRING },
                      field: { type: Type.STRING },
                      startYear: { type: Type.STRING },
                      endYear: { type: Type.STRING },
                      grade: { type: Type.STRING },
                    },
                  },
                },
                experience: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      role: { type: Type.STRING },
                      organization: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                  },
                },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      technologies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                  },
                },
                certifications: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      issuer: { type: Type.STRING },
                      issueDate: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = parseJsonFromGemini<Record<string, unknown>>(response.text, {});
        res.json({
          agent: 'Profile Intelligence Agent',
          fileName: file.originalname,
          fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
          rawTextPreview,
          extracted: parsed,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // AGENT 1: PROFILE INTELLIGENCE — PUBLIC GITHUB API ANALYSIS
  // =========================================================================
  app.post(
    '/api/agents/github/analyze',
    verifyFirebaseAuth,
    rateLimit(12, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const rawUsername = String(req.body?.username || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/.*$/, '');
        if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(rawUsername)) {
          res.status(400).json({ error: 'Please enter a valid GitHub username (letters, numbers, and hyphens only).' });
          return;
        }

        const headers: Record<string, string> = {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Chokma-CareerPilot-App',
        };

        const [profileRes, reposRes] = await Promise.all([
          fetch(`https://api.github.com/users/${encodeURIComponent(rawUsername)}`, { headers }),
          fetch(`https://api.github.com/users/${encodeURIComponent(rawUsername)}/repos?sort=updated&per_page=12`, { headers }),
        ]);

        if (profileRes.status === 404) {
          res.status(404).json({ error: `GitHub user "${rawUsername}" was not found.` });
          return;
        }
        if (!profileRes.ok) {
          res.status(502).json({ error: 'GitHub public API returned an error or rate limit. Try again shortly.' });
          return;
        }

        const profileData = (await profileRes.json()) as {
          login: string;
          html_url: string;
          public_repos: number;
          followers: number;
          bio?: string;
        };
        const reposData = reposRes.ok
          ? ((await reposRes.json()) as Array<{
              name: string;
              description: string | null;
              language: string | null;
              stargazers_count: number;
              updated_at: string;
              html_url: string;
              topics?: string[];
            }>)
          : [];

        const langCounts = new Map<string, number>();
        const repos = reposData.slice(0, 10).map((r) => {
          if (r.language) {
            langCounts.set(r.language, (langCounts.get(r.language) || 0) + 1);
          }
          return {
            name: r.name,
            description: (r.description || 'Public repository').slice(0, 200),
            language: r.language || 'Unknown',
            stars: r.stargazers_count || 0,
            updatedAt: r.updated_at ? r.updated_at.slice(0, 10) : '',
            url: r.html_url,
          };
        });

        const topLanguages = Array.from(langCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([lang]) => lang);

        // Derive evidence-supported skills strictly from observable public repo languages/metadata
        const inferredSkillsMap = new Map<string, { name: string; category: string; notes: string }>();
        for (const lang of topLanguages) {
          inferredSkillsMap.set(lang.toLowerCase(), {
            name: lang,
            category: 'Languages',
            notes: `Observed across ${langCounts.get(lang)} public GitHub repositories for @${profileData.login}.`,
          });
        }
        if (repos.length > 0) {
          inferredSkillsMap.set('git', {
            name: 'Git',
            category: 'Engineering Tools',
            notes: `Verified via ${profileData.public_repos} public repositories on GitHub.`,
          });
        }

        const repoText = repos.map((r) => `${r.name} ${r.description}`).join(' ').toLowerCase();
        const keywordChecks: Array<[string, string, string]> = [
          ['docker', 'Docker', 'DevOps'],
          ['aws', 'AWS Fundamentals', 'Cloud'],
          ['react', 'React', 'Frontend'],
          ['node', 'Node.js', 'Backend'],
          ['linux', 'Linux', 'Operating Systems'],
          ['sql', 'SQL', 'Databases'],
          ['api', 'REST APIs', 'Backend'],
        ];
        for (const [kw, label, cat] of keywordChecks) {
          if (repoText.includes(kw) && !inferredSkillsMap.has(label.toLowerCase())) {
            inferredSkillsMap.set(label.toLowerCase(), {
              name: label,
              category: cat,
              notes: `Referenced in public repository names/descriptions for @${profileData.login}.`,
            });
          }
        }

        const summary =
          repos.length > 0
            ? `Analyzed ${repos.length} public repositories for @${profileData.login}. Primary languages: ${topLanguages.join(', ') || 'None detected'}. Private repositories are not accessed.`
            : `Public profile @${profileData.login} found with ${profileData.public_repos} public repositories. Private repositories are not accessed.`;

        res.json({
          agent: 'Profile Intelligence Agent',
          analysis: {
            username: profileData.login,
            profileUrl: profileData.html_url,
            publicRepos: profileData.public_repos,
            followers: profileData.followers,
            topLanguages,
            analyzedAt: new Date().toISOString().slice(0, 10),
            summary,
            repos,
          },
          inferredSkills: Array.from(inferredSkillsMap.values()),
        });
      } catch (err) {
        console.error('GitHub analysis error:', err);
        res.status(500).json({ error: 'Unable to analyze public GitHub profile right now.' });
      }
    }
  );

  // =========================================================================
  // AGENT 4: LEARNING PLANNER — PERSONALIZED ROADMAP, TASKS & PROJECTS
  // =========================================================================
  app.post(
    '/api/agents/roadmap/generate',
    verifyFirebaseAuth,
    rateLimit(10, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { jobTitle, company, missingSkills, partialSkills, unverifiedSkills, dailyLearningMinutes } = req.body || {};
        if (!jobTitle || typeof jobTitle !== 'string') {
          res.status(400).json({ error: 'Target job title is required to generate a roadmap.' });
          return;
        }

        const gapList = [
          ...(Array.isArray(missingSkills) ? missingSkills.slice(0, 8) : []),
          ...(Array.isArray(partialSkills) ? partialSkills.slice(0, 4) : []),
          ...(Array.isArray(unverifiedSkills) ? unverifiedSkills.slice(0, 4) : []),
        ];

        const ai = getGenAIClient();
        const prompt = `You are the Learning Planner Agent for Chokma (CareerPilot).
Generate a structured, practical, gap-focused learning plan for a student targeting:
Role: ${jobTitle} at ${company || 'Target Employer'}
Missing skills: ${JSON.stringify(missingSkills || [])}
Partial skills: ${JSON.stringify(partialSkills || [])}
Unverified (resume-only) skills: ${JSON.stringify(unverifiedSkills || [])}
Daily learning budget: ${Number(dailyLearningMinutes) || 60} minutes/day.

Requirements:
- Focus strictly on closing the listed skill gaps (not generic unrelated courses).
- Produce 4 to 6 ordered roadmap milestones (phaseOrder 1..N).
- Produce 4 to 5 concrete daily tasks with clear step-by-step instructions (30 to 90 min each).
- Produce 2 hands-on practical portfolio projects specifically relevant to ${jobTitle}, with concrete requirements and implementation instructions.
- Keep all text crisp, professional, and concise.`;

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                roadmapSummary: { type: Type.STRING },
                milestones: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      skillCategory: { type: Type.STRING },
                      targetSkill: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      durationHours: { type: Type.NUMBER },
                      phaseOrder: { type: Type.NUMBER },
                      description: { type: Type.STRING },
                      expectedOutcome: { type: Type.STRING },
                    },
                  },
                },
                dailyTasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      targetSkill: { type: Type.STRING },
                      estimatedMinutes: { type: Type.NUMBER },
                      priority: { type: Type.STRING },
                      instructions: { type: Type.STRING },
                    },
                  },
                },
                practicalProjects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      targetSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                      requirements: { type: Type.ARRAY, items: { type: Type.STRING } },
                      instructions: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = parseJsonFromGemini<Record<string, unknown>>(response.text, {});
        res.json({
          agent: 'Learning Planner Agent',
          gapSkillsTargeted: gapList,
          plan: parsed,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // AGENT 4 & 5: SKILL VERIFICATION ASSESSMENT GENERATOR
  // =========================================================================
  app.post(
    '/api/agents/assessment/generate',
    verifyFirebaseAuth,
    rateLimit(12, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { targetSkill, jobTitle } = req.body || {};
        if (!targetSkill || typeof targetSkill !== 'string') {
          res.status(400).json({ error: 'Target skill is required to generate an assessment.' });
          return;
        }

        const ai = getGenAIClient();
        const prompt = `You are the Assessment & Progress Agent for Chokma (CareerPilot).
Create a rigorous 5-question multiple-choice skill verification assessment for "${targetSkill}" tailored to a "${jobTitle || 'Software / Cloud Engineer'}" candidate.
Include 3 core technical questions and 2 practical troubleshooting/scenario questions.
Each question must have exactly 4 distinct options, a valid correctIndex (0-3), and a clear technical explanation.`;

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                timeLimitMinutes: { type: Type.NUMBER },
                questions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      type: { type: Type.STRING },
                      prompt: { type: Type.STRING },
                      options: { type: Type.ARRAY, items: { type: Type.STRING } },
                      correctIndex: { type: Type.INTEGER },
                      explanation: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const parsed = parseJsonFromGemini<Record<string, unknown>>(response.text, {});
        res.json({
          agent: 'Progress & Outcomes Agent',
          assessment: parsed,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // AGENT 5: PROGRESS & OUTCOMES — PRACTICAL PROJECT AI REVIEW
  // =========================================================================
  app.post(
    '/api/agents/project/review',
    verifyFirebaseAuth,
    rateLimit(10, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { title, description, requirements, targetSkills, githubRepoUrl, evidenceNotes } = req.body || {};
        if (!title || !evidenceNotes) {
          res.status(400).json({ error: 'Project title and implementation evidence notes are required.' });
          return;
        }

        const ai = getGenAIClient();
        const prompt = `You are the Progress & Outcomes Agent for Chokma (CareerPilot).
Review this student's practical project submission strictly based on the evidence provided. Never fabricate repo contents you cannot see.
Project Title: ${title}
Description: ${description || ''}
Requirements: ${JSON.stringify(requirements || [])}
Target Skills: ${JSON.stringify(targetSkills || [])}
Submitted GitHub URL: ${githubRepoUrl || 'Not provided'}
Student Evidence & Implementation Notes: ${String(evidenceNotes).slice(0, 2000)}

Provide:
- score (0 to 100 based strictly on completeness of evidence and alignment to requirements)
- evidenceSufficient (boolean: true if submission demonstrates concrete practical work >= 70)
- feedback (concise structured engineering critique: Strengths, Gaps to improve, Next step)`;

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                score: { type: Type.NUMBER },
                evidenceSufficient: { type: Type.BOOLEAN },
                feedback: { type: Type.STRING },
              },
            },
          },
        });

        const parsed = parseJsonFromGemini<Record<string, unknown>>(response.text, {
          score: 0,
          evidenceSufficient: false,
          feedback: 'Unable to parse structured review output. Please try submitting again.',
        });
        res.json({
          agent: 'Progress & Outcomes Agent',
          review: parsed,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // CENTRAL ORCHESTRATOR — MULTI-LANGUAGE CONTEXT-AWARE AI CAREER ASSISTANT
  // =========================================================================
  app.post(
    '/api/agents/chat',
    verifyFirebaseAuth,
    rateLimit(30, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { message, history, userContext, language } = req.body || {};
        if (!message || typeof message !== 'string' || !message.trim()) {
          res.status(400).json({ error: 'Message content is required.' });
          return;
        }

        const routed = classifyOrchestratorAgent(message);
        const ai = getGenAIClient();
        const langPreference =
          typeof language === 'string' && language.trim() && language !== 'Auto-Detect'
            ? `Respond clearly in ${language.trim()}.`
            : 'Automatically detect the language of the student message and respond in that same language.';

        const systemInstruction = `You are the Chokma (CareerPilot) Central Orchestrator delegating this turn to: ${routed.agentName} (${routed.agentRole}).

LANGUAGE INSTRUCTION:
${langPreference}

RESPONSE & GROUNDING RULES:
1. ALWAYS answer the student's question directly, thoroughly, and clearly — whether they ask about their career profile, target roles, coding, cloud/networking concepts, interview practice, resume feedback, study strategy, or general technology questions.
2. When referencing the student's profile, skills, selected jobs, courses, daily tasks, or applications, ground strictly in the live workspace data below.
3. Distinguish clearly between factual profile records, sample reference listings, and AI guidance.
4. NEVER falsely claim that you modified the database or submitted an external job application — instead tell the student which button or section in Chokma to use.
5. NEVER describe Job Match % or Learning Progress as a "hiring probability" or "placement probability".
6. Keep responses clean, structured, and easy to read (use concise paragraphs or bullet points).

AUTHENTICATED STUDENT CONTEXT:
${JSON.stringify(userContext || {}, null, 2).slice(0, 12000)}`;

        const contents = buildAlternatingChatContents(history, message);

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: contents as never,
          config: {
            systemInstruction,
          },
        });

        let rawReply = '';
        try {
          rawReply = (response.text || '').trim();
        } catch {
          rawReply = '';
        }
        if (!rawReply) {
          const fallbackParts = response.candidates?.[0]?.content?.parts ?? [];
          rawReply = fallbackParts
            .map((p) => (typeof p.text === 'string' ? p.text : ''))
            .join('\n')
            .trim();
        }

        const replyText =
          rawReply ||
          'I reviewed your Chokma workspace and question, but did not receive text output on this attempt. Please ask again or try a slightly more specific wording.';

        res.json({
          agentUsed: routed.agentName,
          reply: replyText,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // MULTI-LANGUAGE TEXT-TO-SPEECH (GEMINI 3.8 FLASH LITE TTS)
  // =========================================================================
  app.post(
    '/api/agents/tts',
    verifyFirebaseAuth,
    rateLimit(25, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { text, voiceName, language } = req.body || {};
        if (!text || typeof text !== 'string' || !text.trim()) {
          res.status(400).json({ error: 'Text is required for speech synthesis.' });
          return;
        }
        const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
        const safeVoice = allowedVoices.has(voiceName) ? voiceName : 'Zephyr';
        const cleanText = text.replace(/[#*`_]/g, '').trim().slice(0, 1500);

        const ai = getGenAIClient();
        const response = await generateContentResilient(
          ai,
          {
            model: 'gemini-3.8-flash-lite-tts',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: cleanText,
                    speechMetadata: {
                      style: `Warm, clear, articulate career mentor${language && language !== 'Auto-Detect' ? ` speaking natural ${language}` : ''}`,
                    },
                  },
                ],
              },
            ],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: safeVoice },
                },
              },
            },
          },
          []
        );

        let base64Audio = '';
        let audioMime = '';
        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            base64Audio = part.inlineData.data;
            audioMime = part.inlineData.mimeType || '';
            break;
          }
        }
        if (!base64Audio) {
          res.status(502).json({ error: 'Speech synthesis did not return audio.' });
          return;
        }

        const audioBuf = Buffer.from(base64Audio, 'base64');
        const hasRiffHeader = audioBuf.length >= 4 && audioBuf.subarray(0, 4).toString('ascii') === 'RIFF';

        let finalDataUrl = '';
        if (hasRiffHeader || audioMime.includes('wav')) {
          finalDataUrl = `data:audio/wav;base64,${base64Audio}`;
        } else if (audioMime.includes('mpeg') || audioMime.includes('mp3')) {
          finalDataUrl = `data:${audioMime};base64,${base64Audio}`;
        } else {
          // Wrap raw 24kHz 16-bit mono PCM in a standard 44-byte RIFF/WAV header
          const sampleRate = 24000;
          const numChannels = 1;
          const bitsPerSample = 16;
          const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
          const blockAlign = (numChannels * bitsPerSample) / 8;
          const wavHeader = Buffer.alloc(44);
          wavHeader.write('RIFF', 0);
          wavHeader.writeUInt32LE(36 + audioBuf.length, 4);
          wavHeader.write('WAVE', 8);
          wavHeader.write('fmt ', 12);
          wavHeader.writeUInt32LE(16, 16);
          wavHeader.writeUInt16LE(1, 20);
          wavHeader.writeUInt16LE(numChannels, 22);
          wavHeader.writeUInt32LE(sampleRate, 24);
          wavHeader.writeUInt32LE(byteRate, 28);
          wavHeader.writeUInt16LE(blockAlign, 32);
          wavHeader.writeUInt16LE(bitsPerSample, 34);
          wavHeader.write('data', 36);
          wavHeader.writeUInt32LE(audioBuf.length, 40);
          const wavBuf = Buffer.concat([wavHeader, audioBuf]);
          finalDataUrl = `data:audio/wav;base64,${wavBuf.toString('base64')}`;
        }

        res.json({
          audioDataUrl: finalDataUrl,
          voiceName: safeVoice,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // MULTI-LANGUAGE AUDIO TRANSCRIPTION (GEMINI 3.5 TRANSCRIBE)
  // =========================================================================
  app.post(
    '/api/agents/transcribe',
    verifyFirebaseAuth,
    rateLimit(25, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { audioBase64, mimeType, language } = req.body || {};
        if (!audioBase64 || typeof audioBase64 !== 'string') {
          res.status(400).json({ error: 'Audio recording data is required.' });
          return;
        }
        if (audioBase64.length > 6_000_000) {
          res.status(413).json({ error: 'Audio recording is too large. Please keep voice clips under 45 seconds.' });
          return;
        }

        const safeMime =
          typeof mimeType === 'string' && mimeType.startsWith('audio/')
            ? mimeType.split(';')[0]
            : 'audio/webm';

        const ai = getGenAIClient();
        const langHint =
          typeof language === 'string' && language !== 'Auto-Detect'
            ? ` The speaker is likely speaking ${language}.`
            : ' Detect the spoken language automatically.';

        const response = await generateContentResilient(
          ai,
          {
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: safeMime,
                    data: audioBase64,
                  },
                },
                {
                  text: `Transcribe the spoken audio accurately in its original language. Return only the clean transcript text without commentary.${langHint}`,
                },
              ],
            },
          },
          [MODEL_NAME]
        );

        const transcript = (response.text || '').trim();
        res.json({ transcript });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // REAL-WORLD JOB & COMPANY HIRING SEARCH (GOOGLE SEARCH GROUNDING)
  // =========================================================================
  app.post(
    '/api/agents/jobs/search',
    verifyFirebaseAuth,
    rateLimit(15, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { query, company, location, jobType } = req.body || {};
        const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 160) : '';
        const cleanCompany = typeof company === 'string' ? company.trim().slice(0, 80) : '';
        const cleanLocation = typeof location === 'string' ? location.trim().slice(0, 80) : 'India / Remote';
        const cleanType = typeof jobType === 'string' ? jobType.trim().slice(0, 40) : 'Full-time or Internship';

        if (!cleanQuery && !cleanCompany) {
          res.status(400).json({ error: 'Enter a job role, skill, or company name to search.' });
          return;
        }

        const ai = getGenAIClient();
        const searchPrompt = `Use Google Search to find current, real-world job openings, hiring availability, and official career portal details matching:
Role / Keywords: ${cleanQuery || 'Software Engineer / Cloud Engineer'}
Company Focus: ${cleanCompany || 'Top tech employers (Amazon, Google, Microsoft, Deloitte, IBM, TCS, Infosys, startups)'}
Location: ${cleanLocation}
Role Type: ${cleanType}

Return ONLY a clean JSON object (inside a \`\`\`json code block) with the exact shape:
{
  "hiringOverview": "2-3 sentence factual summary of current real-world hiring availability and career portal activity based strictly on Google Search results.",
  "openings": [
    {
      "title": "Exact or typical active role title",
      "company": "Company Name",
      "location": "City, Country or Remote",
      "workMode": "Remote | Hybrid | On-site",
      "jobType": "Full-time | Internship",
      "availabilityStatus": "Actively Hiring | Career Portal Open | Campus / Early-Career Window",
      "summary": "1-2 concise factual sentences about the role focus and eligibility.",
      "keySkills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4"],
      "careerUrl": "Official company career page URL found in search results"
    }
  ]
}
Include 4 to 6 real-world roles grounded in search results. Never fabricate private salaries or guarantee hiring outcomes.`;

        // Google Search grounding strictly uses gemini-4-hydrogen with { googleSearch: {} }
        // Do NOT set responseMimeType or responseSchema when using googleSearch grounding.
        const response = await generateContentResilient(
          ai,
          {
            model: MODEL_NAME,
            contents: searchPrompt,
            config: {
              tools: [{ googleSearch: {} }],
            },
          },
          []
        );

        const rawText = (response.text || '').trim();
        const parsed = parseJsonFromGemini<{
          hiringOverview?: string;
          openings?: Array<{
            title?: string;
            company?: string;
            location?: string;
            workMode?: string;
            jobType?: string;
            availabilityStatus?: string;
            summary?: string;
            keySkills?: string[];
            careerUrl?: string;
          }>;
        }>(rawText, {
          hiringOverview: rawText.slice(0, 600),
          openings: [],
        });

        // Extract verified web grounding sources from Google Search metadata
        const rawChunks =
          (response.candidates?.[0]?.groundingMetadata?.groundingChunks as Array<{
            web?: { uri?: string; title?: string };
          }>) || [];
        const seenUris = new Set<string>();
        const sources: Array<{ title: string; uri: string }> = [];
        for (const chunk of rawChunks) {
          const uri = chunk?.web?.uri?.trim();
          const title = chunk?.web?.title?.trim() || uri || 'Official Web Source';
          if (uri && /^https?:\/\//i.test(uri) && !seenUris.has(uri)) {
            seenUris.add(uri);
            sources.push({ title: title.slice(0, 120), uri });
          }
        }

        const safeOpenings = Array.isArray(parsed.openings)
          ? parsed.openings.slice(0, 6).map((item, idx) => ({
              id: `live_${Date.now()}_${idx}`,
              title: String(item.title || cleanQuery || 'Engineering Role').slice(0, 120),
              company: String(item.company || cleanCompany || 'Employer').slice(0, 80),
              location: String(item.location || cleanLocation).slice(0, 80),
              workMode:
                item.workMode === 'Remote' || item.workMode === 'Hybrid' || item.workMode === 'On-site'
                  ? item.workMode
                  : 'Hybrid',
              jobType: item.jobType === 'Internship' ? 'Internship' : 'Full-time',
              availabilityStatus: String(item.availabilityStatus || 'Career Portal Open').slice(0, 60),
              summary: String(item.summary || '').slice(0, 320),
              keySkills: Array.isArray(item.keySkills)
                ? item.keySkills.map((s) => String(s).trim()).filter(Boolean).slice(0, 6)
                : [],
              careerUrl:
                typeof item.careerUrl === 'string' && /^https?:\/\//i.test(item.careerUrl.trim())
                  ? item.careerUrl.trim()
                  : sources[idx]?.uri || sources[0]?.uri || '',
            }))
          : [];

        res.json({
          agent: 'Job Intelligence Agent (Google Search)',
          hiringOverview:
            (typeof parsed.hiringOverview === 'string' && parsed.hiringOverview.trim()) ||
            'Live hiring results retrieved via Google Search grounding.',
          openings: safeOpenings,
          sources: sources.slice(0, 10),
          searchedAt: new Date().toISOString(),
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // AI PICTORIAL VISUAL ROADMAP CREATOR & PROMPT EDITOR (GEMINI 4 HYDROGEN)
  // =========================================================================
  app.post(
    '/api/agents/roadmap/pictorial',
    verifyFirebaseAuth,
    rateLimit(15, 60_000),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          jobTitle,
          company,
          careerGoal,
          selectedSkills,
          visualStyle,
          customPrompt,
          editPrompt,
          currentBlueprint,
          milestones,
          missingSkills,
          matchScore,
        } = req.body || {};
        const roleLabel =
          typeof jobTitle === 'string' && jobTitle.trim()
            ? jobTitle.trim()
            : 'Cloud & Software Engineer';
        const goalLabel =
          typeof careerGoal === 'string' && careerGoal.trim()
            ? careerGoal.trim().slice(0, 260)
            : `Become job-ready for ${roleLabel} at ${company || 'Top Tech Employer'}`;
        const chosenSkills = Array.isArray(selectedSkills)
          ? selectedSkills.map((s) => String(s).trim()).filter(Boolean).slice(0, 10)
          : [];
        const gapSkills = Array.isArray(missingSkills)
          ? missingSkills.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
          : [];
        const isEditMode = typeof editPrompt === 'string' && editPrompt.trim().length > 0 && currentBlueprint;

        const ai = getGenAIClient();
        const prompt = isEditMode
          ? `You are a Visual Career Infographic Architect & Image Editor for Chokma.
EDIT the existing pictorial roadmap visual blueprint strictly according to the user's edit instruction while keeping unchanged parts coherent and publication-grade.

USER EDIT INSTRUCTION:
"${editPrompt.trim().slice(0, 400)}"

CURRENT ROADMAP BLUEPRINT:
${JSON.stringify(currentBlueprint).slice(0, 6000)}

Return the UPDATED visual journey blueprint JSON.
- Choose recommendedTheme from: "editorial", "midnight", "timeline", "emerald".
- Choose accentHex from crisp professional colors (e.g., "#4338CA", "#059669", "#D97706", "#0284C7", "#7C3AED").
- Choose each station icon from: "cloud", "terminal", "network", "shield", "code", "database", "rocket", "award".
- Keep 4 to 6 ordered stations, crisp titles (3-6 words), sharp captions (under 65 chars), and concrete deliverables.`
          : `You are a Visual Career Infographic Architect for Chokma.
Design a crisp, motivating 5-to-6-station pictorial visual roadmap poster specifically tailored to this student's skills, career goal, and creative prompt:
Career Goal: ${goalLabel}
Target Role: ${roleLabel} at ${company || 'Top Tech Employer'}
Selected Focus Skills: ${JSON.stringify(chosenSkills.length > 0 ? chosenSkills : gapSkills)}
Current Match Score: ${Number(matchScore) || 0}%
Requested Visual Poster Style: ${typeof visualStyle === 'string' ? visualStyle : 'editorial'}
${typeof customPrompt === 'string' && customPrompt.trim() ? `Custom Creative Prompt: "${customPrompt.trim().slice(0, 400)}"` : ''}
Existing Roadmap Milestones: ${JSON.stringify(Array.isArray(milestones) ? milestones.slice(0, 6) : [])}

Return a structured visual journey blueprint with 5 or 6 ordered milestone stations covering the selected focus skills and leading directly to the career goal.
- Choose recommendedTheme from: "editorial", "midnight", "timeline", "emerald".
- Choose accentHex from crisp professional colors (e.g., "#4338CA", "#059669", "#D97706", "#0284C7", "#7C3AED").
- For each station, choose the best visual icon from: "cloud", "terminal", "network", "shield", "code", "database", "rocket", "award".
- Keep titles concise (3-6 words), captions sharp (under 65 characters), and deliverables concrete so the rendered pictorial roadmap PNG looks publication-grade.`;

        const response = await generateContentResilient(ai, {
          model: MODEL_NAME,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                estimatedWeeks: { type: Type.NUMBER },
                recommendedTheme: { type: Type.STRING },
                accentHex: { type: Type.STRING },
                stations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      step: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      skill: { type: Type.STRING },
                      icon: { type: Type.STRING },
                      duration: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      deliverable: { type: Type.STRING },
                    },
                  },
                },
              },
            },
          },
        });

        const blueprint = parseJsonFromGemini<Record<string, unknown>>(response.text, {});
        res.json({
          agent: isEditMode ? 'Visual Roadmap Editor' : 'Learning Planner Agent',
          blueprint,
        });
      } catch (err) {
        const formatted = formatGeminiError(err);
        res.status(formatted.status).json({ error: formatted.message });
      }
    }
  );

  // =========================================================================
  // VITE DEV MIDDLEWARE OR STATIC DIST SERVING
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // =========================================================================
  // HTTP SERVER + GEMINI 3.8 LIVE REAL-TIME VOICE & CAMERA WEBSOCKET (/api/live)
  // =========================================================================
  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

  httpServer.on('upgrade', (request, socket, head) => {
    const urlPath = (request.url || '').split('?')[0];
    if (urlPath === '/api/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let isAuthenticated = false;
    let isClosing = false;

    const safeSend = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;
      try {
        liveSession?.close();
      } catch {
        // Ignore close errors on teardown
      }
      liveSession = null;
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type?: string;
          token?: string;
          language?: string;
          voiceName?: string;
          coachingMode?: string;
          cameraEnabled?: boolean;
          userContext?: Record<string, unknown>;
          data?: string;
          text?: string;
        };

        // Step 1: Authenticate session & connect to Gemini 3.8 Live
        if (msg.type === 'init') {
          if (isAuthenticated) return;
          const token = typeof msg.token === 'string' ? msg.token.trim() : '';
          if (!token) {
            safeSend({ type: 'error', message: 'Authentication required to start a live session.' });
            clientWs.close();
            return;
          }

          if (token.startsWith(LOCAL_TOKEN_PREFIX)) {
            const localSession = verifyLocalSessionToken(token);
            if (!localSession) {
              safeSend({ type: 'error', message: 'Session token expired. Please sign in again.' });
              clientWs.close();
              return;
            }
          } else {
            if (!firebaseProjectId || !getApps().length) {
              safeSend({ type: 'error', message: 'Authentication required to start a live session.' });
              clientWs.close();
              return;
            }
            try {
              await getAdminAuth().verifyIdToken(token);
            } catch {
              safeSend({ type: 'error', message: 'Session token expired. Please refresh and sign in again.' });
              clientWs.close();
              return;
            }
          }

          isAuthenticated = true;
          const allowedVoices = new Set(['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr']);
          const safeVoice = msg.voiceName && allowedVoices.has(msg.voiceName) ? msg.voiceName : 'Zephyr';
          const langPref =
            msg.language && msg.language !== 'Auto-Detect'
              ? `Speak naturally, warmly, and clearly in ${msg.language}.`
              : 'Automatically detect whatever language the student speaks (English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi, Spanish, French, German, Japanese, etc.) and reply naturally in that exact same language.';

          const camNote = msg.cameraEnabled
            ? 'You can see the student live through their webcam video stream (1 FPS). Acknowledge visual cues naturally when relevant (e.g., notes, diagrams, whiteboard sketches, or interview eye contact and posture).'
            : 'This is a real-time hands-free voice coaching conversation.';

          const modeMap: Record<string, string> = {
            mentor:
              'SESSION MODE: Open Career & Technical Mentor. Answer every question clearly, give actionable next steps grounded in their workspace, and keep spoken responses concise and conversational.',
            interview:
              'SESSION MODE: Live Face-to-Face Mock Interviewer. Conduct a realistic technical & behavioral interview tailored to their selected target job. Ask one focused question at a time, listen to their answer, give brief constructive feedback on clarity/accuracy, and move to the next question.',
            project:
              'SESSION MODE: Project & Resume Defense Coach. Help the student explain their engineering projects, architecture decisions, and diagrams clearly. Ask probing follow-up questions like a hiring manager.',
            communication:
              'SESSION MODE: Multi-Language Communication & Confidence Coach. Help the student practice clear, structured technical explanations and interview answers in their chosen language, gently refining phrasing and pacing.',
          };
          const coachingGuidance =
            modeMap[typeof msg.coachingMode === 'string' ? msg.coachingMode : 'mentor'] || modeMap.mentor;

          const systemInstruction = `You are Chokma Live — a real-time face-to-face AI career mentor, technical tutor, and mock interviewer powered by Google Gemini.
${langPref}
${camNote}
${coachingGuidance}
Keep spoken turns natural, engaging, and concise (2-5 sentences unless the student asks for a deep explanation) so the conversation feels truly interactive.
Ground career advice in their live Chokma workspace context below:
${JSON.stringify(msg.userContext || {}).slice(0, 6000)}`;

          const ai = getGenAIClient();
          const session = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: safeVoice } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onmessage: (liveMsg: LiveServerMessage) => {
                const content = liveMsg.serverContent;
                if (content?.inputTranscription?.text) {
                  safeSend({ type: 'inputTranscript', text: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  safeSend({ type: 'outputTranscript', text: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    safeSend({ type: 'audio', data: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  safeSend({ type: 'interrupted' });
                }
                if (content?.turnComplete) {
                  safeSend({ type: 'turnComplete' });
                }
              },
              onerror: (err: unknown) => {
                const formatted = formatGeminiError(err);
                safeSend({ type: 'error', message: formatted.message });
              },
              onclose: () => {
                safeSend({ type: 'closed' });
              },
            },
          });

          if (isClosing || clientWs.readyState !== WebSocket.OPEN) {
            try {
              session.close();
            } catch {
              // ignore
            }
            return;
          }

          liveSession = session;
          safeSend({ type: 'ready', voiceName: safeVoice });
          return;
        }

        if (!isAuthenticated || !liveSession) return;

        if (msg.type === 'audio' && typeof msg.data === 'string') {
          liveSession.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'video' && typeof msg.data === 'string') {
          liveSession.sendRealtimeInput({
            video: { data: msg.data, mimeType: 'image/jpeg' },
          });
        } else if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim()) {
          liveSession.sendRealtimeInput({
            text: msg.text.trim().slice(0, 1500),
          });
        }
      } catch (err) {
        const formatted = formatGeminiError(err);
        safeSend({ type: 'error', message: formatted.message });
      }
    });
  });

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Chokma CareerPilot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
