import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a safe Firestore document ID strictly adhering to ^[a-zA-Z0-9_\-]+$ (max 128 chars).
 */
export function makeSafeId(prefix: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'doc';
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${cleanPrefix}_${ts}_${rand}`.slice(0, 120);
}

/**
 * Validate URLs before rendering in href or opening externally.
 * Strictly blocks javascript:, data:, vbscript: schemes.
 */
export function isSafeHttpUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeStr(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

export function formatShortDate(dateInput?: string | unknown): string {
  if (!dateInput) return '—';
  if (typeof dateInput === 'string') {
    const d = new Date(dateInput);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateInput;
  }
  if (typeof dateInput === 'object' && dateInput !== null && 'toDate' in dateInput) {
    const d = (dateInput as { toDate: () => Date }).toDate();
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return '—';
}

export function clampNumber(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function verificationLabel(status: string): string {
  switch (status) {
    case 'assessment_verified':
      return 'Assessment Verified';
    case 'evidence_supported':
      return 'Evidence Supported';
    default:
      return 'Claimed';
  }
}

export function proficiencyLabel(level: number): string {
  if (level >= 0.9) return 'Strong Verified';
  if (level >= 0.75) return 'Demonstrated';
  if (level >= 0.55) return 'Practical Beginner';
  if (level >= 0.35) return 'Basic Understanding';
  return 'No Evidence';
}
