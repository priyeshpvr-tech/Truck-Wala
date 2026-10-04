const STORAGE = { song:"truckWala.song", volume:"truckWala.volume", favorites:"truckWala.favorites", recent:"truckWala.recent" };
let playlistData = null;
let currentIndex = Number(localStorage.getItem(STORAGE.song) || 0);
let isPlaying = false;
let loopEnabled = false;
let loadingPlaylist = false;

const fallbackPoster = "https://files.catbox.moe/gsyvnm.png";

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  restoreVolume();
  initParticles(); animateParticles();
  updateClock(); setInterval(updateClock,1000);
  syncSetupFields();
  const cached = YouTubeData.getCachedPlaylist();
  if (cached) { applyPlaylist(cached); setStatus(`CACHED · ${cached.itemCount} TRACKS`); }
  await loadConfiguredPlaylist(false);
});

function bindEvents(){
  document.getElementById("btn-playlist").onclick = openPlaylist;
  document.getElementById("btn-close-playlist").onclick = closePlaylist;
  document.getElementById("btn-setup").onclick = () => toggleSetup(true);
  document.getElementById("loadPlaylistButton").onclick = () => loadConfiguredPlaylist(true);
  document.getElementById("clearSettingsButton").onclick = clearSettings;
  document.getElementById("refreshPlaylistButton")?.addEventListener("click",()=>loadConfiguredPlaylist(true));
  document.getElementById("playlistInput").onkeydown = e => { if(e.key === "Enter") loadConfiguredPlaylist(true); };
  document.getElementById("apiKeyInput").onkeydown = e => { if(e.key === "Enter") loadConfiguredPlaylist(true); };
  document.getElementById("songSearch").oninput = renderPlaylist;
  document.getElementById("btn-play").onclick = async () => {
    const song = getCurrentSong();
    if(!song){ openPlaylist(); toggleSetup(true); showNotice("Load a YouTube playlist first."); return; }

    // The home play button is also the FIRST-PLAY button.
    // If YouTube has not loaded a video yet, togglePlay() would only
    // tell an empty player to play. Load the current playlist song first.
    if(!RadioPlayer.ready){ await RadioPlayer.ensurePlayer(); }
    if(!RadioPlayer.hasLoadedVideo){
      await playCurrentSong();
      return;
    }
    await RadioPlayer.togglePlay();
  };
  document.getElementById("btn-next").onclick = () => playNextSong(false);
  document.getElementById("btn-prev").onclick = playPreviousSong;
  document.getElementById("btn-loop").onclick = () => { loopEnabled=!loopEnabled; RadioPlayer.setLoop(loopEnabled); document.getElementById("btn-loop").classList.toggle("active",loopEnabled); };
  document.getElementById("volumeBar").oninput = e => RadioPlayer.setVolume(e.target.value);
  document.getElementById("btn-mute").onclick = () => RadioPlayer.toggleMute();
  document.getElementById("seekBar").oninput = e => RadioPlayer.seekToPercent(e.target.value);
  document.getElementById("btn-minimize").onclick = () => document.body.classList.toggle("minimized");
  document.getElementById("btn-fullscreen").onclick = toggleFullscreen;
  document.addEventListener("keydown", e => { if(e.target.matches("input,textarea,button")) return; if(e.code==="Space"){e.preventDefault();document.getElementById("btn-play").click();} else if(e.code==="ArrowRight") playNextSong(false); else if(e.code==="ArrowLeft") playPreviousSong(); else if(e.code==="Escape") closePlaylist(); });
  window.addEventListener("tw:playing",()=>{isPlaying=true;renderPlaylist();});
  window.addEventListener("tw:paused",()=>{isPlaying=false;renderPlaylist();});
  window.addEventListener("tw:ended",()=>{isPlaying=false;});
  window.addEventListener("tw:player-error",e=>handlePlayerError(e.detail));
}

async function loadConfiguredPlaylist(showErrors=true){
  if(loadingPlaylist)return;
  const input=document.getElementById("playlistInput").value.trim(), key=document.getElementById("apiKeyInput").value.trim();
  if(input) YouTubeData.saveSettings({playlistId:input}); if(key) YouTubeData.saveSettings({apiKey:key});
  const id=YouTubeData.getPlaylistId(), api=YouTubeData.getApiKey();
  if(!id||!api){setStatus("SETUP REQUIRED");if(showErrors){openPlaylist();toggleSetup(true);showNotice(!api?"Paste your YouTube Data API key first.":"Paste your YouTube playlist URL or ID first.");}return;}
  loadingPlaylist=true;setStatus("CONNECTING...");
  try{const data=await YouTubeData.fetchPlaylist(id);applyPlaylist(data);setStatus(`ONLINE · ${data.itemCount} TRACKS`);toggleSetup(false);}catch(err){console.error(err);setStatus("CONNECTION ERROR");if(showErrors||!playlistData)showNotice(formatYouTubeError(err));}finally{loadingPlaylist=false;}
}

function applyPlaylist(data){playlistData=data;window.SONGS.youtube=data.songs||[];currentIndex=Math.max(0,Math.min(currentIndex,Math.max(0,getCurrentSongs().length-1)));persistSong();renderCurrentSong();renderPlaylist();renderRecent();updatePlaylistHeader();}
function getCurrentSongs(){return playlistData?.songs||[]}
function getCurrentSong(){return getCurrentSongs()[currentIndex]||null}

function renderCurrentSong(){
  const s=getCurrentSong(),title=document.getElementById("songTitle"),artist=document.getElementById("songArtist"),poster=document.getElementById("poster");
  if(!s){title.textContent="Song Title";artist.textContent="Artist";poster.src=fallbackPoster;return;}
  title.textContent=s.title;artist.textContent=s.artist||s.channel||"YouTube";
  // Do not manufacture a YouTube thumbnail URL when the API did not
  // provide one. Deleted/private videos can return thumbnail 404s.
  setImageWithFallback(poster, s.thumbnail, fallbackPoster);
}

function renderPlaylist(){
  const box=document.getElementById("playlist-items"),empty=document.getElementById("playlistEmpty"),q=document.getElementById("songSearch").value.trim().toLowerCase(),songs=getCurrentSongs();
  box.innerHTML="";
  const filtered=songs.map((song,index)=>({song,index})).filter(x=>!q||x.song.title.toLowerCase().includes(q)||(x.song.artist||"").toLowerCase().includes(q));
  document.getElementById("songCount").textContent=`${songs.length} song${songs.length===1?"":"s"}`;
  empty.style.display=filtered.length?"none":"block";
  if(!songs.length)return;
  if(!filtered.length){empty.textContent="No song found.";return;}
  empty.textContent="No playlist loaded.";
  filtered.forEach(({song,index})=>{
    const item=document.createElement("button");item.type="button";item.className=`playlist-item ${index===currentIndex?"active":""}`;
    item.innerHTML=`<span class="playlist-item-number">${String(index+1).padStart(2,"0")}</span><img src="${escapeAttr(song.thumbnail || fallbackPoster)}" alt=""><span class="playlist-item-info"><span class="playlist-item-title">${escapeHtml(song.title)}</span><span class="playlist-item-artist">${escapeHtml(song.artist||song.channel||"YouTube")}</span></span>`;
    const thumb=item.querySelector("img");
    setImageWithFallback(thumb, song.thumbnail, fallbackPoster);
    item.onclick=()=>{currentIndex=index;persistSong();renderCurrentSong();renderPlaylist();playCurrentSong();};box.appendChild(item);
  });
}

async function playCurrentSong(){const s=getCurrentSong();if(!s)return;renderCurrentSong();const ok=await RadioPlayer.playVideo(s.videoId);if(ok){isPlaying=true;addRecent(s);renderPlaylist();}}
function playNextSong(auto=false){const songs=getCurrentSongs();if(!songs.length)return;currentIndex=(currentIndex+1)%songs.length;persistSong();renderCurrentSong();renderPlaylist();playCurrentSong();}
function playPreviousSong(){const songs=getCurrentSongs();if(!songs.length)return;currentIndex=(currentIndex-1+songs.length)%songs.length;persistSong();renderCurrentSong();renderPlaylist();playCurrentSong();}
function addRecent(song){let list=getRecent().filter(x=>x.id!==song.id);list.unshift({id:song.id,title:song.title,artist:song.artist,playlistId:playlistData?.id||""});localStorage.setItem(STORAGE.recent,JSON.stringify(list.slice(0,12)));}
function getRecent(){try{return JSON.parse(localStorage.getItem(STORAGE.recent)||"[]")}catch{return[]}}
function renderRecent(){}
function persistSong(){localStorage.setItem(STORAGE.song,String(currentIndex))}
function restoreVolume(){const v=Math.max(0,Math.min(100,Number(localStorage.getItem(STORAGE.volume)??80)));document.getElementById("volumeBar").value=v;RadioPlayer.updateVolumeIcon(v)}
function syncSetupFields(){document.getElementById("playlistInput").value=YouTubeData.getPlaylistId();document.getElementById("apiKeyInput").value=YouTubeData.getApiKey()}
function openPlaylist(){const o=document.getElementById("playlist-overlay");o.classList.add("active");o.setAttribute("aria-hidden","false");setTimeout(()=>document.getElementById("songSearch").focus(),50)}
function closePlaylist(){const o=document.getElementById("playlist-overlay");o.classList.remove("active");o.setAttribute("aria-hidden","true")}
function toggleSetup(force){const p=document.getElementById("setupPanel");p.hidden=force===undefined?!p.hidden:!force;if(!p.hidden){document.getElementById("playlistInput").focus();}}
function clearSettings(){YouTubeData.clearSettings();playlistData=null;window.SONGS.youtube=[];currentIndex=0;persistSong();syncSetupFields();renderCurrentSong();renderPlaylist();setStatus("SETUP REQUIRED");toggleSetup(true)}
function setStatus(text){document.getElementById("playlistStatus").textContent=text}
function updatePlaylistHeader(){document.getElementById("playlistSubheading").textContent=playlistData?`${playlistData.title} · ${playlistData.channel||"YouTube"}`:"YouTube Playlist";setStatus(playlistData?`ONLINE · ${playlistData.itemCount} TRACKS`:"SETUP REQUIRED")}
function handlePlayerError(code){const map={2:"YouTube rejected this video ID.",5:"The embedded player could not load this video.",100:"This video was removed or is unavailable.",101:"This video does not allow embedded playback.",150:"This video does not allow embedded playback."};showNotice(map[code]||"YouTube could not play this track.")}
function formatYouTubeError(e){const map={MISSING_API_KEY:"YouTube Data API key is missing.",MISSING_PLAYLIST_ID:"Playlist ID is missing.",PLAYLIST_NOT_FOUND:"Playlist not found or inaccessible.",quotaExceeded:"YouTube API quota was exceeded.",keyInvalid:"That API key is invalid.",forbidden:"YouTube rejected the request. Check API/key restrictions."};return map[e?.message]||e?.details||"Could not load the YouTube playlist."}
function showNotice(msg){const n=document.getElementById("playerNotice");n.textContent=msg;n.hidden=false;clearTimeout(showNotice.timer);showNotice.timer=setTimeout(()=>n.hidden=true,5000)}
function updateClock(){const d=new Date();let h=d.getHours();const m=String(d.getMinutes()).padStart(2,"0"),ap=h>=12?"pm":"am";h=h%12||12;document.getElementById("clock").textContent=`${h}:${m} ${ap}`}
async function toggleFullscreen(){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{} }
function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function escapeAttr(v){return escapeHtml(v)}
function setImageWithFallback(img, src, fallback){
  if(!img)return;
  img.onerror=()=>{
    if(img.dataset.fallbackApplied)return;
    img.dataset.fallbackApplied="1";
    img.src=fallback;
  };
  img.src=src || fallback;
}

let particles=[];let canvas,ctx;
function initParticles(){canvas=document.getElementById("particles-canvas");ctx=canvas.getContext("2d");resizeParticles();window.addEventListener("resize",resizeParticles)}
function resizeParticles(){if(!canvas)return;canvas.width=innerWidth;canvas.height=innerHeight;particles=Array.from({length:80},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2+.5,vx:(Math.random()-.5)*.5,vy:(Math.random()-.5)*.5,a:Math.random()*.5+.1}))}
function animateParticles(){if(!ctx)return;requestAnimationFrame(animateParticles);ctx.clearRect(0,0,canvas.width,canvas.height);for(const p of particles){p.x+=p.vx;p.y+=p.vy;if(p.x<0)p.x=canvas.width;if(p.x>canvas.width)p.x=0;if(p.y<0)p.y=canvas.height;if(p.y>canvas.height)p.y=0;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(255,255,255,${p.a})`;ctx.fill()}}

window.playNextSong=playNextSong;
