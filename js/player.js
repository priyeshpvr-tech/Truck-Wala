(() => {
  let player = null;
  let ready = false;
  let progressTimer = null;
  let currentVideoId = "";
  let muted = false;
  let looping = false;

  const apiReady = new Promise(resolve => {
    if (window.YT?.Player) return resolve();
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
  });

  async function ensurePlayer() {
    await apiReady;
    if (player) return player;
    player = new YT.Player("youtube-player", {
      width: "1", height: "1", videoId: "",
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, iv_load_policy: 3, modestbranding: 1, origin: window.location.origin },
      events: { onReady, onStateChange, onError }
    });
    return player;
  }

  function onReady() {
    ready = true;
    const volume = Number(localStorage.getItem("truckWala.volume") ?? 80);
    player.setVolume(Math.max(0, Math.min(100, volume)));
    startProgressTimer();

    // If a song was selected before the YouTube iframe finished loading,
    // consume that request now instead of silently losing the first click.
    const pendingVideo = window.__truckWalaPendingVideo;
    if (pendingVideo) {
      delete window.__truckWalaPendingVideo;
      currentVideoId = pendingVideo;
      player.loadVideoById(pendingVideo);
    }

    window.dispatchEvent(new CustomEvent("tw:player-ready"));
  }

  function onStateChange(event) {
    if (!window.YT?.PlayerState) return;
    if (event.data === YT.PlayerState.PLAYING) {
      document.getElementById("player-container")?.classList.add("is-playing");
      document.getElementById("btn-play")?.classList.add("playing");
      window.dispatchEvent(new CustomEvent("tw:playing"));
    } else if (event.data === YT.PlayerState.PAUSED) {
      document.getElementById("player-container")?.classList.remove("is-playing");
      document.getElementById("btn-play")?.classList.remove("playing");
      window.dispatchEvent(new CustomEvent("tw:paused"));
    } else if (event.data === YT.PlayerState.ENDED) {
      document.getElementById("player-container")?.classList.remove("is-playing");
      document.getElementById("btn-play")?.classList.remove("playing");
      if (looping) {
        player.seekTo(0, true);
        player.playVideo();
      } else {
        window.dispatchEvent(new CustomEvent("tw:ended"));
        window.playNextSong?.(true);
      }
    }
  }

  function onError(event) {
    console.warn("YouTube player error:", event.data);
    document.getElementById("player-container")?.classList.remove("is-playing");
    document.getElementById("btn-play")?.classList.remove("playing");
    // IMPORTANT: an error does NOT advance the playlist.
    window.dispatchEvent(new CustomEvent("tw:player-error", { detail: event.data }));
  }

  async function playVideo(videoId) {
    if (!videoId) return false;
    currentVideoId = videoId;
    const p = await ensurePlayer();
    if (!ready) {
      window.__truckWalaPendingVideo = videoId;
      return true;
    }
    p.loadVideoById(videoId);
    return true;
  }

  async function togglePlay() {
    const p = await ensurePlayer();
    if (!ready) return false;
    const state = p.getPlayerState();
    if (state === YT.PlayerState.PLAYING) p.pauseVideo();
    else p.playVideo();
    return true;
  }

  function setVolume(value) {
    const volume = Math.max(0, Math.min(100, Number(value) || 0));
    localStorage.setItem("truckWala.volume", String(volume));
    if (player && ready) { player.setVolume(volume); if (volume > 0 && muted) { player.unMute(); muted = false; } }
    updateVolumeIcon(volume);
  }

  function toggleMute() {
    if (!player || !ready) return;
    if (player.isMuted()) { player.unMute(); muted = false; const v = player.getVolume(); document.getElementById("volumeBar").value = v; updateVolumeIcon(v); }
    else { player.mute(); muted = true; document.getElementById("volumeBar").value = 0; updateVolumeIcon(0); }
  }

  function seekToPercent(percent) {
    if (!player || !ready) return;
    const duration = player.getDuration() || 0;
    if (duration > 0) player.seekTo(duration * (Number(percent) / 100), true);
  }

  function setLoop(value) { looping = value; }

  function updateVolumeIcon(volume) {
    const icon = document.getElementById("volume-icon"); if (!icon) return;
    const path = volume <= 0 ? "M16.5 12l4 4-1.5 1.5-4-4-4 4L9.5 16l4-4-4-4L11 6.5l4 4 4-4L20.5 8l-4 4z" : volume < 50 ? "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" : "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
    icon.innerHTML = `<path d="${path}"/>`;
  }

  function startProgressTimer() {
    clearInterval(progressTimer);
    progressTimer = setInterval(() => {
      if (!player || !ready) return;
      const duration = player.getDuration() || 0, current = player.getCurrentTime() || 0;
      const seek = document.getElementById("seekBar"), cur = document.getElementById("currentTime"), dur = document.getElementById("duration");
      if (duration > 0) { if (document.activeElement !== seek) seek.value = current / duration * 100; cur.textContent = formatTime(current); dur.textContent = formatTime(duration); }
    }, 500);
  }

  function formatTime(seconds) { seconds = Math.floor(Number(seconds) || 0); return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`; }

  window.RadioPlayer = { ensurePlayer, playVideo, togglePlay, setVolume, toggleMute, seekToPercent, setLoop, updateVolumeIcon, get ready(){return ready;}, get videoId(){return currentVideoId;} };
})();
