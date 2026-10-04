const STORAGE = {
    song: "truckWala.song",
    volume: "truckWala.volume",
    favorites: "truckWala.favorites",
    recent: "truckWala.recent"
};

let playlistData = null;
let currentIndex = Number(localStorage.getItem(STORAGE.song) || 0);
let isPlaying = false;
let loadingPlaylist = false;

const shayaris = [
    "Raat lambi hai, safar bhi lamba hai... gaane chalte rehne do.",
    "Sadak apni, truck apna, aur radio full volume.",
    "Jahan highway khatam hota hai, wahan kahani shuru hoti hai.",
    "Manzil ka kya hai... pehle ek aur gaana sunte hain."
];

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    restoreVolume();
    document.getElementById("shayari").textContent = shayaris[Math.floor(Math.random() * shayaris.length)];

    window.addEventListener("tw:playing", () => { isPlaying = true; renderPlaylist(); });
    window.addEventListener("tw:paused", () => { isPlaying = false; renderPlaylist(); });
    window.addEventListener("tw:ended", () => { isPlaying = false; });
    window.addEventListener("tw:player-error", event => handlePlayerError(event.detail));

    const cached = YouTubeData.getCachedPlaylist();
    if (cached) {
        applyPlaylist(cached);
        setStatus(`CACHED · ${cached.itemCount} TRACKS`);
    }

    syncSetupFields();
    await loadConfiguredPlaylist(false);
});

function bindEvents() {
    document.getElementById("songSearch").addEventListener("input", renderPlaylist);

    document.getElementById("loadPlaylistButton").addEventListener("click", () => loadConfiguredPlaylist(true));
    document.getElementById("refreshPlaylistButton").addEventListener("click", () => loadConfiguredPlaylist(true));
    document.getElementById("setupToggleButton").addEventListener("click", toggleSetup);
    document.getElementById("clearSettingsButton").addEventListener("click", clearYouTubeSettings);

    document.getElementById("playlistInput").addEventListener("keydown", event => {
        if (event.key === "Enter") loadConfiguredPlaylist(true);
    });
    document.getElementById("apiKeyInput").addEventListener("keydown", event => {
        if (event.key === "Enter") loadConfiguredPlaylist(true);
    });

    document.getElementById("playButton").addEventListener("click", async () => {
        if (!getCurrentSong()) {
            showPlayerNotice("Load a YouTube playlist first.");
            openSetup();
            return;
        }
        await RadioPlayer.togglePlay();
    });

    document.getElementById("nextButton").addEventListener("click", () => playNextSong(false));
    document.getElementById("previousButton").addEventListener("click", playPreviousSong);
    document.getElementById("volumeBar").addEventListener("input", event => RadioPlayer.setVolume(event.target.value));
    document.getElementById("seekBar").addEventListener("input", event => RadioPlayer.seekToPercent(event.target.value));
    document.getElementById("favoriteButton").addEventListener("click", toggleFavorite);

    document.getElementById("hornButton").addEventListener("click", event => {
        event.currentTarget.animate(
            [{ transform: "scale(1)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }],
            { duration: 180 }
        );
    });

    document.getElementById("rainButton").addEventListener("click", event => {
        document.body.classList.toggle("rain-mode");
        event.currentTarget.textContent = document.body.classList.contains("rain-mode") ? "☀️ Rain Mode On" : "🌧️ Rain Mode";
    });

    document.addEventListener("keydown", event => {
        if (event.target.matches("input, textarea, button")) return;
        if (event.code === "Space") {
            event.preventDefault();
            document.getElementById("playButton").click();
        } else if (event.code === "ArrowRight") {
            playNextSong(false);
        } else if (event.code === "ArrowLeft") {
            playPreviousSong();
        }
    });
}

async function loadConfiguredPlaylist(showErrors = true) {
    if (loadingPlaylist) return;
    const playlistId = document.getElementById("playlistInput").value.trim();
    const apiKey = document.getElementById("apiKeyInput").value.trim();

    if (apiKey) YouTubeData.saveSettings({ apiKey });
    if (playlistId) YouTubeData.saveSettings({ playlistId });

    const savedPlaylistId = YouTubeData.getPlaylistId();
    const savedApiKey = YouTubeData.getApiKey();

    if (!savedPlaylistId || !savedApiKey) {
        setStatus("SETUP REQUIRED");
        if (showErrors) {
            showPlayerNotice(!savedApiKey
                ? "Paste a YouTube Data API key first."
                : "Paste your YouTube playlist URL or playlist ID first.");
            openSetup();
        }
        return;
    }

    loadingPlaylist = true;
    setLoading(true);
    setStatus("CONNECTING TO YOUTUBE...");

    try {
        const data = await YouTubeData.fetchPlaylist(savedPlaylistId);
        applyPlaylist(data);
        setStatus(`ONLINE · ${data.itemCount} TRACKS`);
        closeSetup();
    } catch (error) {
        console.error(error);
        setStatus("YOUTUBE CONNECTION ERROR");
        if (showErrors || !playlistData) showPlayerNotice(formatYouTubeError(error));
    } finally {
        loadingPlaylist = false;
        setLoading(false);
    }
}

function applyPlaylist(data) {
    playlistData = data;
    window.SONGS.youtube = data.songs || [];
    currentIndex = Math.max(0, Math.min(currentIndex, Math.max(0, getCurrentSongs().length - 1)));
    localStorage.setItem(STORAGE.song, String(currentIndex));
    renderAll();
    updatePlaylistHeader();
}

function getCurrentSongs() {
    return playlistData?.songs || [];
}

function getCurrentSong() {
    return getCurrentSongs()[currentIndex] || null;
}

function renderAll() {
    renderPlaylist();
    renderCurrentSong();
    renderRecent();
    updatePlaylistHeader();
}

function renderPlaylist() {
    const playlist = document.getElementById("playlist");
    const emptyPlaylist = document.getElementById("emptyPlaylist");
    const search = document.getElementById("songSearch");
    const songs = getCurrentSongs();
    const query = (search?.value || "").trim().toLowerCase();

    const filteredSongs = songs
        .map((song, originalIndex) => ({ song, originalIndex }))
        .filter(({ song }) => !query || song.title.toLowerCase().includes(query) || song.artist.toLowerCase().includes(query));

    document.getElementById("songCount").textContent = `${songs.length} SONG${songs.length === 1 ? "" : "S"}`;
    document.getElementById("playlistLanguage").textContent = playlistData ? `${escapeHtml(playlistData.title)}` : "YOUTUBE PLAYLIST";
    document.getElementById("searchResultCount").textContent = query ? `${filteredSongs.length} MATCH${filteredSongs.length === 1 ? "" : "ES"}` : "";

    playlist.innerHTML = "";
    emptyPlaylist.hidden = filteredSongs.length !== 0;

    if (!songs.length) {
        emptyPlaylist.querySelector("strong").textContent = "No playlist loaded";
        emptyPlaylist.querySelector("p").textContent = "Paste a YouTube playlist URL/ID and load it to bring the radio online.";
        return;
    }

    if (!filteredSongs.length) {
        emptyPlaylist.querySelector("strong").textContent = "No song found";
        emptyPlaylist.querySelector("p").textContent = "Try another song title or channel name.";
        return;
    }

    const favorites = getFavorites();
    filteredSongs.forEach(({ song, originalIndex }) => {
        const button = document.createElement("button");
        const active = originalIndex === currentIndex;
        button.className = `song-row ${active ? "active" : ""}`;
        button.type = "button";

        const star = favorites.has(song.id) ? "★" : "☆";
        const state = active && isPlaying ? `<span class="playing-bars"><i></i><i></i><i></i></span>` : "▶";
        button.innerHTML = `
            <span class="song-number">${String(originalIndex + 1).padStart(2, "0")}</span>
            <span>
                <span class="song-name">${escapeHtml(song.title)}</span>
                <span class="song-artist">${escapeHtml(song.artist)}</span>
            </span>
            <span class="song-favorite" aria-label="${star === "★" ? "Favorited" : "Not favorited"}">${star}</span>
            <span class="song-play">${state}</span>
        `;
        button.title = `Play ${song.title}`;
        button.addEventListener("click", () => {
            currentIndex = originalIndex;
            persistSong();
            renderAll();
            playCurrentSong();
        });
        playlist.appendChild(button);
    });
}

function renderCurrentSong() {
    const song = getCurrentSong();
    const title = document.getElementById("songTitle");
    const artist = document.getElementById("songArtist");
    const favoriteButton = document.getElementById("favoriteButton");
    const availability = document.getElementById("playerAvailability");

    if (!song) {
        title.textContent = "Radio offline";
        artist.textContent = "Load a YouTube playlist to start the journey";
        favoriteButton.textContent = "☆";
        favoriteButton.setAttribute("aria-pressed", "false");
        availability.textContent = "PLAYLIST NOT LOADED";
        availability.classList.remove("ready");
        return;
    }

    title.textContent = song.title;
    artist.textContent = song.artist;
    const favorite = getFavorites().has(song.id);
    favoriteButton.textContent = favorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-pressed", String(favorite));
    favoriteButton.setAttribute("aria-label", favorite ? "Remove from favorites" : "Add to favorites");
    availability.textContent = "YOUTUBE READY";
    availability.classList.add("ready");
}

async function playCurrentSong() {
    const song = getCurrentSong();
    if (!song) return;
    const ok = await RadioPlayer.playVideo(song.videoId);
    if (ok) {
        isPlaying = true;
        addRecent(song);
        renderPlaylist();
    }
}

function playNextSong() {
    const songs = getCurrentSongs();
    if (!songs.length) return;
    currentIndex = (currentIndex + 1) % songs.length;
    persistSong();
    renderAll();
    playCurrentSong();
}

function playPreviousSong() {
    const songs = getCurrentSongs();
    if (!songs.length) return;
    currentIndex = (currentIndex - 1 + songs.length) % songs.length;
    persistSong();
    renderAll();
    playCurrentSong();
}

function toggleFavorite() {
    const song = getCurrentSong();
    if (!song) return;
    const favorites = getFavorites();
    if (favorites.has(song.id)) favorites.delete(song.id);
    else favorites.add(song.id);
    localStorage.setItem(STORAGE.favorites, JSON.stringify([...favorites]));
    renderAll();
}

function getFavorites() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE.favorites) || "[]")); }
    catch { return new Set(); }
}

function addRecent(song) {
    let recent = getRecent().filter(item => item.id !== song.id);
    recent.unshift({ id: song.id, title: song.title, artist: song.artist, playlistId: playlistData?.id || "" });
    localStorage.setItem(STORAGE.recent, JSON.stringify(recent.slice(0, 12)));
    renderRecent();
}

function getRecent() {
    try { return JSON.parse(localStorage.getItem(STORAGE.recent) || "[]"); }
    catch { return []; }
}

function renderRecent() {
    const box = document.getElementById("recentList");
    if (!box) return;
    const recent = getRecent();
    box.innerHTML = "";
    if (!recent.length) {
        box.innerHTML = `<span class="recent-empty">Your recently played songs will appear here.</span>`;
        return;
    }
    recent.slice(0, 6).forEach(item => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "recent-chip";
        button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.artist)}</span>`;
        button.addEventListener("click", () => {
            if (item.playlistId !== playlistData?.id) return;
            const index = getCurrentSongs().findIndex(song => song.id === item.id);
            if (index < 0) return;
            currentIndex = index;
            persistSong();
            renderAll();
            playCurrentSong();
        });
        box.appendChild(button);
    });
}

function persistSong() {
    localStorage.setItem(STORAGE.song, String(currentIndex));
}

function restoreVolume() {
    const saved = Number(localStorage.getItem(STORAGE.volume) ?? 80);
    document.getElementById("volumeBar").value = Math.max(0, Math.min(100, saved));
}

function syncSetupFields() {
    document.getElementById("playlistInput").value = YouTubeData.getPlaylistId();
    document.getElementById("apiKeyInput").value = YouTubeData.getApiKey();
}

function toggleSetup() {
    const panel = document.getElementById("setupPanel");
    const open = panel.hidden;
    panel.hidden = !open;
    document.getElementById("setupToggleButton").textContent = open ? "Hide setup" : "Playlist setup";
}

function openSetup() {
    const panel = document.getElementById("setupPanel");
    panel.hidden = false;
    document.getElementById("setupToggleButton").textContent = "Hide setup";
}

function closeSetup() {
    document.getElementById("setupPanel").hidden = true;
    document.getElementById("setupToggleButton").textContent = "Playlist setup";
}

function clearYouTubeSettings() {
    YouTubeData.clearSettings();
    playlistData = null;
    window.SONGS.youtube = [];
    currentIndex = 0;
    localStorage.removeItem(STORAGE.song);
    syncSetupFields();
    renderAll();
    setStatus("SETUP REQUIRED");
    openSetup();
}

function setLoading(loading) {
    document.getElementById("loadPlaylistButton").disabled = loading;
    document.getElementById("refreshPlaylistButton").disabled = loading;
    document.getElementById("loadPlaylistButton").textContent = loading ? "Loading..." : "Load playlist";
}

function setStatus(text) {
    document.getElementById("playlistConnectionStatus").textContent = text;
}

function updatePlaylistHeader() {
    const data = playlistData;
    document.getElementById("playlistName").textContent = data?.title || "YouTube Playlist Radio";
    document.getElementById("playlistOwner").textContent = data ? `${data.channel} · ${data.itemCount} tracks` : "Paste a playlist ID to begin";
    document.getElementById("playlistIdReadout").textContent = data?.id || "—";
}

function handlePlayerError(code) {
    const messages = {
        2: "YouTube rejected this video ID.",
        5: "The embedded player could not load this video.",
        100: "This video was removed or is unavailable.",
        101: "This video owner does not allow embedded playback.",
        150: "This video owner does not allow embedded playback."
    };
    showPlayerNotice(messages[code] || "YouTube could not play this track.");
}

function formatYouTubeError(error) {
    const map = {
        MISSING_API_KEY: "YouTube Data API key is missing. Create a browser-restricted API key and paste it into setup.",
        MISSING_PLAYLIST_ID: "Playlist ID is missing.",
        PLAYLIST_NOT_FOUND: "Playlist not found. Check the URL/ID and make sure the playlist is accessible.",
        quotaExceeded: "YouTube API quota was exceeded for this key.",
        keyInvalid: "That YouTube API key is invalid.",
        dailyLimitExceeded: "YouTube API daily quota was exceeded.",
        forbidden: "YouTube rejected the API request. Check that YouTube Data API v3 is enabled and the key restrictions allow this site."
    };
    return map[error?.message] || error?.details || "Could not load the YouTube playlist.";
}

function showPlayerNotice(message) {
    const notice = document.getElementById("playerNotice");
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(showPlayerNotice.timer);
    showPlayerNotice.timer = setTimeout(() => notice.hidden = true, 6000);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

window.playNextSong = playNextSong;
