/**
 * AccountStore — persists onboarding completion state to userData/account.json.
 *
 * Write is atomic: data is written to a .tmp file then renamed, so a crash
 * mid-write never produces a corrupt account.json.
 *
 * File location: ${app.getPath('userData')}/account.json
 * Shape: { created_at?, onboarding_completed_at? }
 */

import fs from 'node:fs';
import path from 'node:path';
import { mainLogger } from '../logger';

const ACCOUNT_FILE_NAME = 'account.json';

export interface AccountData {
  /** ISO 8601 — set once on first save, never overwritten */
  created_at?: string;
  /** ISO 8601 — set when the user completes onboarding */
  onboarding_completed_at?: string;
}

export class AccountStore {
  private readonly filePath: string;
  private readonly tmpPath: string;

  constructor(userDataPath?: string) {
    const dir = userDataPath ?? (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { app } = require('electron') as typeof import('electron');
        return app.getPath('userData');
      } catch {
        return '/tmp/agentic-browser';
      }
    })();

    this.filePath = path.join(dir, ACCOUNT_FILE_NAME);
    this.tmpPath = path.join(dir, `account.tmp.${process.pid}`);

    mainLogger.debug('AccountStore.init', { filePath: this.filePath });
  }

  load(): AccountData | null {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(raw) as AccountData;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        mainLogger.warn('AccountStore.load.parseError', {
          filePath: this.filePath,
          error: (err as Error).message,
        });
      }
      return null;
    }
  }

  save(data: AccountData): void {
    let created_at = data.created_at;
    if (!created_at) {
      const existing = this.load();
      created_at = existing?.created_at ?? new Date().toISOString();
    }

    const toWrite: AccountData = { ...data, created_at };
    const serialised = JSON.stringify(toWrite, null, 2);

    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.tmpPath, serialised, 'utf-8');
      fs.renameSync(this.tmpPath, this.filePath);
      mainLogger.debug('AccountStore.save.ok', { filePath: this.filePath });
    } catch (err) {
      mainLogger.error('AccountStore.save.failed', {
        error: (err as Error).message,
        filePath: this.filePath,
      });
      throw err;
    }
  }

  isOnboardingComplete(): boolean {
    return !!this.load()?.onboarding_completed_at;
  }
}
