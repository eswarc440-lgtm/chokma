import React, { useEffect, useRef, useState } from 'react';
import {
  Upload,
  Github,
  Plus,
  Trash2,
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  FileText,
  Save,
  Sun,
  Moon,
  User,
  GraduationCap,
  Award,
  Briefcase,
  FolderGit2,
  Globe,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  analyzeGitHubWithAgent,
  ParsedResumeResponse,
  parseResumeWithAgent,
} from '../services/api';
import {
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  ProfileProjectEntry,
  ResumeRecord,
} from '../types';
import { isSafeHttpUrl, makeSafeId, proficiencyLabel } from '../lib/utils';
import { formatAccountIdentifier, isUsernameAccountEmail } from '../lib/authIdentifier';
import {
  Button,
  ConfirmDialog,
  FieldLabel,
  Input,
  ProgressBar,
  SegmentedTabs,
  Select,
  Surface,
  Textarea,
  VerificationBadgeText,
} from '../components/ui/Primitives';
import { DashboardLeftNav } from '../components/ui/DashboardLeftNav';

type ProfileTab =
  | 'personal'
  | 'education'
  | 'skills'
  | 'resume'
  | 'projects'
  | 'experience'
  | 'certifications'
  | 'external'
  | 'preferences';

const PREFERRED_COMPANY_OPTIONS = [
  'Amazon',
  'Google',
  'Microsoft',
  'IBM',
  'Deloitte',
  'PayPal',
  'HCLTech',
  'Infosys',
  'Wipro',
  'TCS',
  'Accenture',
];

export function ProfilePage() {
  const { profile, skills, updateProfileFields, upsertSkill, deleteSkill } = useApp();
  const { theme, setTheme } = useTheme();
  const [tab, setTab] = useState<ProfileTab>('personal');
  const [saving, setSaving] = useState(false);

  // Personal form state
  const [personal, setPersonal] = useState({
    displayName: '',
    phone: '',
    location: '',
    college: '',
    university: '',
    degree: '',
    department: '',
    graduationYear: '',
    cgpa: '',
    currentAcademicYear: '',
    careerObjective: '',
  });

  // External links
  const [external, setExternal] = useState({
    portfolioUrl: '',
    linkedinUrl: '',
    githubUsername: '',
    credlyUrl: '',
    leetcodeUrl: '',
    hackerrankUrl: '',
  });
  const [analyzingGithub, setAnalyzingGithub] = useState(false);

  // Preferences
  const [prefs, setPrefs] = useState({
    preferredCompanies: ['Amazon', 'Google', 'Microsoft'] as string[],
    preferredRolesText: 'Cloud Support Associate, Software Engineer',
    preferredLocationsText: 'Bengaluru, Hyderabad, Remote',
    preferredCountriesText: 'India',
    jobType: 'Both' as 'Full-time' | 'Internship' | 'Both',
    workMode: 'Any' as 'Remote' | 'Hybrid' | 'On-site' | 'Any',
    minSalary: '',
    experienceLevel: '0–1 Years (Freshers)',
    preferredIndustriesText: 'Cloud Computing, Software Engineering',
    dailyLearningMinutes: 60,
  });

  // Resume upload & extraction review
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [parsingResume, setParsingResume] = useState(false);
  const [pendingExtraction, setPendingExtraction] = useState<ParsedResumeResponse | null>(null);
  const [previewResume, setPreviewResume] = useState<ResumeRecord | null>(null);

  // Skills form
  const [skillFilter, setSkillFilter] = useState<'all' | 'claimed' | 'evidence_supported' | 'assessment_verified'>('all');
  const [newSkill, setNewSkill] = useState({
    name: '',
    category: 'Cloud',
    proficiencyLevel: 0.4,
    evidenceNotes: '',
  });
  const [deleteSkillId, setDeleteSkillId] = useState<string | null>(null);

  // Sub-list forms
  const [newEdu, setNewEdu] = useState({ institution: '', degree: '', field: '', startYear: '', endYear: '', grade: '' });
  const [newProj, setNewProj] = useState({ title: '', description: '', technologies: '', repoUrl: '', liveUrl: '' });
  const [newExp, setNewExp] = useState({ role: '', organization: '', duration: '', description: '' });
  const [newCert, setNewCert] = useState({ name: '', issuer: '', issueDate: '', credentialUrl: '' });

  useEffect(() => {
    if (!profile) return;
    setPersonal({
      displayName: profile.displayName || '',
      phone: profile.phone || '',
      location: profile.location || '',
      college: profile.college || '',
      university: profile.university || '',
      degree: profile.degree || '',
      department: profile.department || '',
      graduationYear: profile.graduationYear || '',
      cgpa: profile.cgpa || '',
      currentAcademicYear: profile.currentAcademicYear || '',
      careerObjective: profile.careerObjective || '',
    });
    setExternal({
      portfolioUrl: profile.portfolioUrl || '',
      linkedinUrl: profile.linkedinUrl || '',
      githubUsername: profile.githubUsername || '',
      credlyUrl: profile.credlyUrl || '',
      leetcodeUrl: profile.leetcodeUrl || '',
      hackerrankUrl: profile.hackerrankUrl || '',
    });
    if (profile.preferences) {
      setPrefs({
        preferredCompanies: profile.preferences.preferredCompanies || [],
        preferredRolesText: (profile.preferences.preferredRoles || []).join(', '),
        preferredLocationsText: (profile.preferences.preferredLocations || []).join(', '),
        preferredCountriesText: (profile.preferences.preferredCountries || []).join(', '),
        jobType: profile.preferences.jobType || 'Both',
        workMode: profile.preferences.workMode || 'Any',
        minSalary: profile.preferences.minSalary || '',
        experienceLevel: profile.preferences.experienceLevel || '0–1 Years (Freshers)',
        preferredIndustriesText: (profile.preferences.preferredIndustries || []).join(', '),
        dailyLearningMinutes: profile.preferences.dailyLearningMinutes || 60,
      });
    }
    if (!previewResume && profile.resumes && profile.resumes.length > 0) {
      setPreviewResume(profile.resumes[0]);
    }
  }, [profile]);

  const savePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfileFields(personal);
      toast.success('Profile details saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const saveExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfileFields(external);
      toast.success('External profiles saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save links');
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyzeGithub = async () => {
    if (!external.githubUsername.trim()) {
      toast.error('Enter your GitHub username first.');
      return;
    }
    setAnalyzingGithub(true);
    try {
      const res = await analyzeGitHubWithAgent(external.githubUsername.trim());
      await updateProfileFields({
        githubUsername: res.analysis.username,
        githubAnalysis: res.analysis,
      });
      // Save GitHub-inferred skills as evidence_supported (never claiming assessment_verified)
      for (const sk of res.inferredSkills) {
        const existing = skills.find((s) => s.name.toLowerCase() === sk.name.toLowerCase());
        if (!existing || existing.verificationStatus === 'claimed') {
          await upsertSkill({
            id: existing?.id,
            name: sk.name,
            category: sk.category,
            proficiencyLevel: Math.max(existing?.proficiencyLevel || 0, 0.7),
            evidenceSource: 'github',
            verificationStatus: 'evidence_supported',
            evidenceNotes: sk.notes,
          });
        }
      }
      toast.success(`Analyzed @${res.analysis.username}: ${res.analysis.publicRepos} public repos & ${res.inferredSkills.length} evidence-supported skills`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'GitHub analysis failed');
    } finally {
      setAnalyzingGithub(false);
    }
  };

  const savePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const splitList = (str: string) =>
        str
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 15);
      await updateProfileFields({
        preferences: {
          preferredCompanies: prefs.preferredCompanies,
          preferredRoles: splitList(prefs.preferredRolesText),
          preferredLocations: splitList(prefs.preferredLocationsText),
          preferredCountries: splitList(prefs.preferredCountriesText),
          jobType: prefs.jobType,
          workMode: prefs.workMode,
          minSalary: prefs.minSalary,
          experienceLevel: prefs.experienceLevel,
          preferredIndustries: splitList(prefs.preferredIndustriesText),
          dailyLearningMinutes: Number(prefs.dailyLearningMinutes) || 60,
        },
      });
      toast.success('Career preferences updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleResumeFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Resume file exceeds 5 MB limit.');
      return;
    }
    setParsingResume(true);
    try {
      const result = await parseResumeWithAgent(file);
      setPendingExtraction(result);
      toast.success('Resume parsed by Profile Intelligence Agent — review extracted data below.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resume parsing failed');
    } finally {
      setParsingResume(false);
    }
  };

  const applyExtractedResume = async () => {
    if (!pendingExtraction || !profile) return;
    setSaving(true);
    try {
      const ex = pendingExtraction.extracted;
      const prevResumes = profile.resumes || [];
      const newResumeEntry: ResumeRecord = {
        id: makeSafeId('res'),
        fileName: pendingExtraction.fileName,
        fileSizeKb: pendingExtraction.fileSizeKb,
        uploadedAt: new Date().toISOString().slice(0, 10),
        version: prevResumes.length + 1,
        extractedSummary: ex.summary || 'Parsed resume record',
        extractedSkills: (ex.skills || []).map((s) => s.name).slice(0, 25),
        rawTextPreview: pendingExtraction.rawTextPreview.slice(0, 1200),
      };

      const nextEdu: EducationEntry[] = [
        ...(profile.education || []),
        ...(ex.education || []).map((ed) => ({ id: makeSafeId('edu'), ...ed })),
      ].slice(0, 10);

      const nextExp: ExperienceEntry[] = [
        ...(profile.experience || []),
        ...(ex.experience || []).map((xp) => ({ id: makeSafeId('exp'), ...xp })),
      ].slice(0, 20);

      const nextProj: ProfileProjectEntry[] = [
        ...(profile.projects || []),
        ...(ex.projects || []).map((p) => ({
          id: makeSafeId('ppr'),
          title: p.title,
          description: p.description,
          technologies: p.technologies || [],
        })),
      ].slice(0, 20);

      const nextCert: CertificationEntry[] = [
        ...(profile.certifications || []),
        ...(ex.certifications || []).map((c) => ({ id: makeSafeId('crt'), ...c })),
      ].slice(0, 20);

      await updateProfileFields({
        displayName: ex.fullName || profile.displayName,
        phone: ex.phone || profile.phone,
        location: ex.location || profile.location,
        college: ex.college || profile.college,
        university: ex.university || profile.university,
        degree: ex.degree || profile.degree,
        department: ex.department || profile.department,
        graduationYear: ex.graduationYear || profile.graduationYear,
        cgpa: ex.cgpa || profile.cgpa,
        careerObjective: ex.careerObjective || profile.careerObjective,
        githubUsername: ex.githubUsername || profile.githubUsername,
        linkedinUrl: ex.linkedinUrl || profile.linkedinUrl,
        portfolioUrl: ex.portfolioUrl || profile.portfolioUrl,
        education: nextEdu,
        experience: nextExp,
        projects: nextProj,
        certifications: nextCert,
        resumes: [newResumeEntry, ...prevResumes].slice(0, 10),
      });

      // Extracted resume skills are STRICTLY saved as `claimed` (unverified) — never falsely marked verified
      for (const sk of (ex.skills || []).slice(0, 20)) {
        if (!sk.name?.trim()) continue;
        const already = skills.find((s) => s.name.toLowerCase() === sk.name.trim().toLowerCase());
        if (!already) {
          await upsertSkill({
            name: sk.name.trim(),
            category: sk.category || 'Technical',
            proficiencyLevel: 0.4,
            evidenceSource: 'resume',
            verificationStatus: 'claimed',
            evidenceNotes: `Extracted from ${pendingExtraction.fileName} (requires project or assessment to verify).`,
          });
        }
      }

      setPreviewResume(newResumeEntry);
      setPendingExtraction(null);
      toast.success('Extracted resume details applied. Resume skills are marked Claimed until verified.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply extracted resume');
    } finally {
      setSaving(false);
    }
  };

  const downloadResumeSummary = (rec: ResumeRecord) => {
    const blob = new Blob(
      [
        `Chokma Resume Extract — v${rec.version}\nFile: ${rec.fileName}\nUploaded: ${rec.uploadedAt}\n\nSummary:\n${rec.extractedSummary}\n\nExtracted Skills (Claimed):\n${rec.extractedSkills.join(', ')}\n\nPreview:\n${rec.rawTextPreview}`,
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.fileName.replace(/\.[^.]+$/, '')}_chokma_v${rec.version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkill.name.trim()) return;
    await upsertSkill({
      name: newSkill.name.trim(),
      category: newSkill.category,
      proficiencyLevel: Math.min(newSkill.proficiencyLevel, 0.55), // Self-claimed capped until verified
      evidenceSource: 'claimed',
      verificationStatus: 'claimed',
      evidenceNotes: newSkill.evidenceNotes || 'Self-reported in candidate profile.',
    });
    setNewSkill({ name: '', category: 'Cloud', proficiencyLevel: 0.4, evidenceNotes: '' });
    toast.success('Skill added as Claimed (complete an assessment or project to verify)');
  };

  const filteredSkills = skills.filter((s) => (skillFilter === 'all' ? true : s.verificationStatus === skillFilter));

  const claimedCount = skills.filter((s) => s.verificationStatus === 'claimed').length;
  const evidenceCount = skills.filter((s) => s.verificationStatus === 'evidence_supported').length;
  const verifiedCount = skills.filter((s) => s.verificationStatus === 'assessment_verified').length;

  return (
    <div className="space-y-6">
      {/* Header + Completeness bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Candidate Profile Intelligence
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Structured academic details, resume parsing, public GitHub analysis, skill evidence, and preferences.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* Light Mode / Dark Mode Appearance Selector in Profile */}
          <div className="space-y-1">
            <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Appearance
            </span>
            <div
              role="group"
              aria-label="Theme mode"
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5 text-amber-500" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  theme === 'dark'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                Dark
              </button>
            </div>
          </div>

          <div className="w-full sm:w-52 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Profile Completeness</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {profile?.profileCompleteness ?? 0}%
              </span>
            </div>
            <ProgressBar value={profile?.profileCompleteness ?? 0} tone="indigo" />
          </div>
        </div>
      </div>

      {/* Left Sidebar Navigation + Active Profile Module */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <DashboardLeftNav
          title="Profile Sections"
          active={tab}
          onChange={setTab}
          items={[
            { id: 'personal', label: 'Personal Info', icon: <User className="w-4 h-4" /> },
            {
              id: 'education',
              label: 'Education',
              count: profile?.education?.length || 0,
              icon: <GraduationCap className="w-4 h-4" />,
            },
            {
              id: 'skills',
              label: 'Skills',
              count: skills.length,
              icon: <Sparkles className="w-4 h-4" />,
            },
            {
              id: 'resume',
              label: 'Resume',
              count: profile?.resumes?.length || 0,
              icon: <FileText className="w-4 h-4" />,
            },
            {
              id: 'projects',
              label: 'Projects',
              count: profile?.projects?.length || 0,
              icon: <FolderGit2 className="w-4 h-4" />,
            },
            {
              id: 'experience',
              label: 'Experience',
              count: profile?.experience?.length || 0,
              icon: <Briefcase className="w-4 h-4" />,
            },
            {
              id: 'certifications',
              label: 'Certifications',
              count: profile?.certifications?.length || 0,
              icon: <Award className="w-4 h-4" />,
            },
            { id: 'external', label: 'External Profiles', icon: <Globe className="w-4 h-4" /> },
            { id: 'preferences', label: 'Preferences', icon: <SlidersHorizontal className="w-4 h-4" /> },
          ]}
        />

        <div className="flex-1 min-w-0 w-full space-y-6">

      {/* TAB 1: PERSONAL INFORMATION */}
      {tab === 'personal' && (
        <Surface className="p-6">
          <form onSubmit={savePersonal} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <FieldLabel htmlFor="p-name">Full name</FieldLabel>
                <Input
                  id="p-name"
                  required
                  value={personal.displayName}
                  onChange={(e) => setPersonal({ ...personal, displayName: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-email">
                  {isUsernameAccountEmail(profile?.email) ? 'Username' : 'Email address'}
                </FieldLabel>
                <Input
                  id="p-email"
                  value={formatAccountIdentifier(profile?.email)}
                  disabled
                  className="opacity-70"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-phone">Phone number</FieldLabel>
                <Input
                  id="p-phone"
                  value={personal.phone}
                  onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-college">College / Institute</FieldLabel>
                <Input
                  id="p-college"
                  value={personal.college}
                  onChange={(e) => setPersonal({ ...personal, college: e.target.value })}
                  placeholder="e.g. National Institute of Technology"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-uni">University</FieldLabel>
                <Input
                  id="p-uni"
                  value={personal.university}
                  onChange={(e) => setPersonal({ ...personal, university: e.target.value })}
                  placeholder="e.g. Anna University / VTU"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-loc">Location</FieldLabel>
                <Input
                  id="p-loc"
                  value={personal.location}
                  onChange={(e) => setPersonal({ ...personal, location: e.target.value })}
                  placeholder="Bengaluru, India"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-degree">Degree</FieldLabel>
                <Input
                  id="p-degree"
                  value={personal.degree}
                  onChange={(e) => setPersonal({ ...personal, degree: e.target.value })}
                  placeholder="B.Tech"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-dept">Department</FieldLabel>
                <Input
                  id="p-dept"
                  value={personal.department}
                  onChange={(e) => setPersonal({ ...personal, department: e.target.value })}
                  placeholder="Computer Science & Engineering"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-grad">Graduation year</FieldLabel>
                <Input
                  id="p-grad"
                  value={personal.graduationYear}
                  onChange={(e) => setPersonal({ ...personal, graduationYear: e.target.value })}
                  placeholder="2026"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-cgpa">CGPA / Percentage</FieldLabel>
                <Input
                  id="p-cgpa"
                  value={personal.cgpa}
                  onChange={(e) => setPersonal({ ...personal, cgpa: e.target.value })}
                  placeholder="8.4 CGPA"
                />
              </div>
              <div>
                <FieldLabel htmlFor="p-year">Current academic year</FieldLabel>
                <Select
                  id="p-year"
                  value={personal.currentAcademicYear}
                  onChange={(e) => setPersonal({ ...personal, currentAcademicYear: e.target.value })}
                >
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="Final Year">Final Year</option>
                  <option value="Fresh Graduate">Fresh Graduate</option>
                  <option value="Working Professional">Working Professional</option>
                </Select>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="p-obj">Career objective</FieldLabel>
              <Textarea
                id="p-obj"
                rows={3}
                value={personal.careerObjective}
                onChange={(e) => setPersonal({ ...personal, careerObjective: e.target.value })}
                placeholder="Describe your target role, technical focus, and near-term career goal..."
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Personal Info'}
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {/* TAB 2: EDUCATION */}
      {tab === 'education' && (
        <Surface className="p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Academic History</h2>
            {(profile?.education || []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No education entries added yet. Add your B.Tech / university records or parse them from your resume.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(profile?.education || []).map((ed) => (
                  <div key={ed.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {ed.degree} {ed.field ? `in ${ed.field}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {ed.institution} · {ed.startYear}–{ed.endYear} {ed.grade ? `· ${ed.grade}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateProfileFields({
                          education: (profile?.education || []).filter((x) => x.id !== ed.id),
                        })
                      }
                      aria-label="Remove education entry"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newEdu.institution.trim() || !newEdu.degree.trim()) return;
              await updateProfileFields({
                education: [...(profile?.education || []), { id: makeSafeId('edu'), ...newEdu }],
              });
              setNewEdu({ institution: '', degree: '', field: '', startYear: '', endYear: '', grade: '' });
              toast.success('Education entry added');
            }}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add Education Entry</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                required
                placeholder="Institution name"
                value={newEdu.institution}
                onChange={(e) => setNewEdu({ ...newEdu, institution: e.target.value })}
              />
              <Input
                required
                placeholder="Degree (e.g. B.Tech)"
                value={newEdu.degree}
                onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
              />
              <Input
                placeholder="Field of study"
                value={newEdu.field}
                onChange={(e) => setNewEdu({ ...newEdu, field: e.target.value })}
              />
              <Input
                placeholder="Start year (e.g. 2022)"
                value={newEdu.startYear}
                onChange={(e) => setNewEdu({ ...newEdu, startYear: e.target.value })}
              />
              <Input
                placeholder="End year (e.g. 2026)"
                value={newEdu.endYear}
                onChange={(e) => setNewEdu({ ...newEdu, endYear: e.target.value })}
              />
              <Input
                placeholder="CGPA / Percentage"
                value={newEdu.grade}
                onChange={(e) => setNewEdu({ ...newEdu, grade: e.target.value })}
              />
            </div>
            <Button type="submit" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Add Education
            </Button>
          </form>
        </Surface>
      )}

      {/* TAB 3: SKILLS (Distinguishing Claimed vs Evidence-Supported vs Assessment-Verified) */}
      {tab === 'skills' && (
        <div className="space-y-6">
          <Surface className="p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Skill Evidence Ledger
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Claimed skills are capped until backed by GitHub, practical project reviews, or timed assessments.
                </p>
              </div>
              <SegmentedTabs
                active={skillFilter}
                onChange={setSkillFilter}
                tabs={[
                  { id: 'all', label: 'All', count: skills.length },
                  { id: 'assessment_verified', label: 'Assessment Verified', count: verifiedCount },
                  { id: 'evidence_supported', label: 'Evidence Supported', count: evidenceCount },
                  { id: 'claimed', label: 'Claimed', count: claimedCount },
                ]}
              />
            </div>

            {filteredSkills.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                No skills in this category yet. Add skills below, upload a resume, or analyze GitHub.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-4">Skill</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Verification</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3 text-right">Proficiency</th>
                      <th className="py-2.5 pl-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                    {filteredSkills.map((sk) => (
                      <tr key={sk.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{sk.name}</p>
                          {sk.evidenceNotes && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                              {sk.evidenceNotes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">{sk.category}</td>
                        <td className="py-3 px-3">
                          <VerificationBadgeText status={sk.verificationStatus} />
                        </td>
                        <td className="py-3 px-3 capitalize text-slate-600 dark:text-slate-400">
                          {sk.evidenceSource}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 dark:text-slate-100">
                          {Math.round(sk.proficiencyLevel * 100)}% · {proficiencyLabel(sk.proficiencyLevel)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => setDeleteSkillId(sk.id)}
                            aria-label={`Delete ${sk.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form
              onSubmit={handleAddSkill}
              className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
            >
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="sk-name">Skill name</FieldLabel>
                <Input
                  id="sk-name"
                  required
                  placeholder="e.g. Linux, IAM, Python"
                  value={newSkill.name}
                  onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3">
                <FieldLabel htmlFor="sk-cat">Category</FieldLabel>
                <Select
                  id="sk-cat"
                  value={newSkill.category}
                  onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                >
                  <option value="Cloud">Cloud</option>
                  <option value="Cloud Security">Cloud Security</option>
                  <option value="Operating Systems">Operating Systems</option>
                  <option value="Networking">Networking</option>
                  <option value="Languages">Languages</option>
                  <option value="Frontend">Frontend</option>
                  <option value="Backend">Backend</option>
                  <option value="Databases">Databases</option>
                  <option value="DevOps">DevOps</option>
                  <option value="CS Core">CS Core</option>
                  <option value="Professional">Professional</option>
                </Select>
              </div>
              <div className="sm:col-span-4">
                <FieldLabel htmlFor="sk-note">Evidence note (optional)</FieldLabel>
                <Input
                  id="sk-note"
                  placeholder="Coursework or project context"
                  value={newSkill.evidenceNotes}
                  onChange={(e) => setNewSkill({ ...newSkill, evidenceNotes: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" className="w-full">
                  <Plus className="w-4 h-4" />
                  Add Skill
                </Button>
              </div>
            </form>
          </Surface>
        </div>
      )}

      {/* TAB 4: RESUME UPLOAD, AI EXTRACTION REVIEW, PREVIEW & VERSIONS */}
      {tab === 'resume' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <Surface className="p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Upload &amp; Parse Resume
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Drag and drop a PDF, DOCX, or TXT resume (max 5 MB). Profile Intelligence Agent extracts education, projects, experience, certifications, and claimed skills for your review.
                </p>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleResumeFile(f);
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragActive
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleResumeFile(f);
                    e.target.value = '';
                  }}
                />
                {parsingResume ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Profile Intelligence Agent analyzing resume...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-slate-400" />
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Drop your resume here, or browse files
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Supports PDF, DOCX, and TXT up to 5 MB
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Select Resume File
                    </Button>
                  </div>
                )}
              </div>

              {/* Extraction Review Panel */}
              {pendingExtraction && (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Extracted Information Review
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Verify extracted data before saving. Resume skills are imported as Claimed (Unverified).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPendingExtraction(null)}>
                        Discard
                      </Button>
                      <Button size="sm" onClick={applyExtractedResume} disabled={saving}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Apply to Profile
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4">
                    <div>
                      <span className="text-slate-500">Name:</span>{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {pendingExtraction.extracted.fullName || 'Not detected'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Degree / Dept:</span>{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {[pendingExtraction.extracted.degree, pendingExtraction.extracted.department].filter(Boolean).join(' · ') || 'Not detected'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">College:</span>{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {pendingExtraction.extracted.college || 'Not detected'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Skills detected:</span>{' '}
                      <strong className="text-slate-900 dark:text-slate-100 font-mono">
                        {pendingExtraction.extracted.skills?.length || 0}
                      </strong>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-500">Skills:</span>{' '}
                      <span className="text-slate-700 dark:text-slate-300">
                        {(pendingExtraction.extracted.skills || []).map((s) => s.name).join(' · ') || 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Surface>

            {/* Version History */}
            <Surface className="p-6 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Resume Version History
              </h2>
              {(profile?.resumes || []).length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No uploaded resume versions recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(profile?.resumes || []).map((r) => (
                    <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setPreviewResume(r)}
                        className="text-left min-w-0 cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          v{r.version} · {r.fileName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {r.uploadedAt} · {r.fileSizeKb} KB · {r.extractedSkills.length} skills extracted
                        </p>
                      </button>
                      <Button variant="outline" size="sm" onClick={() => downloadResumeSummary(r)}>
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>

          {/* Right Resume Preview */}
          <div className="lg:col-span-5">
            <Surface className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Resume Preview</span>
              </div>
              {previewResume ? (
                <div className="space-y-4 text-xs">
                  <div className="text-slate-500 dark:text-slate-400">
                    {previewResume.fileName} · Version {previewResume.version} · {previewResume.uploadedAt}
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">Extracted Summary</p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      {previewResume.extractedSummary}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">Document Excerpt</p>
                    <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300 max-h-80 overflow-y-auto">
                      {previewResume.rawTextPreview}
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
                  Upload a resume to inspect its extracted text and version preview here.
                </p>
              )}
            </Surface>
          </div>
        </div>
      )}

      {/* TAB 5: PROJECTS */}
      {tab === 'projects' && (
        <Surface className="p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Portfolio Projects</h2>
            {(profile?.projects || []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add personal, academic, or open-source projects to improve your Project Relevance score (20% weight).
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(profile?.projects || []).map((p) => (
                  <div key={p.id} className="p-4 flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.title}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{p.description}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {(p.technologies || []).join(' · ')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateProfileFields({
                          projects: (profile?.projects || []).filter((x) => x.id !== p.id),
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newProj.title.trim()) return;
              await updateProfileFields({
                projects: [
                  ...(profile?.projects || []),
                  {
                    id: makeSafeId('ppr'),
                    title: newProj.title.trim(),
                    description: newProj.description.trim(),
                    technologies: newProj.technologies
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                    repoUrl: newProj.repoUrl.trim(),
                    liveUrl: newProj.liveUrl.trim(),
                  },
                ],
              });
              setNewProj({ title: '', description: '', technologies: '', repoUrl: '', liveUrl: '' });
              toast.success('Project added');
            }}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
          >
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add Project</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                required
                placeholder="Project title"
                value={newProj.title}
                onChange={(e) => setNewProj({ ...newProj, title: e.target.value })}
              />
              <Input
                placeholder="Technologies (comma-separated, e.g. AWS, Python, Linux)"
                value={newProj.technologies}
                onChange={(e) => setNewProj({ ...newProj, technologies: e.target.value })}
              />
              <Input
                placeholder="GitHub repository URL"
                value={newProj.repoUrl}
                onChange={(e) => setNewProj({ ...newProj, repoUrl: e.target.value })}
              />
              <Input
                placeholder="Live demo URL (optional)"
                value={newProj.liveUrl}
                onChange={(e) => setNewProj({ ...newProj, liveUrl: e.target.value })}
              />
            </div>
            <Textarea
              rows={2}
              placeholder="Project impact, architecture, and key deliverables"
              value={newProj.description}
              onChange={(e) => setNewProj({ ...newProj, description: e.target.value })}
            />
            <Button type="submit" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Add Project
            </Button>
          </form>
        </Surface>
      )}

      {/* TAB 6: EXPERIENCE */}
      {tab === 'experience' && (
        <Surface className="p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Internships &amp; Experience</h2>
            {(profile?.experience || []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No internships or roles listed yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(profile?.experience || []).map((ex) => (
                  <div key={ex.id} className="p-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {ex.role} · {ex.organization}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{ex.duration}</p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{ex.description}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateProfileFields({
                          experience: (profile?.experience || []).filter((x) => x.id !== ex.id),
                        })
                      }
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newExp.role.trim() || !newExp.organization.trim()) return;
              await updateProfileFields({
                experience: [...(profile?.experience || []), { id: makeSafeId('exp'), ...newExp }],
              });
              setNewExp({ role: '', organization: '', duration: '', description: '' });
              toast.success('Experience added');
            }}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                required
                placeholder="Role title (e.g. Cloud Intern)"
                value={newExp.role}
                onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
              />
              <Input
                required
                placeholder="Organization"
                value={newExp.organization}
                onChange={(e) => setNewExp({ ...newExp, organization: e.target.value })}
              />
              <Input
                placeholder="Duration (e.g. May–Jul 2026)"
                value={newExp.duration}
                onChange={(e) => setNewExp({ ...newExp, duration: e.target.value })}
              />
            </div>
            <Textarea
              rows={2}
              placeholder="Key responsibilities and measurable outcomes"
              value={newExp.description}
              onChange={(e) => setNewExp({ ...newExp, description: e.target.value })}
            />
            <Button type="submit" size="sm">
              <Plus className="w-3.5 h-3.5" />
              Add Experience
            </Button>
          </form>
        </Surface>
      )}

      {/* TAB 7: CERTIFICATIONS */}
      {tab === 'certifications' && (
        <Surface className="p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Certifications</h2>
            {(profile?.certifications || []).length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No certifications added yet (e.g., AWS Cloud Practitioner, CCNA, AZ-900).
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(profile?.certifications || []).map((c) => (
                  <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.issuer} {c.issueDate ? `· ${c.issueDate}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isSafeHttpUrl(c.credentialUrl) && (
                        <a
                          href={c.credentialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-indigo-700 dark:text-indigo-400 inline-flex items-center gap-1 hover:underline"
                        >
                          Verify <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          updateProfileFields({
                            certifications: (profile?.certifications || []).filter((x) => x.id !== c.id),
                          })
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newCert.name.trim()) return;
              await updateProfileFields({
                certifications: [...(profile?.certifications || []), { id: makeSafeId('crt'), ...newCert }],
              });
              setNewCert({ name: '', issuer: '', issueDate: '', credentialUrl: '' });
              toast.success('Certification added');
            }}
            className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <Input
              required
              placeholder="Certification name"
              value={newCert.name}
              onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
            />
            <Input
              placeholder="Issuing organization (e.g. AWS, Microsoft)"
              value={newCert.issuer}
              onChange={(e) => setNewCert({ ...newCert, issuer: e.target.value })}
            />
            <Input
              placeholder="Issue date (e.g. Oct 2026)"
              value={newCert.issueDate}
              onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })}
            />
            <Input
              placeholder="Credential verification URL (Credly / issuer)"
              value={newCert.credentialUrl}
              onChange={(e) => setNewCert({ ...newCert, credentialUrl: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Button type="submit" size="sm">
                <Plus className="w-3.5 h-3.5" />
                Add Certification
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {/* TAB 8: EXTERNAL PROFILES & LIVE GITHUB ANALYZER */}
      {tab === 'external' && (
        <div className="space-y-6">
          <Surface className="p-6">
            <form onSubmit={saveExternal} className="space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  External Profiles &amp; GitHub Intelligence
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Connect your public GitHub username to analyze public repositories and languages via the GitHub API. Private repositories are never accessed.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="ext-gh">GitHub username</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="ext-gh"
                      value={external.githubUsername}
                      onChange={(e) => setExternal({ ...external, githubUsername: e.target.value })}
                      placeholder="e.g. torvalds"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleAnalyzeGithub}
                      disabled={analyzingGithub || !external.githubUsername.trim()}
                    >
                      {analyzingGithub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                      Analyze
                    </Button>
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="ext-port">Portfolio website URL</FieldLabel>
                  <Input
                    id="ext-port"
                    type="url"
                    value={external.portfolioUrl}
                    onChange={(e) => setExternal({ ...external, portfolioUrl: e.target.value })}
                    placeholder="https://yourportfolio.dev"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="ext-li">LinkedIn URL</FieldLabel>
                  <Input
                    id="ext-li"
                    type="url"
                    value={external.linkedinUrl}
                    onChange={(e) => setExternal({ ...external, linkedinUrl: e.target.value })}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="ext-cred">Credly URL</FieldLabel>
                  <Input
                    id="ext-cred"
                    type="url"
                    value={external.credlyUrl}
                    onChange={(e) => setExternal({ ...external, credlyUrl: e.target.value })}
                    placeholder="https://www.credly.com/users/username"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="ext-lc">LeetCode URL</FieldLabel>
                  <Input
                    id="ext-lc"
                    type="url"
                    value={external.leetcodeUrl}
                    onChange={(e) => setExternal({ ...external, leetcodeUrl: e.target.value })}
                    placeholder="https://leetcode.com/u/username"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="ext-hr">HackerRank URL</FieldLabel>
                  <Input
                    id="ext-hr"
                    type="url"
                    value={external.hackerrankUrl}
                    onChange={(e) => setExternal({ ...external, hackerrankUrl: e.target.value })}
                    placeholder="https://www.hackerrank.com/profile/username"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  <Save className="w-4 h-4" />
                  Save External Links
                </Button>
              </div>
            </form>
          </Surface>

          {profile?.githubAnalysis && (
            <Surface className="p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Public GitHub Report · @{profile.githubAnalysis.username}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {profile.githubAnalysis.summary}
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {profile.githubAnalysis.publicRepos} public repos · Analyzed {profile.githubAnalysis.analyzedAt}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {(profile.githubAnalysis.repos || []).slice(0, 6).map((repo) => (
                  <div key={repo.name} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                    <div className="min-w-0">
                      {isSafeHttpUrl(repo.url) ? (
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-indigo-700 dark:text-indigo-400 hover:underline"
                        >
                          {repo.name}
                        </a>
                      ) : (
                        <span className="font-semibold">{repo.name}</span>
                      )}
                      <p className="text-slate-500 dark:text-slate-400 truncate mt-0.5">{repo.description}</p>
                    </div>
                    <div className="text-right shrink-0 text-slate-500 font-mono tabular-nums">
                      <span>{repo.language}</span>
                      <span className="mx-1.5">·</span>
                      <span>★ {repo.stars}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Surface>
          )}
        </div>
      )}

      {/* TAB 9: CAREER PREFERENCES */}
      {tab === 'preferences' && (
        <Surface className="p-6">
          <form onSubmit={savePreferences} className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Career &amp; Learning Preferences
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Preferred companies are prioritized first in Recommended Jobs alongside other matching employers.
              </p>
            </div>

            <div>
              <FieldLabel>Preferred companies</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {PREFERRED_COMPANY_OPTIONS.map((comp) => {
                  const selected = prefs.preferredCompanies.includes(comp);
                  return (
                    <button
                      key={comp}
                      type="button"
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          preferredCompanies: selected
                            ? prefs.preferredCompanies.filter((c) => c !== comp)
                            : [...prefs.preferredCompanies, comp],
                        })
                      }
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-700 text-white border-indigo-700 dark:bg-indigo-600 dark:border-indigo-600'
                          : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {comp}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <FieldLabel htmlFor="pref-roles">Preferred roles (comma-separated)</FieldLabel>
                <Input
                  id="pref-roles"
                  value={prefs.preferredRolesText}
                  onChange={(e) => setPrefs({ ...prefs, preferredRolesText: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="pref-locs">Preferred locations</FieldLabel>
                <Input
                  id="pref-locs"
                  value={prefs.preferredLocationsText}
                  onChange={(e) => setPrefs({ ...prefs, preferredLocationsText: e.target.value })}
                />
              </div>
              <div>
                <FieldLabel htmlFor="pref-type">Job type</FieldLabel>
                <Select
                  id="pref-type"
                  value={prefs.jobType}
                  onChange={(e) => setPrefs({ ...prefs, jobType: e.target.value as typeof prefs.jobType })}
                >
                  <option value="Both">Both Internship &amp; Full-time</option>
                  <option value="Full-time">Full-time only</option>
                  <option value="Internship">Internship only</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="pref-mode">Work mode</FieldLabel>
                <Select
                  id="pref-mode"
                  value={prefs.workMode}
                  onChange={(e) => setPrefs({ ...prefs, workMode: e.target.value as typeof prefs.workMode })}
                >
                  <option value="Any">Any</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="pref-sal">Minimum expected salary (optional)</FieldLabel>
                <Input
                  id="pref-sal"
                  value={prefs.minSalary}
                  onChange={(e) => setPrefs({ ...prefs, minSalary: e.target.value })}
                  placeholder="e.g. ₹8L / year"
                />
              </div>
              <div>
                <FieldLabel htmlFor="pref-time">Daily learning commitment (minutes)</FieldLabel>
                <Input
                  id="pref-time"
                  type="number"
                  min={15}
                  max={360}
                  value={prefs.dailyLearningMinutes}
                  onChange={(e) => setPrefs({ ...prefs, dailyLearningMinutes: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4" />
                Save Preferences
              </Button>
            </div>
          </form>
        </Surface>
      )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteSkillId)}
        onClose={() => setDeleteSkillId(null)}
        onConfirm={() => {
          if (deleteSkillId) deleteSkill(deleteSkillId);
        }}
        title="Remove skill?"
        message="This will remove the skill and its recorded verification status from your profile."
        confirmLabel="Remove"
      />
    </div>
  );
}
