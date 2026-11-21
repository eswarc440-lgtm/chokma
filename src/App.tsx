import React, { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Loader2, MailCheck, RefreshCw, LogOut } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AppProvider, useApp } from './contexts/AppContext';
import { AppLayout } from './layouts/AppLayout';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { JobIntelligenceDashboard } from './pages/JobIntelligenceDashboard';
import { JobDetailsPage } from './pages/JobDetailsPage';
import { LearningPage } from './pages/LearningPage';
import { AssistantPage } from './pages/AssistantPage';
import { SettingsPage } from './pages/SettingsPage';
import { Button } from './components/ui/Primitives';
import { canAccessWorkspace } from './lib/authIdentifier';

function EmailVerificationGate() {
  const { user, resendVerificationEmail, refreshUserAuth, signOut } = useApp();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB] dark:bg-[#0B0F17] p-6">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-7 space-y-5 text-center">
        <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center mx-auto">
          <MailCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Verify your email address
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            We sent a verification link to{' '}
            <strong className="text-slate-900 dark:text-slate-100">{user?.email}</strong>. Click the
            link in your inbox to unlock your private Chokma career workspace.
          </p>
        </div>
        <div className="space-y-2.5 pt-1">
          <Button
            className="w-full"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              try {
                await refreshUserAuth();
              } finally {
                setChecking(false);
              }
            }}
          >
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking verification...' : "I've verified — Continue"}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={resending}
            onClick={async () => {
              setResending(true);
              try {
                await resendVerificationEmail();
              } finally {
                setResending(false);
              }
            }}
          >
            {resending ? 'Sending link...' : 'Resend Verification Email'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={signOut}>
            <LogOut className="w-4 h-4" />
            Sign out and use Google instead
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, authLoading } = useApp();
  const { theme } = useTheme();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-700 text-white font-semibold flex items-center justify-center text-base shadow-sm">
          C
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
          <span>Loading Chokma workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        theme={theme}
        richColors
        toastOptions={{
          className: 'text-xs font-medium',
        }}
      />
      {!user ? (
        <AuthPage />
      ) : !canAccessWorkspace(user) ? (
        <EmailVerificationGate />
      ) : (
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/jobs" element={<JobIntelligenceDashboard section="recommended" />} />
            <Route path="/jobs/recommended" element={<JobIntelligenceDashboard section="recommended" />} />
            <Route path="/jobs/selected" element={<JobIntelligenceDashboard section="selected" />} />
            <Route path="/jobs/:jobId" element={<JobDetailsPage />} />
            <Route path="/applications" element={<JobIntelligenceDashboard section="applications" />} />
            <Route path="/learning" element={<LearningPage section="roadmap" />} />
            <Route path="/learning/roadmap" element={<LearningPage section="roadmap" />} />
            <Route path="/learning/courses" element={<LearningPage section="courses" />} />
            <Route path="/learning/tasks" element={<LearningPage section="tasks" />} />
            <Route path="/learning/projects" element={<LearningPage section="projects" />} />
            <Route path="/learning/assessments" element={<LearningPage section="assessments" />} />
            <Route path="/learning/outcomes" element={<LearningPage section="outcomes" />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
