/**
 * Smooth Input: a text field whose caret glides to its new position with spring physics.
 * Adapted from Skiper UI's skiper106 (https://skiper-ui.com) for SlotBook:
 * - the dialkit live-tuning panel is removed; type, placeholder and spring are fixed props/constants
 * - type="email" renders as a text input with inputMode="email": browsers hide the cursor position of
 *   real email inputs, which the animated caret needs; phones still show the email keyboard
 * - the forwarded ref reaches the real <input>, so react-hook-form's register() can use it
 * - uncontrolled unless `value` is passed, so form libraries can set the value directly
 * - guards for document.fonts and ResizeObserver, which test environments lack
 * - styled with the DESIGN.md input look (border, 14 px radius, accent focus ring, error border)
 */
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { type ComponentPropsWithRef, type Ref, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

const SPRING = { stiffness: 500, damping: 30, mass: 0.5 };
const INSTANT = { stiffness: 10000, damping: 100, mass: 0.1 };

const wrapperBase = cn(
  'relative flex min-h-12 w-full items-center rounded-[14px] border border-[var(--border)] bg-background px-4',
  'transition-[border-color,box-shadow] duration-200 hover:border-[var(--text-muted)]',
  'has-[:focus-visible]:border-primary has-[:focus-visible]:shadow-[0_0_0_4px_rgba(0,113,227,0.18)]',
  'has-[[aria-invalid=true]]:border-[var(--error)]',
  'has-[[aria-invalid=true]:focus-visible]:shadow-[0_0_0_4px_rgba(215,0,21,0.14)]',
);

// Tailwind's reset isn't loaded (see tailwind.css), so the browser's default input border and padding are cleared here.
const inputBase =
  'w-full border-0 bg-transparent p-0 font-[inherit] text-base text-foreground outline-none placeholder:text-foreground/40';

type SmoothInputType = 'text' | 'password' | 'email';

type SmoothInputProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  type?: SmoothInputType;
  wrapperClassName?: string;
};

const PASSWORD_CHAR = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent) ? '●' : '•';

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

const SmoothInput = ({
  className,
  wrapperClassName,
  value,
  onChange,
  onBlur,
  type = 'text',
  style,
  ref,
  ...props
}: SmoothInputProps) => {
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const springCaretX = useSpring(caretX, prefersReducedMotion ? INSTANT : SPRING);

  // Our own ref for measuring, and the caller's ref (react-hook-form's register) on the same input.
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(ref, node);
    },
    [ref],
  );

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;

    const styles = window.getComputedStyle(input);
    let fontSize = styles.fontSize;
    if (PASSWORD_CHAR === '•' && input.type === 'password' && !/chrome|chromium|crios/i.test(navigator.userAgent)) {
      fontSize = `${String(parseFloat(fontSize) + 6.25)}px`;
    }
    measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize} ${styles.fontFamily}`;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
  };

  const measurePrefixWidth = (text: string) => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;

    syncMeasureSpan();
    measureSpan.textContent = text;
    const paddingLeft = parseFloat(window.getComputedStyle(input).paddingLeft) || 0;
    return text.length > 0 ? measureSpan.offsetWidth + paddingLeft : paddingLeft - 1;
  };

  const scrollCaretIntoView = (target: HTMLInputElement, absoluteWidth: number) => {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;

    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(absoluteWidth - target.clientWidth + paddingRight, maxScroll);
      return;
    }
    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  };

  const getCaretIndex = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;
    if (selectionStart === selectionEnd) return selectionStart;
    return target.selectionDirection === 'backward' ? selectionStart : selectionEnd;
  };

  const updateCaretFromInput = (target: HTMLInputElement) => {
    const hasSelection = (target.selectionStart ?? 0) !== (target.selectionEnd ?? 0);
    const caretIndex = getCaretIndex(target);
    const textBeforeCaret =
      target.type === 'password' ? PASSWORD_CHAR.repeat(caretIndex) : target.value.slice(0, caretIndex);

    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;

    scrollCaretIntoView(target, absoluteWidth);

    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft - 1;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible = caretPosition >= minX && caretPosition <= maxX + 1;

    caretX.set(Math.min(caretPosition, maxX));
    caretOpacity.set(!isCaretVisible || hasSelection ? 0 : 1);
  };

  // Always call the latest version from listeners set up once below.
  const updateCaretRef = useRef(updateCaretFromInput);
  useLayoutEffect(() => {
    updateCaretRef.current = updateCaretFromInput;
  });

  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) updateCaretRef.current(input);
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateCaretIfFocused = () => {
      if (document.activeElement === input) updateCaretRef.current(input);
    };
    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;
      requestAnimationFrame(updateCaretIfFocused);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    input.addEventListener('scroll', updateCaretIfFocused);
    input.addEventListener('focus', updateCaretIfFocused);
    // Not every environment has these (jsdom in tests, for one).
    const fonts = typeof document.fonts === 'undefined' ? null : document.fonts;
    fonts?.addEventListener('loadingdone', updateCaretIfFocused);
    void fonts?.ready.then(updateCaretIfFocused);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateCaretIfFocused);
    resizeObserver?.observe(container);
    updateCaretIfFocused();

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      input.removeEventListener('scroll', updateCaretIfFocused);
      input.removeEventListener('focus', updateCaretIfFocused);
      fonts?.removeEventListener('loadingdone', updateCaretIfFocused);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div className={cn(wrapperBase, wrapperClassName)}>
      <div ref={containerRef} className="relative grid w-full grid-cols-1 p-0" style={{ caretColor: 'transparent' }}>
        <input
          inputMode={type === 'email' ? 'email' : undefined}
          {...props}
          ref={setInputRef}
          type={type === 'email' ? 'text' : type}
          className={cn(inputBase, 'col-start-1 col-end-2 row-start-1 row-end-2', className)}
          style={style}
          {...(value === undefined ? {} : { value })}
          onChange={(e) => {
            onChange?.(e);
            const target = e.target;
            requestAnimationFrame(() => {
              updateCaretRef.current(target);
            });
          }}
          onBlur={(e) => {
            caretOpacity.set(0);
            onBlur?.(e);
          }}
        />
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre"
        />
        <motion.div
          aria-hidden
          className="pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 h-[1.15em] w-0.5 self-center rounded-full bg-primary"
          style={{ x: springCaretX, opacity: caretOpacity }}
        />
      </div>
    </div>
  );
};

export { SmoothInput };
