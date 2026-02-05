const express = require('express');
const path = require('path');
const { initDatabase, getDb } = require('./database');
const { fetchBookmarks, testConnection } = require('./fetcher');

const app = express();
const PORT = 3456;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDatabase();

// === API Routes ===

// Get all bookmarks (with pagination)
app.get('/api/bookmarks', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const tag = req.query.tag || '';
    
    const db = getDb();
    let query = 'SELECT * FROM bookmarks';
    let countQuery = 'SELECT COUNT(*) as total FROM bookmarks';
    const params = [];
    const conditions = [];
    
    if (search) {
      conditions.push('(author LIKE ? OR content LIKE ? OR author_handle LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }
    
    if (tag) {
      query = `SELECT b.* FROM bookmarks b 
               JOIN tags t ON b.id = t.bookmark_id 
               WHERE t.tag = ?`;
      countQuery = `SELECT COUNT(DISTINCT b.id) as total FROM bookmarks b 
                    JOIN tags t ON b.id = t.bookmark_id 
                    WHERE t.tag = ?`;
      params.length = 0;
      params.push(tag);
    } else if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY bookmarked_at DESC LIMIT ? OFFSET ?';
    
    const bookmarks = db.prepare(query).all(...params, limit, offset);
    
    // Get tags for each bookmark
    const bookmarksWithTags = bookmarks.map(bm => {
      const tags = db.prepare('SELECT tag FROM tags WHERE bookmark_id = ?').all(bm.id);
      return { ...bm, tags: tags.map(t => t.tag) };
    });
    
    const totalResult = tag 
      ? db.prepare(countQuery).get(tag)
      : conditions.length > 0 
        ? db.prepare(countQuery).get(...params)
        : db.prepare(countQuery).get();
    
    const total = totalResult ? totalResult.total : 0;
    
    res.json({
      bookmarks: bookmarksWithTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single bookmark
app.get('/api/bookmarks/:id', (req, res) => {
  try {
    const db = getDb();
    const bookmark = db.prepare('SELECT * FROM bookmarks WHERE id = ?').get(req.params.id);
    
    if (!bookmark) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    const tags = db.prepare('SELECT tag FROM tags WHERE bookmark_id = ?').all(req.params.id);
    
    res.json({ ...bookmark, tags: tags.map(t => t.tag) });
  } catch (error) {
    console.error('Error fetching bookmark:', error);
    res.status(500).json({ error: error.message });
  }
});

// Refresh bookmarks from bird CLI
app.post('/api/bookmarks/refresh', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const bookmarks = fetchBookmarks(limit);
    
    const db = getDb();
    let added = 0;
    let skipped = 0;
    
    const insert = db.prepare(`
      INSERT OR IGNORE INTO bookmarks 
      (id, author, author_handle, content, url, created_at, media_urls, reply_count, retweet_count, like_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const bm of bookmarks) {
      const result = insert.run(
        bm.id,
        bm.author,
        bm.author_handle,
        bm.content,
        bm.url,
        bm.created_at,
        bm.media_urls,
        bm.reply_count,
        bm.retweet_count,
        bm.like_count
      );
      
      if (result.changes > 0) {
        added++;
      } else {
        skipped++;
      }
    }
    
    res.json({
      success: true,
      added,
      skipped,
      total: bookmarks.length
    });
  } catch (error) {
    console.error('Error refreshing bookmarks:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add tag to bookmark
app.post('/api/bookmarks/:id/tags', (req, res) => {
  try {
    const { tag } = req.body;
    if (!tag || !tag.trim()) {
      return res.status(400).json({ error: 'Tag is required' });
    }
    
    const db = getDb();
    
    // Check if bookmark exists
    const bookmark = db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(req.params.id);
    if (!bookmark) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    
    db.prepare('INSERT OR IGNORE INTO tags (bookmark_id, tag) VALUES (?, ?)')
      .run(req.params.id, tag.trim().toLowerCase());
    
    const tags = db.prepare('SELECT tag FROM tags WHERE bookmark_id = ?').all(req.params.id);
    res.json({ tags: tags.map(t => t.tag) });
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove tag from bookmark
app.delete('/api/bookmarks/:id/tags/:tag', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM tags WHERE bookmark_id = ? AND tag = ?')
      .run(req.params.id, req.params.tag.toLowerCase());
    
    const tags = db.prepare('SELECT tag FROM tags WHERE bookmark_id = ?').all(req.params.id);
    res.json({ tags: tags.map(t => t.tag) });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all tags with counts
app.get('/api/tags', (req, res) => {
  try {
    const db = getDb();
    const tags = db.prepare(`
      SELECT tag, COUNT(*) as count 
      FROM tags 
      GROUP BY tag 
      ORDER BY count DESC, tag ASC
    `).all();
    
    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete bookmark
app.delete('/api/bookmarks/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM bookmarks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting bookmark:', error);
    res.status(500).json({ error: error.message });
  }
});

// Test bird CLI connection
app.get('/api/status', (req, res) => {
  const connectionStatus = testConnection();
  
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as total FROM bookmarks').get();
    
    res.json({
      bird_cli: connectionStatus,
      database: {
        connected: true,
        bookmarks_count: count.total
      }
    });
  } catch (error) {
    res.json({
      bird_cli: connectionStatus,
      database: {
        connected: false,
        error: error.message
      }
    });
  }
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║          🐦 PIA's Twitter Archive is running!              ║
║                                                            ║
║  Open your browser: http://localhost:${PORT}                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;