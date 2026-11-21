/**
 * Chokma (CareerPilot) Firestore Security Rules — Dirty Dozen Adversarial Verification Spec
 *
 * Run against Firebase Emulator Suite (`firebase emulators:exec`) when local emulators are installed.
 * All 12 adversarial payloads validate Identity, Integrity, PII Isolation, and Terminal State Locking.
 */

export interface DirtyDozenCase {
  id: string;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  payload?: Record<string, unknown>;
  reason: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    name: 'Shadow Role Escalation on Profile Create',
    collectionPath: '/users/userA',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { uid: 'userA', email: 'a@example.com', displayName: 'Alice', role: 'admin', profileCompleteness: 50 },
    reason: 'Non-admin users are strictly limited to role == student on create.',
  },
  {
    id: 'DD-02',
    name: 'Ghost Field Injection on Profile Update',
    collectionPath: '/users/userA',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { isVerifiedAdmin: true },
    reason: 'isValidUserProfile and affectedKeys().hasOnly() reject undeclared fields.',
  },
  {
    id: 'DD-03',
    name: 'Cross-User PII Read',
    collectionPath: '/users/userA',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    reason: 'User B cannot read User A profile document containing email and phone PII.',
  },
  {
    id: 'DD-04',
    name: 'Cross-User Subcollection Write',
    collectionPath: '/users/userA/skills/skill1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { userId: 'userA', name: 'AWS IAM', category: 'Cloud', proficiencyLevel: 1.0 },
    reason: 'isVerifiedOwner(userId) blocks writes from any uid != userId.',
  },
  {
    id: 'DD-05',
    name: 'Spoofed Owner Field in Application',
    collectionPath: '/users/userA/applications/app1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { userId: 'userB', jobId: 'job_csa', jobTitle: 'Cloud Support Associate', company: 'Amazon' },
    reason: 'isValidApplication requires incoming().userId == userId == request.auth.uid.',
  },
  {
    id: 'DD-06',
    name: 'ID Poisoning (Denial of Wallet)',
    collectionPath: '/users/userA/skills/' + 'x'.repeat(200),
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    reason: 'isValidId() enforces <= 128 chars and ^[a-zA-Z0-9_\\-]+$.',
  },
  {
    id: 'DD-07',
    name: 'Client-Forged Timestamp on Daily Task',
    collectionPath: '/users/userA/daily_tasks/task1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { userId: 'userA', createdAt: '2020-01-01T00:00:00Z' },
    reason: 'createdAt and updatedAt must strictly equal request.time.',
  },
  {
    id: 'DD-08',
    name: 'Immutable Field Tampering on Application Update',
    collectionPath: '/users/userA/applications/app1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { jobId: 'different_job_id' },
    reason: 'jobId and createdAt are immutable after creation.',
  },
  {
    id: 'DD-09',
    name: 'Terminal State Tampering on Completed Assessment',
    collectionPath: '/users/userA/assessments/assess1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { scorePercent: 100, passed: true },
    reason: 'Assessments are terminal-locked once created; students cannot alter scores.',
  },
  {
    id: 'DD-10',
    name: 'Unverified Email Admin Spoof',
    collectionPath: '/admin_settings/matching_weights',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { technicalSkillsWeight: 100 },
    reason: 'isAdmin() requires request.auth.token.email_verified == true.',
  },
  {
    id: 'DD-11',
    name: 'Oversized String Exhaustion',
    collectionPath: '/users/userA/skills/skill2',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { userId: 'userA', name: 'A'.repeat(5000) },
    reason: 'isValidSkill enforces name.size() <= 80.',
  },
  {
    id: 'DD-12',
    name: 'Unauthorized Job Catalog Mutation',
    collectionPath: '/jobs/fake_job',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    payload: { title: 'Fake Role', company: 'Spoof Corp' },
    reason: 'Only verified admins can create or modify global /jobs listings.',
  },
];
