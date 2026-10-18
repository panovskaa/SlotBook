import { useState } from 'react';
import { Icon } from './Icon';

interface Props {
  path: string;
  /** Accessible name for the link field, e.g. "Private cancellation link" */
  label: string;
  children: React.ReactNode;
}

/** A private link (cancellation FR-7, waitlist status FR-9) shown once, with a copy button. */
export function PrivateLink({ path, label, children }: Props) {
  const url = `${window.location.origin}${path}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="manage" aria-labelledby="private-link-heading">
      <h2 id="private-link-heading" className="manage__title">
        Your private link
      </h2>
      <p className="manage__body">{children}</p>
      <div className="manage__row">
        <input className="field__input manage__url" readOnly value={url} aria-label={label} onFocus={(e) => e.target.select()} />
        <button type="button" className="button button--secondary" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {copied ? 'Link copied' : ''}
      </p>
    </section>
  );
}
