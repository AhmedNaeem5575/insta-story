#!/usr/bin/env node
/**
 * Instagram Stories Sync - Node.js Version
 * Extracts stories from Instagram and sends to Laravel API
 */

import { InstagramScraper } from './services/instagramScraper.js';
import { sendToApi, testApiConnection } from './utils/apiClient.js';
import { sendErrorNotification, sendSuccessNotification } from './utils/notifications.js';
import { log, getLogMessages } from './utils/logger.js';
import { config, validateConfig } from './config/env.js';
import dotenv from 'dotenv';
import { createInterface } from 'readline';
import fs from 'fs/promises';
import { StoryTracker } from './services/storyTracker.js';

dotenv.config();

// Helper function to wait for user input - using raw stdin
function waitForEnter() {
  console.log('\n>>> waitForEnter called - waiting for input... <<<\n');

  return new Promise((resolve) => {
    // Make sure stdin is in the right state
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });

    console.log('>>> readline interface created <<<\n');

    rl.question('>>> PREMI ENTER PER CONTINUARE <<<', () => {
      console.log('>>> Enter pressed! <<<\n');
      rl.close();
      resolve();
    });
  });
}

async function main() {
  log('=== Starting Instagram Stories Sync (Node.js) ===');

  // Validate configuration
  try {
    validateConfig();
    log(`Target account: @${config.igTargetUsername}`);
    log(`Laravel API: ${config.laravelApiUrl}`);
  } catch (error) {
    log(`❌ ${error.message}`);
    process.exit(1);
  }

  // Test API connection (only if URL is configured)
  if (config.laravelApiUrl && config.laravelApiKey && !config.laravelApiUrl.includes('your-domain.com')) {
    const apiConnected = await testApiConnection();
    if (!apiConnected) {
      log('⚠ Continuing without API connection test...');
    }
  } else {
    log('⚠ Laravel API not configured, data will only be logged');
  }

  const scraper = new InstagramScraper();
  const tracker = new StoryTracker(config.igTargetUsername);

  try {
    // Initialize browser
    await scraper.init();

    // Login to Instagram with manual callback (readline handles stdin)
    await scraper.login(waitForEnter);

    // Go to target user profile
    await scraper.goToUserProfile();

    // Check for active stories
    const hasStories = await scraper.hasActiveStories();

    if (!hasStories) {
      log('No active stories found. Sync complete.');
      await scraper.close();
      process.exit(0);
    }

    // Extract stories
    const allStories = await scraper.extractStories();

    if (allStories.length === 0) {
      log('⚠ No stories extracted (may have already been viewed)');
      await scraper.close();
      process.exit(0);
    }

    log(`✓ ${allStories.length} total stories extracted`);

    // Filter out already processed stories
    const newStories = await tracker.filterProcessedStories(allStories);

    if (newStories.length === 0) {
      log('✓ No new stories to process (all already tracked)');
      await scraper.close();
      process.exit(0);
    }

    log(`✓ ${newStories.length} new stories to process`);

    // Count stories with links
    const storiesWithLinks = newStories.filter(s => s.story_link).length;
    log(`✓ ${storiesWithLinks} stories with links`);

    // Log all extracted stories for preview
    log('\n--- NEW STORIES TO PROCESS ---');
    newStories.forEach((story, i) => {
      log(`Story ${i + 1}:`);
      log(`  - ID: ${story.ig_pk || 'N/A'}`);
      log(`  - Type: ${story.is_video ? 'Video' : 'Image'}`);
      log(`  - Media URL: ${story.media_url}`);
      if (story.story_link) {
        log(`  - Link: ${story.story_link}`);
      }
      if (story.caption) {
        log(`  - Caption: ${story.caption}`);
      }
    });

    // Save to JSON file with timestamp
    if (newStories.length > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = `stories_${config.igTargetUsername}_${timestamp}.json`;

      const outputData = {
        scraped_at: new Date().toISOString(),
        username: config.igTargetUsername,
        total_stories: newStories.length,
        stories: newStories,
      };

      await fs.writeFile(outputFile, JSON.stringify(outputData, null, 2));
      log(`\n✓ Stories saved to: ${outputFile}`);
    }

    // Mark stories as processed
    await tracker.markAsProcessed(newStories);

    // Get tracker stats
    const stats = await tracker.getStats();
    log(`\n📊 Tracker Stats: ${stats.total_processed} total stories tracked`);

    // Send to API (only if configured)
    if (newStories.length > 0) {
      if (config.laravelApiUrl && !config.laravelApiUrl.includes('your-domain.com')) {
        const result = await sendToApi('stories', { stories: newStories, total_stories: newStories.length });

        if (result.success) {
          log(`✓ ${newStories.length} stories synced successfully`);

          // Send success notification
          await sendSuccessNotification(newStories.length, getLogMessages());
        } else {
          log('⚠ Error sending data to server');
          await sendErrorNotification(
            'API Upload Failed',
            result.error || 'Unknown error',
            { stories_count: newStories.length }
          );
        }
      } else {
        log('⚠ Laravel API not configured - skipping data send');
      }
    }

    await scraper.close();
    log('\n=== Sync complete ===');

  } catch (error) {
    log(`\n❌ FATAL ERROR: ${error.message}`);

    await sendErrorNotification(
      'Fatal Error',
      error.message,
      {
        step: 'Script execution',
        stack: error.stack?.substring(0, 1000) || 'No stack trace',
      }
    );

    await scraper.close();
    process.exit(1);
  }
}

// Handle interruption gracefully
process.on('SIGINT', () => {
  log('\n⚠ Interrupted by user');
  process.exit(0);
});

// Run main function
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
