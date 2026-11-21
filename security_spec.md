# Chokma (CareerPilot) Firestore Security Specification

## 1. Data Invariants
1. **Strict User Data Isolation (PII Protection)**: Documents under `/users/{userId}` and every subcollection beneath `/users/{userId}/...` are strictly readable and writable ONLY by `request.auth.uid == userId` (with `email_verified == true` for writes) or a verified administrator.
2. **Master Gate Relational Sync**: Every subcollection write under `/users/{userId}/...` verifies parent user document existence and enforces `incoming().userId == userId == request.auth.uid`.
3. **No Self-Assigned Admin Roles**: Users creating `/users/{userId}` can ONLY set `role == 'student'` and cannot escalate `role` on update. Admin verification relies strictly on verified email (`request.auth.token.email == 'santhoshosanthosho19@gmail.com' && request.auth.token.email_verified == true`) or an existing `/admins/{uid}` document.
4. **Immutable Ownership & Timestamps**: `uid` / `userId` and `createdAt` are immutable after creation. All `createdAt` (on create) and `updatedAt` (on create/update) must equal `request.time`.
5. **Terminal State Locking**: Completed assessment records in `/users/{userId}/assessments/{assessmentId}` cannot be mutated by students after creation (`allow update: if isAdmin()`).
6. **Admin-Only Global Writes**: `/jobs/{jobId}` and `/admin_settings/{settingId}` are readable by signed-in users (with explicit status/resource checks) and writable exclusively by verified administrators.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Role Escalation**: Create `/users/userA` with `{ role: "admin" }`.
2. **Ghost Field Injection**: Update `/users/userA` with an undeclared field `{ isVerifiedAdmin: true }`.
3. **Cross-User PII Read**: Authenticated `userB` attempts `get` on `/users/userA`.
4. **Cross-User Subcollection Write**: `userB` attempts `create` on `/users/userA/skills/s1` with `userId: "userA"`.
5. **Spoofed Owner Field**: `userA` attempts `create` on `/users/userA/applications/a1` with `userId: "userB"`.
6. **ID Poisoning (Denial of Wallet)**: Create `/users/userA/skills/{1500_char_invalid_id}` containing spaces/slashes.
7. **Timestamp Forgery**: Create `/users/userA/daily_tasks/t1` with client-forged `createdAt` != `request.time`.
8. **Immutable Field Tampering**: Update `/users/userA/applications/a1` changing `createdAt` or `jobId`.
9. **Terminal Assessment Tampering**: `userA` attempts to `update` `/users/userA/assessments/as1` to change `scorePercent: 100`.
10. **Unverified Email Admin Spoof**: Token with `email: "santhoshosanthosho19@gmail.com"` and `email_verified: false` writes to `/admin_settings/matching_weights`.
11. **Oversized String Exhaustion**: Create `/users/userA/skills/s1` with `name` of 50,000 characters.
12. **Unauthorized Job Catalog Mutation**: Non-admin student attempts to create or update `/jobs/j1`.
