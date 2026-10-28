// High-level orchestration shared by the UI and the tests.
import { analyzeProject } from './analysis.js';
import { applyStrategy } from './packager.js';
import { generateContextFiles } from './generator.js';
import { buildExport } from './exporter.js';
import { validateExport } from './validation.js';

export async function analyze(entries, config, opts = {}) {
  const project = await analyzeProject(entries, { config, ...opts });
  applyStrategy(project, config.strategy);
  return project;
}

/**
 * Generate once, then export for the chosen layout and validate.
 * Returns { generation, exportPlan, validation }.
 */
export async function buildPackage(project, config, layout = config.exportLayout) {
  applyStrategy(project, project.strategy || config.strategy);
  const generation = generateContextFiles(project, config);
  return exportFor(project, generation, config, layout);
}

/** Re-export an existing generation in another layout without regenerating content. */
export async function exportFor(project, generation, config, layout) {
  const draft = await buildExport(project, generation, config, layout, null);
  const draftValidation = validateExport(project, generation, draft);
  const exportPlan = await buildExport(project, generation, config, layout, draftValidation);
  const validation = validateExport(project, generation, exportPlan); // re-run on the final files (incl. manifest)
  return { generation, exportPlan, validation };
}
