/* YouTube Data API v3 client for the static Truck Wala Radio site. */
(() => {
    const API_BASE = "https://www.googleapis.com/youtube/v3";
    const STORAGE = {
        apiKey: "truckWala.youtubeApiKey",
        playlistId: "truckWala.playlistId",
        playlistCache: "truckWala.playlistCache"
    };

    function getApiKey() {
        return (localStorage.getItem(STORAGE.apiKey) || window.TRUCK_WALA_CONFIG?.youtubeApiKey || "").trim();
    }

    function getPlaylistId() {
        return (localStorage.getItem(STORAGE.playlistId) || window.TRUCK_WALA_CONFIG?.playlistId || "").trim();
    }

    function extractPlaylistId(value) {
        const raw = String(value || "").trim();
        if (!raw) return "";
        try {
            const url = new URL(raw);
            return url.searchParams.get("list") || raw;
        } catch {
            return raw.replace(/^.*[?&]list=/, "").split("&")[0].trim();
        }
    }

    async function request(endpoint, params) {
        const apiKey = getApiKey();
        if (!apiKey) throw new Error("MISSING_API_KEY");

        const url = new URL(`${API_BASE}/${endpoint}`);
        Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
        });

        const response = await fetch(url);
        let body = null;
        try { body = await response.json(); } catch { /* no-op */ }

        if (!response.ok) {
            const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || `HTTP_${response.status}`;
            const error = new Error(reason);
            error.details = body?.error?.message || "YouTube API request failed.";
            error.status = response.status;
            throw error;
        }
        return body;
    }

    async function fetchPlaylist(playlistId) {
        const id = extractPlaylistId(playlistId);
        if (!id) throw new Error("MISSING_PLAYLIST_ID");

        const playlistResponse = await request("playlists", {
            part: "snippet,contentDetails",
            id
        });
        const playlist = playlistResponse.items?.[0];
        if (!playlist) throw new Error("PLAYLIST_NOT_FOUND");

        const songs = [];
        let pageToken = "";
        do {
            const response = await request("playlistItems", {
                part: "snippet,contentDetails,status",
                playlistId: id,
                maxResults: 50,
                pageToken
            });

            for (const item of response.items || []) {
                const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
                if (!videoId) continue;
                const title = item.snippet?.title || "Untitled video";
                const channel = item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || "YouTube";
                const thumbnails = item.snippet?.thumbnails || {};
                const thumbnail = thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";

                songs.push({
                    id: videoId,
                    videoId,
                    title,
                    artist: channel,
                    channel,
                    thumbnail,
                    position: item.snippet?.position ?? songs.length,
                    playlistItemId: item.id
                });
            }

            pageToken = response.nextPageToken || "";
        } while (pageToken);

        const data = {
            id,
            title: playlist.snippet?.title || "Truck Wala Playlist",
            description: playlist.snippet?.description || "",
            channel: playlist.snippet?.channelTitle || "YouTube",
            thumbnail: playlist.snippet?.thumbnails?.high?.url || playlist.snippet?.thumbnails?.medium?.url || "",
            itemCount: songs.length,
            loadedAt: new Date().toISOString(),
            songs
        };

        localStorage.setItem(STORAGE.playlistId, id);
        localStorage.setItem(STORAGE.playlistCache, JSON.stringify(data));
        return data;
    }

    function getCachedPlaylist() {
        try {
            const data = JSON.parse(localStorage.getItem(STORAGE.playlistCache) || "null");
            if (data?.songs?.length) return data;
        } catch { /* ignore invalid cache */ }
        return null;
    }

    function saveSettings({ apiKey, playlistId }) {
        if (apiKey !== undefined) localStorage.setItem(STORAGE.apiKey, String(apiKey).trim());
        if (playlistId !== undefined) {
            const id = extractPlaylistId(playlistId);
            if (id) localStorage.setItem(STORAGE.playlistId, id);
        }
    }

    function clearSettings() {
        localStorage.removeItem(STORAGE.apiKey);
        localStorage.removeItem(STORAGE.playlistId);
        localStorage.removeItem(STORAGE.playlistCache);
    }

    window.YouTubeData = {
        getApiKey,
        getPlaylistId,
        extractPlaylistId,
        fetchPlaylist,
        getCachedPlaylist,
        saveSettings,
        clearSettings
    };
})();
