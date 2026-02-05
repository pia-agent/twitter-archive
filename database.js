const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'bookmarks.db');

let db = null;

function initDatabase() {
  if (db) return db;
  
  db = new Database(DB_PATH);
  
  // Create bookmarks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      author_handle TEXT,
      content TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      bookmarked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      media_urls TEXT,
      reply_count INTEGER DEFAULT 0,
      retweet_count INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0
    );
  `);
  
  // Create tags table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookmark_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id) ON DELETE CASCADE,
      UNIQUE(bookmark_id, tag)
    );
  `);
  
  // Create index for search
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_bookmarks_author ON bookmarks(author);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_content ON bookmarks(content);
    CREATE INDEX IF NOT EXISTS idx_tags_bookmark ON tags(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
  `);
  
  return db;
}

function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDb,
  closeDb
};