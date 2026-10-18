import type { HealthResponse } from '@slotbook/shared';
import { useEffect, useState } from 'react';

/** Placeholder until the calendar (FR-2) lands: shows that the web app can reach the API. */
export function App() {
  const [health, setHealth] = useState<HealthResponse | 'unreachable' | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth('unreachable'));
  }, []);

  const status =
    health === null ? 'Checking the API…' : health === 'unreachable' ? 'The API is not reachable.' : `API ${health.status}, database ${health.database}.`;

  return (
    <main className="container">
      <h1 className="hero">SlotBook</h1>
      <p className="lede">Book time with me in a few clicks.</p>
      <p className="muted" role="status">
        {status}
      </p>
    </main>
  );
}
