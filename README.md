# Instagram Stories Scraper - Node.js Version

Instagram story scraper using Playwright to extract stories and send data to a Laravel API.

## Features

- Automated Instagram login with session persistence
- Extracts stories from any public Instagram account
- Captures media URLs, captions, and story links (swipe-up/tap links)
- Sends data to remote Laravel API
- Email notifications for errors and success
- Proxy support for avoiding IP blocks

## Project Structure

```
node-version/
├── config/
│   └── env.js              # Environment configuration
├── services/
│   └── instagramScraper.js # Main scraping logic with Playwright
├── utils/
│   ├── logger.js           # Logging utility
│   ├── notifications.js    # Formspree email notifications
│   └── apiClient.js        # Laravel API communication
├── .env                    # Environment variables
├── index.js                # Main entry point
├── package.json            # Dependencies
└── README.md               # This file
```

## Installation

```bash
cd node-version
npm install
npx playwright install chromium
```

## Configuration

Edit `.env` file:

```bash
# Instagram Credentials
IG_USERNAME=your_username
IG_PASSWORD=your_password

# Target Instagram Account
IG_TARGET_USERNAME=cristiano

# Laravel API Configuration
LARAVEL_API_URL=https://your-domain.com/api/instagram
LARAVEL_API_KEY=your_api_key

# Optional: Proxy
PROXY_URL=http://username:password@proxy.example.com:8080
```

## Usage

```bash
# Run the scraper
npm start

# Or with nodemon for development
npm run dev
```

## Data Extracted

| Field | Description |
|-------|-------------|
| `ig_pk` | Unique Instagram story ID |
| `username` | Account username |
| `caption` | Story caption/text |
| `media_type` | 1 = image, 2 = video |
| `is_video` | Boolean - is this a video |
| `taken_at` | ISO 8601 timestamp |
| `expires_at` | ISO 8601 expiration timestamp |
| `media_url` | URL to video/image |
| `thumbnail_url` | URL to thumbnail |
| `permalink` | Direct story link |
| `story_link` | Extracted URL from stickers |

## How It Works

1. **Initialize Playwright browser** (Chromium)
2. **Login to Instagram** with credentials
3. **Navigate to target profile**
4. **Click on story ring** to open viewer
5. **Extract story data** from page/API responses
6. **Send to Laravel API** via POST request
7. **Send notification** via Formspree email

## Notes

- Set `headless: false` to `true` in `instagramScraper.js` for production
- Instagram may block automated logins - use proxy if needed
- Stories expire after 24 hours
- Run frequently via cron to capture new stories

## Troubleshooting

**Login Failed:**
- Use a VPN or proxy to change IP
- Check credentials are correct
- Delete `ig-session.json` if exists

**No Stories Found:**
- Verify target username is correct
- Check if account has active stories
- Stories expire after 24 hours

**API Connection Error:**
- Test API endpoint: `curl {LARAVEL_API_URL}/ping -H "X-API-Key: {LARAVEL_API_KEY}"`
- Check firewall allows outbound connections
