import { loadInput } from '../excel/readInput';
import { RESULTS_XLSX } from '../paths';
import { refreshResults } from './resultsWorkbook';

/** Final rebuild after a full `npm test` run. (VS Code's Test Explorer skips this, which is why every test case also refreshes.) */
export default async function globalTeardown(): Promise<void> {
  await refreshResults(loadInput().writeResultsToInput);
  console.log(`\n  Results workbook: ${RESULTS_XLSX}`);
}
