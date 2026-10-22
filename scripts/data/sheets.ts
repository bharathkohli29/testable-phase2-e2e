import { CaseDef, LOGIN_CASES } from './loginCases';
import { COMMIT_CASES } from './commitCases';
import { CONFIDENCE_CASES } from './confidenceCases';
import { COVERAGE_CASES } from './coverageCases';
import { GRAPH_CASES } from './graphCases';
import { DASHBOARD_CASES } from './dashboardCases';
import { EXECUTION_CASES } from './executionCases';
import { OBJECT_CASES } from './objectCases';
import { PLAN_CASES } from './planCases';
import { REPO_CASES } from './repoCases';
import { SIGNUP_CASES } from './signupCases';
import { ACCOUNT_CASES } from './accountCases';
import { SUPPORT_CASES } from './supportCases';
import { qaFor } from './qaCases';
import { ASSISTANT_CASES } from './assistantCases';
import { CONTEXT_CASES } from './contextCases';
import { REDIRECT_CASES } from './redirectCases';

/** One entry per module sheet in the workbook. Add new modules here. */
export const SHEETS: Array<{ name: string; cases: CaseDef[] }> = [
  { name: 'Login', cases: [...LOGIN_CASES, ...qaFor('Login')] },
  { name: 'Repo', cases: [...REPO_CASES, ...qaFor('Repo')] },
  { name: 'Coverage', cases: [...COVERAGE_CASES, ...qaFor('Coverage')] },
  { name: 'Plan', cases: [...PLAN_CASES, ...qaFor('Plan')] },
  { name: 'Execution', cases: [...EXECUTION_CASES, ...qaFor('Execution')] },
  { name: 'Confidence', cases: [...CONFIDENCE_CASES, ...qaFor('Confidence')] },
  { name: 'Graph', cases: [...GRAPH_CASES, ...qaFor('Graph')] },
  { name: 'Object', cases: [...OBJECT_CASES, ...qaFor('Object')] },
  { name: 'Commit', cases: [...COMMIT_CASES, ...qaFor('Commit')] },
  { name: 'Dashboard', cases: [...DASHBOARD_CASES, ...qaFor('Dashboard')] },
  { name: 'Signup', cases: [...SIGNUP_CASES, ...qaFor('Signup')] },
  { name: 'Assistant', cases: [...ASSISTANT_CASES, ...qaFor('Assistant')] },
  { name: 'Context', cases: [...CONTEXT_CASES, ...qaFor('Context')] },
  { name: 'Account', cases: [...ACCOUNT_CASES, ...qaFor('Account')] },
  { name: 'Support', cases: [...SUPPORT_CASES, ...qaFor('Support')] },
  { name: 'Redirects', cases: [...REDIRECT_CASES, ...qaFor('Redirects')] },
];

/** Sheets that were dropped on purpose: `npm run sync` deletes them from an existing workbook. */
export const RETIRED_SHEETS: string[] = ['Manual'];
