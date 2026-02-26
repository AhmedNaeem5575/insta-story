import { execSync } from 'child_process';
import fs from 'fs';

const [, , videoInput, audioInput] = process.argv;

if (!videoInput || !audioInput) {
    console.error('Usage: node test-files.js <video.mp4> <audio.mp3|mp4>');
    process.exit(1);
}

console.log('\n📋 Testing audio file...\n');

// Test if audio plays
console.log('1. Check audio file info:');
try {
    const info = execSync(`ffprobe -v error -show_entries format=duration,bit_rate,size:stream=codec_name,channels,sample_rate -of default=noprint_wrappers=1 "${audioInput}"`, { encoding: 'utf8' });
    console.log(info);
} catch (e) {
    console.log('Could not probe audio');
}

console.log('\n2. Extract first 3 seconds of audio to test:');

// Try to extract and play first 3 seconds
try {
    execSync(`ffmpeg -y -i "${audioInput}" -t 3 -c:a copy test_audio_sample.m4a`, { stdio: 'inherit' });
    console.log('\n✅ Created test_audio_sample.m4a');
    console.log('   Try playing this file to verify the audio source is valid');
} catch (e) {
    console.log('\n❌ Could not extract audio sample - file may be corrupt');
}

console.log('\n3. Check if video already has audio:');
try {
    const videoStreams = execSync(`ffprobe -v error -select_streams a -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${videoInput}"`, { encoding: 'utf8' });
    if (videoStreams.trim()) {
        console.log('⚠️  Video file HAS audio:', videoStreams.trim());
        console.log('   This means the video already contains audio, and we might be replacing it');
    } else {
        console.log('✅ Video file has NO audio (video only)');
    }
} catch (e) {
    console.log('Could not check video streams');
}

console.log('\n4. File sizes:');
const videoSize = fs.statSync(videoInput).size;
const audioSize = fs.statSync(audioInput).size;
console.log(`   Video: ${(videoSize / 1024).toFixed(2)} KB`);
console.log(`   Audio: ${(audioSize / 1024).toFixed(2)} KB`);

if (audioSize < 10000) {
    console.log('\n⚠️  Audio file is VERY small - it might be incomplete or corrupt!');
    console.log('   The downloaded URL might be a segment, not the full audio.');
}
