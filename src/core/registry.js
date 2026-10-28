// Extension registry: extension -> language, default category, text/binary, family.
// Ported from the original Python registry (118 extensions) and extended.

export const CAT = Object.freeze({
  SOURCE: 'Source Code', TEST: 'Test', CONFIG: 'Configuration', DOC: 'Documentation',
  DATA: 'Data', SPREADSHEET: 'Spreadsheet', PDF: 'PDF', OFFICE: 'Office Document',
  IMAGE: 'Image', DEPENDENCY: 'Dependency Metadata', GENERATED: 'Generated',
  BUILD: 'Build Artifact', CACHE: 'Cache', BINARY: 'Binary', UNKNOWN: 'Unknown',
});
export const ALL_CATEGORIES = Object.values(CAT);

const e = (language, category, text = true, family = language) => ({ language, category, text, family });

export const EXTENSIONS = {
  '.js': e('JavaScript', CAT.SOURCE), '.mjs': e('JavaScript ES Module', CAT.SOURCE, true, 'JavaScript'),
  '.cjs': e('JavaScript CommonJS', CAT.SOURCE, true, 'JavaScript'), '.jsx': e('JavaScript (JSX)', CAT.SOURCE, true, 'JavaScript'),
  '.ts': e('TypeScript', CAT.SOURCE), '.tsx': e('TypeScript (TSX)', CAT.SOURCE, true, 'TypeScript'),
  '.mts': e('TypeScript ES Module', CAT.SOURCE, true, 'TypeScript'), '.cts': e('TypeScript CommonJS', CAT.SOURCE, true, 'TypeScript'),
  '.py': e('Python', CAT.SOURCE), '.pyw': e('Python', CAT.SOURCE), '.pyi': e('Python Stub', CAT.SOURCE, true, 'Python'),
  '.ipynb': e('Jupyter Notebook', CAT.SOURCE, true, 'Python'),
  '.html': e('HTML', CAT.SOURCE), '.htm': e('HTML', CAT.SOURCE), '.xhtml': e('HTML', CAT.SOURCE),
  '.vue': e('Vue SFC', CAT.SOURCE, true, 'Vue'), '.svelte': e('Svelte', CAT.SOURCE),
  '.css': e('CSS', CAT.SOURCE), '.scss': e('SCSS', CAT.SOURCE, true, 'CSS'), '.sass': e('Sass', CAT.SOURCE, true, 'CSS'), '.less': e('Less', CAT.SOURCE, true, 'CSS'),
  '.sql': e('SQL', CAT.SOURCE), '.ddl': e('SQL', CAT.SOURCE), '.psql': e('SQL', CAT.SOURCE), '.prisma': e('Prisma Schema', CAT.SOURCE, true, 'SQL'),
  '.c': e('C', CAT.SOURCE, true, 'C/C++'), '.h': e('C/C++ Header', CAT.SOURCE, true, 'C/C++'), '.cpp': e('C++', CAT.SOURCE, true, 'C/C++'),
  '.hpp': e('C++ Header', CAT.SOURCE, true, 'C/C++'), '.cc': e('C++', CAT.SOURCE, true, 'C/C++'), '.cxx': e('C++', CAT.SOURCE, true, 'C/C++'), '.hxx': e('C++ Header', CAT.SOURCE, true, 'C/C++'),
  '.java': e('Java', CAT.SOURCE), '.kt': e('Kotlin', CAT.SOURCE), '.kts': e('Kotlin Script', CAT.SOURCE, true, 'Kotlin'),
  '.scala': e('Scala', CAT.SOURCE), '.groovy': e('Groovy', CAT.SOURCE), '.cs': e('C#', CAT.SOURCE), '.vb': e('Visual Basic', CAT.SOURCE), '.fs': e('F#', CAT.SOURCE),
  '.go': e('Go', CAT.SOURCE), '.rs': e('Rust', CAT.SOURCE), '.php': e('PHP', CAT.SOURCE), '.rb': e('Ruby', CAT.SOURCE),
  '.swift': e('Swift', CAT.SOURCE), '.dart': e('Dart', CAT.SOURCE), '.r': e('R', CAT.SOURCE), '.m': e('Objective-C/MATLAB', CAT.SOURCE),
  '.pl': e('Perl', CAT.SOURCE), '.lua': e('Lua', CAT.SOURCE), '.jl': e('Julia', CAT.SOURCE),
  '.sh': e('Shell', CAT.SOURCE, true, 'Shell'), '.bash': e('Bash', CAT.SOURCE, true, 'Shell'), '.zsh': e('Zsh', CAT.SOURCE, true, 'Shell'), '.fish': e('Fish', CAT.SOURCE, true, 'Shell'),
  '.ps1': e('PowerShell', CAT.SOURCE), '.psm1': e('PowerShell Module', CAT.SOURCE, true, 'PowerShell'), '.psd1': e('PowerShell Manifest', CAT.CONFIG, true, 'PowerShell'),
  '.bat': e('Batch', CAT.SOURCE), '.cmd': e('Batch', CAT.SOURCE),
  '.json': e('JSON', CAT.CONFIG), '.jsonl': e('JSON Lines', CAT.DATA, true, 'JSON'), '.ndjson': e('JSON Lines', CAT.DATA, true, 'JSON'), '.json5': e('JSON5', CAT.CONFIG, true, 'JSON'),
  '.xml': e('XML', CAT.CONFIG), '.xsd': e('XML Schema', CAT.CONFIG, true, 'XML'), '.yaml': e('YAML', CAT.CONFIG), '.yml': e('YAML', CAT.CONFIG),
  '.toml': e('TOML', CAT.CONFIG), '.ini': e('INI', CAT.CONFIG), '.cfg': e('Config', CAT.CONFIG, true, 'INI'), '.conf': e('Config', CAT.CONFIG, true, 'INI'),
  '.config': e('Config', CAT.CONFIG, true, 'INI'), '.env': e('Dotenv', CAT.CONFIG), '.properties': e('Java Properties', CAT.CONFIG),
  '.tf': e('Terraform', CAT.CONFIG), '.gradle': e('Gradle', CAT.CONFIG),
  '.md': e('Markdown', CAT.DOC), '.markdown': e('Markdown', CAT.DOC), '.mdx': e('MDX', CAT.DOC, true, 'Markdown'),
  '.rst': e('reStructuredText', CAT.DOC), '.txt': e('Plain Text', CAT.DOC), '.adoc': e('AsciiDoc', CAT.DOC), '.rtf': e('Rich Text', CAT.DOC, true, 'Text'),
  '.log': e('Log', CAT.GENERATED),
  '.csv': e('CSV', CAT.DATA), '.tsv': e('TSV', CAT.DATA, true, 'CSV'), '.parquet': e('Parquet', CAT.DATA, false),
  '.xlsx': e('Excel Workbook', CAT.SPREADSHEET, false, 'Excel'), '.xlsm': e('Excel Macro Workbook', CAT.SPREADSHEET, false, 'Excel'),
  '.xls': e('Excel 97-2003', CAT.SPREADSHEET, false, 'Excel'), '.xlsb': e('Excel Binary', CAT.SPREADSHEET, false, 'Excel'),
  '.docx': e('Word Document', CAT.OFFICE, false, 'Word'), '.doc': e('Word 97-2003', CAT.OFFICE, false, 'Word'),
  '.pptx': e('PowerPoint', CAT.OFFICE, false, 'PowerPoint'), '.ppt': e('PowerPoint 97-2003', CAT.OFFICE, false, 'PowerPoint'),
  '.pdf': e('PDF', CAT.PDF, false),
  '.png': e('PNG Image', CAT.IMAGE, false, 'Image'), '.jpg': e('JPEG Image', CAT.IMAGE, false, 'Image'), '.jpeg': e('JPEG Image', CAT.IMAGE, false, 'Image'),
  '.gif': e('GIF Image', CAT.IMAGE, false, 'Image'), '.bmp': e('BMP Image', CAT.IMAGE, false, 'Image'), '.webp': e('WebP Image', CAT.IMAGE, false, 'Image'),
  '.tiff': e('TIFF Image', CAT.IMAGE, false, 'Image'), '.tif': e('TIFF Image', CAT.IMAGE, false, 'Image'), '.ico': e('Icon', CAT.IMAGE, false, 'Image'),
  '.svg': e('SVG Image', CAT.IMAGE, true, 'Image'),
  '.zip': e('ZIP Archive', CAT.BINARY, false, 'Archive'), '.tar': e('TAR Archive', CAT.BINARY, false, 'Archive'), '.gz': e('GZip Archive', CAT.BINARY, false, 'Archive'),
  '.7z': e('7-Zip Archive', CAT.BINARY, false, 'Archive'), '.rar': e('RAR Archive', CAT.BINARY, false, 'Archive'),
  '.exe': e('Executable', CAT.BINARY, false, 'Binary'), '.dll': e('Library', CAT.BINARY, false, 'Binary'), '.so': e('Shared Object', CAT.BINARY, false, 'Binary'),
  '.jar': e('Java Archive', CAT.BINARY, false, 'Binary'), '.wasm': e('WebAssembly', CAT.BINARY, false, 'Binary'),
  '.db': e('Database File', CAT.DATA, false, 'Database'), '.sqlite': e('SQLite', CAT.DATA, false, 'Database'), '.sqlite3': e('SQLite', CAT.DATA, false, 'Database'),
  '.pyc': e('Python Bytecode', CAT.CACHE, false, 'Generated'), '.pyo': e('Python Bytecode', CAT.CACHE, false, 'Generated'),
  '.class': e('Java Bytecode', CAT.BUILD, false, 'Generated'), '.o': e('Object File', CAT.BUILD, false, 'Generated'), '.obj': e('Object File', CAT.BUILD, false, 'Generated'),
  '.map': e('Source Map', CAT.GENERATED, true, 'Generated'), '.lock': e('Lock File', CAT.DEPENDENCY, true, 'Dependency'),
  '.bak': e('Backup', CAT.GENERATED, true, 'Generated'), '.tmp': e('Temporary', CAT.GENERATED, true, 'Generated'),
  '.feature': e('Gherkin', CAT.TEST, true, 'Gherkin'), '.robot': e('Robot Framework', CAT.TEST, true, 'Robot'),
};

export const FILENAMES = {
  'dockerfile': e('Dockerfile', CAT.CONFIG), 'makefile': e('Makefile', CAT.CONFIG), 'procfile': e('Procfile', CAT.CONFIG),
  'license': e('Plain Text', CAT.DOC, true, 'Text'), 'readme': e('Plain Text', CAT.DOC, true, 'Text'), 'changelog': e('Plain Text', CAT.DOC, true, 'Text'),
  '.gitignore': e('Git Ignore', CAT.CONFIG, true, 'Config'), '.gitattributes': e('Git Attributes', CAT.CONFIG, true, 'Config'),
  '.dockerignore': e('Docker Ignore', CAT.CONFIG, true, 'Config'), '.npmrc': e('NPM Config', CAT.CONFIG, true, 'Config'),
  '.env': e('Dotenv', CAT.CONFIG), '.editorconfig': e('EditorConfig', CAT.CONFIG, true, 'Config'),
};

export const DEPENDENCY_NAMES = new Set([
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'requirements.txt', 'requirements-dev.txt',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'pipfile', 'pipfile.lock', 'poetry.lock', 'environment.yml',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'gemfile', 'gemfile.lock', 'go.mod', 'go.sum', 'cargo.toml',
  'cargo.lock', 'composer.json', 'composer.lock', 'tsconfig.json',
]);
export const LOCKFILE_NAMES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'pipfile.lock', 'poetry.lock', 'gemfile.lock', 'cargo.lock', 'composer.lock', 'go.sum']);

export const TEST_DIRS = new Set(['test', 'tests', 'spec', 'specs', '__tests__', 'testing', 'e2e', 'integration-tests', 'unit-tests', 'cypress', 'playwright']);
const TEST_PATTERNS = [
  /^test_.*\.py$/i, /_test\.py$/i, /^tests?\.py$/i, /^conftest\.py$/i, /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /Tests?\.java$/, /_test\.go$/i, /_spec\.rb$/i, /Tests?\.cs$/, /^test_.*\.sql$/i, /\.feature$/i, /\.robot$/i,
];

export const TEST_FRAMEWORKS = [
  ['pytest', /^\s*import\s+pytest|^\s*from\s+pytest\b|@pytest\./m],
  ['unittest', /^\s*import\s+unittest|^\s*from\s+unittest\b|unittest\.TestCase/m],
  ['jest', /from\s+['"]@jest\/|require\(['"]jest|\bjest\.(mock|fn|spyOn)\b/],
  ['mocha', /require\(['"]mocha['"]\)|from\s+['"]mocha['"]/],
  ['chai', /require\(['"]chai['"]\)|from\s+['"]chai['"]/],
  ['vitest', /from\s+['"]vitest['"]|require\(['"]vitest['"]\)/],
  ['node:test', /from\s+['"]node:test['"]|require\(['"]node:test['"]\)/],
  ['playwright', /@playwright\/test|require\(['"]playwright/],
  ['cypress', /\bcy\.(visit|get|contains)\b|require\(['"]cypress/],
  ['selenium', /selenium\.webdriver|from\s+selenium\b|selenium-webdriver/],
  ['junit', /org\.junit/], ['testng', /org\.testng/], ['xunit/nunit', /\[(Fact|Test|TestMethod)\]/],
];

export const ENTRY_NAMES = new Set([
  'main.py', 'app.py', '__main__.py', 'manage.py', 'wsgi.py', 'asgi.py', 'run.py', 'cli.py',
  'index.js', 'main.js', 'app.js', 'server.js', 'index.mjs', 'main.mjs', 'index.ts', 'main.ts', 'server.ts',
  'index.html', 'program.cs', 'main.go', 'main.rs', 'main.java', 'application.java', 'index.php', 'main.c', 'main.cpp',
]);

export function extensionOf(name) {
  const n = name.toLowerCase();
  if (n.startsWith('.') && n.split('.').length === 2) return '';
  const i = n.lastIndexOf('.');
  return i <= 0 ? '' : n.slice(i);
}

export function lookup(name) {
  const lower = name.toLowerCase();
  if (FILENAMES[lower]) return FILENAMES[lower];
  if (lower.startsWith('.env.')) return FILENAMES['.env'];
  const ext = extensionOf(lower);
  if (ext && EXTENSIONS[ext]) return EXTENSIONS[ext];
  const stem = lower.split('.')[0];
  if (!ext && FILENAMES[stem]) return FILENAMES[stem];
  if (stem === 'dockerfile' || stem === 'makefile') return FILENAMES[stem];
  return null;
}

export function isTestPath(path) {
  const parts = path.split('/');
  const name = parts[parts.length - 1];
  for (const p of parts.slice(0, -1)) if (TEST_DIRS.has(p.toLowerCase())) return [true, `in test directory '${p}/'`];
  for (const re of TEST_PATTERNS) if (re.test(name)) return [true, 'filename matches a test pattern'];
  return [false, ''];
}

export function detectFrameworks(text) {
  return TEST_FRAMEWORKS.filter(([, re]) => re.test(text)).map(([n]) => n);
}

export function classify(path) {
  const name = path.split('/').pop();
  const info = lookup(name);
  if (!info) return { language: '', category: CAT.UNKNOWN, text: true, unknown: true, family: 'Unknown' };
  let { language, category, text, family } = info;
  if (DEPENDENCY_NAMES.has(name.toLowerCase()) || /\.(csproj|sln|vbproj)$/i.test(name)) category = CAT.DEPENDENCY;
  if (isTestPath(path)[0] && (category === CAT.SOURCE || category === CAT.UNKNOWN)) category = CAT.TEST;
  return { language, category, text, unknown: false, family };
}

export const knownExtensionCount = () => Object.keys(EXTENSIONS).length;
