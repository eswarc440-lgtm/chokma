import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  generatePictorialRoadmapWithAgent,
  PictorialRoadmapBlueprint,
} from '../services/api';
import { CandidateSkill, RoadmapItem, SelectedJob, UserProfile } from '../types';
import { Button, FieldLabel, Input, Surface } from './ui/Primitives';

export type PictorialTheme = 'editorial' | 'midnight' | 'timeline' | 'emerald';

interface RoadmapPictorialProps {
  selectedJob: SelectedJob | null;
  roadmapItems: RoadmapItem[];
  profile?: UserProfile | null;
  skills?: CandidateSkill[];
}

const THEME_OPTIONS: Array<{ id: PictorialTheme; label: string }> = [
  { id: 'editorial', label: 'Editorial Blueprint' },
  { id: 'midnight', label: 'Midnight Studio' },
  { id: 'timeline', label: 'Milestone Timeline' },
  { id: 'emerald', label: 'Emerald Horizon' },
];

const ACCENT_SWATCHES = [
  { hex: '#4338CA', label: 'Indigo' },
  { hex: '#059669', label: 'Emerald' },
  { hex: '#0284C7', label: 'Ocean' },
  { hex: '#D97706', label: 'Amber' },
  { hex: '#7C3AED', label: 'Violet' },
];

const QUICK_EDIT_PROMPTS = [
  'Switch to Midnight Studio & highlight AWS Certification milestone',
  'Add a Docker & Kubernetes deployment phase with hands-on deliverable',
  'Make station titles shorter and focus on technical interview prep',
  'Switch to Emerald Horizon with crisp beginner-to-advanced pacing',
];

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length <= maxChars) {
      current = (current + ' ' + w).trim();
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current.length > maxChars ? current.slice(0, maxChars - 1) + '…' : current);
  }
  return lines;
}

function getIconPaths(icon: string): string {
  switch (icon) {
    case 'cloud':
      return '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
    case 'terminal':
      return '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>';
    case 'network':
      return '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>';
    case 'shield':
      return '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>';
    case 'database':
      return '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>';
    case 'rocket':
      return '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>';
    case 'award':
      return '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>';
    default:
      return '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>';
  }
}

function guessIconForSkill(skill: string): string {
  const s = (skill || '').toLowerCase();
  if (s.includes('aws') || s.includes('cloud') || s.includes('azure') || s.includes('gcp')) return 'cloud';
  if (s.includes('linux') || s.includes('bash') || s.includes('docker') || s.includes('kuber')) return 'terminal';
  if (s.includes('tcp') || s.includes('dns') || s.includes('network')) return 'network';
  if (s.includes('iam') || s.includes('sec') || s.includes('auth')) return 'shield';
  if (s.includes('sql') || s.includes('data') || s.includes('mongo') || s.includes('postgres')) return 'database';
  return 'code';
}

function buildPictorialSvg(
  blueprint: PictorialRoadmapBlueprint,
  statusBySkill: Map<string, 'not_started' | 'in_progress' | 'completed'>,
  companyName: string,
  overallPct: number,
  theme: PictorialTheme,
  accentHex: string,
  careerGoalText: string,
  selectedSkills: string[]
): string {
  const isDark = theme === 'midnight';
  const isTimeline = theme === 'timeline';
  const isEmerald = theme === 'emerald';
  const W = 1280;
  const stations = (blueprint.stations || []).slice(0, 6);
  const count = Math.max(1, stations.length);
  const H = isTimeline ? 680 : count > 3 ? 720 : 490;
  const primaryAccent = /^#[0-9A-Fa-f]{6}$/.test(accentHex) ? accentHex : '#4338CA';

  const palette = isDark
    ? {
        bgStart: '#0B1120',
        bgEnd: '#0F172A',
        gridDot: '#1E293B',
        headerBg: '#111827',
        headerBorder: '#1F2937',
        title: '#F8FAFC',
        subtitle: '#94A3B8',
        cardBg: '#111827',
        cardBorder: '#1F2937',
        cardTitle: '#F8FAFC',
        cardText: '#CBD5E1',
        cardMuted: '#94A3B8',
        routeBase: '#1E293B',
        routeAccent: primaryAccent,
        accentText: primaryAccent === '#4338CA' ? '#818CF8' : primaryAccent,
        footerText: '#64748B',
      }
    : isEmerald
    ? {
        bgStart: '#ECFDF5',
        bgEnd: '#F0FDF4',
        gridDot: '#A7F3D0',
        headerBg: '#FFFFFF',
        headerBorder: '#D1FAE5',
        title: '#064E3B',
        subtitle: '#047857',
        cardBg: '#FFFFFF',
        cardBorder: '#D1FAE5',
        cardTitle: '#064E3B',
        cardText: '#334155',
        cardMuted: '#475569',
        routeBase: '#D1FAE5',
        routeAccent: primaryAccent === '#4338CA' ? '#059669' : primaryAccent,
        accentText: primaryAccent === '#4338CA' ? '#059669' : primaryAccent,
        footerText: '#047857',
      }
    : {
        bgStart: '#F8FAFC',
        bgEnd: '#EEF2FF',
        gridDot: '#CBD5E1',
        headerBg: '#FFFFFF',
        headerBorder: '#E2E8F0',
        title: '#0F172A',
        subtitle: '#475569',
        cardBg: '#FFFFFF',
        cardBorder: '#E2E8F0',
        cardTitle: '#0F172A',
        cardText: '#475569',
        cardMuted: '#64748B',
        routeBase: '#E2E8F0',
        routeAccent: primaryAccent,
        accentText: primaryAccent,
        footerText: '#64748B',
      };

  const goalShort =
    careerGoalText.length > 86 ? `${careerGoalText.slice(0, 85)}…` : careerGoalText;
  const skillsLine =
    selectedSkills.length > 0
      ? `Focus skills: ${selectedSkills.slice(0, 6).join(' · ')}`
      : `Target employer: ${companyName}`;

  if (isTimeline) {
    const colW = Math.floor((W - 96 - (Math.min(count, 3) - 1) * 24) / Math.min(count, 3));
    const cardsMarkup = stations
      .map((st, idx) => {
        const col = idx % 3;
        const row = Math.floor(idx / 3);
        const x = 48 + col * (colW + 24);
        const y = 176 + row * 230;
        const status = statusBySkill.get((st.skill || '').toLowerCase()) || 'not_started';
        const isDone = status === 'completed';
        const isProg = status === 'in_progress';
        const accent = isDone ? '#15803D' : isProg ? primaryAccent : '#64748B';
        const badgeBg = isDone ? '#DCFCE7' : isProg ? '#E0E7FF' : '#F1F5F9';
        const statusText = isDone ? 'Completed' : isProg ? 'In Progress' : 'Planned';
        const titleLines = wrapLines(st.title, 28, 2);
        const capLines = wrapLines(st.caption || st.deliverable || '', 42, 2);
        const delivShort =
          (st.deliverable || '').length > 44
            ? `${(st.deliverable || '').slice(0, 43)}…`
            : st.deliverable || 'Verified hands-on milestone';

        return `
        <g>
          <rect x="${x}" y="${y}" width="${colW}" height="198" rx="14" fill="#FFFFFF" stroke="${isDone ? '#86EFAC' : isProg ? primaryAccent : '#E2E8F0'}" stroke-width="1.5"/>
          <rect x="${x}" y="${y}" width="${colW}" height="6" rx="3" fill="${accent}"/>
          <circle cx="${x + 30}" cy="${y + 38}" r="16" fill="${badgeBg}"/>
          <g transform="translate(${x + 20}, ${y + 28}) scale(0.84)" fill="none" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${getIconPaths(st.icon)}
          </g>
          <text x="${x + 56}" y="${y + 34}" fill="${accent}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="700">PHASE 0${idx + 1} · ${escapeXml(st.skill)}</text>
          <text x="${x + 56}" y="${y + 50}" fill="#64748B" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11">${escapeXml(st.duration || '6 hrs')} · ${statusText}</text>
          ${titleLines
            .map(
              (line, li) =>
                `<text x="${x + 20}" y="${y + 84 + li * 20}" fill="#0F172A" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="15" font-weight="700">${escapeXml(line)}</text>`
            )
            .join('')}
          ${capLines
            .map(
              (line, li) =>
                `<text x="${x + 20}" y="${y + 126 + li * 16}" fill="#475569" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5">${escapeXml(line)}</text>`
            )
            .join('')}
          <line x1="${x + 20}" y1="${y + 164}" x2="${x + colW - 20}" y2="${y + 164}" stroke="#F1F5F9" stroke-width="1"/>
          <text x="${x + 20}" y="${y + 183}" fill="#334155" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="600">Outcome: ${escapeXml(delivShort)}</text>
        </g>`;
      })
      .join('\n');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#F8FAFC"/>
      <rect x="48" y="28" width="${W - 96}" height="118" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1.5"/>
      <text x="74" y="60" fill="${primaryAccent}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12" font-weight="700">CHOKMA CAREER TIMELINE · ${escapeXml(companyName.toUpperCase())}</text>
      <text x="74" y="90" fill="#0F172A" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="25" font-weight="700">${escapeXml(blueprint.headline || 'Career Roadmap')}</text>
      <text x="74" y="114" fill="#475569" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12.5">${escapeXml(goalShort)}</text>
      <text x="74" y="133" fill="#64748B" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5">${escapeXml(skillsLine)}</text>
      <rect x="${W - 266}" y="52" width="194" height="68" rx="12" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="${W - 246}" y="76" fill="#64748B" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="600">AUTO-TRACKED</text>
      <text x="${W - 246}" y="106" fill="#0F172A" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="24" font-weight="700">${overallPct}%</text>
      <text x="${W - 180}" y="104" fill="${primaryAccent}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12" font-weight="600">~${blueprint.estimatedWeeks || 4} wks</text>
      ${cardsMarkup}
      <text x="48" y="${H - 18}" fill="#64748B" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5">Chokma Visual Career Roadmap · Auto-synced with courses, daily sessions &amp; skill verification assessments.</text>
    </svg>`;
  }

  // Winding pictorial route (Editorial Blueprint, Midnight Studio, or Emerald Horizon)
  const positions: Array<{ x: number; y: number }> = [
    { x: 215, y: 268 },
    { x: 640, y: 268 },
    { x: 1065, y: 268 },
    { x: 1065, y: 525 },
    { x: 640, y: 525 },
    { x: 215, y: 525 },
  ].slice(0, count);

  let routePath = '';
  if (positions.length >= 2) {
    routePath = `M ${positions[0].x} ${positions[0].y}`;
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (prev.y === curr.y) {
        routePath += ` L ${curr.x} ${curr.y}`;
      } else {
        routePath += ` C ${prev.x + 125} ${prev.y}, ${curr.x + 125} ${curr.y}, ${curr.x} ${curr.y}`;
      }
    }
  }

  const nodesMarkup = stations
    .map((st, idx) => {
      const pos = positions[idx];
      const status = statusBySkill.get((st.skill || '').toLowerCase()) || 'not_started';
      const isDone = status === 'completed';
      const isProg = status === 'in_progress';

      const accent = isDone ? '#16A34A' : isProg ? palette.routeAccent : isDark ? '#475569' : '#64748B';
      const nodeRing = isDone
        ? isDark
          ? '#052E16'
          : '#DCFCE7'
        : isProg
        ? isDark
          ? '#1E1B4B'
          : '#E0E7FF'
        : isDark
        ? '#1E293B'
        : '#F1F5F9';
      const statusLabel = isDone ? 'Completed' : isProg ? 'In Progress' : 'Up Next';

      const cardW = 344;
      const cardH = 148;
      const cardX = pos.x - cardW / 2;
      const cardY = pos.y + 42;
      const titleLines = wrapLines(st.title, 28, 2);
      const captionLines = wrapLines(st.caption || st.deliverable || '', 42, 2);

      return `
      <g>
        <circle cx="${pos.x}" cy="${pos.y}" r="30" fill="${nodeRing}" stroke="${accent}" stroke-width="2.5"/>
        <circle cx="${pos.x}" cy="${pos.y}" r="22" fill="${accent}"/>
        <g transform="translate(${pos.x - 10}, ${pos.y - 10}) scale(0.84)" fill="none" stroke="#FFFFFF" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          ${getIconPaths(st.icon)}
        </g>
        <rect x="${pos.x + 15}" y="${pos.y - 31}" width="26" height="20" rx="6" fill="${isDark ? '#F8FAFC' : '#0F172A'}"/>
        <text x="${pos.x + 28}" y="${pos.y - 17}" text-anchor="middle" fill="${isDark ? '#0F172A' : '#FFFFFF'}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="10.5" font-weight="700">0${idx + 1}</text>

        <rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${palette.cardBg}" stroke="${isDone ? '#22C55E' : isProg ? palette.routeAccent : palette.cardBorder}" stroke-width="1.5"/>
        <text x="${cardX + 18}" y="${cardY + 25}" fill="${accent}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5" font-weight="700">${escapeXml(st.skill)} · ${escapeXml(st.duration || '6 hrs')}</text>
        <text x="${cardX + cardW - 18}" y="${cardY + 25}" text-anchor="end" fill="${accent}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="600">${statusLabel}</text>
        ${titleLines
          .map(
            (line, li) =>
              `<text x="${cardX + 18}" y="${cardY + 50 + li * 19}" fill="${palette.cardTitle}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="14.5" font-weight="700">${escapeXml(line)}</text>`
          )
          .join('')}
        ${captionLines
          .map(
            (line, li) =>
              `<text x="${cardX + 18}" y="${cardY + 95 + li * 16}" fill="${palette.cardText}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5">${escapeXml(line)}</text>`
          )
          .join('')}
      </g>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bgStart}"/>
      <stop offset="100%" stop-color="${palette.bgEnd}"/>
    </linearGradient>
    <pattern id="dotGrid" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.15" fill="${palette.gridDot}" opacity="${isDark ? '0.65' : '0.55'}"/>
    </pattern>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <rect width="${W}" height="${H}" fill="url(#dotGrid)"/>

  <!-- Header Banner -->
  <rect x="48" y="28" width="${W - 96}" height="128" rx="16" fill="${palette.headerBg}" stroke="${palette.headerBorder}" stroke-width="1.5"/>
  <text x="74" y="60" fill="${palette.accentText}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5" font-weight="700" letter-spacing="0.06em">CHOKMA PICTORIAL CAREER ROADMAP · ${escapeXml(companyName.toUpperCase())}</text>
  <text x="74" y="92" fill="${palette.title}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="25" font-weight="700">${escapeXml(blueprint.headline || 'Career Readiness Roadmap')}</text>
  <text x="74" y="116" fill="${palette.subtitle}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12.5">${escapeXml(goalShort)}</text>
  <text x="74" y="138" fill="${palette.cardMuted}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5">${escapeXml(skillsLine)}</text>

  <!-- Right-side Progress Metric Box -->
  <rect x="${W - 270}" y="54" width="198" height="74" rx="12" fill="${isDark ? '#0B1120' : '#F8FAFC'}" stroke="${palette.headerBorder}"/>
  <text x="${W - 250}" y="80" fill="${palette.cardMuted}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11" font-weight="600">AUTO-TRACKED PROGRESS</text>
  <text x="${W - 250}" y="111" fill="${palette.title}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="25" font-weight="700">${overallPct}%</text>
  <text x="${W - 180}" y="109" fill="${palette.accentText}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="12" font-weight="600">~${blueprint.estimatedWeeks || 4} wks</text>

  <!-- Winding Roadmap Track -->
  ${
    routePath
      ? `<path d="${routePath}" fill="none" stroke="${palette.routeBase}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="${routePath}" fill="none" stroke="${palette.routeAccent}" stroke-width="3.5" stroke-dasharray="9 9" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`
      : ''
  }

  <!-- Pictorial Milestone Stations -->
  ${nodesMarkup}

  <!-- Footer -->
  <text x="48" y="${H - 18}" fill="${palette.footerText}" font-family="Plus Jakarta Sans, system-ui, sans-serif" font-size="11.5" font-weight="500">Generated by Chokma Gemini Roadmap Studio · Progress syncs automatically from video courses, daily sessions &amp; assessments.</text>
</svg>`;
}

export function RoadmapPictorial({
  selectedJob,
  roadmapItems,
  profile,
  skills = [],
}: RoadmapPictorialProps) {
  const [blueprint, setBlueprint] = useState<PictorialRoadmapBlueprint | null>(null);
  const [historyStack, setHistoryStack] = useState<
    Array<{ blueprint: PictorialRoadmapBlueprint | null; theme: PictorialTheme; accentHex: string }>
  >([]);
  const [generating, setGenerating] = useState(false);
  const [pngUrl, setPngUrl] = useState<string>('');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [theme, setTheme] = useState<PictorialTheme>('editorial');
  const [accentHex, setAccentHex] = useState<string>('#4338CA');
  const [promptMode, setPromptMode] = useState<'edit' | 'create'>('edit');
  const [promptText, setPromptText] = useState('');
  const [customGoal, setCustomGoal] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [newSkillText, setNewSkillText] = useState('');
  const lastJobIdRef = useRef<string | null>(null);

  const availableSkills = useMemo(() => {
    const set = new Set<string>();
    roadmapItems.forEach((r) => r.targetSkill && set.add(r.targetSkill));
    (selectedJob?.missingSkills || []).forEach((s) => set.add(s));
    (selectedJob?.partialSkills || []).forEach((s) => set.add(s));
    (selectedJob?.unverifiedSkills || []).forEach((s) => set.add(s));
    skills.forEach((s) => s.name && set.add(s.name));
    if (set.size === 0) {
      ['Linux', 'AWS Fundamentals', 'IAM', 'TCP/IP', 'Docker', 'Python'].forEach((s) => set.add(s));
    }
    return Array.from(set).slice(0, 14);
  }, [roadmapItems, selectedJob, skills]);

  useEffect(() => {
    if (selectedJob?.id !== lastJobIdRef.current) {
      lastJobIdRef.current = selectedJob?.id || null;
      setBlueprint(null);
      setHistoryStack([]);
    }
    if (!customGoal) {
      const defaultGoal = selectedJob
        ? `Become job-ready for ${selectedJob.jobTitle} at ${selectedJob.company}`
        : profile?.careerObjective || 'Master high-demand engineering skills for my target tech role';
      setCustomGoal(defaultGoal);
    }
  }, [selectedJob, profile?.careerObjective, customGoal]);

  useEffect(() => {
    if (selectedSkills.length === 0 && availableSkills.length > 0) {
      setSelectedSkills(availableSkills.slice(0, 5));
    }
  }, [availableSkills, selectedSkills.length]);

  const effectiveGoal =
    customGoal.trim() ||
    (selectedJob
      ? `Become job-ready for ${selectedJob.jobTitle} at ${selectedJob.company}`
      : 'Master core technical skills for your target career role');

  const activeBlueprint: PictorialRoadmapBlueprint = useMemo(() => {
    if (blueprint && blueprint.stations?.length) return blueprint;
    const roleTitle = selectedJob?.jobTitle || 'Career Readiness Path';
    const items = roadmapItems.slice(0, 6);

    const stations =
      items.length > 0
        ? items.map((item, idx) => ({
            step: idx + 1,
            title: item.title.replace(/^Master\s+/i, '').slice(0, 42),
            skill: item.targetSkill,
            icon: guessIconForSkill(item.targetSkill),
            duration: `${item.durationHours} hrs`,
            caption: item.expectedOutcome || item.description || 'Hands-on mastery milestone',
            deliverable: item.expectedOutcome || 'Complete course & assessment',
          }))
        : (selectedSkills.length > 0 ? selectedSkills : availableSkills).slice(0, 5).map((sk, idx) => ({
            step: idx + 1,
            title: `Master ${sk} Essentials`,
            skill: sk,
            icon: guessIconForSkill(sk),
            duration: `${6 + idx * 2} hrs`,
            caption: `Build verified hands-on fluency in ${sk} aligned to your career goal.`,
            deliverable: `Complete ${sk} video course & pass verification quiz`,
          }));

    return {
      headline: `${roleTitle} Visual Path`,
      subtitle: effectiveGoal,
      estimatedWeeks: Math.max(
        2,
        Math.ceil(
          (items.length > 0
            ? items.reduce((s, i) => s + (i.durationHours || 6), 0)
            : stations.length * 8) / 8
        )
      ),
      stations,
    };
  }, [blueprint, selectedJob, roadmapItems, selectedSkills, availableSkills, effectiveGoal]);

  const statusBySkill = useMemo(() => {
    const map = new Map<string, 'not_started' | 'in_progress' | 'completed'>();
    for (const item of roadmapItems) {
      map.set(item.targetSkill.toLowerCase(), item.status);
    }
    return map;
  }, [roadmapItems]);

  const overallPct = useMemo(() => {
    if (roadmapItems.length === 0) return 0;
    const score = roadmapItems.reduce(
      (sum, item) => sum + (item.status === 'completed' ? 1 : item.status === 'in_progress' ? 0.5 : 0),
      0
    );
    return Math.round((score / roadmapItems.length) * 100);
  }, [roadmapItems]);

  useEffect(() => {
    const svgString = buildPictorialSvg(
      activeBlueprint,
      statusBySkill,
      selectedJob?.company || 'Chokma',
      overallPct,
      theme,
      accentHex,
      effectiveGoal,
      selectedSkills
    );
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);
    const img = new window.Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = 1.5;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);
          setPngUrl(canvas.toDataURL('image/png'));
        }
      } catch {
        setPngUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`);
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    };
    img.onerror = () => {
      setPngUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`);
      URL.revokeObjectURL(blobUrl);
    };
    img.src = blobUrl;
  }, [
    activeBlueprint,
    statusBySkill,
    selectedJob?.company,
    overallPct,
    theme,
    accentHex,
    effectiveGoal,
    selectedSkills,
  ]);

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName].slice(0, 8)
    );
  };

  const handleAddCustomSkill = () => {
    const clean = newSkillText.trim();
    if (!clean) return;
    if (!selectedSkills.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      setSelectedSkills((prev) => [...prev, clean].slice(0, 8));
    }
    setNewSkillText('');
  };

  const runPictorialRequest = async (mode: 'create' | 'edit', instruction?: string) => {
    const cleanPrompt = (instruction ?? promptText).trim();
    if (mode === 'edit' && !cleanPrompt) {
      toast.info('Describe how you want to edit the roadmap image (e.g., add a skill or change theme).');
      return;
    }
    setGenerating(true);
    try {
      const res = await generatePictorialRoadmapWithAgent({
        jobTitle: selectedJob?.jobTitle || 'Target Tech Role',
        company: selectedJob?.company || 'Top Tech Employer',
        careerGoal: effectiveGoal,
        selectedSkills,
        visualStyle: theme,
        customPrompt: mode === 'create' ? cleanPrompt : undefined,
        editPrompt: mode === 'edit' ? cleanPrompt : undefined,
        currentBlueprint: mode === 'edit' ? activeBlueprint : undefined,
        milestones: roadmapItems.slice(0, 6).map((m) => ({
          title: m.title,
          targetSkill: m.targetSkill,
          status: m.status,
          durationHours: m.durationHours,
        })),
        missingSkills: selectedJob?.missingSkills || selectedSkills,
        matchScore: selectedJob?.matchScore || 0,
      });

      if (res.blueprint?.stations?.length) {
        setHistoryStack((prev) => [...prev.slice(-9), { blueprint, theme, accentHex }]);
        setBlueprint(res.blueprint);
        const recTheme = res.blueprint.recommendedTheme as PictorialTheme | undefined;
        if (recTheme && ['editorial', 'midnight', 'timeline', 'emerald'].includes(recTheme)) {
          setTheme(recTheme);
        }
        if (res.blueprint.accentHex && /^#[0-9A-Fa-f]{6}$/.test(res.blueprint.accentHex)) {
          setAccentHex(res.blueprint.accentHex);
        }
        if (cleanPrompt) setPromptText('');
        toast.success(
          mode === 'edit' ? 'Roadmap image edited with Gemini' : 'New roadmap image created with Gemini'
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update pictorial roadmap');
    } finally {
      setGenerating(false);
    }
  };

  const handleUndo = () => {
    if (historyStack.length === 0) return;
    const prev = historyStack[historyStack.length - 1];
    setHistoryStack((s) => s.slice(0, -1));
    setBlueprint(prev.blueprint);
    setTheme(prev.theme);
    setAccentHex(prev.accentHex);
    toast.info('Reverted to previous roadmap image version');
  };

  const handleDownloadPng = () => {
    if (!pngUrl) return;
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `chokma-roadmap-${(selectedJob?.jobTitle || 'career')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Pictorial roadmap PNG downloaded');
  };

  const mergedSkillButtons = useMemo(() => {
    const merged = new Set<string>([...availableSkills, ...selectedSkills]);
    return Array.from(merged);
  }, [availableSkills, selectedSkills]);

  return (
    <>
      <Surface className="p-5 space-y-4">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Create &amp; Edit Visual Roadmap Image
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create a fresh roadmap poster or edit stations, theme, and deliverables using natural prompts · Export high-res PNG
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {historyStack.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleUndo}>
                <RotateCcw className="w-3.5 h-3.5" />
                Undo ({historyStack.length})
              </Button>
            )}
            <Button
              size="sm"
              variant={showCustomizer ? 'secondary' : 'outline'}
              onClick={() => setShowCustomizer((v) => !v)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showCustomizer ? 'Hide Skills & Goal' : 'Skills & Goal'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setZoomOpen(true)}
              disabled={!pngUrl}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Full View
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleDownloadPng}
              disabled={!pngUrl}
            >
              <Download className="w-3.5 h-3.5" />
              Download PNG
            </Button>
          </div>
        </div>

        {/* Prompt Create / Edit Studio Bar */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setPromptMode('edit')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  promptMode === 'edit'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Pencil className="w-3 h-3" />
                Edit Current Image
              </button>
              <button
                type="button"
                onClick={() => setPromptMode('create')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  promptMode === 'create'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Wand2 className="w-3 h-3" />
                Create New from Prompt
              </button>
            </div>

            {/* Accent Color Swatches */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Accent:</span>
              <div className="flex items-center gap-1.5">
                {ACCENT_SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    title={sw.label}
                    aria-label={`Accent color ${sw.label}`}
                    onClick={() => setAccentHex(sw.hex)}
                    className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      accentHex.toLowerCase() === sw.hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-slate-100 dark:ring-offset-slate-950 scale-110'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: sw.hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runPictorialRequest(promptMode);
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <Input
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={
                promptMode === 'edit'
                  ? 'e.g. Add Terraform & CI/CD station, switch to Midnight Studio, or shorten titles...'
                  : 'e.g. Create a 6-week AWS DevOps visual roadmap focusing on hands-on cloud labs...'
              }
              className="flex-1 bg-white dark:bg-slate-900"
            />
            <Button type="submit" size="sm" variant="primary" disabled={generating}>
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {generating
                ? 'Rendering...'
                : promptMode === 'edit'
                ? 'Apply Image Edit'
                : 'Create Image'}
            </Button>
          </form>

          {/* 1-Click Quick Edit Suggestions */}
          <div className="flex flex-wrap items-center gap-1.5">
            {QUICK_EDIT_PROMPTS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={generating}
                onClick={() => {
                  setPromptMode('edit');
                  void runPictorialRequest('edit', chip);
                }}
                className="text-[11px] px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Visual Theme Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  theme === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {activeBlueprint.stations.length} stations · {selectedSkills.length} focus skills
          </span>
        </div>

        {showCustomizer && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <FieldLabel htmlFor="pictorial-goal">Career goal for this pictorial roadmap</FieldLabel>
              <Input
                id="pictorial-goal"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="e.g. Become job-ready for Cloud Support Associate at Amazon within 6 weeks"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <FieldLabel>Select skills to feature (up to 8)</FieldLabel>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Click skills to include or exclude
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mergedSkillButtons.map((sk) => {
                  const active = selectedSkills.includes(sk);
                  return (
                    <button
                      key={sk}
                      type="button"
                      onClick={() => toggleSkill(sk)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-indigo-700 border-indigo-700 text-white'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                      <span>{sk}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1 max-w-sm">
                <Input
                  value={newSkillText}
                  onChange={(e) => setNewSkillText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  placeholder="Add custom skill (e.g. Terraform, GraphQL)"
                  className="h-8 text-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleAddCustomSkill}>
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                onClick={() => void runPictorialRequest('create')}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {generating ? 'Designing Roadmap Image...' : 'Regenerate Image from Skills & Goal'}
              </Button>
            </div>
          </div>
        )}

        {/* Rendered Pictorial Roadmap Image */}
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          {pngUrl ? (
            <img
              src={pngUrl}
              alt={`Pictorial career roadmap for ${selectedJob?.jobTitle || effectiveGoal}`}
              className="w-full h-auto block cursor-zoom-in"
              onClick={() => setZoomOpen(true)}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-xs text-slate-500 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Rendering pictorial roadmap image...</span>
            </div>
          )}
        </div>
      </Surface>

      {/* Fullscreen Lightbox */}
      {zoomOpen && pngUrl && (
        <div
          role="dialog"
          aria-label="Pictorial Roadmap Fullscreen Preview"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="max-w-6xl w-full bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {activeBlueprint.headline}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="primary" onClick={handleDownloadPng}>
                  <Download className="w-3.5 h-3.5" />
                  Download PNG
                </Button>
                <button
                  type="button"
                  onClick={() => setZoomOpen(false)}
                  aria-label="Close fullscreen roadmap"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[82vh] overflow-auto bg-slate-100 dark:bg-slate-950 p-3">
              <img
                src={pngUrl}
                alt="Fullscreen pictorial roadmap"
                className="w-full h-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
