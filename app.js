// ── Config ──────────────────────────────────────────────────────────────────

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEOS_BASE = 'https://www.googleapis.com/youtube/v3/videos';
const MIN_DURATION_SECONDS = 60;// 1 minutes
const PAGE_SIZE = 10;

const SEARCH_QUERIES = {
  animal: {
    beginner:           'easy beginner origami animal tutorial step by step',
    'low-intermediate': 'origami animal low intermediate tutorial',
    intermediate:       'intermediate origami animal tutorial',
    advanced:           'advanced complex origami animal tutorial',
  },
  bird: {
    beginner:           'easy beginner origami bird tutorial',
    'low-intermediate': 'origami bird low intermediate tutorial',
    intermediate:       'intermediate origami bird tutorial',
    advanced:           'advanced origami bird complex tutorial',
  },
  flower: {
    beginner:           'easy beginner origami flower tutorial',
    'low-intermediate': 'origami flower low intermediate tutorial',
    intermediate:       'intermediate origami flower tutorial',
    advanced:           'advanced origami flower modular tutorial',
  },
  plant: {
    beginner:           'easy beginner origami plant leaf tutorial',
    'low-intermediate': 'origami plant leaf low intermediate tutorial',
    intermediate:       'intermediate origami plant tutorial',
    advanced:           'advanced origami plant tutorial',
  },
  box: {
    beginner:           'easy beginner origami box tutorial',
    'low-intermediate': 'origami box low intermediate tutorial',
    intermediate:       'intermediate origami box container tutorial',
    advanced:           'advanced origami box modular tutorial',
  },
  holiday: {
    beginner:           'easy beginner origami holiday christmas tutorial',
    'low-intermediate': 'origami holiday decoration low intermediate tutorial',
    intermediate:       'intermediate origami holiday decoration tutorial',
    advanced:           'advanced origami holiday decoration tutorial',
  },
  abstract: {
    beginner:           'easy beginner origami geometric abstract tutorial',
    'low-intermediate': 'origami geometric abstract low intermediate tutorial',
    intermediate:       'intermediate origami geometric modular tutorial',
    advanced:           'advanced origami geometric modular kusudama tutorial',
  },
  tessellation: {
    beginner:           'easy beginner origami tessellation tutorial',
    'low-intermediate': 'origami tessellation low intermediate tutorial',
    intermediate:       'intermediate origami tessellation folding tutorial',
    advanced:           'advanced origami tessellation complex tutorial',
  },
};

const DIFFICULTY_ORDER = { beginner: 0, 'low-intermediate': 1, intermediate: 2, advanced: 3 };

// ── State ────────────────────────────────────────────────────────────────────

let apiKey        = 'AIzaSyDYdkop2Op_w6Mzd_MI6VtKd4F8xytsFAQ';
let apiKeyInvalid = false;

let pendingType       = 'all';
let pendingDifficulty = 'all';

let activeType       = 'all';
let activeDifficulty = 'all';

let allTutorials      = [];
let filteredTutorials = [];
let nextPageTokens    = {};
let sortMode          = 'relevance';
let currentPage       = 1;

// ── DOM refs ─────────────────────────────────────────────────────────────────

const grid            = document.getElementById('tutorial-grid');
const loadingEl       = document.getElementById('loading');
const errorEl         = document.getElementById('error-state');
const errorMsgEl      = document.getElementById('error-message');
const noResultsEl     = document.getElementById('no-results');
const resultsCountEl  = document.getElementById('results-count');
const paginationEl    = document.getElementById('pagination');
const sortSelect      = document.getElementById('sort-select');
const applyFiltersBtn = document.getElementById('apply-filters-btn');

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  bindFilterPills();
  bindApplyFilters();
  bindSort();
  showPickFilterPrompt();
}

function showPickFilterPrompt() {
  noResultsEl.innerHTML = '<p>Select a Type and/or Difficulty above, then press <strong>Apply Filters</strong> to load tutorials.</p>';
  show(noResultsEl);
}

// ── Filter binding ────────────────────────────────────────────────────────────

function bindFilterPills() {
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.filter;
      const value = btn.dataset.value;

      document.querySelectorAll(`.pill[data-filter="${group}"]`).forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      if (group === 'type')       pendingType = value;
      if (group === 'difficulty') pendingDifficulty = value;

      const isDirty = pendingType !== activeType || pendingDifficulty !== activeDifficulty;
      applyFiltersBtn.classList.toggle('dirty', isDirty);
    });
  });
}

function bindApplyFilters() {
  applyFiltersBtn.addEventListener('click', () => {
    const typeChanged       = pendingType !== activeType;
    const difficultyChanged = pendingDifficulty !== activeDifficulty;

    activeType       = pendingType;
    activeDifficulty = pendingDifficulty;
    applyFiltersBtn.classList.remove('dirty');

    if (typeChanged || difficultyChanged) {
      startFetching();
    } else {
      applyAndRender();
    }
  });
}

function bindSort() {
  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    currentPage = 1;
    applyAndRender();
  });
}

// ── Fetch orchestration ───────────────────────────────────────────────────────

function startFetching() {
  apiKeyInvalid     = false;
  allTutorials      = [];
  filteredTutorials = [];
  nextPageTokens    = {};
  currentPage       = 1;
  grid.innerHTML    = '';

  show(loadingEl);
  hide(errorEl);
  hide(noResultsEl);
  hide(paginationEl);

  fetchAll();
}

function getQueryCombos() {
  const types = activeType === 'all' ? Object.keys(SEARCH_QUERIES) : [activeType];
  const diffs  = activeDifficulty === 'all' ? Object.keys(DIFFICULTY_ORDER) : [activeDifficulty];
  const combos = [];
  for (const t of types) {
    for (const d of diffs) {
      combos.push({ type: t, difficulty: d, query: SEARCH_QUERIES[t][d] });
    }
  }
  return combos;
}

async function fetchAll() {
  const combos = getQueryCombos();
  let hadError = false;

  for (let i = 0; i < combos.length; i++) {
    const c = combos[i];
    try {
      await fetchTutorials(c.query, c.type, c.difficulty);
    } catch {
      hadError = true;
    }
    if (i < combos.length - 1) await delay(300);
  }

  hide(loadingEl);

  if (allTutorials.length === 0 && hadError) {
    showError('Could not load tutorials. Please check your API key or try again later.');
    return;
  }

  applyAndRender();
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function fetchTutorials(query, type, difficulty, pageToken = null, retries = 3) {
  if (apiKeyInvalid) throw new Error('API key invalid');

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: 8,
    relevanceLanguage: 'en',
    key: apiKey,
    ...(pageToken ? { pageToken } : {}),
  });

  const resp = await fetchWithTimeout(`${YT_API_BASE}?${params}`);

  if (resp.status === 429 && retries > 0) {
    const waitMs = (4 - retries) * 1500;
    await delay(waitMs);
    return fetchTutorials(query, type, difficulty, pageToken, retries - 1);
  }

  if (resp.status === 400 || resp.status === 403) {
    const data = await resp.json();
    console.error('[YT API Error]', resp.status, data);
    const msg  = data?.error?.message || 'API error';
    if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('keyinvalid')) {
      showApiKeyInvalidError();
    }
    throw new Error(msg);
  }

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const data     = await resp.json();
  const queryKey = `${type}__${difficulty}`;

  if (data.nextPageToken) {
    nextPageTokens[queryKey] = { token: data.nextPageToken, query, type, difficulty };
  } else {
    delete nextPageTokens[queryKey];
  }

  const existingIds = new Set(allTutorials.map(t => t.id));
  const videos = (data.items || [])
    .map(item => ({
      id:          item.id.videoId,
      title:       item.snippet.title,
      channel:     item.snippet.channelTitle,
      thumb:       item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      type,
      difficulty,
      publishedAt: item.snippet.publishedAt,
    }))
    .filter(v => !existingIds.has(v.id));

  const withDuration = await filterByDuration(videos);
  allTutorials.push(...withDuration);
  return withDuration;
}

// ── Duration filter ───────────────────────────────────────────────────────────

async function filterByDuration(videos) {
  if (videos.length === 0) return [];

  const params = new URLSearchParams({ part: 'contentDetails', id: videos.map(v => v.id).join(','), key: apiKey });
  const resp   = await fetchWithTimeout(`${YT_VIDEOS_BASE}?${params}`);
  if (!resp.ok) return videos;

  const data        = await resp.json();
  const durationMap = {};
  for (const item of data.items || []) {
    durationMap[item.id] = parseDuration(item.contentDetails.duration);
  }

  return videos.filter(v => {
    const secs = durationMap[v.id];
    return secs === undefined || secs >= MIN_DURATION_SECONDS;
  });
}

function parseDuration(iso) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || 0) * 3600 + parseInt(match[2] || 0) * 60 + parseInt(match[3] || 0);
}

// ── API key error ─────────────────────────────────────────────────────────────

function showApiKeyInvalidError() {
  apiKeyInvalid = true;
  hide(loadingEl);
  showError('API key error. Please check the key in app.js and reload.');
}

// ── Filter + render ───────────────────────────────────────────────────────────

function applyAndRender() {
  let filtered = allTutorials;
  if (activeType !== 'all')       filtered = filtered.filter(t => t.type === activeType);
  if (activeDifficulty !== 'all') filtered = filtered.filter(t => t.difficulty === activeDifficulty);

  filtered = sortTutorials(filtered);
  filteredTutorials = filtered;

  updateResultsCount(filtered.length);
  renderPage(currentPage);
}

function sortTutorials(list) {
  const copy = [...list];
  switch (sortMode) {
    case 'title':           return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'difficulty-asc':  return copy.sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    case 'difficulty-desc': return copy.sort((a, b) => DIFFICULTY_ORDER[b.difficulty] - DIFFICULTY_ORDER[a.difficulty]);
    default:                return copy;
  }
}

// ── Pagination ────────────────────────────────────────────────────────────────

function renderPage(page) {
  hide(noResultsEl);
  grid.innerHTML = '';

  if (filteredTutorials.length === 0) {
    show(noResultsEl);
    hide(paginationEl);
    return;
  }

  const totalPages = Math.ceil(filteredTutorials.length / PAGE_SIZE);
  currentPage = Math.min(Math.max(1, page), totalPages);

  const start = (currentPage - 1) * PAGE_SIZE;
  const slice = filteredTutorials.slice(start, start + PAGE_SIZE);

  const fragment = document.createDocumentFragment();
  for (const t of slice) fragment.appendChild(buildCard(t));
  grid.appendChild(fragment);

  grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    hide(paginationEl);
    return;
  }

  paginationEl.innerHTML = '';
  show(paginationEl);

  const makeBtn = (label, page, disabled = false, isCurrent = false) => {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (isCurrent ? ' current' : '');
    btn.textContent = label;
    btn.disabled = disabled;
    btn.setAttribute('aria-label', isCurrent ? `Page ${page}, current` : `Go to page ${page}`);
    if (isCurrent) btn.setAttribute('aria-current', 'page');
    if (!disabled && !isCurrent) {
      btn.addEventListener('click', () => renderPage(page));
    }
    return btn;
  };

  paginationEl.appendChild(makeBtn('←', currentPage - 1, currentPage === 1));

  const range = getPaginationRange(currentPage, totalPages);
  let lastNum = 0;
  for (const num of range) {
    if (num - lastNum > 1) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '…';
      paginationEl.appendChild(ellipsis);
    }
    paginationEl.appendChild(makeBtn(num, num, false, num === currentPage));
    lastNum = num;
  }

  paginationEl.appendChild(makeBtn('→', currentPage + 1, currentPage === totalPages));
}

function getPaginationRange(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current]);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  return [...pages].sort((a, b) => a - b);
}

// ── Card ──────────────────────────────────────────────────────────────────────

function buildCard(tutorial) {
  const card = document.createElement('article');
  card.className = 'tutorial-card';
  card.setAttribute('aria-label', tutorial.title);

  const ytUrl     = `https://www.youtube.com/watch?v=${tutorial.id}`;
  const diffLabel = difficultyLabel(tutorial.difficulty);

  card.innerHTML = `
    <a href="${ytUrl}" target="_blank" rel="noopener" class="card-thumb" aria-label="Watch ${escHtml(tutorial.title)} on YouTube">
      <img src="${tutorial.thumb}" alt="${escHtml(tutorial.title)} thumbnail" loading="lazy" />
      <div class="play-overlay" aria-hidden="true"><div class="play-icon">&#9658;</div></div>
    </a>
    <div class="card-body">
      <div class="card-tags">
        <span class="tag-type">${typeEmoji(tutorial.type)} ${escHtml(tutorial.type)}</span>
        <span class="tag-difficulty ${tutorial.difficulty}">${diffLabel}</span>
      </div>
      <p class="card-title">${escHtml(tutorial.title)}</p>
      <p class="card-channel">${escHtml(tutorial.channel)}</p>
      <div class="card-footer">
        <a href="${ytUrl}" target="_blank" rel="noopener" class="card-link">Watch on YouTube &#8599;</a>
      </div>
    </div>
  `;

  return card;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateResultsCount(count) {
  const totalPages = Math.ceil(count / PAGE_SIZE);
  resultsCountEl.textContent = count === 0
    ? ''
    : `${count} tutorial${count !== 1 ? 's' : ''} — page ${currentPage} of ${totalPages}`;
}

function difficultyLabel(d) {
  return { beginner: 'Beginner', 'low-intermediate': 'Low Intermediate', intermediate: 'Intermediate', advanced: 'Advanced' }[d] || d;
}

function typeEmoji(type) {
  return { animal: '🐾', bird: '🐦', flower: '🌸', plant: '🌿', box: '📦', holiday: '🎄', abstract: '✨', tessellation: '🔷' }[type] || '';
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

function showError(msg) {
  errorMsgEl.textContent = msg;
  show(errorEl);
}

// ── Go ────────────────────────────────────────────────────────────────────────

init();
