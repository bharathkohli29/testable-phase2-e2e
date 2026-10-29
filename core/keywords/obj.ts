import type { Locator } from '@playwright/test';
import { loadObjects, locate, ObjectRepo, Scope } from './objects';

let repo: ObjectRepo | undefined;

/**
 * The locator of an element of the object repository (/objects/*.json), for use in page objects and case code:
 *   obj(page, 'login.forgotPasswordLink').click()
 *   obj(menu, 'graph.link.by-name', 'Dashboard')   <- an entry with {{0}} in it: the changing part is given by the call
 * The repository is read once per process; the files are updated before the workers start (see core/keywords/autoUpdate.ts).
 */
export function obj(scope: Scope, name: string, ...args: Array<string | number>): Locator {
  repo ??= loadObjects();
  return locate(scope, repo, name, { args });
}

export function resetObjectCache(): void {
  repo = undefined;
}
