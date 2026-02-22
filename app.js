/**
 * ZETTEL — Luhmann Zettelkasten Outliner
 *
 * Data model: flat array of notes
 *   { id: string (uuid), ids: string[], content: string }
 *
 * The "address" (Luhmann ID) system:
 *   IDs alternate number/letter segments: 1, 1a, 1a2, 1a2b, ...
 *   Depth = number of segments.
 *   Tree is derived by sorting all (note, id) pairs, no tree object needed.
 */

// ─────────────────────────────────────────────
// Storage
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

function getNoteById(uuid) {
  return notes.find(n => n.id === uuid);
}

function generateUUID() {
  return 'n_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─────────────────────────────────────────────
// Luhmann ID parsing & comparison
// ─────────────────────────────────────────────

/**
 * Parse a Luhmann ID into segments.
 * "1a2b" → [{type:'num', val:1}, {type:'alpha', val:'a'}, {type:'num', val:2}, {type:'alpha', val:'b'}]
 */
function parseId(id) {
  const segments = [];
  let i = 0;
  const s = id.trim().toLowerCase();
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
      i++; // skip unexpected chars
    }
  }
  return segments;
}

function isValidId(id) {
  if (!id || !id.trim()) return false;
  const s = id.trim();
  // Must start with digit, and strictly alternate num/alpha segments
  const segs = parseId(s);
  if (segs.length === 0) return false;
  if (segs[0].type !== 'num') return false;
  for (let i = 0; i < segs.length; i++) {
    const expected = i % 2 === 0 ? 'num' : 'alpha';
    if (segs[i].type !== expected) return false;
  }
  return true;
}

function idDepth(id) {
  return parseId(id).length;
}

/**
 * Compare two Luhmann IDs lexicographically by segments.
 * Returns -1, 0, or 1.
 */
function compareIds(a, b) {
  const sa = parseId(a);
  const sb = parseId(b);
  const len = Math.min(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    const xa = sa[i], xb = sb[i];
    if (xa.type === 'num' && xb.type === 'num') {
      if (xa.val !== xb.val) return xa.val < xb.val ? -1 : 1;
    } else if (xa.type === 'alpha' && xb.type === 'alpha') {
      if (xa.val !== xb.val) return xa.val < xb.val ? -1 : 1;
    } else {
      // type mismatch — numbers before letters at same position
      return xa.type === 'num' ? -1 : 1;
    }
  }
  if (sa.length !== sb.length) return sa.length < sb.length ? -1 : 1;
  return 0;
}

/**
 * Normalize an ID to lowercase trimmed form.
 */
function normalizeId(id) {
  return id.trim().toLowerCase();
}

/**
 * Parse space-separated IDs from a string.
 */
function parseIdsString(str) {
  return str.trim().split(/\s+/).filter(s => s.length > 0).map(normalizeId);
}

// ─────────────────────────────────────────────
// Derived tree rows
// ─────────────────────────────────────────────

/**
 * Build sorted list of {note, id} pairs for rendering.
 * Excludes notes with uuid in excludeSet.
 */
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

/**
 * Check if a given luhmann id is taken by any note (optionally excluding a uuid).
 */
function isIdTaken(id, excludeUUID = null) {
  const norm = normalizeId(id);
  for (const note of notes) {
    if (note.id === excludeUUID) continue;
    if (note.ids.map(normalizeId).includes(norm)) return note;
  }
  return null;
}

// ─────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────

const treeEl = document.getElementById('tree');
const emptyState = document.getElementById('empty-state');

let floatingState = null; // { uuid, originalIds, originalContent, rect }

function render(excludeUUIDs = new Set()) {
  const rows = buildRows(excludeUUIDs);

  if (rows.length === 0) {
    treeEl.innerHTML = '';
    emptyState.classList.add('visible');
    return;
  }
  emptyState.classList.remove('visible');

  treeEl.innerHTML = '';
  for (const { note, id } of rows) {
    const row = createNoteRow(note, id);
    treeEl.appendChild(row);
  }
}

function createNoteRow(note, id) {
  const depth = idDepth(id) - 1; // depth 0 = top level

  const row = document.createElement('div');
  row.className = 'note-row';
  row.dataset.uuid = note.id;
  row.dataset.luhmannId = id;

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
  rendered.innerHTML = marked.parse(note.content || '');
  contentEl.appendChild(rendered);

  row.appendChild(indent);
  row.appendChild(idLabel);
  row.appendChild(contentEl);

  // Click to edit
  row.addEventListener('click', (e) => {
    if (floatingState) return; // already editing
    startFloatingEdit(note, id, row);
  });

  return row;
}

// ─────────────────────────────────────────────
// Floating editor
// ─────────────────────────────────────────────

const floatingEditor = document.getElementById('floating-editor');
const floatIdsInput = document.getElementById('float-ids');
const floatContentInput = document.getElementById('float-content');
const floatConflictMsg = document.getElementById('float-conflict-msg');

function startFloatingEdit(note, clickedId, rowEl) {
  // Record original state
  floatingState = {
    uuid: note.id,
    originalIds: [...note.ids],
    originalContent: note.content,
    clickedId,
  };

  // Position floating editor where the row was
  const rect = rowEl.getBoundingClientRect();
  floatingEditor.classList.remove('hidden');
  floatingEditor.style.left = rect.left + 'px';
  floatingEditor.style.top = rect.top + 'px';
  floatingEditor.style.width = Math.max(320, rect.width) + 'px';

  // Keep it in view vertically
  clampFloatingEditor();

  // Populate fields
  floatIdsInput.value = note.ids.join(' ');
  floatContentInput.value = note.content || '';
  autoResizeTextarea(floatContentInput);

  // Re-render tree without this note
  render(new Set([note.id]));

  // Focus content
  floatContentInput.focus();

  // ID field events
  floatIdsInput.addEventListener('input', onFloatIdsInput);
  floatIdsInput.addEventListener('keydown', onFloatIdsKeydown);
  floatIdsInput.addEventListener('click', onFloatIdsCursorMove);
  floatIdsInput.addEventListener('keyup', onFloatIdsCursorMove);
  floatContentInput.addEventListener('input', onFloatContentInput);

  // Save on outside click
  document.addEventListener('mousedown', onOutsideClick, true);
  document.addEventListener('keydown', onEscapeKey, true);
}

function clampFloatingEditor() {
  if (floatingEditor.classList.contains('hidden')) return;
  const rect = floatingEditor.getBoundingClientRect();
  const vpH = window.innerHeight;
  const vpW = window.innerWidth;
  const bottomBarH = document.getElementById('bottom-bar').offsetHeight;
  const margin = 8;

  let top = parseFloat(floatingEditor.style.top) || 0;
  let left = parseFloat(floatingEditor.style.left) || 0;

  const maxBottom = vpH - bottomBarH - margin;
  const floatH = floatingEditor.offsetHeight;

  if (top + floatH > maxBottom) top = maxBottom - floatH;
  if (top < 48 + margin) top = 48 + margin;
  if (left + rect.width > vpW - margin) left = vpW - rect.width - margin;
  if (left < margin) left = margin;

  floatingEditor.style.top = top + 'px';
  floatingEditor.style.left = left + 'px';
}

function onFloatIdsInput() {
  handleIdFieldChange(floatIdsInput, floatConflictMsg, floatingState.uuid);
}

function onFloatIdsCursorMove() {
  handleIdCursorScroll(floatIdsInput);
}

function onFloatIdsKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    floatContentInput.focus();
  }
}

function onFloatContentInput() {
  autoResizeTextarea(floatContentInput);
}

function onOutsideClick(e) {
  if (!floatingEditor.contains(e.target)) {
    commitFloatingEdit();
  }
}

function onEscapeKey(e) {
  if (e.key === 'Escape') {
    cancelFloatingEdit();
  }
}

function cancelFloatingEdit() {
  if (!floatingState) return;
  cleanup();
  render();
}

function commitFloatingEdit() {
  if (!floatingState) return;

  const rawIds = floatIdsInput.value;
  const newContent = floatContentInput.value;
  const parsedIds = parseIdsString(rawIds);

  // Validate IDs
  const validIds = parsedIds.filter(isValidId);
  if (validIds.length === 0) {
    // No valid IDs — revert
    cancelFloatingEdit();
    return;
  }

  // Check uniqueness (excluding self)
  for (const id of validIds) {
    const conflict = isIdTaken(id, floatingState.uuid);
    if (conflict) {
      showConflict(floatConflictMsg, id, conflict);
      return; // don't save
    }
  }

  // Save
  const note = getNoteById(floatingState.uuid);
  if (note) {
    note.ids = validIds;
    note.content = newContent;
    saveNotes();
  }

  cleanup();
  render();
  // Scroll to first id
  if (validIds.length > 0) {
    scrollToId(validIds[0]);
  }
}

function cleanup() {
  floatingEditor.classList.add('hidden');
  floatIdsInput.removeEventListener('input', onFloatIdsInput);
  floatIdsInput.removeEventListener('keydown', onFloatIdsKeydown);
  floatIdsInput.removeEventListener('click', onFloatIdsCursorMove);
  floatIdsInput.removeEventListener('keyup', onFloatIdsCursorMove);
  floatContentInput.removeEventListener('input', onFloatContentInput);
  document.removeEventListener('mousedown', onOutsideClick, true);
  document.removeEventListener('keydown', onEscapeKey, true);
  floatConflictMsg.classList.add('hidden');
  floatingState = null;
}

// ─────────────────────────────────────────────
// ID field: live scroll + conflict detection
// ─────────────────────────────────────────────

/**
 * Given cursor position in an ID field, find which token (space-sep) the cursor is in.
 */
function getActiveToken(input) {
  const val = input.value;
  const pos = input.selectionStart;
  const tokens = [];
  let i = 0;
  let start = 0;
  // Find token boundaries
  const parts = val.split(/(\s+)/);
  let offset = 0;
  for (const part of parts) {
    if (/\S/.test(part)) {
      tokens.push({ text: part, start: offset, end: offset + part.length });
    }
    offset += part.length;
  }

  let active = null;
  for (const tok of tokens) {
    if (pos >= tok.start && pos <= tok.end) {
      active = tok.text;
      break;
    }
  }
  if (!active && tokens.length > 0) {
    // cursor might be at end
    const last = tokens[tokens.length - 1];
    if (pos >= last.end) active = last.text;
  }
  return active;
}

let scrollDebounceTimer = null;

function handleIdCursorScroll(input) {
  const token = getActiveToken(input);
  if (!token) return;

  clearTimeout(scrollDebounceTimer);
  scrollDebounceTimer = setTimeout(() => {
    scrollToClosestId(token);
  }, 80);
}

function handleIdFieldChange(input, msgEl, excludeUUID) {
  // Live conflict check for each token
  const tokens = parseIdsString(input.value);
  msgEl.classList.add('hidden');
  clearAllHighlights();

  for (const tok of tokens) {
    if (!isValidId(tok)) continue;
    const conflict = isIdTaken(tok, excludeUUID);
    if (conflict) {
      showConflict(msgEl, tok, conflict);
      highlightRow(tok, 'conflict-highlighted');
    }
  }

  // Scroll to current cursor token
  handleIdCursorScroll(input);
}

function showConflict(msgEl, id, conflictNote) {
  msgEl.textContent = `"${id}" is already taken`;
  msgEl.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// Scrolling helpers
// ─────────────────────────────────────────────

/**
 * Scroll tree to an exact ID row. Highlight it briefly.
 */
function scrollToId(id) {
  const norm = normalizeId(id);
  const row = treeEl.querySelector(`[data-luhmann-id="${norm}"]`);
  if (row) {
    clearScrollHighlights();
    row.classList.add('scroll-dest');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => row.classList.remove('scroll-dest'), 1200);
    return true;
  }
  return false;
}

/**
 * Scroll to the closest existing ancestor of a given ID.
 * "1a3c" → try "1a3c", "1a3", "1a", "1" in turn.
 */
function scrollToClosestId(id) {
  const norm = normalizeId(id);
  // Try exact match first
  if (scrollToId(norm)) return;

  // Try progressively shorter prefixes
  const segs = parseId(norm);
  for (let len = segs.length - 1; len >= 1; len--) {
    const prefix = segmentsToId(segs.slice(0, len));
    if (scrollToId(prefix)) return;
  }

  // Nothing found — scroll to nearest neighbor by sort order
  scrollToNearestNeighbor(norm);
}

function segmentsToId(segs) {
  return segs.map(s => String(s.val)).join('');
}
// e.g. [{type:'num',val:1},{type:'alpha',val:'a'},{type:'num',val:2}] → "1a2"

function scrollToNearestNeighbor(targetId) {
  const rows = Array.from(treeEl.querySelectorAll('.note-row'));
  if (rows.length === 0) return;

  // Find insertion point
  let best = null;
  let bestCmp = null;
  for (const row of rows) {
    const rid = row.dataset.luhmannId;
    const cmp = compareIds(rid, targetId);
    if (cmp <= 0) {
      best = row;
    } else {
      if (!best) best = row; // target is before all rows
      break;
    }
  }
  if (best) {
    clearScrollHighlights();
    best.classList.add('scroll-dest');
    best.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(() => best.classList.remove('scroll-dest'), 1200);
  }
}

function highlightRow(id, cls) {
  const norm = normalizeId(id);
  const row = treeEl.querySelector(`[data-luhmann-id="${norm}"]`);
  if (row) {
    row.classList.add(cls);
  }
}

function clearAllHighlights() {
  treeEl.querySelectorAll('.conflict-highlighted').forEach(el => {
    el.classList.remove('conflict-highlighted');
  });
  clearScrollHighlights();
}

function clearScrollHighlights() {
  treeEl.querySelectorAll('.scroll-dest').forEach(el => {
    el.classList.remove('scroll-dest');
  });
}

// ─────────────────────────────────────────────
// Bottom bar — new note
// ─────────────────────────────────────────────

const newIdInput = document.getElementById('new-id');
const newContentInput = document.getElementById('new-content');
const newConflictMsg = document.getElementById('new-conflict-msg');

newIdInput.addEventListener('input', () => {
  handleIdFieldChange(newIdInput, newConflictMsg, null);
});
newIdInput.addEventListener('click', () => handleIdCursorScroll(newIdInput));
newIdInput.addEventListener('keyup', () => handleIdCursorScroll(newIdInput));

newIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    newContentInput.focus();
  }
});

newContentInput.addEventListener('input', () => {
  autoResizeTextarea(newContentInput);
});

newContentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitNewNote();
  }
});

// Also allow submitting with Enter on the ID field if content is filled
newIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && newContentInput.value.trim()) {
    e.preventDefault();
    submitNewNote();
  }
});

function submitNewNote() {
  const rawIds = newIdInput.value.trim();
  const content = newContentInput.value.trim();

  if (!rawIds || !content) return;

  const parsedIds = parseIdsString(rawIds).filter(isValidId);
  if (parsedIds.length === 0) {
    newConflictMsg.textContent = 'Enter a valid Luhmann ID (e.g. 1a2b)';
    newConflictMsg.classList.remove('hidden');
    return;
  }

  // Check conflicts
  for (const id of parsedIds) {
    const conflict = isIdTaken(id, null);
    if (conflict) {
      showConflict(newConflictMsg, id, conflict);
      highlightRow(id, 'conflict-highlighted');
      scrollToId(id);
      return;
    }
  }

  const note = {
    id: generateUUID(),
    ids: parsedIds,
    content,
  };
  notes.push(note);
  saveNotes();
  render();

  // Clear
  newIdInput.value = '';
  newContentInput.value = '';
  newContentInput.style.height = '';
  newConflictMsg.classList.add('hidden');

  // Scroll to new note
  scrollToId(parsedIds[0]);
}

// ─────────────────────────────────────────────
// Textarea auto-resize
// ─────────────────────────────────────────────

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ─────────────────────────────────────────────
// Keep floating editor clamped on scroll/resize
// ─────────────────────────────────────────────

document.getElementById('tree-container').addEventListener('scroll', () => {
  clampFloatingEditor();
});

window.addEventListener('resize', () => {
  clampFloatingEditor();
});

// ─────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────

render();
