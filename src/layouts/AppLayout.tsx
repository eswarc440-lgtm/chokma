import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  UserCircle2,
  Briefcase,
  Map as MapIcon,
  Bot,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  Mic,
  Video,
  MessageSquare,
  LayoutDashboard,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { cn } from '../lib/utils';
import { formatAccountIdentifier } from '../lib/authIdentifier';
import { Modal } from '../components/ui/Primitives';
import { AssistantDrawer } from '../components/AssistantDrawer';

export function AppLayout() {
  const { user, profile, jobs, skills, courses, dailyTasks, applications, signOut } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agentQuickMenuOpen, setAgentQuickMenuOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setNotifOpen(false);
    setAccountOpen(false);
    setAgentQuickMenuOpen(false);
  }, [location.pathname]);

  // Close popovers on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  // Global Cmd/Ctrl+K search shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setAccountOpen(false);
        setAgentQuickMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isJobsActive =
    location.pathname.startsWith('/jobs') || location.pathname.startsWith('/applications');
  const isLearningActive = location.pathname.startsWith('/learning');
  const isProfileActive = location.pathname.startsWith('/profile');
  const isSettingsActive = location.pathname.startsWith('/settings');

  const notifications = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; to: string }> = [];
    const pendingTasks = dailyTasks.filter((t) => t.status !== 'completed');
    if (pendingTasks.length > 0) {
      items.push({
        id: 'pending-tasks',
        title: `${pendingTasks.length} daily learning task${pendingTasks.length > 1 ? 's' : ''} remaining`,
        detail: `Next up: ${pendingTasks[0].title}`,
        to: '/learning/tasks',
      });
    }
    const unverifiedSkills = skills.filter((s) => s.verificationStatus === 'claimed');
    if (unverifiedSkills.length > 0) {
      items.push({
        id: 'unverified-skills',
        title: `${unverifiedSkills.length} claimed skill${unverifiedSkills.length > 1 ? 's' : ''} awaiting verification`,
        detail: 'Complete an assessment or project to verify proficiency.',
        to: '/learning/assessments',
      });
    }
    const upcomingApps = applications.filter(
      (a) => a.deadline && a.status !== 'Rejected' && a.status !== 'Selected'
    );
    if (upcomingApps.length > 0) {
      items.push({
        id: 'upcoming-app',
        title: `Application deadline: ${upcomingApps[0].company}`,
        detail: `${upcomingApps[0].jobTitle} · Due ${upcomingApps[0].deadline}`,
        to: '/applications',
      });
    }
    if ((profile?.profileCompleteness || 0) < 70) {
      items.push({
        id: 'profile-comp',
        title: `Profile completeness at ${profile?.profileCompleteness || 0}%`,
        detail: 'Upload your resume or link GitHub to sharpen job matching.',
        to: '/profile',
      });
    }
    return items;
  }, [dailyTasks, skills, applications, profile]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ category: string; title: string; subtitle: string; to: string }> = [];
    jobs
      .filter((j) => `${j.title} ${j.company} ${j.location}`.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((j) =>
        results.push({
          category: 'Job',
          title: j.title,
          subtitle: `${j.company} · ${j.location}`,
          to: `/jobs/${j.id}`,
        })
      );
    courses
      .filter((c) => `${c.title} ${c.provider} ${c.targetSkill}`.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((c) =>
        results.push({
          category: 'Course',
          title: c.title,
          subtitle: `${c.provider} · ${c.targetSkill}`,
          to: '/learning/courses',
        })
      );
    dailyTasks
      .filter((t) => `${t.title} ${t.targetSkill}`.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((t) =>
        results.push({
          category: 'Task',
          title: t.title,
          subtitle: `${t.targetSkill} · ${t.estimatedMinutes} min`,
          to: '/learning/tasks',
        })
      );
    skills
      .filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((s) =>
        results.push({
          category: 'Skill',
          title: s.name,
          subtitle: `${s.category} · ${Math.round(s.proficiencyLevel * 100)}%`,
          to: '/profile',
        })
      );
    return results;
  }, [searchQuery, jobs, courses, dailyTasks, skills]);

  const initials = (profile?.displayName || user?.displayName || user?.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const headerNavLinkClass = (active: boolean) =>
    cn(
      'relative inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer',
      active
        ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-semibold'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100/90 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
    );

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FB] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Clean Single-Row Top Header Bar: Chokma + Job Intelligence + Learning Outcomes + Profile directly beside it */}
      <header
        ref={headerRef}
        className="sticky top-0 z-30 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200/90 dark:border-slate-800"
      >
        <div className="max-w-[1400px] mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-6">
          {/* Left Zone: Brand + Primary Direct Dashboard Links right beside Chokma */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              title="Go to Overview Dashboard"
              className="flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 rounded-md whitespace-nowrap shrink-0"
            >
              <span className="w-8 h-8 rounded-lg bg-indigo-700 dark:bg-indigo-600 text-white flex items-center justify-center shrink-0">
                <svg
                  width="16"
                  height="16"
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
              <span className="font-semibold text-[15px] tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                Chokma
              </span>
            </button>

            <span
              aria-hidden="true"
              className="hidden md:block h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0"
            />

            {/* Direct Dashboard Navigation right beside Chokma */}
            <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-1">
              <NavLink to="/jobs" className={() => headerNavLinkClass(isJobsActive)}>
                <Briefcase className="w-4 h-4 shrink-0" />
                <span>Job Intelligence</span>
              </NavLink>

              <NavLink to="/learning" className={() => headerNavLinkClass(isLearningActive)}>
                <MapIcon className="w-4 h-4 shrink-0" />
                <span>Learning Outcomes</span>
              </NavLink>

              <NavLink to="/profile" className={() => headerNavLinkClass(isProfileActive)}>
                <UserCircle2 className="w-4 h-4 shrink-0" />
                <span>Profile</span>
              </NavLink>
            </nav>
          </div>

          {/* Right Utility Controls: Search, Notifications, Settings, User Account (NO AI Agent button in top bar) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="h-9 px-3 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Search Chokma"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Search...</span>
              <kbd className="hidden sm:inline font-mono text-[10px] text-slate-400 dark:text-slate-500">
                ⌘K
              </kbd>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setAccountOpen(false);
                }}
                aria-label="Notifications"
                className="relative h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-mono font-bold flex items-center justify-center">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-40">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Workspace Alerts
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {notifications.length}
                    </span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                      All caught up. No pending alerts.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(n.to);
                          }}
                          className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                        >
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            {n.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {n.detail}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Settings button */}
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label="Settings"
              title="Settings"
              className={cn(
                'h-9 w-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer',
                isSettingsActive
                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Avatar & Account Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((o) => !o);
                  setNotifOpen(false);
                }}
                aria-label="Account menu"
                className="h-9 w-9 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center cursor-pointer"
              >
                {initials}
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 z-40">
                  <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {profile?.displayName || user?.displayName || 'Student'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {formatAccountIdentifier(user?.email)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <LayoutDashboard className="w-3.5 h-3.5" />
                    Overview Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/profile');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <UserCircle2 className="w-3.5 h-3.5" />
                    Profile &amp; Theme Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 space-y-1 shadow-xl">
            <NavLink to="/" end className={({ isActive }) => cn(headerNavLinkClass(isActive), 'w-full justify-start')}>
              <LayoutDashboard className="w-4 h-4" />
              Overview Dashboard
            </NavLink>
            <NavLink to="/jobs" className={() => cn(headerNavLinkClass(isJobsActive), 'w-full justify-start')}>
              <Briefcase className="w-4 h-4" />
              Job Intelligence
            </NavLink>
            <NavLink to="/learning" className={() => cn(headerNavLinkClass(isLearningActive), 'w-full justify-start')}>
              <MapIcon className="w-4 h-4" />
              Learning Outcomes
            </NavLink>
            <NavLink to="/profile" className={() => cn(headerNavLinkClass(isProfileActive), 'w-full justify-start')}>
              <UserCircle2 className="w-4 h-4" />
              Profile (Dark / Light Mode)
            </NavLink>
            <NavLink to="/settings" className={() => cn(headerNavLinkClass(isSettingsActive), 'w-full justify-start')}>
              <Settings className="w-4 h-4" />
              Settings
            </NavLink>
          </div>
        )}
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 pb-24">
        <Outlet context={{ openAssistantDrawer: () => setDrawerOpen(true) }} />
      </main>

      {/* Persistent Floating Bottom-Right AI Agent Dock (Visible Everywhere) */}
      {!drawerOpen && (
        <div
          aria-label="Floating AI Agent"
          className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2"
        >
          {agentQuickMenuOpen && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-1.5 w-52 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setAgentQuickMenuOpen(false);
                  setDrawerOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Quick Text &amp; Voice Drawer
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgentQuickMenuOpen(false);
                  navigate('/assistant?mode=voice');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Air Voice Assistant
              </button>
              <button
                type="button"
                onClick={() => {
                  setAgentQuickMenuOpen(false);
                  navigate('/assistant?mode=video');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Live Face-to-Face Camera
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full p-1.5 shadow-xl">
            <button
              type="button"
              onClick={() => setAgentQuickMenuOpen((v) => !v)}
              aria-label="AI Agent modes"
              title="Voice & Live Camera modes"
              className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer"
            >
              {agentQuickMenuOpen ? <X className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setAgentQuickMenuOpen(false);
                setDrawerOpen(true);
              }}
              className="h-9 px-4 rounded-full bg-indigo-700 hover:bg-indigo-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Bot className="w-4 h-4" />
              <span>AI Agent</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchQuery('');
        }}
        title="Search Workspace"
        description="Find jobs, skills, courses, and daily tasks across Chokma."
      >
        <div className="space-y-4">
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Type a role, company, skill, or course..."
            className="w-full h-10 px-3.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600"
          />
          {searchQuery.trim() && searchResults.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No matching records found for &ldquo;{searchQuery}&rdquo;.
            </p>
          )}
          {searchResults.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {searchResults.map((res, idx) => (
                <button
                  key={`${res.category}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery('');
                    navigate(res.to);
                  }}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/70 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {res.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {res.subtitle}
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
                    {res.category}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Global Compact AI Assistant Drawer */}
      <AssistantDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
