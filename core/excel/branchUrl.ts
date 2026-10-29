/**
 * "Run this branch" is given as a link instead of two cells:
 *   https://github.com/Nandhini-Testable/CSharp_Corpus_Tool_Triggering/tree/CS_VNET5_CAKE_CPM_MICRO
 * One or more links (separated by comma, semicolon, space or a new line). Several links must belong to the same repository.
 * A branch name with slashes (feature/x) works: everything after /tree/ is the branch. owner/repo (no branch) and owner/repo:branch also work.
 */
export interface BranchTarget { repo: string; branches: string[]; problems: string[] }

const GIT_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com|gitlab\.com|bitbucket\.org)\/([^/\s?#]+)\/([^/\s?#]+?)(?:\.git)?(?:\/(?:-\/)?(?:tree|src)\/([^?#\s]+?))?\/?(?:[?#]\S*)?$/i;

export function parseBranchUrls(text: string): BranchTarget {
  const out: BranchTarget = { repo: '', branches: [], problems: [] };
  for (const entry of text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    let repo = '', branch = '';
    const link = GIT_LINK.exec(entry);
    if (link) {
      repo = `${link[1]}/${link[2]}`;
      if (link[3]) { try { branch = decodeURIComponent(link[3]); } catch { branch = link[3]; } }
    } else {
      const pair = /^([\w.-]+\/[\w.-]+):(.+)$/.exec(entry);
      if (pair) { repo = pair[1]; branch = pair[2]; } else if (/^[\w.-]+\/[\w.-]+$/.test(entry)) repo = entry;
      else { out.problems.push(`"${entry}" is not a repository link. Use a link like https://github.com/owner/repo/tree/branch`); continue; }
    }
    if (out.repo && repo.toLowerCase() !== out.repo.toLowerCase()) { out.problems.push(`"${entry}" is another repository (${repo}); one run uses one repository (${out.repo}). Use npm run test:branches for several repositories.`); continue; }
    out.repo = out.repo || repo;
    if (branch && !out.branches.includes(branch)) out.branches.push(branch);
  }
  return out;
}
