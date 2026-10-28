// Minimal configuration. Persisted (optionally) to localStorage by the UI — settings only, never content.
export const DEFAULT_EXCLUDE_DIRS = [
  '.git', '.github', '.hg', '.svn', 'node_modules', 'bower_components', 'jspm_packages',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.tox', '.venv', 'venv', 'env', 'virtualenv',
  'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage', 'htmlcov', '.nyc_output',
  '.cache', '.parcel-cache', '.next', '.nuxt', '.svelte-kit', '.turbo', '.idea', '.vscode', '.vs',
  '.terraform', '.gradle', '.m2', '__MACOSX', '.DS_Store',
];
export const DEFAULT_EXCLUDE_PATTERNS = [
  '*.pyc', '*.pyo', '*.pyd', '*.class', '*.o', '*.obj', '*.log', '*.tmp', '*.temp', '*.cache',
  '*.bak', '*.swp', '*.swo', '*~', '.DS_Store', 'Thumbs.db', 'desktop.ini',
  '*.so', '*.dylib', '*.dll', '*.exe', '*.bin', '*.min.js', '*.min.css', '*.map', '*.orig',
];

export const DEFAULTS = Object.freeze({
  strategy: 'smart',               // smart | complete | minimal
  exportLayout: 'preserve',        // preserve | flat
  maxFileSizeMB: 2,                // per-file limit for full text/source extraction
  maxDocumentMB: 25,               // per-file limit for PDF/Office extraction
  maxOutputMB: 4,                  // budget for generated text across all files
  maxContentsFileMB: 1.5,          // split PROJECT_CONTENTS into parts beyond this
  excludeDirs: DEFAULT_EXCLUDE_DIRS,
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  respectGitignore: true,
  detectSecrets: true,
  redactSecrets: true,             // replace detected secret values in generated output
  excludeSensitiveFiles: true,     // .env, private keys etc. excluded by default
  includeLockfiles: false,         // lock files are huge and low-value
  csvSampleRows: 5,
  pdfMaxPages: 30,
  hashMaxMB: 64,                   // files above this are not hashed (memory)
});

export function makeConfig(overrides = {}) {
  const cfg = { ...DEFAULTS, ...overrides };
  for (const k of ['maxFileSizeMB', 'maxDocumentMB', 'maxOutputMB', 'maxContentsFileMB', 'csvSampleRows', 'pdfMaxPages', 'hashMaxMB']) {
    const v = Number(cfg[k]);
    cfg[k] = Number.isFinite(v) && v > 0 ? v : DEFAULTS[k];
  }
  if (!['smart', 'complete', 'minimal'].includes(cfg.strategy)) cfg.strategy = 'smart';
  if (!['preserve', 'flat'].includes(cfg.exportLayout)) cfg.exportLayout = 'preserve';
  return cfg;
}

export const STORAGE_KEY = 'contextforge.settings.v1';
