import fs from 'fs/promises';
import path from 'path';
import { log } from '../utils/logger.js';

/**
 * Track processed story IDs to avoid duplicates
 */
export class StoryTracker {
  constructor(username) {
    this.username = username;
    const trackerDir = path.join(process.cwd(), 'story_tracker');
    this.trackerFile = path.join(trackerDir, `stories_${username}.json`);
    this.ensureDir();
  }

  /**
   * Ensure tracker directory exists
   */
  async ensureDir() {
    const trackerDir = path.join(process.cwd(), 'story_tracker');
    try {
      await fs.mkdir(trackerDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }
  }

  /**
   * Load existing tracker data
   */
  async load() {
    try {
      const data = await fs.readFile(this.trackerFile, 'utf-8');
      const tracker = JSON.parse(data);
      log(`Loaded tracker: ${tracker.processed_ids?.length || 0} processed stories`);
      return tracker;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log(`⚠ Error loading tracker: ${error.message}`);
      }
      // Return empty tracker if file doesn't exist
      return {
        username: this.username,
        processed_ids: [],
        last_updated: null,
      };
    }
  }

  /**
   * Save tracker data
   */
  async save(tracker) {
    try {
      tracker.last_updated = new Date().toISOString();
      await fs.writeFile(this.trackerFile, JSON.stringify(tracker, null, 2));
      log(`Tracker saved: ${tracker.processed_ids.length} total processed stories`);
    } catch (error) {
      log(`⚠ Error saving tracker: ${error.message}`);
    }
  }

  /**
   * Get all processed story IDs
   */
  async getProcessedIds() {
    const tracker = await this.load();
    return new Set(tracker.processed_ids || []);
  }

  /**
   * Add new story IDs to tracker
   */
  async addStoryIds(storyIds) {
    const tracker = await this.load();
    const currentIds = new Set(tracker.processed_ids || []);

    let added = 0;
    for (const id of storyIds) {
      if (!currentIds.has(id)) {
        currentIds.add(id);
        added++;
      }
    }

    tracker.processed_ids = Array.from(currentIds);
    await this.save(tracker);

    log(`Added ${added} new story IDs to tracker (total: ${tracker.processed_ids.length})`);
    return tracker;
  }

  /**
   * Filter out already processed stories
   */
  async filterProcessedStories(stories) {
    const processedIds = await this.getProcessedIds();
    const newStories = [];
    const seenPks = new Set();

    for (const story of stories) {
      const storyId = story.ig_pk || story.media_url;

      // Skip if we've already seen this story in this batch
      if (seenPks.has(storyId)) {
        continue;
      }
      seenPks.add(storyId);

      // Skip if already processed
      if (processedIds.has(storyId)) {
        log(`Skipping already processed story: ${storyId}`);
        continue;
      }

      newStories.push(story);
    }

    log(`Filtered: ${newStories.length} new stories (out of ${stories.length} total)`);
    return newStories;
  }

  /**
   * Mark stories as processed
   */
  async markAsProcessed(stories) {
    const storyIds = stories.map(s => s.ig_pk || s.media_url).filter(id => id);
    return await this.addStoryIds(storyIds);
  }

  /**
   * Get tracker statistics
   */
  async getStats() {
    const tracker = await this.load();
    return {
      username: this.username,
      total_processed: tracker.processed_ids?.length || 0,
      last_updated: tracker.last_updated,
    };
  }

  /**
   * Clear all processed IDs (reset tracker)
   */
  async clear() {
    try {
      await fs.unlink(this.trackerFile);
      log('Tracker cleared');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        log(`⚠ Error clearing tracker: ${error.message}`);
      }
    }
  }
}
