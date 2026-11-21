import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Moon,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button, FieldLabel, Input, SegmentedTabs } from '../components/ui/Primitives';

const FIREBASE_PROVIDERS_URL =
  'https://console.firebase.google.com/project/gen-lang-client-0125498620/authentication/providers';

export function AuthPage() {
  const { signInWithGoogle, signInWithEmail, registerWithEmail, resetPassword } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('register');
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [needsConsoleEnable, setNeedsConsoleEnable] = useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    setErrorMsg('');
    setNeedsConsoleEnable(false);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleCredentialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMsg('');
    setNeedsConsoleEnable(false);
    try {
      if (mode === 'signin') {
        await signInWithEmail(identifier, password);
      } else if (mode === 'register') {
        await registerWithEmail(displayName, identifier, password);
      } else {
        await resetPassword(identifier);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Authentication failed.';
      if (raw.includes('operation-not-allowed')) {
        setNeedsConsoleEnable(true);
        setErrorMsg(
          'Username & Password sign-in needs Email/Password toggled ON once in your Firebase Console.'
        );
      } else if (
        raw.includes('invalid-credential') ||
        raw.includes('wrong-password') ||
        raw.includes('user-not-found')
      ) {
        setErrorMsg('Incorrect username/email or password. Double-check your credentials or create an account.');
      } else if (raw.includes('email-already-in-use')) {
        setErrorMsg('That username or email already has an account. Switch to "Sign In" above.');
      } else if (raw.includes('weak-password')) {
        setErrorMsg('Password must be at least 6 characters long.');
      } else {
        setErrorMsg(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] dark:bg-[#0B0F17] flex flex-col">
      <header className="h-16 px-6 lg:px-10 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-lg bg-indigo-700 text-white flex items-center justify-center">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <polyline points="22 8.5 12 15.5 2 8.5" />
            </svg>
          </span>
          <span className="font-semibold text-base tracking-tight text-slate-900 dark:text-slate-100">
            Chokma
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </header>

      <div className="flex-1 grid lg:grid-cols-12 max-w-[1200px] w-full mx-auto px-6 py-10 lg:py-14 gap-12 items-center">
        {/* Left editorial value column */}
        <div className="lg:col-span-7 space-y-6">
          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-400">
            CareerPilot Intelligence Architecture
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-[1.15] max-w-xl">
            Move from student profile to verified job readiness with clarity.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-lg leading-relaxed">
            Chokma connects your resume, public GitHub projects, real-world Google Search job
            discovery, 3D &amp; pictorial roadmaps, and a multi-language Gemini voice &amp; camera
            mentor in one clean workspace.
          </p>

          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            {[
              [
                'Auto-Tracked Learning',
                'Watch embedded course videos and run guided focus sessions — progress syncs automatically to your roadmap and outcomes.',
              ],
              [
                '3D & Pictorial Career Roadmaps',
                'Explore interactive Three.js 3D roadmaps and create or edit visual roadmap graphics reflecting your live milestones.',
              ],
              [
                'Live Job Intelligence',
                'Explainable weighted job matching plus real-world company career search backed by Google Search.',
              ],
              [
                'Text, Air Voice & Live Camera Mentor',
                'Ask anything in multiple languages via text chat, hands-free Air Voice, or face-to-face live webcam mentorship.',
              ],
            ].map(([heading, desc]) => (
              <div key={heading} className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>{heading}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-6">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right sign-in & account creation panel */}
        <div className="lg:col-span-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {mode === 'register'
                  ? 'Create your Chokma account'
                  : mode === 'signin'
                  ? 'Sign in to Chokma'
                  : 'Reset your password'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Create a username &amp; password to sign in immediately, or continue with Google for
                cloud-synced storage.
              </p>
            </div>

            <SegmentedTabs
              className="w-full grid grid-cols-3"
              active={mode}
              onChange={(m) => {
                setMode(m);
                setErrorMsg('');
                setNeedsConsoleEnable(false);
              }}
              tabs={[
                { id: 'register', label: 'Create Account' },
                { id: 'signin', label: 'Sign In' },
                { id: 'reset', label: 'Reset' },
              ]}
            />

            <form onSubmit={handleCredentialSubmit} className="space-y-3.5">
              <div>
                <FieldLabel htmlFor="auth-identifier">
                  {mode === 'reset' ? 'Email address' : 'Username'}
                </FieldLabel>
                <Input
                  id="auth-identifier"
                  type={mode === 'reset' ? 'email' : 'text'}
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={
                    mode === 'reset' ? 'student@university.edu' : 'Choose a username (e.g. alex_dev)'
                  }
                />
                {mode !== 'reset' && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Works instantly with any username (3–30 characters, no spaces) and password.
                  </p>
                )}
              </div>

              {mode === 'register' && (
                <div>
                  <FieldLabel htmlFor="auth-name">Full name (optional)</FieldLabel>
                  <Input
                    id="auth-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Defaults to your username if left blank"
                  />
                </div>
              )}

              {mode !== 'reset' && (
                <div>
                  <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                  <div className="relative">
                    <Input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg px-3.5 py-2.5 space-y-2 leading-relaxed"
                >
                  <p>{errorMsg}</p>
                  {needsConsoleEnable && (
                    <div className="space-y-2 pt-1 text-slate-700 dark:text-slate-300">
                      <ol className="list-decimal pl-4 space-y-0.5 text-[11px]">
                        <li>Open Firebase Console Authentication Providers below.</li>
                        <li>
                          Click <strong>Email/Password</strong>, toggle <strong>Enable</strong>, and
                          click <strong>Save</strong>.
                        </li>
                        <li>Return here and submit your username &amp; password again.</li>
                      </ol>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <a
                          href={FIREBASE_PROVIDERS_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-400 hover:underline"
                        >
                          Open Firebase Console <ExternalLink className="w-3 h-3" />
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleGoogle}
                          disabled={busy}
                        >
                          Or Continue with Google
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
                {mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{busy ? 'Creating Account...' : 'Create Account'}</span>
                  </>
                ) : mode === 'signin' ? (
                  <>
                    <span>{busy ? 'Signing In...' : 'Sign In'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  <span>{busy ? 'Sending Reset Link...' : 'Send Password Reset Link'}</span>
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
              <span className="px-3 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                or
              </span>
              <div className="flex-1 border-t border-slate-200 dark:border-slate-800" />
            </div>

            {/* Instant Google Sign-In */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-between px-4"
                onClick={handleGoogle}
                disabled={busy}
              >
                <span className="inline-flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded bg-white flex items-center justify-center shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3a7.17 7.17 0 0 1-10.67-3.76H1.4v3.09A12 12 0 0 0 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.39 14.34a7.2 7.2 0 0 1 0-4.68V6.57H1.4a12 12 0 0 0 0 10.86l3.99-3.09z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.4 6.57l3.99 3.09A7.16 7.16 0 0 1 12 4.75z"
                      />
                    </svg>
                  </span>
                  <span>Continue with Google</span>
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Credentials are securely handled by Firebase Authentication.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
