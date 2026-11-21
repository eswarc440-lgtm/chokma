import React, { useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  X,
  CircleDashed,
  ShieldCheck,
  FileCheck2,
} from 'lucide-react';
import { cn } from '../../lib/utils';

// =============================================================================
// BUTTON
// =============================================================================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-indigo-700 hover:bg-indigo-800 text-white border border-transparent focus-visible:ring-indigo-600 dark:bg-indigo-600 dark:hover:bg-indigo-500',
    secondary:
      'bg-slate-100 hover:bg-slate-200 text-slate-900 border border-transparent dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 focus-visible:ring-slate-500',
    outline:
      'bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-100 dark:border-slate-700 focus-visible:ring-indigo-600',
    ghost:
      'bg-transparent hover:bg-slate-100 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/80 border border-transparent focus-visible:ring-slate-500',
    danger:
      'bg-red-700 hover:bg-red-800 text-white border border-transparent focus-visible:ring-red-600',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-10 px-5 text-sm gap-2',
  };

  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}

// =============================================================================
// INPUT / TEXTAREA / SELECT
// =============================================================================
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full h-9 px-3 text-sm rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 dark:focus:border-indigo-500 transition-colors',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 dark:focus:border-indigo-500 transition-colors resize-y',
      className
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full h-9 px-3 text-sm rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600/30 focus:border-indigo-600 dark:focus:border-indigo-500 transition-colors',
      className
    )}
    {...props}
  />
));
Select.displayName = 'Select';

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-700 dark:text-slate-300">
        {children}
      </label>
      {hint && <span className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
    </div>
  );
}

// =============================================================================
// SURFACE PANEL (Single-Elevation Depth, 1px hairline border, never nested)
// =============================================================================
export function Surface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl',
        className
      )}
    >
      {children}
    </div>
  );
}

// =============================================================================
// PROGRESS BAR (Accessible, clean hairline bar)
// =============================================================================
export function ProgressBar({
  value,
  label,
  tone = 'indigo',
  className,
}: {
  value: number;
  label?: string;
  tone?: 'indigo' | 'emerald' | 'amber' | 'slate';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const fillColors = {
    indigo: 'bg-indigo-600 dark:bg-indigo-500',
    emerald: 'bg-emerald-600 dark:bg-emerald-500',
    amber: 'bg-amber-600 dark:bg-amber-500',
    slate: 'bg-slate-600 dark:bg-slate-400',
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || 'Progress'}
        className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
      >
        <div
          className={cn('h-full rounded-full transition-all duration-300', fillColors[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// SEMANTIC STATUS INDICATOR (Text + Icon, NEVER color-only or static pill box)
// =============================================================================
export function StatusText({
  tone,
  label,
  icon = true,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  label: string;
  icon?: boolean;
}) {
  const styles = {
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    danger: 'text-red-700 dark:text-red-400',
    info: 'text-indigo-700 dark:text-indigo-400',
    neutral: 'text-slate-600 dark:text-slate-400',
  };

  const IconComp = {
    success: CheckCircle2,
    warning: Clock,
    danger: AlertCircle,
    info: HelpCircle,
    neutral: CircleDashed,
  }[tone];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', styles[tone])}>
      {icon && <IconComp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

export function VerificationBadgeText({ status }: { status: string }) {
  if (status === 'assessment_verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Assessment Verified
      </span>
    );
  }
  if (status === 'evidence_supported') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
        <FileCheck2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        Evidence Supported
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 whitespace-nowrap">
      <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Claimed (Unverified)
    </span>
  );
}

// =============================================================================
// SEGMENTED TABS (Interactive Functional Control)
// =============================================================================
export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/80 rounded-lg overflow-x-auto max-w-full',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5',
              isActive
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            )}
          >
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="font-mono text-[11px] tabular-nums opacity-70">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// ACCESSIBLE MODAL DIALOG
// =============================================================================
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={cn(
          'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl max-h-[90vh] flex flex-col',
          maxWidth
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="modal-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// =============================================================================
// CONFIRM DESTRUCTIVE ACTION DIALOG
// =============================================================================
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Delete',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{message}</p>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// =============================================================================
// EMPTY STATE
// =============================================================================
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}
