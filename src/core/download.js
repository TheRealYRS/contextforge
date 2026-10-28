// Browser download helpers. No archive is ever created: files are delivered individually,
// or written one-by-one into a folder the user picks (File System Access API).
export const supportsFolderWrite = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** Trigger a browser download for one generated file. Resolves once the download has been handed to the browser. */
export function downloadOne(output) {
  const blob = new Blob([output.content], { type: `${output.contentType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = output.exportName; // browsers cannot accept "/" — folder paths are only kept in the manifest
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Write every output into a user-selected folder using the chosen layout.
 * Returns [{exportPath, ok, error}] — success is only reported after the write stream closes.
 */
export async function writeAllToFolder(outputs, packageFolderName, { onProgress = () => {} } = {}) {
  const root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'contextforge-output' });
  const pkg = await root.getDirectoryHandle(packageFolderName, { create: true });
  const results = [];
  for (const [i, o] of outputs.entries()) {
    try {
      const parts = o.exportPath.split('/');
      let dir = pkg;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg, { create: true });
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(new Blob([o.content], { type: o.contentType }));
      await w.close();
      results.push({ exportPath: o.exportPath, ok: true });
    } catch (e) {
      results.push({ exportPath: o.exportPath, ok: false, error: `${e?.name || 'Error'}: ${e?.message || e}` });
    }
    onProgress(i + 1, outputs.length);
  }
  return { folder: `${root.name}/${packageFolderName}`, results };
}
