import { existsSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

/** Loads .env from the API folder or the repo root, whichever exists. Real env vars win. */
export function loadEnv(): void {
  for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(path)) {
      config({ path });
      return;
    }
  }
}
