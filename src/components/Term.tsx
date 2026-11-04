"use client";
import { useState, useRef, useCallback, useId } from "react";
import { GLOSSARY } from "@/lib/glossary";

// Accessible jargon tooltip. Opens on mouse hover, keyboard focus, and tap/click.
// Closes on mouse-leave, blur, Escape, or a second tap. Never uses <abbr title>
// (screen readers announce it inconsistently and axe flags it for keyboard users).

interface TermProps {
  term: string;
  children?: React.ReactNode;
}

export function Term({ term, children }: TermProps) {
  const def = GLOSSARY[term];
  const label = children ?? term;
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); e.stopPropagation(); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
  }, []);

  if (!def) return <>{label}</>;

  return (
    <span className="term-wrapper" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
      <span
        className="term"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => { cancelClose(); setOpen(true); }}
        onBlur={scheduleClose}
        onKeyDown={onKeyDown}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </span>
      {open && (
        <span id={tooltipId} role="tooltip" className="term-tooltip">
          <span className="term-tooltip-label">{term}</span>
          {def}
        </span>
      )}
    </span>
  );
}
