/**
 * What visitors are booking, in one place. SlotBook is set up for office hours: one-to-one sessions
 * with a single host. Set VITE_HOST_NAME in the web app's environment to name the host.
 */
const hostName = (import.meta.env.VITE_HOST_NAME as string | undefined)?.trim() || undefined;

export const OFFERING = {
  /** "Office hours" or "Office hours with Ada Lovelace" */
  title: hostName ? `Office hours with ${hostName}` : 'Office hours',
  hostName,
  /** One sentence on what a session is for. */
  summary: 'A one-to-one session to ask questions, get advice or talk something through.',
  /** Short facts shown under the intro. */
  facts: ['One-to-one', '15 minutes to 4 hours', 'Free to book', 'Cancel up to an hour before'],
} as const;
