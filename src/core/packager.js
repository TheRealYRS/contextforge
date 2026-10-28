// Strategy application, content selection and the generated-text budget.
import { CAT } from './registry.js';
import { byteLength } from './util.js';

export const STRATEGIES = {
  smart: { label: 'Smart', blurb: 'Relevant source, tests, configuration, docs and useful data. Noise, duplicates and binaries excluded. Datasets summarised.' },
  complete: { label: 'Complete Context', blurb: 'All readable project information, including full small datasets and unknown text formats. Caches, dependencies and binaries still excluded.' },
  minimal: { label: 'Minimal Context', blurb: 'Entry points, core implementation, important tests, essential configuration, manifests and critical docs only.' },
};

const DOC_CATS = new Set([CAT.PDF, CAT.SPREADSHEET, CAT.OFFICE]);
const TEXT_CONTENT_CATS = new Set([CAT.SOURCE, CAT.TEST, CAT.CONFIG, CAT.DEPENDENCY, CAT.DOC, CAT.DATA, CAT.UNKNOWN]);

export const TIERS = ['Entry points', 'Core source', 'Tests', 'Configuration', 'Documentation', 'Data & documents', 'Other'];
export function tierOf(r) {
  if (r.entryPoint) return 0;
  if (r.category === CAT.SOURCE) return 1;
  if (r.category === CAT.TEST) return 2;
  if (r.category === CAT.CONFIG || r.category === CAT.DEPENDENCY) return 3;
  if (r.category === CAT.DOC || r.category === CAT.OFFICE && r.ext !== '.pptx') return 4;
  if (r.category === CAT.DATA || DOC_CATS.has(r.category)) return 5;
  return 6;
}

/** Does this file carry any content we can put in a text package? */
export function hasRepresentableContent(r) {
  if (r.status === 'skipped' || r.status === 'failed') return false;
  if (r.status === 'metadata-only') return false;
  if (r.text != null) return true;
  return !!r.analysis?.extractedText || r.analysis?.kind === 'spreadsheet';
}

function strategyReason(r, strategy, project) {
  if (r.status === 'skipped') return r.ruleReason;
  if (r.status === 'failed') return `could not be processed: ${r.error}`;
  if (r.ruleReason) return r.ruleReason;
  if (r.duplicateOf) return `identical content to ${r.duplicateOf} (included once)`;
  if (r.category === CAT.IMAGE) return 'image — referenced in the project map; content is not interpretable as text';
  if (r.category === CAT.BINARY) return 'binary file — not representable as text';
  if (r.status === 'metadata-only') return r.error || 'metadata only';
  if (!hasRepresentableContent(r)) return r.analysis?.note || 'no extractable content';
  if (strategy === 'minimal') return minimalReason(r, project);
  if (strategy === 'smart' && r.unknown && r.size > 256 * 1024) return 'large unknown-format text file (include manually if relevant)';
  return null;
}

function minimalReason(r, project) {
  if (r.entryPoint) return null;
  const referenced = project._inbound.get(r.path) || 0;
  if (r.category === CAT.SOURCE) return null;
  if (r.category === CAT.TEST) return (r.analysis.testFrameworks || []).length || referenced || /test/i.test(r.name) ? null : 'not identified as a significant test';
  if (r.category === CAT.DEPENDENCY) return null;
  if (r.category === CAT.CONFIG) return referenced || !r.dir || r.dir.split('/').length <= 1 ? null : 'nested configuration not referenced by source';
  if (r.category === CAT.DOC) return /^readme/i.test(r.name) && r.path.split('/').length <= 2 || /architecture|design|overview/i.test(r.name) ? null : 'not critical documentation';
  return 'not part of the minimal context set';
}

export function applyStrategy(project, strategy) {
  project._inbound = new Map();
  for (const e of project.relationships) if (e.resolved && !e.external) project._inbound.set(e.target, (project._inbound.get(e.target) || 0) + 1);
  for (const r of project.files) {
    if (r.override === true && r.status !== 'skipped' && hasRepresentableContent(r)) { r.included = true; r.reason = ''; continue; }
    if (r.override === false) { r.included = false; r.reason = 'excluded by you'; continue; }
    const reason = strategyReason(r, strategy, project);
    r.included = !reason;
    r.reason = reason || '';
  }
  project.strategy = strategy;
}

/** Build the ordered content plan within the output budget. */
export function planContent(project, config) {
  const budget = config.maxOutputMB * 1024 * 1024;
  const items = project.files.filter((r) => r.included).sort((a, b) => tierOf(a) - tierOf(b) || a.path.localeCompare(b.path));
  let used = 0;
  const plan = [];
  for (const r of items) {
    const isDocLike = DOC_CATS.has(r.category) || (r.category === CAT.DATA && r.text != null);
    const fullBytes = r.text != null ? byteLength(r.text) : byteLength(r.analysis.extractedText || '');
    let mode = 'full';
    let cost = fullBytes + 200;
    if (r.category === CAT.DATA && r.text != null && !(project.strategy === 'complete' && fullBytes < 200 * 1024)) { mode = 'summary'; cost = 1500; }
    if (r.analysis.kind === 'spreadsheet') { mode = 'summary'; cost = 3000; }
    if (used + cost > budget) {
      const room = budget - used;
      if (room > 4096 && mode === 'full') { mode = 'truncated'; cost = room; }
      else { mode = 'omitted'; cost = 0; }
    }
    used += cost;
    plan.push({ record: r, mode, bytesAllowed: mode === 'truncated' ? cost - 300 : null, tier: tierOf(r), target: isDocLike || r.analysis.kind === 'spreadsheet' ? 'data' : 'contents' });
  }
  return { plan, estimatedBytes: used, budgetBytes: budget, overBudget: plan.some((p) => p.mode === 'omitted' || p.mode === 'truncated') };
}

export function summaryCounts(project) {
  const f = project.files;
  return {
    total: f.length,
    relevant: f.filter((r) => r.status !== 'skipped' && !r.ruleReason).length,
    included: f.filter((r) => r.included).length,
    excluded: f.filter((r) => !r.included).length,
    skipped: f.filter((r) => r.status === 'skipped').length,
    unknown: f.filter((r) => r.unknown).length,
    large: f.filter((r) => r.large).length,
    failed: f.filter((r) => r.status === 'failed').length,
    partial: f.filter((r) => r.status === 'partial').length,
    duplicates: f.filter((r) => r.duplicateOf).length,
    secrets: f.filter((r) => r.secrets.length).length,
    sensitive: f.filter((r) => r.sensitive).length,
  };
}
