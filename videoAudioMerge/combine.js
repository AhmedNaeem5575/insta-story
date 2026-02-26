import { execSync } from 'child_process';
import fs from 'fs';

// ─── Args ──────────────────────────────────────────────────────────────────────
const [, , videoInput, audioInput, outputArg] = process.argv;

if (!videoInput || !audioInput) {
    console.error('Usage: node combine.js <video.mp4> <audio.mp3|mp4> [output.mp4]');
    console.error('Example: node combine.js videos/abc.mp4 audios/xyz.mp4 output.mp4');
    process.exit(1);
}

if (!fs.existsSync(videoInput)) {
    console.error(`❌  Video file not found: ${videoInput}`);
    process.exit(1);
}

if (!fs.existsSync(audioInput)) {
    console.error(`❌  Audio file not found: ${audioInput}`);
    process.exit(1);
}

const output = outputArg || `combined_${Date.now()}.mp4`;

// ─── Check ffmpeg ──────────────────────────────────────────────────────────────
try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
} catch {
    console.error('❌  ffmpeg is not installed or not in PATH.');
    process.exit(1);
}

// ─── Combine ───────────────────────────────────────────────────────────────────
console.log(`\n🎬  Video : ${videoInput}`);
console.log(`🎵  Audio : ${audioInput}`);
console.log(`📦  Output: ${output}\n`);

// Method 1: Copy with audio sync fix
console.log('🔧 Merging with audio timestamp fix...\n');

const cmd = [
    'ffmpeg',
    '-y',
    '-i', videoInput,
    '-i', audioInput,
    '-map', '0:v',              // Video from input 0
    '-map', '1:a',              // Audio from input 1
    '-c:v', 'copy',             // Copy video as-is
    '-c:a', 'copy',             // Copy audio as-is
    '-shortest',                // End at shortest stream
    '-fflags', '+genpts',       // Generate presentation timestamps
    '-movflags', 'faststart',   // Optimize for web
    output
];

try {
    console.log('Command:', cmd.join(' '));
    console.log('');
    execSync(cmd.join(' '), { stdio: 'inherit' });
    console.log(`\n✅  Done! Saved to: ${output}`);

    // Verify output
    const probe = execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name -of default=noprint_wrappers=1 "${output}"`, { encoding: 'utf8' });
    console.log('\n📋 Output file streams:');
    console.log(probe);

    if (probe.toLowerCase().includes('audio')) {
        console.log('✅  Audio stream present in output!');
    } else {
        console.log('⚠️  No audio stream found!');
    }

    console.log('\n💡 Try playing the file with:');
    console.log(`   VLC: open output.mp4`);
    console.log(`   QuickTime: open output.mp4`);
    console.log(`   ffplay: ffplay "${output}"`);

} catch (err) {
    console.error('\n❌  Merge failed.');
    process.exit(1);
}
