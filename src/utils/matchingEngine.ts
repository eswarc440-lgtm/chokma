import {
  CandidateSkill,
  DEFAULT_MATCHING_WEIGHTS,
  JobListing,
  MatchBreakdown,
  MatchingWeights,
  SkillComparisonRow,
  SkillMatchStatus,
  UserProfile,
} from '../types';

/**
 * Normalize skill proficiency strictly based on evidence level:
 * - No evidence: 0
 * - Basic understanding / Claimed: 0.4
 * - Practical beginner / Resume or Course: 0.6
 * - Independently demonstrated / GitHub or Project: 0.8
 * - Strong verified proficiency / Assessment Verified: 1.0
 */
export function normalizeEvidenceProficiency(skill: CandidateSkill | undefined): number {
  if (!skill) return 0;
  if (skill.verificationStatus === 'assessment_verified') {
    return Math.max(skill.proficiencyLevel, 0.9);
  }
  if (skill.verificationStatus === 'evidence_supported') {
    return Math.min(Math.max(skill.proficiencyLevel, 0.6), 0.85);
  }
  // Claimed / resume-only keywords are capped at 0.4–0.55 until backed by evidence or assessment
  return Math.min(Math.max(skill.proficiencyLevel, 0.3), 0.55);
}

function normalizeSkillKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9+#./]/g, '');
}

function findMatchingCandidateSkill(requiredName: string, skills: CandidateSkill[]): CandidateSkill | undefined {
  const target = normalizeSkillKey(requiredName);
  return skills.find((s) => {
    const key = normalizeSkillKey(s.name);
    if (key === target) return true;
    if (target.includes('aws') && key === 'aws') return true;
    if (target === 'python' && key.includes('python')) return true;
    if (target === 'sql' && (key.includes('sql') || key.includes('mysql') || key.includes('postgres'))) return true;
    if (target === 'datastructures&algorithms' && (key === 'dsa' || key.includes('algorithm'))) return true;
    if (target === 'tcp/ip' && (key === 'networking' || key.includes('tcp'))) return true;
    if (target === 'nodejs' && key === 'node') return true;
    return false;
  });
}

export function calculateProfileCompleteness(profile: UserProfile | null, skills: CandidateSkill[]): number {
  if (!profile) return 0;
  let score = 0;
  const checks: [boolean, number][] = [
    [Boolean(profile.displayName?.trim()), 8],
    [Boolean(profile.phone?.trim()), 5],
    [Boolean(profile.location?.trim()), 5],
    [Boolean(profile.college?.trim() && profile.degree?.trim()), 12],
    [Boolean(profile.graduationYear?.trim() && profile.cgpa?.trim()), 8],
    [Boolean(profile.careerObjective && profile.careerObjective.trim().length > 20), 8],
    [skills.length >= 3, 14],
    [skills.some((s) => s.verificationStatus !== 'claimed'), 8],
    [Boolean(profile.resumes && profile.resumes.length > 0), 10],
    [Boolean(profile.githubUsername?.trim() || profile.portfolioUrl?.trim()), 8],
    [Boolean(profile.projects && profile.projects.length > 0), 7],
    [Boolean(profile.preferences?.preferredRoles && profile.preferences.preferredRoles.length > 0), 7],
  ];
  for (const [passed, weight] of checks) {
    if (passed) score += weight;
  }
  return Math.min(100, Math.round(score));
}

export function calculateJobMatch(
  job: JobListing,
  profile: UserProfile | null,
  skills: CandidateSkill[],
  weights: MatchingWeights = DEFAULT_MATCHING_WEIGHTS
): MatchBreakdown {
  const matchedSkills: string[] = [];
  const partialSkills: string[] = [];
  const missingSkills: string[] = [];
  const unverifiedSkills: string[] = [];
  const skillComparisons: SkillComparisonRow[] = [];

  // 1. Evaluate mandatory eligibility without treating missing profile info as automatic failure
  const eligibilityNotes: string[] = [];
  let eligibilityPassed = true;

  if (!profile?.degree) {
    eligibilityNotes.push('Education degree not yet added (unverified — add in Profile to confirm eligibility).');
  } else {
    eligibilityNotes.push(`Academic track recorded: ${profile.degree}${profile.department ? ` (${profile.department})` : ''}.`);
  }

  if (job.jobType === 'Internship' && profile?.graduationYear) {
    eligibilityNotes.push(`Graduation cohort ${profile.graduationYear} checked for internship track.`);
  }

  if (job.status === 'expired') {
    eligibilityPassed = false;
    eligibilityNotes.push('This listing is marked expired.');
  }

  // 2. Technical skills weighted score (40% default)
  let totalReqWeight = 0;
  let earnedReqWeight = 0;

  for (const req of job.requiredSkills) {
    totalReqWeight += req.weight;
    const candidateSkill = findMatchingCandidateSkill(req.name, skills);
    const normalizedProf = normalizeEvidenceProficiency(candidateSkill);

    let status: SkillMatchStatus = 'missing';
    let note = 'Not yet recorded in your profile.';

    if (!candidateSkill) {
      status = 'missing';
      missingSkills.push(req.name);
      note = 'Missing skill — add to roadmap to close this gap.';
    } else if (candidateSkill.verificationStatus === 'claimed') {
      // Unverified resume/self-claimed skill: counts partially but explicitly surfaced as unverified
      status = 'unverified';
      unverifiedSkills.push(req.name);
      earnedReqWeight += req.weight * Math.min(normalizedProf / req.minProficiency, 0.72);
      note = `Listed via ${candidateSkill.evidenceSource}, but unverified. Complete a project or assessment to verify.`;
    } else if (normalizedProf >= req.minProficiency) {
      status = 'matched';
      matchedSkills.push(req.name);
      earnedReqWeight += req.weight * Math.min(normalizedProf / req.minProficiency, 1.0);
      note = `Verified via ${candidateSkill.evidenceSource} (${Math.round(normalizedProf * 100)}% proficiency).`;
    } else {
      status = 'partial';
      partialSkills.push(req.name);
      earnedReqWeight += req.weight * Math.min(normalizedProf / req.minProficiency, 0.85);
      note = `Evidence-supported (${Math.round(normalizedProf * 100)}%), below target threshold (${Math.round(req.minProficiency * 100)}%).`;
    }

    skillComparisons.push({
      skillName: req.name,
      category: req.category,
      importance: req.importance,
      requiredLevel: req.minProficiency,
      candidateLevel: normalizedProf,
      status,
      evidenceSource: candidateSkill ? candidateSkill.evidenceSource : 'none',
      verificationStatus: candidateSkill ? candidateSkill.verificationStatus : 'none',
      note,
    });
  }

  const technicalSkillsScore = totalReqWeight > 0 ? Math.round((earnedReqWeight / totalReqWeight) * 100) : 0;

  // 3. Project relevance score (20% default)
  const reqSkillNamesLower = job.requiredSkills.map((r) => r.name.toLowerCase());
  const profileProjects = profile?.projects || [];
  const githubRepos = profile?.githubAnalysis?.repos || [];
  let relevantProjects = 0;

  for (const p of profileProjects) {
    const haystack = `${p.title} ${p.description} ${(p.technologies || []).join(' ')}`.toLowerCase();
    if (reqSkillNamesLower.some((sk) => haystack.includes(sk.split(' ')[0]))) {
      relevantProjects += 1;
    }
  }
  for (const r of githubRepos) {
    const haystack = `${r.name} ${r.description} ${r.language}`.toLowerCase();
    if (reqSkillNamesLower.some((sk) => haystack.includes(sk.split(' ')[0]))) {
      relevantProjects += 0.75;
    }
  }
  const projectRelevanceScore =
    profileProjects.length === 0 && githubRepos.length === 0
      ? 25 // Unverified baseline rather than automatic 0 penalty
      : Math.min(100, Math.round(35 + relevantProjects * 25));

  // 4. Education score (15% default)
  let educationScore = 50; // Unverified neutral baseline
  if (profile?.degree) {
    const deg = `${profile.degree} ${profile.department || ''}`.toLowerCase();
    if (deg.includes('b.tech') || deg.includes('b.e') || deg.includes('computer') || deg.includes('engineering') || deg.includes('mca')) {
      educationScore = 92;
    } else {
      educationScore = 75;
    }
    const cgpaNum = parseFloat(profile.cgpa || '');
    if (!Number.isNaN(cgpaNum) && cgpaNum >= 7.5 && cgpaNum <= 10) {
      educationScore = Math.min(100, educationScore + 8);
    }
  }

  // 5. Experience score (15% default)
  const expCount = profile?.experience?.length || 0;
  const experienceScore = expCount === 0 ? 45 : Math.min(100, 60 + expCount * 20);

  // 6. Certifications score (10% default)
  const certs = profile?.certifications || [];
  let certScore = certs.length === 0 ? 20 : Math.min(100, 45 + certs.length * 25);
  if (certs.some((c) => c.name.toLowerCase().includes('aws') || c.name.toLowerCase().includes('cloud') || c.name.toLowerCase().includes('azure'))) {
    if (job.title.toLowerCase().includes('cloud') || job.company === 'Amazon') {
      certScore = Math.min(100, certScore + 25);
    }
  }

  const totalWeight =
    weights.technicalSkillsWeight +
    weights.projectRelevanceWeight +
    weights.educationWeight +
    weights.experienceWeight +
    weights.certificationsWeight;

  const normFactor = totalWeight > 0 ? totalWeight : 100;
  const overallScore = Math.round(
    (technicalSkillsScore * weights.technicalSkillsWeight +
      projectRelevanceScore * weights.projectRelevanceWeight +
      educationScore * weights.educationWeight +
      experienceScore * weights.experienceWeight +
      certScore * weights.certificationsWeight) /
      normFactor
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    eligibilityPassed,
    eligibilityNotes,
    technicalSkillsScore,
    projectRelevanceScore,
    educationScore,
    experienceScore,
    certificationsScore: certScore,
    matchedSkills,
    partialSkills,
    missingSkills,
    unverifiedSkills,
    skillComparisons,
    disclaimer:
      'Explainable skill-evidence alignment score. This reflects current profile and verified evidence coverage — it is not a hiring or selection probability.',
  };
}
