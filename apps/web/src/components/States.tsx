import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  title,
  children,
  onRetry,
}: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <div className="notice notice--error" role="alert">
      <Icon name="alert" />
      <div>
        <p className="notice__title">{title}</p>
        {children && <div className="notice__body">{children}</div>}
        {onRetry && (
          <button type="button" className="button button--secondary button--small notice__action" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
