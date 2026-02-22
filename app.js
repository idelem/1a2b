/**
 * 1a2b — Luhmann Zettelkasten Outliner
 *
 * Data: flat array of { id: uuid, ids: string[], content: string }
 * Tree derived at render time by sorting (note, id) pairs.
 * Luhmann IDs: alternating num/alpha segments — 1, 1a, 1a2, 1a2b, ...
 */

// ─────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────

const SETTINGS_KEY = 'zettel_settings_v1';

const DEFAULT_SETTINGS = {
  accent:    '#c8a96e',
  orphan:    '#a05c7a',
  defaultId: '',
  theme:     'dark',
};

let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
  const isDark = settings.theme !== 'light';
  document.body.classList.toggle('light', !isDark);

  const root = document.documentElement;
  const ac = settings.accent || DEFAULT_SETTINGS.accent;
  const oc = settings.orphan || DEFAULT_SETTINGS.orphan;

  applyColorSet(root, 'accent', ac, isDark);
  applyColorSet(root, 'orphan', oc, isDark);
}

/**
 * Compute and inject the full set of CSS vars for one color role.
 * In dark mode: the base color is medium-bright, dim is darker, bg is very faint.
 * In light mode: base is darkened for contrast on light bg, dim is the original
 * (lighter, used for borders/underlines), bg is a faint tint.
 */
function applyColorSet(root, role, hex, isDark) {
  const hsl = hexToHsl(hex);
  if (!hsl) return;

  let main, dim, bg;

  if (isDark) {
    // Dark mode: use the color roughly as-is (user sees what they picked),
    // dim = same hue, less lightness, bg = very faint tint
    main = hslStr(hsl.h, hsl.s, clamp(hsl.l, 45, 75));
    dim  = hslStr(hsl.h, clamp(hsl.s - 10, 20, 80), clamp(hsl.l - 22, 20, 55));
    bg   = `hsla(${hsl.h},${Math.round(hsl.s)}%,${Math.round(hsl.l)}%,0.08)`;
  } else {
    // Light mode: darken significantly so it reads on light background
    main = hslStr(hsl.h, clamp(hsl.s + 5, 35, 85), clamp(hsl.l - 30, 18, 45));
    dim  = hslStr(hsl.h, clamp(hsl.s - 5, 25, 75), clamp(hsl.l - 10, 35, 60));
    bg   = `hsla(${hsl.h},${Math.round(hsl.s)}%,${Math.round(hsl.l)}%,0.09)`;
  }

  root.style.setProperty(`--${role}`,     main);
  root.style.setProperty(`--${role}-dim`,  dim);
  root.style.setProperty(`--${role}-bg`,   bg);
}

// ── Color math ──

function hexToRgb(hex) {
  const m = (hex || '').replace('#','').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) };
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let { r, g, b } = rgb;
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslStr(h, s, l) {
  return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** Make a hex color into rgba with alpha a. */
function hexAlpha(hex, a) {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function isValidHex(h) {
  return /^#[0-9a-f]{6}$/i.test(h);
}

// ─────────────────────────────────────────────
// Storage — notes
// ─────────────────────────────────────────────

const STORAGE_KEY = 'zettel_notes_v1';

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

let notes = loadNotes();

function getNoteById(uuid) { return notes.find(n => n.id === uuid); }

function generateUUID() {
  return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─────────────────────────────────────────────
// Luhmann ID parsing & comparison
// ─────────────────────────────────────────────

function parseId(id) {
  const segments = [];
  let i = 0;
  const s = (id || '').trim().toLowerCase();
  while (i < s.length) {
    if (/\d/.test(s[i])) {
      let start = i;
      while (i < s.length && /\d/.test(s[i])) i++;
      segments.push({ type: 'num', val: parseInt(s.slice(start, i), 10) });
    } else if (/[a-z]/.test(s[i])) {
      let start = i;
      while (i < s.length && /[a-z]/.test(s[i])) i++;
      segments.push({ type: 'alpha', val: s.slice(start, i) });
    } else {
      i++;
    }
  }
  return segments;
}

function isValidId(id) {
  if (!id || !id.trim()) return false;
  const segs = parseId(id.trim());
  if (segs.length === 0 || segs[0].type !== 'num') return false;
  for (let i = 0; i < segs.length; i++) {
    if (segs[i].type !== (i % 2 === 0 ? 'num' : 'alpha')) return false;
  }
  return true;
}

function idDepth(id) { return parseId(id).length; }

function compareIds(a, b) {
  const sa = parseId(a), sb = parseId(b);
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const xa = sa[i], xb = sb[i];
    if (xa.type === 'num' && xb.type === 'num') {
      if (xa.val !== xb.val) return xa.val < xb.val ? -1 : 1;
    } else if (xa.type === 'alpha' && xb.type === 'alpha') {
      if (xa.val !== xb.val) return xa.val < xb.val ? -1 : 1;
    } else {
      return xa.type === 'num' ? -1 : 1;
    }
  }
  return sa.length < sb.length ? -1 : sa.length > sb.length ? 1 : 0;
}

function normalizeId(id) { return (id || '').trim().toLowerCase(); }

function parseIdsString(str) {
  return (str || '').trim().split(/\s+/).filter(s => s.length > 0).map(normalizeId);
}

function segmentsToId(segs) {
  return segs.map(s => String(s.val)).join('');
}

// ─────────────────────────────────────────────
// Orphan detection
// ─────────────────────────────────────────────

/**
 * Returns the "effective depth" = depth of deepest existing ancestor.
 * If no ancestor exists at all, returns 0 (meaning treat as top-level orphan).
 * An ID is "orphaned" if its direct parent doesn't exist.
 */
function getEffectiveDepth(id, existingIdSet, excludeUUID) {
  const segs = parseId(id);
  if (segs.length <= 1) return 0; // top-level, never orphaned

  // Check if direct parent exists
  const parentId = segmentsToId(segs.slice(0, segs.length - 1));
  if (existingIdSet.has(normalizeId(parentId))) {
    return segs.length - 1; // parent exists, normal depth
  }

  // Parent missing — find deepest existing ancestor
  for (let len = segs.length - 2; len >= 1; len--) {
    const ancestorId = segmentsToId(segs.slice(0, len));
    if (existingIdSet.has(normalizeId(ancestorId))) {
      return len; // indent at ancestor level
    }
  }

  // No ancestor exists at all — treat as top-level
  return 0;
}

function isOrphaned(id, existingIdSet) {
  const segs = parseId(id);
  if (segs.length <= 1) return false;
  const parentId = segmentsToId(segs.slice(0, segs.length - 1));
  return !existingIdSet.has(normalizeId(parentId));
}

// ─────────────────────────────────────────────
// Derived tree rows
// ─────────────────────────────────────────────

function buildRows(excludeUUIDs = new Set()) {
  const rows = [];
  for (const note of notes) {
    if (excludeUUIDs.has(note.id)) continue;
    for (const id of note.ids) {
      rows.push({ note, id });
    }
  }
  rows.sort((a, b) => compareIds(a.id, b.id));
  return rows;
}

function buildExistingIdSet(excludeUUIDs = new Set()) {
  const set = new Set();
  for (const note of notes) {
    if (excludeUUIDs.has(note.id)) continue;
    for (const id of note.ids) {
      set.add(normalizeId(id));
    }
  }
  return set;
}

function isIdTaken(id, excludeUUID = null) {
  const norm = normalizeId(id);
  for (const note of notes) {
    if (note.id === excludeUUID) continue;
    if (note.ids.map(normalizeId).includes(norm)) return note;
  }
  return null;
}

// ─────────────────────────────────────────────
// Markdown setup
// ─────────────────────────────────────────────

// Configure marked to preserve blank lines as visual spacing
marked.setOptions({
  breaks: true,   // single newline → <br>
  gfm: true,
});

function renderMarkdown(content) {
  if (!content) return '';
  // Preserve intentional blank lines by converting \n\n inside paragraphs
  // to <br><br> before marked processes them, then let marked handle the rest.
  // marked with breaks:true already handles \n → <br> within paragraphs,
  // and paragraph breaks naturally create spacing.
  return marked.parse(content);
}

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

const treeEl = document.getElementById('tree');
const emptyState = document.getElementById('empty-state');

let floatingState = null;

function render(excludeUUIDs = new Set()) {
  const rows = buildRows(excludeUUIDs);
  const existingIdSet = buildExistingIdSet(excludeUUIDs);

  if (rows.length === 0) {
    treeEl.innerHTML = '';
    emptyState.classList.add('visible');
    return;
  }
  emptyState.classList.remove('visible');
  treeEl.innerHTML = '';

  for (const { note, id } of rows) {
    const orphaned = isOrphaned(id, existingIdSet);
    const effectiveDepth = orphaned
      ? getEffectiveDepth(id, existingIdSet, null)
      : idDepth(id) - 1;
    const row = createNoteRow(note, id, effectiveDepth, orphaned);
    treeEl.appendChild(row);
  }
}

function createNoteRow(note, id, depth, orphaned) {
  const row = document.createElement('div');
  row.className = 'note-row' + (orphaned ? ' orphan' : '');
  row.dataset.uuid = note.id;
  row.dataset.luhmannId = normalizeId(id);

  // Indent
  const indent = document.createElement('div');
  indent.className = 'note-indent';
  for (let i = 0; i < depth; i++) {
    const unit = document.createElement('div');
    unit.className = 'indent-unit';
    indent.appendChild(unit);
  }

  // ID label
  const idLabel = document.createElement('div');
  idLabel.className = 'note-id';
  idLabel.textContent = id;

  // Content
  const contentEl = document.createElement('div');
  contentEl.className = 'note-content';
  const rendered = document.createElement('div');
  rendered.className = 'rendered';
  rendered.innerHTML = renderMarkdown(note.content || '');
  contentEl.appendChild(rendered);

  row.appendChild(indent);
  row.appendChild(idLabel);
  row.appendChild(contentEl);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'note-delete';
  delBtn.textContent = '✕';
  delBtn.title = 'Delete note';
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (floatingState) return;
    const label = note.ids.join(' ');
    if (confirm(`Delete "${label}"?`)) {
      notes = notes.filter(n => n.id !== note.id);
      saveNotes();
      render();
    }
  });
  row.appendChild(delBtn);

  row.addEventListener('click', () => {
    if (floatingState) return;
    startFloatingEdit(note, id, row);
  });

  return row;
}

// ─────────────────────────────────────────────
// Floating editor
// ─────────────────────────────────────────────

const floatingEditor = document.getElementById('floating-editor');
const floatIdsInput  = document.getElementById('float-ids');
const floatContentInput = document.getElementById('float-content');
const floatConflictMsg  = document.getElementById('float-conflict-msg');

function startFloatingEdit(note, clickedId, rowEl) {
  floatingState = {
    uuid: note.id,
    originalIds: [...note.ids],
    originalContent: note.content,
    clickedId,
  };

  const rect = rowEl.getBoundingClientRect();
  floatingEditor.classList.remove('hidden');
  floatingEditor.style.left  = rect.left + 'px';
  floatingEditor.style.top   = rect.top + 'px';
  floatingEditor.style.width = Math.max(300, rect.width) + 'px';

  clampFloatingEditor();

  floatIdsInput.value = note.ids.join(' ');
  floatContentInput.value = note.content || '';
  autoResizeTextarea(floatContentInput);

  render(new Set([note.id]));

  // Focus the ID input first
  floatIdsInput.focus();
  floatIdsInput.select();

  floatIdsInput.addEventListener('input',  onFloatIdsInput);
  floatIdsInput.addEventListener('keydown',onFloatIdsKeydown);
  floatIdsInput.addEventListener('click',  onFloatIdsCursorMove);
  floatIdsInput.addEventListener('keyup',  onFloatIdsCursorMove);
  floatContentInput.addEventListener('input', onFloatContentInput);

  document.addEventListener('mousedown', onOutsideClick, true);
  document.addEventListener('keydown',   onEscapeKey,    true);
}

function clampFloatingEditor() {
  if (floatingEditor.classList.contains('hidden')) return;
  const vpH = window.innerHeight;
  const vpW = window.innerWidth;
  const barH = document.getElementById('bottom-bar').offsetHeight;
  const margin = 8;

  let top  = parseFloat(floatingEditor.style.top)  || 0;
  let left = parseFloat(floatingEditor.style.left) || 0;
  const floatH = floatingEditor.offsetHeight;
  const floatW = floatingEditor.offsetWidth;

  const maxBottom = vpH - barH - margin;
  if (top + floatH > maxBottom) top  = maxBottom - floatH;
  if (top < 48 + margin)        top  = 48 + margin;
  if (left + floatW > vpW - margin) left = vpW - floatW - margin;
  if (left < margin)            left = margin;

  floatingEditor.style.top  = top  + 'px';
  floatingEditor.style.left = left + 'px';
}

function onFloatIdsInput()      { handleIdFieldChange(floatIdsInput, floatConflictMsg, floatingState.uuid); }
function onFloatIdsCursorMove() { handleIdCursorScroll(floatIdsInput); }
function onFloatIdsKeydown(e) {
  if (e.key === 'Enter') { e.preventDefault(); floatContentInput.focus(); }
}
function onFloatContentInput()  { autoResizeTextarea(floatContentInput); }

function onOutsideClick(e) {
  if (!floatingEditor.contains(e.target)) commitFloatingEdit();
}
function onEscapeKey(e) {
  if (e.key === 'Escape') cancelFloatingEdit();
}

function cancelFloatingEdit() {
  if (!floatingState) return;
  cleanup();
  render();
}

function commitFloatingEdit() {
  if (!floatingState) return;

  const rawIds    = floatIdsInput.value;
  const newContent = floatContentInput.value;
  const parsedIds  = parseIdsString(rawIds).filter(isValidId);

  if (parsedIds.length === 0) { cancelFloatingEdit(); return; }

  for (const id of parsedIds) {
    const conflict = isIdTaken(id, floatingState.uuid);
    if (conflict) { showConflict(floatConflictMsg, id); return; }
  }

  const note = getNoteById(floatingState.uuid);
  if (note) {
    note.ids     = parsedIds;
    note.content = newContent;
    saveNotes();
  }

  cleanup();
  render();
  if (parsedIds.length > 0) scrollToId(parsedIds[0]);
}

function cleanup() {
  floatingEditor.classList.add('hidden');
  floatIdsInput.removeEventListener('input',   onFloatIdsInput);
  floatIdsInput.removeEventListener('keydown', onFloatIdsKeydown);
  floatIdsInput.removeEventListener('click',   onFloatIdsCursorMove);
  floatIdsInput.removeEventListener('keyup',   onFloatIdsCursorMove);
  floatContentInput.removeEventListener('input', onFloatContentInput);
  document.removeEventListener('mousedown', onOutsideClick, true);
  document.removeEventListener('keydown',   onEscapeKey,    true);
  floatConflictMsg.classList.add('hidden');
  floatingState = null;
}

// ─────────────────────────────────────────────
// ID field: cursor-aware scroll + conflict
// ─────────────────────────────────────────────

function getActiveToken(input) {
  const val = input.value;
  const pos = input.selectionStart;
  const parts = val.split(/(\s+)/);
  const tokens = [];
  let offset = 0;
  for (const part of parts) {
    if (/\S/.test(part)) tokens.push({ text: part, start: offset, end: offset + part.length });
    offset += part.length;
  }
  for (const tok of tokens) {
    if (pos >= tok.start && pos <= tok.end) return tok.text;
  }
  if (tokens.length > 0) {
    const last = tokens[tokens.length - 1];
    if (pos >= last.end) return last.text;
  }
  return null;
}

let scrollDebounceTimer = null;

function handleIdCursorScroll(input) {
  const token = getActiveToken(input);
  if (!token) return;
  clearTimeout(scrollDebounceTimer);
  scrollDebounceTimer = setTimeout(() => scrollToClosestId(token), 80);
}

function handleIdFieldChange(input, msgEl, excludeUUID) {
  const tokens = parseIdsString(input.value);
  msgEl.classList.add('hidden');
  clearAllHighlights();

  for (const tok of tokens) {
    if (!isValidId(tok)) continue;
    const conflict = isIdTaken(tok, excludeUUID);
    if (conflict) {
      showConflict(msgEl, tok);
      highlightRow(tok, 'conflict-highlighted');
    }
  }
  handleIdCursorScroll(input);
}

function showConflict(msgEl, id) {
  msgEl.textContent = `"${id}" is already taken`;
  msgEl.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// Scroll helpers
// ─────────────────────────────────────────────

function scrollToId(id) {
  const norm = normalizeId(id);
  const row = treeEl.querySelector(`[data-luhmann-id="${norm}"]`);
  if (row) {
    clearScrollHighlights();
    row.classList.add('scroll-dest');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => row.classList.remove('scroll-dest'), 1400);
    return true;
  }
  return false;
}

function scrollToClosestId(id) {
  const norm = normalizeId(id);
  if (scrollToId(norm)) return;
  const segs = parseId(norm);
  for (let len = segs.length - 1; len >= 1; len--) {
    const prefix = segmentsToId(segs.slice(0, len));
    if (scrollToId(prefix)) return;
  }
  scrollToNearestNeighbor(norm);
}

function scrollToNearestNeighbor(targetId) {
  const rows = Array.from(treeEl.querySelectorAll('.note-row'));
  if (!rows.length) return;
  let best = rows[0];
  for (const row of rows) {
    if (compareIds(row.dataset.luhmannId, targetId) <= 0) best = row;
    else break;
  }
  clearScrollHighlights();
  best.classList.add('scroll-dest');
  best.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => best.classList.remove('scroll-dest'), 1400);
}

function highlightRow(id, cls) {
  const row = treeEl.querySelector(`[data-luhmann-id="${normalizeId(id)}"]`);
  if (row) row.classList.add(cls);
}

function clearAllHighlights() {
  treeEl.querySelectorAll('.conflict-highlighted').forEach(el => el.classList.remove('conflict-highlighted'));
  clearScrollHighlights();
}

function clearScrollHighlights() {
  treeEl.querySelectorAll('.scroll-dest').forEach(el => el.classList.remove('scroll-dest'));
}

// ─────────────────────────────────────────────
// Bottom bar — new note
// ─────────────────────────────────────────────

const newIdInput      = document.getElementById('new-id');
const newContentInput = document.getElementById('new-content');
const newConflictMsg  = document.getElementById('new-conflict-msg');

newIdInput.addEventListener('input',  () => handleIdFieldChange(newIdInput, newConflictMsg, null));
newIdInput.addEventListener('click',  () => handleIdCursorScroll(newIdInput));
newIdInput.addEventListener('keyup',  () => handleIdCursorScroll(newIdInput));

newIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); newContentInput.focus(); }
});

newContentInput.addEventListener('input', () => autoResizeTextarea(newContentInput));

newContentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNewNote(); }
});

function submitNewNote() {
  const rawIds   = newIdInput.value.trim();
  const content  = newContentInput.value.trim();
  if (!rawIds || !content) return;

  const parsedIds = parseIdsString(rawIds).filter(isValidId);
  if (parsedIds.length === 0) {
    newConflictMsg.textContent = 'Enter a valid Luhmann ID (e.g. 1a2b)';
    newConflictMsg.classList.remove('hidden');
    return;
  }

  for (const id of parsedIds) {
    const conflict = isIdTaken(id, null);
    if (conflict) {
      showConflict(newConflictMsg, id);
      highlightRow(id, 'conflict-highlighted');
      scrollToId(id);
      return;
    }
  }

  notes.push({ id: generateUUID(), ids: parsedIds, content });
  saveNotes();
  render();

  // Reset bottom bar
  newIdInput.value = settings.defaultId || '';
  newContentInput.value = '';
  newContentInput.style.height = '';
  newConflictMsg.classList.add('hidden');

  scrollToId(parsedIds[0]);
  newIdInput.focus();
}

// ─────────────────────────────────────────────
// Theme toggle
// ─────────────────────────────────────────────

document.getElementById('theme-toggle').addEventListener('click', () => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings();
  applySettings();
});

// ─────────────────────────────────────────────
// Settings modal
// ─────────────────────────────────────────────

const settingsOverlay  = document.getElementById('settings-overlay');
const inputAccent      = document.getElementById('input-accent');
const inputOrphan      = document.getElementById('input-orphan');
const inputDefaultId   = document.getElementById('input-default-id');
const swatchAccent     = document.getElementById('swatch-accent');
const swatchOrphan     = document.getElementById('swatch-orphan');

function openSettings() {
  inputAccent.value    = settings.accent;
  inputOrphan.value    = settings.orphan;
  inputDefaultId.value = settings.defaultId || '';
  updateSwatches();
  settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  settingsOverlay.classList.add('hidden');
}

function updateSwatches() {
  const a = inputAccent.value;
  const o = inputOrphan.value;
  swatchAccent.style.background = isValidHex(a) ? a : 'transparent';
  swatchOrphan.style.background = isValidHex(o) ? o : 'transparent';
}

inputAccent.addEventListener('input', updateSwatches);
inputOrphan.addEventListener('input', updateSwatches);

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);

settingsOverlay.addEventListener('mousedown', (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

document.getElementById('settings-save').addEventListener('click', () => {
  const a = inputAccent.value.trim();
  const o = inputOrphan.value.trim();
  const d = inputDefaultId.value.trim();

  if (isValidHex(a)) settings.accent = a;
  if (isValidHex(o)) settings.orphan = o;
  settings.defaultId = isValidId(d) ? normalizeId(d) : '';

  saveSettings();
  applySettings();

  // Prefill new-id if defaultId set
  if (settings.defaultId && !newIdInput.value) {
    newIdInput.value = settings.defaultId;
  }

  closeSettings();
});

document.getElementById('settings-reset').addEventListener('click', () => {
  settings.accent    = DEFAULT_SETTINGS.accent;
  settings.orphan    = DEFAULT_SETTINGS.orphan;
  settings.defaultId = DEFAULT_SETTINGS.defaultId;
  inputAccent.value  = settings.accent;
  inputOrphan.value  = settings.orphan;
  inputDefaultId.value = '';
  saveSettings();
  applySettings();
  updateSwatches();
});

// ─────────────────────────────────────────────
// Textarea auto-resize
// ─────────────────────────────────────────────

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ─────────────────────────────────────────────
// Clamp floating on scroll/resize
// ─────────────────────────────────────────────

document.getElementById('tree-container').addEventListener('scroll', clampFloatingEditor);
window.addEventListener('resize', clampFloatingEditor);

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

loadSettings();
applySettings();
render();

// Prefill default ID and focus id input
if (settings.defaultId) newIdInput.value = settings.defaultId;
newIdInput.focus();
