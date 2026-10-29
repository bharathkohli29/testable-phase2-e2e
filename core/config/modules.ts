import * as fs from 'fs';
import * as path from 'path';

export interface ModuleConfig {
  key: string;
  enabled: boolean;
  title: string;
  timeoutSec: number;
  needs: string;
  provides: string;
  resets?: boolean;
  /** "Sheet:CASE-ID@stage" or "qa:Sheet@stage", in the order they run. */
  steps: string[];
}

const STAGES = ['start', 'login', 'repo-list', 'configure', 'confirm', 'plan', 'execute', 'engine', 'finished'];

/** Reads config/modules.json: the order of the modules (top to bottom) and which are switched on. */
export function loadModules(file = path.resolve(__dirname, '../../config/modules.json')): ModuleConfig[] {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { modules: ModuleConfig[] };
  const seen = new Set<string>();
  for (const m of raw.modules) {
    if (!m.key || !m.title) throw new Error(`config/modules.json: every module needs "key" and "title"`);
    if (seen.has(m.key)) throw new Error(`config/modules.json: duplicate module key "${m.key}"`);
    seen.add(m.key);
    for (const f of ['needs', 'provides'] as const) {
      if (!STAGES.includes(m[f])) throw new Error(`config/modules.json: "${m.key}".${f} = "${m[f]}" is not one of ${STAGES.join(', ')}`);
    }
    if (!Array.isArray(m.steps) || m.steps.some((x) => typeof x !== 'string' || !/^(qa:[A-Za-z]+|[A-Za-z]+:[A-Za-z0-9-]+)@[a-z-]+$/.test(x))) throw new Error(`config/modules.json: "${m.key}".steps must be a list of "Sheet:CASE-ID@stage" or "qa:Sheet@stage"`);
    for (const x of m.steps) if (!STAGES.includes(x.split('@')[1])) throw new Error(`config/modules.json: "${m.key}" step "${x}" has an unknown stage`);
    if (!(m.timeoutSec > 0)) throw new Error(`config/modules.json: "${m.key}" needs a positive timeoutSec`);
  }
  return raw.modules.filter((m) => m.enabled !== false);
}
