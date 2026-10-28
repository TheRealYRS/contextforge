// Browser input adapters. Each produces entries: { path, size, lastModified, read() }.
// Files are only ever read; nothing is written back to the selected folder.

export const supportsDirectoryPicker = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;
export const supportsDirectoryInput = () => typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input');

const fromFile = (file, path) => ({
  path, size: file.size, lastModified: file.lastModified,
  read: async () => new Uint8Array(await file.arrayBuffer()),
});

/** File System Access API: walk a directory handle. Heavy dependency folders are listed, not descended. */
export async function entriesFromDirectoryHandle(dirHandle, { onFound = () => {}, signal = {}, excludeDirs = [] } = {}) {
  const skip = new Set(excludeDirs.map((d) => d.toLowerCase()));
  const entries = [];
  const skipped = [];
  async function walk(handle, prefix) {
    for await (const [name, child] of handle.entries()) {
      if (signal.cancelled) return;
      const path = prefix ? `${prefix}/${name}` : name;
      if (child.kind === 'directory') {
        if (skip.has(name.toLowerCase())) { skipped.push(path); continue; }
        await walk(child, path);
      } else {
        try {
          const file = await child.getFile();
          entries.push({ path, size: file.size, lastModified: file.lastModified, read: async () => new Uint8Array(await (await child.getFile()).arrayBuffer()) });
        } catch (e) {
          entries.push({ path, size: 0, lastModified: 0, read: async () => { throw e; } });
        }
        if (entries.length % 50 === 0) onFound(entries.length);
      }
    }
  }
  await walk(dirHandle, '');
  return { entries, skippedDirs: skipped, rootName: dirHandle.name };
}

/** <input webkitdirectory> or multi-file input. */
export function entriesFromFileList(fileList) {
  const files = [...fileList];
  const entries = files.map((f) => fromFile(f, f.webkitRelativePath || f.name));
  const rootName = files[0]?.webkitRelativePath?.split('/')[0] || '';
  return { entries, rootName };
}

/** Drag-and-drop of folders via DataTransferItem.webkitGetAsEntry. */
export async function entriesFromDataTransfer(items, { excludeDirs = [] } = {}) {
  const skip = new Set(excludeDirs.map((d) => d.toLowerCase()));
  const skipped = [];
  const entries = [];
  const readAll = (reader) => new Promise((res, rej) => { const all = []; const next = () => reader.readEntries((b) => (b.length ? (all.push(...b), next()) : res(all)), rej); next(); });
  async function walk(entry, prefix) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      entries.push(fromFile(file, path));
    } else if (entry.isDirectory) {
      if (skip.has(entry.name.toLowerCase())) { skipped.push(path); return; }
      for (const child of await readAll(entry.createReader())) await walk(child, path);
    }
  }
  const roots = [...items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  for (const r of roots) await walk(r, '');
  return { entries, skippedDirs: skipped, rootName: roots.length === 1 && roots[0].isDirectory ? roots[0].name : '' };
}
