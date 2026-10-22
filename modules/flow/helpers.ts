import { CaseContext, CaseHandler } from '../../core/runner/registerCases';
import { setBlocker } from '../../core/runner/blockers';
import { nth, RepoPage } from '../repo/shared/RepoPage';

export type Ctx = CaseContext<RepoPage>;

/**
 * The Input-sheet values the journey needs (account, REPO, BRANCHES). A missing value SKIPS the step with a reason, and when
 * the rest of the journey cannot work without it, it also blocks the later stages (so they are skipped, not failed one by one).
 *   repo     - REPO is needed (blocks from "choose repository" on)
 *   branches - this many BRANCHES are needed (the first one blocks Confirm / Coverage / Run plan)
 */
export function inputs(ctx: Ctx, need: { repo?: boolean; branches?: number } = {}): { repo: string; branch: string; branch2: string } {
  const repo = ctx.input.get('REPO').trim();
  const list = ctx.input.get('BRANCHES');
  const branch = nth(list, 0);
  const branch2 = nth(list, 1);
  if (need.repo && !repo) {
    const reason = 'REPO is blank on the Input sheet.';
    setBlocker('configure', ctx.row.id, reason);
    ctx.skip(reason);
  }
  if ((need.branches ?? 0) >= 1 && !branch) {
    const reason = 'BRANCHES is blank on the Input sheet.';
    setBlocker('confirm', ctx.row.id, reason);
    ctx.skip(reason);
  }
  if ((need.branches ?? 0) >= 2 && !branch2) ctx.skip('Needs at least two BRANCHES on the Input sheet.');
  return { repo, branch, branch2 };
}

/** Lets a step written for another page object (login page, SSO page, ...) run inside the journey, on the same browser page. */
export function adapt<Q>(make: (ctx: Ctx) => Q, handler: CaseHandler<Q>): CaseHandler<RepoPage> {
  return (ctx) => handler({ ...ctx, pg: make(ctx) } as unknown as CaseContext<Q>);
}
