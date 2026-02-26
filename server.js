import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getVideoPath, videoExists, getAllVideoIds, deleteVideo } from './services/videoProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'Instagram Story Video Server' });
});

// Get all videos
app.get('/videos', async (req, res) => {
  try {
    const videos = await getAllVideoIds();
    res.json({
      videos: videos.map(id => ({
        id,
        url: `${SERVER_URL}/videos/${id}.mp4`,
      })),
      count: videos.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve video file
app.get('/videos/:id.mp4', async (req, res) => {
  const { id } = req.params;

  try {
    const exists = await videoExists(id);
    if (!exists) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const videoPath = getVideoPath(id);
    res.sendFile(videoPath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stream video with proper headers
app.get('/stream/:id.mp4', async (req, res) => {
  const { id } = req.params;

  try {
    const exists = await videoExists(id);
    if (!exists) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const videoPath = getVideoPath(id);
    const stat = await import('fs').then(fs => fs.promises.stat(videoPath));
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });

      const stream = (await import('fs')).createReadStream(videoPath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      const stream = (await import('fs')).createReadStream(videoPath);
      stream.pipe(res);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete video
app.delete('/videos/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await deleteVideo(id);
    if (deleted) {
      res.json({ success: true, message: 'Video deleted' });
    } else {
      res.status(404).json({ error: 'Video not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n🎬 Instagram Story Video Server');
  console.log('='.repeat(50));
  console.log(`✅ Server running at: ${SERVER_URL}`);
  console.log(`📁 Video directory: ${path.join(__dirname, 'video_stories')}`);
  console.log(`\n📌 Endpoints:`);
  console.log(`   GET  /health              - Health check`);
  console.log(`   GET  /videos              - List all videos`);
  console.log(`   GET  /videos/:id.mp4      - Serve video file`);
  console.log(`   GET  /stream/:id.mp4      - Stream video with range support`);
  console.log(`   DEL  /videos/:id          - Delete video`);
  console.log('\n');
});

export { app, SERVER_URL };
