'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
} from 'react';
import { Menu, X, BookOpen } from 'lucide-react';

export interface NavTopic {
  id: string;
  label: string;
}

interface LearnTopicNavProps {
  topics: NavTopic[];
}

/**
 * Mobile-first topic navigation for the Learn section (issue #692).
 *
 * - On small screens: a sticky "Topics" button opens a slide-in drawer.
 *   Closing the drawer restores focus to the trigger button.
 * - On md+ screens: renders as a static sidebar list (the drawer is hidden).
 * - Active topic is tracked via IntersectionObserver and highlighted in both
 *   the drawer and the sidebar.
 */
export function LearnTopicNav({ topics }: LearnTopicNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>(topics[0]?.id ?? '');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const navId = useId();
  const drawerId = `learn-topic-drawer-${navId}`;

  // Track which section heading is in view.
  useEffect(() => {
    const targets = topics
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The first intersecting entry from the top wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveTopic(visible[0].target.id);
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [topics]);

  // Close drawer on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [drawerOpen]);

  // Trap focus inside the drawer when it is open.
  useEffect(() => {
    if (!drawerOpen || !drawerRef.current) return;
    const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Restore focus to the trigger button after the state update paints.
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const handleTopicClick = (id: string) => {
    // Navigate to the section.
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Move focus to the section heading for screen readers.
      el.focus();
    }
    closeDrawer();
  };

  const NavList = ({ onClick }: { onClick?: (id: string) => void }) => (
    <ul role="list" className="space-y-1">
      {topics.map((topic) => {
        const isActive = topic.id === activeTopic;
        return (
          <li key={topic.id}>
            <a
              href={`#${topic.id}`}
              onClick={(e) => {
                e.preventDefault();
                (onClick ?? handleTopicClick)(topic.id);
              }}
              aria-current={isActive ? 'location' : undefined}
              className={[
                'block px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-emerald-500/15 text-emerald-300 font-semibold border-l-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60',
              ].join(' ')}
            >
              {topic.label}
            </a>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Mobile sticky trigger (hidden on md+)                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="md:hidden sticky top-4 z-30 flex justify-end px-4 mb-4">
        <button
          ref={triggerRef}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          onClick={() => setDrawerOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/90 border border-slate-700 text-slate-300 text-sm font-medium shadow-lg hover:bg-slate-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <Menu size={16} aria-hidden="true" />
          Topics
        </button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile drawer                                                        */}
      {/* ------------------------------------------------------------------ */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Panel */}
          <div
            id={drawerId}
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Vault topics"
            className="relative ml-auto w-72 max-w-full h-full bg-[#0d1117] border-l border-slate-800 shadow-2xl flex flex-col overflow-y-auto"
          >
            <div className="flex items-center justify-between px-4 pt-5 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-semibold">
                <BookOpen size={18} className="text-emerald-400" aria-hidden="true" />
                Topics
              </div>
              <button
                onClick={closeDrawer}
                aria-label="Close topics menu"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X size={18} />
              </button>
            </div>

            <nav aria-label="Vault topics" className="p-4 flex-1">
              <NavList onClick={handleTopicClick} />
            </nav>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Desktop sidebar (hidden on mobile)                                  */}
      {/* ------------------------------------------------------------------ */}
      <aside
        aria-label="Vault topics"
        className="hidden md:block sticky top-10 self-start w-52 shrink-0"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 px-3 mb-3">
          Topics
        </p>
        <nav>
          <NavList />
        </nav>
      </aside>
    </>
  );
}
