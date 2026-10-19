import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode, useState } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { cn } from '@/lib/utils';

/** Same feel as the 21st.dev bottom nav bar: the label springs open, the fade is quick. */
const SPRING = { type: 'spring', stiffness: 350, damping: 32 } as const;

type ExpandingLinkProps = Omit<LinkProps, 'children'> & {
  icon: ReactNode;
  label: string;
};

/**
 * A round icon button that slides open to show its label on hover or keyboard focus.
 * The label is always in the DOM (just clipped), so screen readers and voice control get the full name.
 */
export function ExpandingLink({ icon, label, className, ...props }: ExpandingLinkProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : { width: SPRING, opacity: { duration: 0.19 } };

  return (
    <Link
      {...props}
      className={cn(
        'expanding-link inline-flex h-11 min-w-11 items-center justify-center rounded-full px-[13px] no-underline',
        className,
      )}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(e) => setOpen(e.currentTarget.matches(':focus-visible'))}
      onBlur={() => setOpen(false)}
    >
      <span className="flex shrink-0 items-center" aria-hidden="true">
        {icon}
      </span>
      <motion.span
        className="overflow-hidden whitespace-nowrap"
        initial={false}
        animate={{ width: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={transition}
      >
        <span className="block pl-2 pr-1 font-medium">{label}</span>
      </motion.span>
    </Link>
  );
}
