import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger.js';

/**
 * Video Processor Service
 * Downloads video and audio files, combines them using ffmpeg, and serves them
 */

const VIDEO_STORIES_DIR = path.join(process.cwd(), 'video_stories');
const TEMP_DIR = path.join(process.cwd(), 'temp_media');

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(VIDEO_STORIES_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Check if ffmpeg is installed
 */
export async function checkFfmpeg() {
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', ['-version'], {
      stdio: 'ignore',
      windowsHide: true
    });

    ffmpeg.on('close', (code) => {
      resolve(code === 0);
    });

    ffmpeg.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Download a file from URL using the page context (has cookies/session)
 */
async function downloadFile(url, destination, page) {
  try {
    // Use CDP to download with proper cookies
    const base64Data = await page.evaluate(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, url);

    const buffer = Buffer.from(base64Data, 'base64');
    await fs.writeFile(destination, buffer);

    const stats = await fs.stat(destination);
    log(`   Downloaded ${(stats.size / 1024).toFixed(2)} KB`);
    return true;
  } catch (error) {
    log(`   ❌ Download failed: ${error.message}`);
    return false;
  }
}

/**
 * Check if URL is audio-only (not video)
 */
export function isAudioOnly(url) {
  try {
    // First check: path segment - audio tracks use /m78/ while video uses /m367/
    if (url.includes('/m78/')) {
      return true;
    }
    if (url.includes('/m367/')) {
      return false;
    }

    // Second check: decode efg parameter and check encode_tag
    const u = new URL(url);
    const efg = u.searchParams.get('efg');
    if (!efg) return false;
    const decoded = JSON.parse(Buffer.from(efg, 'base64').toString('utf8'));
    const tag = (decoded.encode_tag || '').toLowerCase();
    return tag.includes('audio') && !tag.includes('vp9') && !tag.includes('avc');
  } catch {
    return false;
  }
}

/**
 * Process a story: download video and audio, combine them, save to video_stories
 * Returns the UUID and local URL
 */
export async function processStory(videoUrl, audioUrl, page) {
  const videoId = uuidv4();
  const videoPath = path.join(TEMP_DIR, `${videoId}_video.mp4`);
  const audioPath = path.join(TEMP_DIR, `${videoId}_audio.m4a`);
  const outputPath = path.join(VIDEO_STORIES_DIR, `${videoId}.mp4`);

  try {
    await ensureDirectories();

    log(`\n📹 Processing story video...`);
    log(`   Video ID: ${videoId}`);

    // Download video
    log(`   ⬇️  Downloading video...`);
    const videoDownloaded = await downloadFile(videoUrl, videoPath, page);
    if (!videoDownloaded) {
      throw new Error('Failed to download video');
    }

    // Download audio if provided
    if (audioUrl) {
      log(`   ⬇️  Downloading audio...`);
      const audioDownloaded = await downloadFile(audioUrl, audioPath, page);
      if (audioDownloaded) {
        // Combine video and audio
        log(`   🔧 Combining video and audio...`);
        await combineVideoAudio(videoPath, audioPath, outputPath);
      } else {
        // Just use video without audio
        log(`   ⚠️  Audio download failed, using video only`);
        await fs.copyFile(videoPath, outputPath);
      }
    } else {
      // No audio, just copy video
      log(`   ℹ️  No audio track, using video only`);
      await fs.copyFile(videoPath, outputPath);
    }

    // Clean up temp files
    try {
      await fs.unlink(videoPath);
      if (audioUrl) {
        await fs.unlink(audioPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }

    log(`   ✅ Story processed: ${videoId}.mp4`);

    return {
      success: true,
      videoId,
      localPath: outputPath,
      url: `/videos/${videoId}.mp4`,
    };

  } catch (error) {
    log(`   ❌ Processing failed: ${error.message}`);

    // Clean up temp files on error
    try {
      await fs.unlink(videoPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});
      await fs.unlink(outputPath).catch(() => {});
    } catch (e) {}

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Combine video and audio files using ffmpeg
 */
async function combineVideoAudio(videoPath, audioPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = [
      'ffmpeg',
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-map', '0:v',
      '-map', '1:a',
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-shortest',
      '-fflags', '+genpts',
      outputPath
    ];

    log(`   Running ffmpeg...`);

    const ffmpeg = spawn('ffmpeg', cmd.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        log(`   ✅ ffmpeg completed successfully`);
        resolve();
      } else {
        log(`   ⚠️  ffmpeg stderr: ${stderr.substring(0, 500)}`);
        reject(new Error(`ffmpeg failed with exit code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Get video path by ID
 */
export function getVideoPath(videoId) {
  return path.join(VIDEO_STORIES_DIR, `${videoId}.mp4`);
}

/**
 * Check if video exists
 */
export async function videoExists(videoId) {
  try {
    const videoPath = getVideoPath(videoId);
    await fs.access(videoPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete video by ID
 */
export async function deleteVideo(videoId) {
  try {
    const videoPath = getVideoPath(videoId);
    await fs.unlink(videoPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all video IDs
 */
export async function getAllVideoIds() {
  try {
    const files = await fs.readdir(VIDEO_STORIES_DIR);
    return files
      .filter(f => f.endsWith('.mp4'))
      .map(f => f.replace('.mp4', ''));
  } catch {
    return [];
  }
}
