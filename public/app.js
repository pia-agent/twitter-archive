// PIA's Twitter Archive - Frontend
const API_BASE = '';

let currentPage = 1;
let currentSearch = '';
let currentTag = '';
let isLoading = false;

// DOM Elements
const bookmarksList = document.getElementById('bookmarksList');
const loadingState = document.getElementById('loadingState');
const pagination = document.getElementById('pagination');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const tagsList = document.getElementById('tagsList');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const totalCount = document.getElementById('totalCount');
const statusIndicator = document.getElementById('statusIndicator');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');

// Initialize
async function init() {
  loadStatus();
  loadTags();
  loadBookmarks();
  setupEventListeners();
}

// Event Listeners
function setupEventListeners() {
  refreshBtn.addEventListener('click', refreshBookmarks);
  searchBtn.addEventListener('click', handleSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
  });
  prevPageBtn.addEventListener('click', () => changePage(currentPage - 1));
  nextPageBtn.addEventListener('click', () => changePage(currentPage + 1));
  clearFilterBtn.addEventListener('click', clearFilters);
  
  // Modal close
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Load bookmarks
async function loadBookmarks() {
  if (isLoading) return;
  isLoading = true;
  
  showLoading(true);
  
  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 20
    });
    
    if (currentSearch) params.append('search', currentSearch);
    if (currentTag) params.append('tag', currentTag);
    
    const response = await fetch(`${API_BASE}/api/bookmarks?${params}`);
    const data = await response.json();
    
    if (response.ok) {
      renderBookmarks(data.bookmarks);
      renderPagination(data.pagination);
      totalCount.textContent = data.pagination.total;
    } else {
      showError(data.error || 'Failed to load bookmarks');
    }
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    showError('Failed to load bookmarks. Is the server running?');
  } finally {
    isLoading = false;
    showLoading(false);
  }
}

// Refresh bookmarks from bird CLI
async function refreshBookmarks() {
  if (isLoading) return;
  isLoading = true;
  
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="icon">⟳</span> Fetching...';
  
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/refresh`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      alert(`✅ Added ${data.added} new bookmarks\n⏭️ Skipped ${data.skipped} existing`);
      currentPage = 1;
      await loadBookmarks();
      await loadTags();
    } else {
      alert(`❌ Error: ${data.error || 'Failed to refresh'}`);
    }
  } catch (error) {
    console.error('Error refreshing:', error);
    alert('❌ Failed to connect to server');
  } finally {
    isLoading = false;
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = '<span class="icon">↻</span> Refresh';
  }
}

// Load tags
async function loadTags() {
  try {
    const response = await fetch(`${API_BASE}/api/tags`);
    const tags = await response.json();
    
    if (response.ok) {
      renderTags(tags);
    }
  } catch (error) {
    console.error('Error loading tags:', error);
  }
}

// Load status
async function loadStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/status`);
    const data = await response.json();
    
    if (response.ok) {
      if (data.bird_cli.success) {
        statusIndicator.textContent = 'Connected';
        statusIndicator.classList.add('connected');
      } else {
        statusIndicator.textContent = 'CLI Error';
        statusIndicator.classList.add('error');
      }
      totalCount.textContent = data.database.bookmarks_count;
    }
  } catch (error) {
    statusIndicator.textContent = 'Offline';
    statusIndicator.classList.add('error');
  }
}

// Render bookmarks
function renderBookmarks(bookmarks) {
  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = `
      <div class="empty-state">
        <p>No bookmarks found.</p>
        <p style="margin-top: 8px; font-size: 0.875rem;">
          ${currentSearch || currentTag ? 'Try adjusting your filters.' : 'Click "Refresh" to import from Twitter.'}
        </p>
      </div>
    `;
    return;
  }
  
  bookmarksList.innerHTML = bookmarks.map(bookmark => `
    <article class="bookmark-card" data-id="${bookmark.id}">
      <div class="bookmark-header">
        <div class="bookmark-author">
          <span class="author-name">${escapeHtml(bookmark.author)}</span>
          <span class="author-handle">@${escapeHtml(bookmark.author_handle)}</span>
        </div>
        <span class="bookmark-date">${formatDate(bookmark.created_at)}</span>
      </div>
      <div class="bookmark-content">${escapeHtml(bookmark.content)}</div>
      <div class="bookmark-footer">
        <div class="bookmark-tags">
          ${bookmark.tags.map(tag => `<span class="bookmark-tag">${escapeHtml(tag)}</span>`).join('')}
          ${bookmark.tags.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.75rem;">No tags</span>' : ''}
        </div>
        <div class="bookmark-stats">
          <span class="stat-item">💬 ${formatNumber(bookmark.reply_count)}</span>
          <span class="stat-item">🔄 ${formatNumber(bookmark.retweet_count)}</span>
          <span class="stat-item">❤️ ${formatNumber(bookmark.like_count)}</span>
        </div>
      </div>
    </article>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.bookmark-card').forEach(card => {
    card.addEventListener('click', () => openBookmark(card.dataset.id));
  });
}

// Render pagination
function renderPagination(paginationData) {
  if (paginationData.totalPages <= 1) {
    pagination.classList.add('hidden');
    return;
  }
  
  pagination.classList.remove('hidden');
  prevPageBtn.disabled = currentPage === 1;
  nextPageBtn.disabled = currentPage === paginationData.totalPages;
  pageInfo.textContent = `Page ${currentPage} of ${paginationData.totalPages}`;
}

// Render tags
function renderTags(tags) {
  if (tags.length === 0) {
    tagsList.innerHTML = '<p class="empty">No tags yet</p>';
    return;
  }
  
  tagsList.innerHTML = tags.map(tag => `
    <span class="tag ${currentTag === tag.tag ? 'active' : ''}" data-tag="${escapeHtml(tag.tag)}">
      ${escapeHtml(tag.tag)}
      <span class="tag-count">${tag.count}</span>
    </span>
  `).join('');
  
  // Add click handlers
  document.querySelectorAll('.tag').forEach(tag => {
    tag.addEventListener('click', () => filterByTag(tag.dataset.tag));
  });
}

// Handle search
function handleSearch() {
  const query = searchInput.value.trim();
  currentSearch = query;
  currentPage = 1;
  loadBookmarks();
}

// Filter by tag
function filterByTag(tag) {
  if (currentTag === tag) {
    clearFilters();
    return;
  }
  
  currentTag = tag;
  currentPage = 1;
  clearFilterBtn.classList.remove('hidden');
  loadBookmarks();
}

// Clear filters
function clearFilters() {
  currentSearch = '';
  currentTag = '';
  searchInput.value = '';
  clearFilterBtn.classList.add('hidden');
  loadBookmarks();
}

// Change page
function changePage(page) {
  currentPage = page;
  loadBookmarks();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Open bookmark modal
async function openBookmark(id) {
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/${id}`);
    const bookmark = await response.json();
    
    if (!response.ok) {
      alert('Bookmark not found');
      return;
    }
    
    modalBody.innerHTML = `
      <div class="modal-body">
        <div class="modal-author">
          <span class="author-name">${escapeHtml(bookmark.author)}</span>
          <span class="author-handle">@${escapeHtml(bookmark.author_handle)}</span>
        </div>
        <div class="modal-content-text">${escapeHtml(bookmark.content)}</div>
        <div class="modal-meta">
          <span>${formatDate(bookmark.created_at)}</span>
          <span>💬 ${formatNumber(bookmark.reply_count)} replies</span>
          <span>🔄 ${formatNumber(bookmark.retweet_count)} reposts</span>
          <span>❤️ ${formatNumber(bookmark.like_count)} likes</span>
        </div>
        <div class="modal-actions">
          <a href="${bookmark.url}" target="_blank" rel="noopener" class="btn btn-primary">
            Open on Twitter →
          </a>
          <button class="btn btn-danger" onclick="deleteBookmark('${bookmark.id}')">
            🗑️ Delete
          </button>
        </div>
        <div class="modal-tags-section">
          <h4>Tags</h4>
          <div id="modalTagsList" class="modal-tags-list">
            ${bookmark.tags.map(tag => `
              <span class="modal-tag">
                ${escapeHtml(tag)}
                <button class="tag-remove" onclick="removeTag('${bookmark.id}', '${escapeHtml(tag)}')">×</button>
              </span>
            `).join('')}
            ${bookmark.tags.length === 0 ? '<span style="color: var(--text-muted);">No tags yet</span>' : ''}
          </div>
          <form class="add-tag-form" onsubmit="addTag(event, '${bookmark.id}')">
            <input type="text" id="newTagInput" placeholder="Add a tag..." required>
            <button type="submit" class="btn btn-primary">Add</button>
          </form>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } catch (error) {
    console.error('Error loading bookmark:', error);
    alert('Failed to load bookmark');
  }
}

// Close modal
function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Add tag
async function addTag(event, bookmarkId) {
  event.preventDefault();
  const input = document.getElementById('newTagInput');
  const tag = input.value.trim();
  
  if (!tag) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/${bookmarkId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      input.value = '';
      openBookmark(bookmarkId); // Refresh modal
      loadBookmarks(); // Refresh list
      loadTags(); // Refresh tags sidebar
    } else {
      alert(data.error || 'Failed to add tag');
    }
  } catch (error) {
    console.error('Error adding tag:', error);
    alert('Failed to add tag');
  }
}

// Remove tag
async function removeTag(bookmarkId, tag) {
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/${bookmarkId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE'
    });
    
    const data = await response.json();
    
    if (response.ok) {
      openBookmark(bookmarkId); // Refresh modal
      loadBookmarks(); // Refresh list
      loadTags(); // Refresh tags sidebar
    } else {
      alert(data.error || 'Failed to remove tag');
    }
  } catch (error) {
    console.error('Error removing tag:', error);
    alert('Failed to remove tag');
  }
}

// Delete bookmark
async function deleteBookmark(bookmarkId) {
  if (!confirm('Are you sure you want to delete this bookmark?')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/bookmarks/${bookmarkId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      closeModal();
      loadBookmarks();
      loadTags();
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to delete bookmark');
    }
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    alert('Failed to delete bookmark');
  }
}

// Show loading state
function showLoading(show) {
  if (show) {
    bookmarksList.classList.add('hidden');
    pagination.classList.add('hidden');
    loadingState.classList.remove('hidden');
  } else {
    bookmarksList.classList.remove('hidden');
    loadingState.classList.add('hidden');
  }
}

// Show error
function showError(message) {
  bookmarksList.innerHTML = `
    <div class="empty-state" style="color: var(--danger);">
      <p>⚠️ ${escapeHtml(message)}</p>
    </div>
  `;
}

// Utilities
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Start
init();