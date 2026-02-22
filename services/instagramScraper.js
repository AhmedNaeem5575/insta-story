import { chromium } from 'playwright';
import { config } from '../config/env.js';
import { log } from '../utils/logger.js';
import { sendErrorNotification } from '../utils/notifications.js';
import { SessionManager } from './sessionManager.js';
import { StoryTracker } from './storyTracker.js';
import fs from 'fs/promises';

/**
 * Instagram Story Scraper using Playwright
 */
export class InstagramScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.isLoggedIn = false;
    this.sessionManager = new SessionManager();
    this.storyTracker = null;
    this.seenPks = new Set();
  }

  /**
   * Initialize browser with optional proxy
   */
  async init() {
    try {
      const launchOptions = {
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
        ],
      };

      if (config.proxyUrl) {
        launchOptions.proxy = { server: config.proxyUrl };
        log(`Using proxy: ${config.proxyUrl}`);
      }

      this.browser = await chromium.launch(launchOptions);

      const contextOptions = {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
        permissions: ['geolocation', 'notifications'],
      };

      // Load session if exists
      if (await this.sessionManager.hasSession()) {
        const sessionAge = await this.sessionManager.getSessionAge();
        if (sessionAge < 168) {
          log(`Existing session found (${Math.round(sessionAge)} hours ago)`);
          try {
            const sessionData = await fs.readFile(this.sessionManager.sessionFile, 'utf-8');
            const storageState = JSON.parse(sessionData);
            console.log(`[DEBUG] Loaded session with ${storageState.cookies?.length || 0} cookies`);
            contextOptions.storageState = {
              cookies: storageState.cookies,
              origins: storageState.localStorage ? [{
                origin: config.instagramUrl,
                localStorage: Object.entries(storageState.localStorage).map(([name, value]) => ({ name, value }))
              }] : []
            };
          } catch (e) {
            console.log(`[DEBUG] Failed to load storage state: ${e.message}`);
          }
        }
      }

      this.context = await this.browser.newContext(contextOptions);

      await this.context.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      });

      await this.context.setGeolocation({ latitude: 40.7128, longitude: -74.0060 });

      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(config.navigationTimeout);

      log('Browser initialized');
    } catch (error) {
      log(`❌ Browser initialization error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Navigate to Instagram and login (auto or manual based on config)
   */
  async login(onLoginReady) {
    try {
      console.log('[DEBUG] Login function started');
      console.log(`[DEBUG] FORCE_MANUAL_LOGIN = ${config.forceManualLogin}`);
      log(`Navigating to ${config.instagramUrl}...`);

      let loaded = false;
      for (let i = 0; i < 3; i++) {
        try {
          console.log(`[DEBUG] Loading Instagram, attempt ${i + 1}`);
          await this.page.goto(config.instagramUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          loaded = true;
          console.log(`[DEBUG] Page loaded successfully`);
          break;
        } catch (e) {
          log(`⚠ Attempt ${i + 1} failed: ${e.message}`);
          if (i < 2) await this.page.waitForTimeout(2000);
        }
      }

      if (!loaded) throw new Error('Failed to load Instagram after 3 attempts');

      console.log('[DEBUG] Waiting for page to render...');
      await this.page.waitForTimeout(2000);

      console.log('[DEBUG] Checking for login form...');
      const loginFormExists = await this.page.locator('input[name="email"]').count() > 0;
      console.log(`[DEBUG] loginFormExists = ${loginFormExists}`);

      // Check for "Continue" button (session needs password confirmation)
      // Use getByLabel which is more specific and uses aria-label
      const continueButton = this.page.getByLabel('Continue', { exact: true });
      const hasContinueButton = await continueButton.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`[DEBUG] Has Continue button: ${hasContinueButton}`);

      // Already logged in (no login form, no continue button)
      if (!loginFormExists && !hasContinueButton) {
        log('✓ Already logged in (active session)');
        this.isLoggedIn = true;
        return true;
      }

      // Handle "Continue" button scenario
      if (hasContinueButton) {
        log('Continue button found - session needs password confirmation');
        await continueButton.click();
        log('Clicked Continue button');

        // Wait for password modal
        await this.page.waitForTimeout(1500);

        // Check for password input in modal
        const passwordInput = this.page.locator('input[name="password"], input[type="password"], input[name="pass"]');
        const hasPasswordInput = await passwordInput.count() > 0;

        if (hasPasswordInput) {
          console.log('[DEBUG] Password input found in modal, filling password...');
          log('Entering password for session confirmation...');

          await passwordInput.fill(config.igPassword);
          console.log('[DEBUG] Password filled');

          await this.page.waitForTimeout(500);

          // Press Enter to submit
          await this.page.keyboard.press('Enter');
          log('Submitted password');

          // Wait for navigation
          await this.page.waitForTimeout(3000);

          // Check if we're now logged in
          const currentUrl = this.page.url();
          if (!currentUrl.includes('login') && !currentUrl.includes('challenge')) {
            log('✓ Session confirmed successfully');
            this.isLoggedIn = true;
            return true;
          }
        }
      }

      // Manual login mode
      if (config.forceManualLogin) {
        console.log('[DEBUG] Manual login mode - waiting for user');
        log('');
        log('════════════════════════════════════════════════════════════');
        log('  MANUAL LOGIN REQUIRED');
        log('════════════════════════════════════════════════════════════');
        log('');
        log('1. Browser is open and ready for login');
        log('2. Enter your Instagram credentials in the browser');
        log('3. Complete any verification (2FA, email, etc.)');
        log('4. After login, come back here and press ENTER to continue');
        log('');
        log('⏳ Waiting... Press ENTER when you have completed the login');
        log('');
        log('════════════════════════════════════════════════════════════');
        log('');

        console.log('\n⏳⏳⏳ WAITING FOR YOUR ENTER - Press ENTER in terminal when done with login ⏳⏳⏳\n');

        await onLoginReady();
        log('✓ ENTER received, continuing...');

        const url = this.page.url();
        if (url.includes('instagram.com') && !url.includes('login')) {
          log('✓ Login detected!');
        } else {
          log('⚠ Warning: login may not have been completed');
          log(`   Current URL: ${url}`);
        }
      }
      // Auto login mode
      else {
        console.log('[DEBUG] Auto-filling login form...');
        log('Auto-filling login form...');

        // Fill username
        await this.page.fill('input[name="email"]', config.igUsername);
        console.log('[DEBUG] Username filled');

        // Fill password
        await this.page.fill('input[name="pass"]', config.igPassword);
        console.log('[DEBUG] Password filled');

        // Click login button
        await this.page.waitForTimeout(2000);
        await this.page.keyboard.press('Enter');
        log('Logging in...');

        // Wait for navigation
        await this.page.waitForTimeout(3000);

        // Check for login error
        const errorText = await this.page.locator('p[id*=""]').filter({ hasText: /Sorry|password|incorrect|error/i }).first().textContent().catch(() => null);
        if (errorText) {
          throw new Error(`Login failed: ${errorText}`);
        }

        // Check for 2FA or challenge
        const currentUrl = this.page.url();
        console.log(`[DEBUG] Current URL after login: ${currentUrl}`);

        if (currentUrl.includes('challenge') || currentUrl.includes('two_factor')) {
          log('');
          log('════════════════════════════════════════════════════════════');
          log('  2FA/CHALLENGE VERIFICATION REQUIRED');
          log('════════════════════════════════════════════════════════════');
          log('');
          log('Complete the verification (SMS, Email, etc.) in the browser');
          log('Then press ENTER to continue');
          log('');
          log('════════════════════════════════════════════════════════════');
          log('');

          console.log('\n⏳⏳⏳ WAITING FOR YOUR ENTER - Press ENTER after verification ⏳⏳⏳\n');

          await onLoginReady();
          log('✓ Verification completed');
        }
      }

      // Handle popups (both modes)
      const saveInfoButton = this.page.getByText('Save info').or(this.page.getByText('Save your login'));
      if (await saveInfoButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveInfoButton.click();
        log('Skipped save info');
      }

      const notifButton = this.page.getByText('Turn On').or(this.page.getByText('Not Now'));
      if (await notifButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await notifButton.click();
        log('Skipped notifications');
      }

      this.isLoggedIn = true;
      log('');
      log('✓ Login successful!');
      log('');

      await this.sessionManager.saveSession(this.context, this.page);
      return true;
    } catch (error) {
      log(`❌ Login error: ${error.message}`);
      this.isLoggedIn = false;

      await sendErrorNotification('Instagram Login Failed', error.message, { step: 'Login', username: config.igUsername });
      throw error;
    }
  }

  /**
   * Navigate to target user's profile
   */
  async goToUserProfile() {
    try {
      const profileUrl = `${config.instagramUrl}/${config.igTargetUsername}/`;
      log(`Navigating to profile: @${config.igTargetUsername}`);
      console.log(`[DEBUG] Loading profile: ${profileUrl}`);

      await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log('[DEBUG] Profile page loaded');

      await this.page.waitForTimeout(2000);

      console.log('[DEBUG] Waiting for profile header...');
      try {
        await this.page.waitForSelector('header section', { timeout: 10000 });
        console.log('[DEBUG] Profile header found');
      } catch (e) {
        const headerExists = await this.page.locator('header').count() > 0;
        if (!headerExists) throw new Error('Profile header not found');
      }

      console.log('[DEBUG] Checking if profile is private or not found...');
      const isPrivate = await this.page.getByText('This Account is Private').count() > 0;
      const notFound = await this.page.getByText(/Sorry|not found|page isn't available/i).count() > 0;
      console.log(`[DEBUG] isPrivate=${isPrivate}, notFound=${notFound}`);

      if (notFound) throw new Error(`Profile @${config.igTargetUsername} not found`);
      if (isPrivate) throw new Error(`Profile @${config.igTargetUsername} is private`);

      log(`✓ Profile @${config.igTargetUsername} loaded`);
      return true;
    } catch (error) {
      log(`❌ Profile navigation error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if user has active stories and open story viewer
   */
  async hasActiveStories() {
    try {
      const canvasCount = await this.page.locator('header section canvas').count();
      console.log(`[DEBUG] Found ${canvasCount} canvas elements in header`);

      if (canvasCount > 0) {
        log('✓ Active stories detected');

        const storyCanvas = this.page.locator('header section canvas').first();
        await storyCanvas.click();
        log('Story opened (clicked on canvas)');

        await this.page.waitForTimeout(2000);

        const currentUrl = this.page.url();
        console.log(`[DEBUG] URL after clicking story: ${currentUrl}`);

        const isStoryViewer = currentUrl.includes('/stories/');
        console.log(`[DEBUG] Story viewer detected: ${isStoryViewer}`);

        if (!isStoryViewer) {
          console.log('[DEBUG] NOT in story viewer - trying alternative click...');
          // Try clicking the profile image itself
          const profileImg = this.page.locator('header section img').first();
          await profileImg.click();
          await this.page.waitForTimeout(1500);
        }

        return true;
      }

      log('No active stories found');
      return false;
    } catch (error) {
      log(`⚠ Story check error: ${error.message}`);
      return false;
    }
  }

  /**
   * Extract stories data by navigating through all stories
   */
  async extractStories() {
    try {
      log('Extracting stories...');

      const storyData = await this.extractStoryDataFromPage();

      console.log('[DEBUG] Closing story viewer...');
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);

      return storyData;
    } catch (error) {
      log(`❌ Story extraction error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract story data by navigating through all stories
   */
  async extractStoryDataFromPage() {
    try {
      console.log('[DEBUG] Extracting ALL stories...');

      const currentUrl = this.page.url();
      console.log(`[DEBUG] Current URL: ${currentUrl}`);

      const isStoryViewer = currentUrl.includes('/stories/');
      if (!isStoryViewer) {
        console.log('[DEBUG] NOT in story viewer mode!');
        log('⚠ Story viewer not detected');
        return [];
      }

      const stories = [];
      let storyIndex = 0;
      const maxStories = 20;
      let noContentCount = 0;
      let lastUrl = '';

      // Load previously seen story IDs from tracker
      if (this.seenPks.size === 0) {
        console.log('[DEBUG] Loading seen story IDs from tracker...');
        const tracker = new StoryTracker(config.igTargetUsername);
        this.seenPks = await tracker.getProcessedIds();
        console.log(`[DEBUG] Loaded ${this.seenPks.size} previously seen story IDs`);
      }

      while (noContentCount < 3) {
        console.log(`[DEBUG] ===== Story ${storyIndex + 1} =====`);

        await this.page.waitForTimeout(1200);

        const currentUrl2 = this.page.url();
        console.log(`[DEBUG] Current URL: ${currentUrl2}`);

        if (currentUrl2 === lastUrl && storyIndex > 0) {
          console.log('[DEBUG] URL unchanged, likely at end of stories');
          noContentCount++;
        } else {
          lastUrl = currentUrl2;
          noContentCount = 0;
        }

        // Extract story ID from URL
        const urlMatch = currentUrl2.match(/stories\/[^/]+\/(\d+)/);
        const storyPk = urlMatch ? urlMatch[1] : null;
        console.log(`[DEBUG] Story PK from URL: ${storyPk}`);

        // Check if this story was already processed
        if (storyPk && this.seenPks.has(storyPk)) {
          console.log(`[DEBUG] Story ${storyPk} already seen in tracker, skipping extraction`);
          log(`Skipping already processed story: ${storyPk}`);
          storyIndex++;
          // Go to next story
          if (storyIndex < maxStories && noContentCount < 3) {
            try {
              await this.page.keyboard.press('ArrowRight');
              await this.page.waitForTimeout(600);
            } catch (e) {
              console.log('[DEBUG] Navigation error:', e.message);
              break;
            }
          }
          continue;
        }

        // Extract content
        const content = await this.page.evaluate(() => {
          const result = {
            mediaUrl: null,
            isVideo: false,
            caption: null,
            link: null,
          };

          // Check for video
          const videos = Array.from(document.querySelectorAll('video'));
          for (const v of videos) {
            if (v.src && v.offsetParent !== null) {
              result.mediaUrl = v.src;
              result.isVideo = true;
              console.log('[EVAL] Found visible video');
              break;
            }
          }

          // Check for image
          if (!result.mediaUrl) {
            const imgs = Array.from(document.querySelectorAll('img'));
            for (const img of imgs) {
              const src = img.src;
              if (src && !src.includes('64x64') && !src.includes('150x150')) {
                const rect = img.getBoundingClientRect();
                if (rect.width >= 200 && rect.height >= 200 && rect.width !== 0) {
                  result.mediaUrl = src;
                  console.log('[EVAL] Found story image', rect.width, 'x', rect.height);
                  break;
                }
              }
            }
          }

          // Get caption
          const spans = Array.from(document.querySelectorAll('span'));
          for (const s of spans) {
            const text = s.textContent?.trim();
            if (text && text.length > 5 && text.length < 500) {
              if (!text.includes('Close') && !text.includes('More') && !text.includes('View') && !text.includes('Follow')) {
                result.caption = text;
                console.log('[EVAL] Found caption:', text.substring(0, 30));
                break;
              }
            }
          }

          // Get links
          const links = Array.from(document.querySelectorAll('a[href]'));
          for (const a of links) {
            const href = a.href;
            if (href && !href.includes('instagram.com') && !href.startsWith('#')) {
              result.link = href;
              console.log('[EVAL] Found link:', href);
              break;
            }
          }

          return result;
        });

        if (content.mediaUrl) {
          const uniqueId = storyPk || content.mediaUrl;

          if (!this.seenPks.has(uniqueId) && storyPk) {
            this.seenPks.add(uniqueId);
            stories.push({
              ig_pk: storyPk,
              username: config.igTargetUsername,
              caption: content.caption,
              media_type: content.isVideo ? 2 : 1,
              is_video: content.isVideo,
              taken_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              media_url: content.mediaUrl,
              thumbnail_url: content.mediaUrl,
              permalink: storyPk ? `${config.instagramUrl}/stories/${config.igTargetUsername}/${storyPk}/` : null,
              story_link: content.link,
            });
            console.log(`[DEBUG] ✓ Story ${storyIndex + 1} extracted (PK: ${storyPk || 'N/A'})`);
          } else {
            console.log(`[DEBUG] Story already extracted`);
          }
        } else {
          console.log('[DEBUG] No content found');
          noContentCount++;
        }

        storyIndex++;

        // Go to next story
        if (storyIndex < maxStories && noContentCount < 3) {
          try {
            // Tap right side of screen
            await this.page.keyboard.press('ArrowRight')
            await this.page.waitForTimeout(600);
          } catch (e) {
            console.log('[DEBUG] Navigation error:', e.message);
            break;
          }
        }
      }

      console.log(`[DEBUG] Total stories extracted: ${stories.length}`);
      log(`✓ Extracted ${stories.length} total stories`);
      return stories;

    } catch (error) {
      console.log(`[DEBUG] Error: ${error.message}`);
      log(`⚠ Extraction error: ${error.message}`);
      return [];
    }
  }

  /**
   * Close browser
   */
  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        log('Browser closed');
      }
    } catch (error) {
      log(`⚠ Browser close error: ${error.message}`);
    }
  }
}
