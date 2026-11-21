import React from 'react';
import { cn } from '../../lib/utils';

export interface DashboardLeftNavItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export function DashboardLeftNav<T extends string>({
  title,
  items,
  active,
  onChange,
  className,
}: {
  title: string;
  items: DashboardLeftNavItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        'w-full lg:w-60 shrink-0 lg:sticky lg:top-20 lg:self-start',
        className
      )}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-2">
        <p className="hidden lg:block px-3 pt-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </p>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
          {items.map((item) => {
            const isActive = item.id === active;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap lg:w-full text-left',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="hidden lg:block absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-indigo-600 dark:bg-indigo-400"
                  />
                )}
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  {item.icon && (
                    <span
                      className={cn(
                        'shrink-0',
                        isActive
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                      )}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={cn(
                      'font-mono tabular-nums text-[11px] px-1.5 py-0.5 rounded-md shrink-0',
                      isActive
                        ? 'bg-indigo-100/90 text-indigo-700 dark:bg-indigo-900/70 dark:text-indigo-200'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
