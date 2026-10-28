// Export layer: applies a layout to the logical files produced once by the generator.
//  - preserve: keeps each file's intended relative path (e.g. context/PROJECT_CONTENTS.md)
//  - flat:     every file at one level; folder segments are joined with "_"
// Links ({{link:id}}) are resolved per layout so internal references always work.
// The manifest is built here because it records the final export filenames.
import { sanitizeRelativePath, sanitizeComponent } from './safety.js';
import { APP } from './generator.js';
import { byteLength, sha256Hex } from './util.js';

export const LAYOUTS = { preserve: 'Preserve Folder Structure', flat: 'Flat Files' };

/** Deterministic flat filename for a relative path, collision-safe against `taken`. */
export function flatName(path, taken) {
  const base = path.split('/').map(sanitizeComponent).filter(Boolean).join('_') || 'file';
  let name = base; let n = 2;
  const dot = base.lastIndexOf('.');
  while (taken.has(name.toLowerCase())) { name = dot > 0 ? `${base.slice(0, dot)}__${n}${base.slice(dot)}` : `${base}__${n}`; n++; }
  taken.add(name.toLowerCase());
  return name;
}

/** Map logical files -> export paths for a layout. Pure and deterministic. */
export function planLayout(files, layout) {
  const taken = new Set();
  const out = new Map();
  const sorted = [...files].sort((a, b) => (a.path.split('/').length - b.path.split('/').length) || a.path.localeCompare(b.path));
  for (const f of sorted) {
    let p;
    if (layout === 'flat') p = flatName(f.path, taken);
    else {
      p = sanitizeRelativePath(f.path);
      const base = p; let n = 2;
      while (taken.has(p.toLowerCase())) { const d = base.lastIndexOf('.'); p = d > base.lastIndexOf('/') ? `${base.slice(0, d)}__${n}${base.slice(d)}` : `${base}__${n}`; n++; }
      taken.add(p.toLowerCase());
    }
    out.set(f.id, p);
  }
  return out;
}

function relativeLink(fromPath, toPath) {
  const from = fromPath.split('/').slice(0, -1);
  const to = toPath.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/');
}

export function resolveLinks(content, selfPath, pathById) {
  return content.replace(/\{\{link:([\w-]+)\}\}/g, (m, id) => {
    const target = pathById.get(id);
    return target ? encodeURI(relativeLink(selfPath, target)) : m;
  });
}

/**
 * Build the export plan: final files (with resolved links) + manifest for one layout.
 * generation = result of generateContextFiles; validation = optional results to embed.
 */
export async function buildExport(project, generation, config, layout, validation = null) {
  const manifestLogical = { id: 'manifest', logicalName: 'PACKAGE_MANIFEST.json', dir: '', path: 'PACKAGE_MANIFEST.json', contentType: 'application/json', sources: [] };
  const all = [...generation.files, manifestLogical];
  const pathById = planLayout(all, layout);
  const outputs = [];
  for (const f of generation.files) {
    const exportPath = pathById.get(f.id);
    const content = resolveLinks(f.content, exportPath, pathById);
    outputs.push({ id: f.id, logicalName: f.logicalName, logicalPath: f.path, exportPath, exportName: exportPath.split('/').pop(), content, contentType: f.contentType, sources: f.sources, bytes: byteLength(content), sha256: await sha256Hex(new TextEncoder().encode(content)) });
  }
  const manifest = buildManifest(project, generation, config, layout, outputs, pathById, validation);
  const mText = JSON.stringify(manifest, null, 2) + '\n';
  const mPath = pathById.get('manifest');
  outputs.push({ id: 'manifest', logicalName: 'PACKAGE_MANIFEST.json', logicalPath: 'PACKAGE_MANIFEST.json', exportPath: mPath, exportName: mPath.split('/').pop(), content: mText, contentType: 'application/json', sources: [], bytes: byteLength(mText), sha256: await sha256Hex(new TextEncoder().encode(mText)) });
  return { layout, layoutLabel: LAYOUTS[layout], outputs, manifest, totalBytes: outputs.reduce((s, o) => s + o.bytes, 0) };
}

function buildManifest(project, gen, config, layout, outputs, pathById, validation) {
  const byId = new Map(outputs.map((o) => [o.id, o]));
  return {
    formatVersion: APP.formatVersion,
    generator: APP.name,
    generatedAt: new Date().toISOString(),
    project: { name: project.name, scannedAt: project.scannedAt, strategy: project.strategy, filesDiscovered: project.files.length },
    export: {
      layout, layoutLabel: LAYOUTS[layout], fileCount: outputs.length + 1,
      note: layout === 'flat' ? 'All generated files are at one level. Folder segments of the logical path are joined with "_".' : 'Generated files keep their logical folder structure.',
      files: [...outputs.map((o) => ({ id: o.id, logicalName: o.logicalName, logicalPath: o.logicalPath, exportPath: o.exportPath, exportName: o.exportName, contentType: o.contentType, bytes: o.bytes, sha256: o.sha256, sourceCount: o.sources.length })),
        { id: 'manifest', logicalName: 'PACKAGE_MANIFEST.json', logicalPath: 'PACKAGE_MANIFEST.json', exportPath: pathById.get('manifest'), exportName: pathById.get('manifest').split('/').pop(), contentType: 'application/json', note: 'this file; its own hash is not recorded' }],
    },
    settings: { maxFileSizeMB: config.maxFileSizeMB, maxDocumentMB: config.maxDocumentMB, maxOutputMB: config.maxOutputMB, redactSecrets: config.redactSecrets, excludeSensitiveFiles: config.excludeSensitiveFiles },
    budget: { estimatedBytes: gen.estimatedBytes, budgetBytes: gen.budgetBytes },
    inputs: project.files.map((r) => {
      const pl = gen.placement.get(r.path);
      const red = gen.stats.redactions.filter((x) => x.path === r.path).reduce((s, x) => s + x.count, 0);
      return {
        path: r.path, category: r.category, language: r.language || null, size: r.size, sha256: r.sha256 || null,
        status: r.status, included: r.included, reason: r.included ? null : r.reason,
        contentMode: pl ? pl.mode : null,
        outputFile: pl?.file ? byId.get(pl.file)?.exportPath ?? null : null,
        truncated: pl?.mode === 'truncated', duplicateOf: r.duplicateOf || null,
        secretsDetected: r.secrets.length, secretsRedacted: red, sensitive: r.sensitive,
        unknownFormat: r.unknown, limitation: r.error || (r.analysis?.limitations || []).join(' ') || null,
      };
    }),
    truncation: gen.stats.truncated,
    omittedForBudget: gen.plan.filter((p) => p.mode === 'omitted').map((p) => p.record.path),
    extractionLimitations: project.files.filter((r) => r.status === 'failed' || r.status === 'partial' || r.status === 'metadata-only').map((r) => ({ path: r.path, status: r.status, detail: r.error || (r.analysis?.limitations || [r.analysis?.note]).filter(Boolean).join(' ') })),
    relationships: project.relationships.filter((e) => e.resolved && !e.external).map(({ source, target, kind, confidence }) => ({ source, target, kind, confidence })),
    skippedDirectories: project.skippedDirs,
    validation: validation ? { ok: validation.ok, checks: validation.checks.map(({ name, ok, detail }) => ({ name, ok, detail })), note: 'Checks were run on the generated files before this manifest was finalised; the manifest itself is then re-parsed and verified.' } : null,
  };
}
