import React, { useEffect, useState } from 'react';
import { Moon, Sun, Shield, Save, Plus, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { MatchingWeights } from '../types';
import { Button, FieldLabel, Input, Select, Surface, Textarea } from '../components/ui/Primitives';
import { formatAccountIdentifier } from '../lib/authIdentifier';

export function SettingsPage() {
  const { user, profile, isAdmin, matchingWeights, saveMatchingWeights, publishAdminJob, signOut } = useApp();
  const { theme, setTheme } = useTheme();

  const [weights, setWeights] = useState<MatchingWeights>(matchingWeights);
  const [savingWeights, setSavingWeights] = useState(false);

  const [jobForm, setJobForm] = useState({
    title: '',
    company: '',
    location: 'Bengaluru, India',
    jobType: 'Full-time' as 'Full-time' | 'Internship',
    workMode: 'Hybrid' as 'Remote' | 'Hybrid' | 'On-site',
    experienceLevel: '0–1 Years (Freshers)',
    officialUrl: '',
    source: 'Administrator Verified Listing',
    description: '',
    skillsCsv: 'Linux, AWS Fundamentals, Python, SQL',
  });
  const [publishingJob, setPublishingJob] = useState(false);

  useEffect(() => {
    setWeights(matchingWeights);
  }, [matchingWeights]);

  const weightTotal =
    weights.technicalSkillsWeight +
    weights.projectRelevanceWeight +
    weights.educationWeight +
    weights.experienceWeight +
    weights.certificationsWeight;

  const handleSaveWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weightTotal !== 100) {
      toast.error(`Weights must sum to 100% (currently ${weightTotal}%).`);
      return;
    }
    setSavingWeights(true);
    try {
      await saveMatchingWeights(weights);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save weights');
    } finally {
      setSavingWeights(false);
    }
  };

  const handlePublishJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobForm.title.trim() || !jobForm.company.trim() || !jobForm.officialUrl.trim()) return;
    setPublishingJob(true);
    try {
      const reqSkills = jobForm.skillsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({
          name,
          category: 'Technical',
          importance: 'mandatory' as const,
          weight: 2,
          minProficiency: 0.6,
        }));
      await publishAdminJob({
        title: jobForm.title.trim(),
        company: jobForm.company.trim(),
        location: jobForm.location.trim(),
        jobType: jobForm.jobType,
        workMode: jobForm.workMode,
        experienceLevel: jobForm.experienceLevel.trim(),
        description: jobForm.description.trim() || `Verified role at ${jobForm.company.trim()}.`,
        responsibilities: ['Deliver engineering and troubleshooting outcomes per official employer posting.'],
        qualifications: ['Relevant technical degree or demonstrated portfolio evidence.'],
        requiredSkills: reqSkills,
        preferredSkills: [],
        officialUrl: jobForm.officialUrl.trim(),
        source: jobForm.source.trim(),
        isSampleListing: false,
        status: 'active',
        postedDate: new Date().toISOString().slice(0, 10),
        lastVerifiedDate: new Date().toISOString().slice(0, 10),
      });
      setJobForm({
        title: '',
        company: '',
        location: 'Bengaluru, India',
        jobType: 'Full-time',
        workMode: 'Hybrid',
        experienceLevel: '0–1 Years (Freshers)',
        officialUrl: '',
        source: 'Administrator Verified Listing',
        description: '',
        skillsCsv: 'Linux, AWS Fundamentals, Python, SQL',
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not publish job');
    } finally {
      setPublishingJob(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Manage appearance, account security, data privacy, and administrator scoring configuration.
        </p>
      </div>

      {/* Appearance */}
      <Surface className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Appearance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Switch between light neutral and dark slate themes across Chokma.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={theme === 'light' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTheme('light')}
          >
            <Sun className="w-3.5 h-3.5" />
            Light
          </Button>
          <Button
            variant={theme === 'dark' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setTheme('dark')}
          >
            <Moon className="w-3.5 h-3.5" />
            Dark
          </Button>
        </div>
      </Surface>

      {/* Account & Privacy */}
      <Surface className="p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Account &amp; Data Isolation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Signed in as{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {formatAccountIdentifier(user?.email)}
              </strong>{' '}
              · Role:{' '}
              <span className="capitalize">{isAdmin ? 'Administrator' : profile?.role || 'student'}</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </Button>
        </div>
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
          <p>• Your personal profile, resumes, skills, roadmaps, assessments, and applications are stored under your isolated Firestore namespace.</p>
          <p>• All AI agent endpoints verify your Firebase ID token on the server before invoking Gemini.</p>
          <p>• External application links redirect directly to official employer portals; Chokma never submits applications without your action.</p>
        </div>
      </Surface>

      {/* Admin Controls (Visible only to verified admin) */}
      {isAdmin && (
        <>
          <Surface className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Administrator · Job Matching Algorithm Weights
              </h2>
            </div>
            <form onSubmit={handleSaveWeights} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {[
                  ['technicalSkillsWeight', 'Technical Skills'],
                  ['projectRelevanceWeight', 'Project Relevance'],
                  ['educationWeight', 'Education'],
                  ['experienceWeight', 'Experience'],
                  ['certificationsWeight', 'Certifications'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <FieldLabel htmlFor={key}>{label} (%)</FieldLabel>
                    <Input
                      id={key}
                      type="number"
                      min={0}
                      max={100}
                      value={weights[key as keyof MatchingWeights]}
                      onChange={(e) =>
                        setWeights({ ...weights, [key]: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <span
                  className={`text-xs font-mono tabular-nums ${
                    weightTotal === 100
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  Total Weight: {weightTotal}% (must equal 100%)
                </span>
                <Button type="submit" size="sm" disabled={savingWeights || weightTotal !== 100}>
                  <Save className="w-3.5 h-3.5" />
                  Save Scoring Weights
                </Button>
              </div>
            </form>
          </Surface>

          <Surface className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Administrator · Publish Verified Job Listing
              </h2>
            </div>
            <form onSubmit={handlePublishJob} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <FieldLabel htmlFor="adm-title">Job Title</FieldLabel>
                  <Input
                    id="adm-title"
                    required
                    value={jobForm.title}
                    onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                    placeholder="e.g. Cloud DevOps Associate"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="adm-comp">Company</FieldLabel>
                  <Input
                    id="adm-comp"
                    required
                    value={jobForm.company}
                    onChange={(e) => setJobForm({ ...jobForm, company: e.target.value })}
                    placeholder="e.g. Amazon"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="adm-loc">Location</FieldLabel>
                  <Input
                    id="adm-loc"
                    required
                    value={jobForm.location}
                    onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="adm-url">Official Application URL</FieldLabel>
                  <Input
                    id="adm-url"
                    type="url"
                    required
                    value={jobForm.officialUrl}
                    onChange={(e) => setJobForm({ ...jobForm, officialUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="adm-type">Job Type</FieldLabel>
                  <Select
                    id="adm-type"
                    value={jobForm.jobType}
                    onChange={(e) => setJobForm({ ...jobForm, jobType: e.target.value as 'Full-time' | 'Internship' })}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Internship">Internship</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="adm-mode">Work Mode</FieldLabel>
                  <Select
                    id="adm-mode"
                    value={jobForm.workMode}
                    onChange={(e) => setJobForm({ ...jobForm, workMode: e.target.value as 'Remote' | 'Hybrid' | 'On-site' })}
                  >
                    <option value="Hybrid">Hybrid</option>
                    <option value="Remote">Remote</option>
                    <option value="On-site">On-site</option>
                  </Select>
                </div>
              </div>
              <div>
                <FieldLabel htmlFor="adm-skills">Required Skills (comma-separated)</FieldLabel>
                <Input
                  id="adm-skills"
                  value={jobForm.skillsCsv}
                  onChange={(e) => setJobForm({ ...jobForm, skillsCsv: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="adm-desc">Role Summary</FieldLabel>
                <Textarea
                  id="adm-desc"
                  rows={2}
                  value={jobForm.description}
                  onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })}
                />
              </div>
              <Button type="submit" size="sm" disabled={publishingJob}>
                <Plus className="w-3.5 h-3.5" />
                {publishingJob ? 'Publishing...' : 'Publish Verified Job'}
              </Button>
            </form>
          </Surface>
        </>
      )}
    </div>
  );
}
