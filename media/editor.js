/**
 * MDZip Editor — webview script
 *
 * Runs inside the VS Code webview. Communicates with the extension host via
 * the acquireVsCodeApi() message bus.
 *
 * Expected inbound messages (from extension):
 *   { type: 'load', markdown, entryPoint, manifest, images, paths }
 *
 * Outbound messages (to extension):
 *   { type: 'ready' }
 *   { type: 'edit', markdown }
 */

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const previewPane = /** @type {HTMLElement} */ (document.getElementById('preview-pane'));
  const editPane    = /** @type {HTMLElement} */ (document.getElementById('edit-pane'));
  const previewContent = /** @type {HTMLElement} */ (document.getElementById('preview-content'));
  const editor      = /** @type {HTMLTextAreaElement} */ (document.getElementById('editor'));
  const btnPreview  = /** @type {HTMLButtonElement} */ (document.getElementById('btn-preview'));
  const btnEdit     = /** @type {HTMLButtonElement} */ (document.getElementById('btn-edit'));
  const fileLabel   = /** @type {HTMLElement} */ (document.getElementById('file-label'));

  // ── State ─────────────────────────────────────────────────────────────────
  /** @type {Record<string, string>} archive-path → data-URI */
  let imageMap = {};
  /** @type {string} */
  let entryPoint = '';

  // ── Toolbar toggle ────────────────────────────────────────────────────────
  function showPreview() {
    previewPane.classList.add('active');
    editPane.classList.remove('active');
    btnPreview.classList.add('active');
    btnEdit.classList.remove('active');
    renderPreview();
  }

  function showEdit() {
    editPane.classList.add('active');
    previewPane.classList.remove('active');
    btnEdit.classList.add('active');
    btnPreview.classList.remove('active');
  }

  btnPreview.addEventListener('click', showPreview);
  btnEdit.addEventListener('click', showEdit);

  // ── Markdown rendering ────────────────────────────────────────────────────
  /**
   * Render the current editor content to the preview pane.
   * Images with archive-relative src values are replaced by data-URIs.
   */
  function renderPreview() {
    const raw = editor.value;

    // Replace relative image paths with data-URIs before parsing
    const rewritten = rewriteImageSrc(raw);

    // marked is loaded inline from the extension; fall back to plain text
    if (typeof marked !== 'undefined') {
      previewContent.innerHTML = marked.parse(rewritten);
    } else {
      previewContent.textContent = raw;
    }
  }

  /**
   * Replace `![alt](path)` image paths with the matching data-URI when
   * available.  Paths may be relative to the entry-point directory.
   */
  function rewriteImageSrc(markdown) {
    const entryDir = entryPoint.includes('/')
      ? entryPoint.slice(0, entryPoint.lastIndexOf('/') + 1)
      : '';

    return markdown.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        // Strip query/hash
        const clean = src.split('?')[0].split('#')[0];
        // Try the path as-is first, then relative to entry-point directory
        const candidates = [clean, entryDir + clean];
        for (const candidate of candidates) {
          const normalised = candidate.replace(/^\.\//, '').replace(/\\/g, '/');
          if (imageMap[normalised]) {
            return `![${alt}](${imageMap[normalised]})`;
          }
        }
        return match; // leave unchanged
      }
    );
  }

  // ── Editor change → notify extension ─────────────────────────────────────
  let editTimer = null;

  editor.addEventListener('input', () => {
    // Debounce to avoid sending a message on every keystroke
    clearTimeout(editTimer);
    editTimer = setTimeout(() => {
      vscode.postMessage({ type: 'edit', markdown: editor.value });
    }, 300);
  });

  // ── Handle Tab key in the editor ──────────────────────────────────────────
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.slice(0, start) + '  ' + editor.value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      vscode.postMessage({ type: 'edit', markdown: editor.value });
    }
  });

  // ── Inbound messages from the extension ───────────────────────────────────
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'load') {
      imageMap    = message.images || {};
      entryPoint  = message.entryPoint || '';
      editor.value = message.markdown || '';

      // Update toolbar label
      const title = message.manifest && message.manifest.title
        ? message.manifest.title
        : entryPoint;
      fileLabel.textContent = title;

      // Always start in preview mode when loading new content
      renderPreview();
      previewPane.classList.add('active');
      editPane.classList.remove('active');
      btnPreview.classList.add('active');
      btnEdit.classList.remove('active');
    }
  });

  // ── Signal readiness to the extension ────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
