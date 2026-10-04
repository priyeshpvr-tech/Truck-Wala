(() => {
    let youtubePlayer = null;
    let playerReady = false;
    let progressTimer = null;
    let pendingVideoId = "";

    const apiReady = new Promise(resolve => {
        if (window.YT?.Player) {
            resolve();
            return;
        }

        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            previous?.();
            resolve();
        };

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            script.async = true;
            document.head.appendChild(script);
        }
    });

    async function ensurePlayer(videoId = "") {
        pendingVideoId = videoId || pendingVideoId || "";
        await apiReady;

        if (youtubePlayer) return;

        youtubePlayer = new YT.Player("youtube-player", {
            videoId: pendingVideoId,
            playerVars: {
                autoplay: 0,
                controls: 1,
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                origin: window.location.origin
            },
            events: {
                onReady: onReady,
                onStateChange: onStateChange,
                onError: onError
            }
        });
    }

    function onReady() {
        playerReady = true;
        const savedVolume = Number(localStorage.getItem("truckWala.volume") ?? 80);
        const volume = Math.max(0, Math.min(100, savedVolume));
        const input = document.getElementById("volumeBar");
        if (input) input.value = volume;
        youtubePlayer.setVolume(volume);
        startProgressTimer();
        window.dispatchEvent(new CustomEvent("tw:player-ready"));
    }

    function onStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            updatePlayButton(true);
            window.dispatchEvent(new CustomEvent("tw:playing"));
        } else if (
            event.data === YT.PlayerState.PAUSED ||
            event.data === YT.PlayerState.CUED
        ) {
            updatePlayButton(false);
            window.dispatchEvent(new CustomEvent("tw:paused"));
        } else if (event.data === YT.PlayerState.ENDED) {
            updatePlayButton(false);
            window.dispatchEvent(new CustomEvent("tw:ended"));
            window.playNextSong?.(true);
        }
    }

    function onError(event) {
        console.warn("YouTube player error:", event.data);
        window.dispatchEvent(new CustomEvent("tw:player-error", { detail: event.data }));
        window.playNextSong?.(true);
    }

    async function playVideo(videoId) {
        if (!videoId) return false;

        pendingVideoId = videoId;
        await ensurePlayer(videoId);

        if (!youtubePlayer || !playerReady) return false;

        youtubePlayer.loadVideoById(videoId);
        return true;
    }

    async function togglePlay() {
        await ensurePlayer();
        if (!youtubePlayer || !playerReady) return;

        const state = youtubePlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) youtubePlayer.pauseVideo();
        else youtubePlayer.playVideo();
    }

    function setVolume(value) {
        const volume = Math.max(0, Math.min(100, Number(value) || 0));
        localStorage.setItem("truckWala.volume", String(volume));
        if (youtubePlayer && playerReady) youtubePlayer.setVolume(volume);
    }

    function seekToPercent(percent) {
        if (!youtubePlayer || !playerReady) return;
        const duration = youtubePlayer.getDuration();
        if (duration > 0) youtubePlayer.seekTo(duration * (Number(percent) / 100), true);
    }

    function updatePlayButton(isPlaying) {
        const button = document.getElementById("playButton");
        if (!button) return;
        button.textContent = isPlaying ? "Ⅱ" : "▶";
        button.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
        button.classList.toggle("is-playing", isPlaying);
    }

    function startProgressTimer() {
        clearInterval(progressTimer);
        progressTimer = setInterval(() => {
            if (!youtubePlayer || !playerReady) return;

            const duration = youtubePlayer.getDuration();
            const current = youtubePlayer.getCurrentTime();
            if (!duration) return;

            const seekBar = document.getElementById("seekBar");
            const currentTime = document.getElementById("currentTime");
            const durationElement = document.getElementById("duration");

            if (seekBar) seekBar.value = (current / duration) * 100;
            if (currentTime) currentTime.textContent = formatTime(current);
            if (durationElement) durationElement.textContent = formatTime(duration);
        }, 500);
    }

    function formatTime(seconds) {
        seconds = Math.floor(Number(seconds) || 0);
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    window.RadioPlayer = {
        ensurePlayer,
        playVideo,
        togglePlay,
        setVolume,
        seekToPercent,
        get ready() { return playerReady; }
    };
})();