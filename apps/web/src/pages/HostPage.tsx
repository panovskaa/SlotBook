import { useState } from 'react';
import { ApiRequestError, hostApi } from '../api/client';
import { Icon } from '../components/Icon';
import { Dashboard } from '../host/Dashboard';
import { clearHostKey, loadHostKey, saveHostKey } from '../lib/hostKey';

/** /host: asks for the shared host key (A3), then shows the dashboard (FR-8). */
export function HostPage() {
  const [key, setKey] = useState<string | null>(() => loadHostKey());
  const [keyRejected, setKeyRejected] = useState(false);

  const lock = (rejected: boolean) => {
    clearHostKey();
    setKey(null);
    setKeyRejected(rejected);
  };

  if (!key) {
    return (
      <HostKeyForm
        rejected={keyRejected}
        onSubmit={(k) => {
          saveHostKey(k);
          setKeyRejected(false);
          setKey(k);
        }}
      />
    );
  }
  return <Dashboard api={hostApi(key)} onLock={() => lock(false)} onUnauthorized={() => lock(true)} />;
}

function HostKeyForm({ rejected, onSubmit }: { rejected: boolean; onSubmit: (key: string) => void }) {
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(rejected ? "That key didn't work. Check it and try again." : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = value.trim();
    if (!key) {
      setError('Enter the host key.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await hostApi(key).stats();
      onSubmit(key);
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      setError(
        status === 401
          ? "That key didn't work. Check it and try again."
          : "We couldn't reach the server. Check your connection and try again.",
      );
      setChecking(false);
    }
  };

  return (
    <div className="narrow">
      <h1 className="page-title">Host dashboard</h1>
      <p className="lede lede--tight">Enter your host key to manage your slots and bookings.</p>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="host-key" className="field__label">
            Host key
          </label>
          <input
            id="host-key"
            className="field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'host-key-error' : 'host-key-hint'}
          />
          {error ? (
            <p id="host-key-error" className="field__error" role="alert">
              <Icon name="alert" size={14} />
              {error}
            </p>
          ) : (
            <p id="host-key-hint" className="form__hint form__hint--left">
              It's the HOST_ACCESS_KEY value from the server's settings. It stays in this tab only.
            </p>
          )}
        </div>
        <button type="submit" className="button button--primary button--large" disabled={checking}>
          {checking ? 'Checking…' : 'Open dashboard'}
        </button>
      </form>
    </div>
  );
}
