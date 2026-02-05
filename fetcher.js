const { execSync } = require('child_process');

/**
 * Parse tweet URL to extract tweet ID
 */
function extractTweetId(url) {
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Fetch bookmarks from bird CLI
 */
function fetchBookmarks(limit = 50) {
  try {
    console.log(`Fetching ${limit} bookmarks from bird CLI...`);
    const output = execSync(`bird bookmarks -n ${limit}`, { 
      encoding: 'utf-8',
      timeout: 30000 
    });
    return parseBookmarksOutput(output);
  } catch (error) {
    console.error('Error fetching bookmarks:', error.message);
    if (error.stderr) {
      console.error('stderr:', error.stderr.toString());
    }
    throw new Error(`Failed to fetch bookmarks: ${error.message}`);
  }
}

/**
 * Parse the bird CLI output
 * Format:
 * @handle (Name):
 * Content lines...
 * 📅 Date
 * 🔗 URL
 * ──────────────────
 */
function parseBookmarksOutput(output) {
  const bookmarks = [];
  const entries = output.split('──────────────────────────────────────────────────').filter(e => e.trim());
  
  for (const entry of entries) {
    const lines = entry.split('\n').filter(line => line.trim());
    if (lines.length < 3) continue;
    
    // Parse header: @handle (Name):
    const headerMatch = lines[0].match(/^@(\w+)\s*\(([^)]+)\):/);
    if (!headerMatch) continue;
    
    const [, handle, name] = headerMatch;
    
    // Find date and URL lines
    let dateLine = '';
    let urlLine = '';
    let contentLines = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('📅')) {
        dateLine = line;
      } else if (line.startsWith('🔗')) {
        urlLine = line;
      } else if (!line.startsWith('┌─') && !line.startsWith('│') && !line.startsWith('└─') && !line.startsWith('🖼️')) {
        contentLines.push(line);
      }
    }
    
    if (!urlLine) continue;
    
    const url = urlLine.replace('🔗', '').trim();
    const tweetId = extractTweetId(url);
    
    // Parse date
    let createdAt = new Date().toISOString();
    if (dateLine) {
      const dateStr = dateLine.replace('📅', '').trim();
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        createdAt = parsedDate.toISOString();
      }
    }
    
    // Extract media URLs (🖼️ lines)
    const mediaUrls = [];
    for (const line of lines) {
      if (line.includes('pbs.twimg.com') || line.includes('video_thumb')) {
        const urlMatch = line.match(/(https:\/\/[^\s]+)/);
        if (urlMatch) mediaUrls.push(urlMatch[1]);
      }
    }
    
    bookmarks.push({
      id: tweetId || `${handle}_${Date.now()}`,
      author: name.trim(),
      author_handle: handle.trim(),
      content: contentLines.join('\n').trim(),
      url: url,
      created_at: createdAt,
      media_urls: mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      reply_count: 0,
      retweet_count: 0,
      like_count: 0
    });
  }
  
  console.log(`Parsed ${bookmarks.length} bookmarks`);
  return bookmarks;
}

/**
 * Test the bird CLI connection
 */
function testConnection() {
  try {
    execSync('bird whoami', { encoding: 'utf-8', timeout: 10000 });
    return { success: true, message: 'Connected to bird CLI' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

module.exports = {
  fetchBookmarks,
  testConnection,
  parseBookmarksOutput
};