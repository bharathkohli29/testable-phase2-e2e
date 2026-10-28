import type { Locator, Page } from '@playwright/test';
import { loadObjects, locate, ObjectRepo } from './objects';

let repo: ObjectRepo | undefined;

/**
 * The locator of an element of the object repository (/objects/*.json), for use in page objects and case code:
 *   obj(page, 'login.forgotPasswordLink').click()
 * The repository is read once per process; the files are updated before the workers start (see core/keywords/autoUpdate.ts).
 */
export function obj(page: Page, name: string): Locator {
  repo ??= loadObjects();
  return locate(page, repo, name);
}

export function resetObjectCache(): void {
  repo = undefined;
}
