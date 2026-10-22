/**
 * Forgiving text matching for the checks. The wording on the sheet is the rule, but upper/lower case, punctuation, spacing,
 * plural/singular and Organization/Organisation must never fail a case.
 */
const WORD = /[\p{L}\p{N}]+/gu;

/** Case-insensitive regex that matches the words of `text` in order, ignoring punctuation / spacing / a plural "s". */
export function loose(text: string, opts: { exact?: boolean } = {}): RegExp {
  const words = text.match(WORD) ?? [];
  if (words.length === 0) return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const parts = words.map((w) => {
    const lower = w.toLowerCase();
    if (/^organi[sz]ations?$/.test(lower)) return 'organi[sz]ations?';
    const esc = lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return lower.length > 3 && lower.endsWith('s') ? `${esc.slice(0, -1)}s?` : lower.length > 3 ? `${esc}s?` : esc;
  });
  const body = parts.join('[\\W_]*');
  return new RegExp(opts.exact ? `^[\\W_]*${body}[\\W_]*$` : body, 'i');
}

/** Whitespace-normalised text. */
export const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
