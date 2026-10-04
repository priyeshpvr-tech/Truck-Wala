# Truck Wala Radio — V11

A static, no-backend Truck Wala radio site powered by a YouTube playlist.

## How it works

1. Create/manage your music as a YouTube playlist.
2. Open the site and paste the playlist URL or ID.
3. Paste a YouTube Data API v3 browser key.
4. The site fetches the playlist, keeps YouTube's order, and builds the song list automatically.
5. Playback uses the official YouTube IFrame Player API.

The playlist is fetched with `playlistItems.list`. The implementation follows YouTube's pagination tokens so playlists larger than 50 items are loaded too.

## API key setup

For a static website, the browser needs a YouTube Data API v3 key to enumerate playlist items. The key is not a server secret, so **restrict it by HTTP referrer** before publishing.

Recommended restrictions:

- API restriction: YouTube Data API v3 only
- Website/application restriction: HTTP referrers
- Add your production domain and your local development origin as allowed referrers

The key is stored locally in the visitor's browser. This project does not send it to any server of its own.

## Zero-backend note

The site itself has no backend. YouTube Data API usage is subject to Google's current API quota/policies. `playlistItems.list` currently has a quota cost of 1 unit per call, and the site requests up to 50 playlist items per page.

## Files

- `index.html` — UI
- `js/youtube-data.js` — playlist discovery, pagination, cache, settings
- `js/player.js` — YouTube IFrame playback
- `js/app.js` — radio UI/state
- `css/style.css` — visual design

## Local development

Because browser referrer/API-key restrictions and YouTube embeds behave best from an HTTP origin, use a local static server rather than opening `index.html` directly with `file://`.

For example, with Python installed:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.
