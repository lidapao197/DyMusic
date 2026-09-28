/* ============ 数据（从 /api/music 读本地缓存的全部歌单） ============ */
let PLAYLISTS = []; // [{ uid, nickname, ts, count, list }]
let SONGS = [];     // 当前歌单的歌曲 { name, artist, dur, cover, play }

/* ============ 状态 ============ */
let playingIndex = -1;
let isPlaying = false;
let playMode = "sequence"; // sequence 顺序播放 | shuffle 随机播放

const audio = new Audio();
audio.preload = "auto";

/* ============ 工具 ============ */
function fmtDur(sec) {
  sec = Number(sec) || 0;
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ============ 顶部提示 Toast ============ */
let toastTimer = null;
function showToast(msg, type = "") { // type: 'success' | 'error' | ''
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), type === "error" ? 4000 : 3000);
}

/* ============ 数据加载 ============ */
async function loadMusic() {
  const head = document.getElementById("songPanelHead");
  head.querySelector("h3").textContent = "🎵 加载中...";
  let data = null;
  try {
    const res = await fetch("/api/music");
    data = await res.json();
  } catch { /* 本地服务不可用（如 CF Pages 静态部署） */ }
  if (!data || data.code !== 0 || !(data.playlists || []).length) {
    data = await loadStaticPlaylist();
  }
  try {
    if (!data) throw new Error("无数据");
    PLAYLISTS = data.playlists || [];
    if (PLAYLISTS.length > 0) {
      selectPlaylist();
    } else {
      SONGS = [];
      renderSongs();
      updatePlayer(null);
    }
  } catch (e) {
    head.querySelector("h3").textContent = "🎵 加载失败：" + e.message;
  }
}

/* 静态回退：直接读 public/data/music.json（与后端读写同一份文件，不含 cookie） */
async function loadStaticPlaylist() {
  try {
    const res = await fetch("data/music.json");
    const snap = await res.json();
    if (!snap || !Array.isArray(snap.data) || snap.data.length === 0) return null;
    // 静态模式下隐藏需要本地后端的按钮
    for (const id of ["newPlaylistBtn", "refreshBtn"]) {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = "none";
    }
    return {
      playlists: [{
        uid: snap.uid, nickname: snap.nickname, ts: snap.ts,
        count: snap.data.length, list: snap.data,
      }],
    };
  } catch {
    return null;
  }
}

/* 单歌单模式：数据里有多个时，显示最近更新的一份 */
function activePlaylist() {
  if (PLAYLISTS.length === 0) return null;
  return PLAYLISTS.reduce((a, b) => ((b.ts || 0) > (a.ts || 0) ? b : a));
}

function selectPlaylist() {
  const p = activePlaylist();
  SONGS = (p ? p.list : []).map((m) => ({
    name: m.title,
    artist: m.author,
    dur: m.duration,
    cover: m.cover,
    play: m.play,
  }));
  playingIndex = -1;
  isPlaying = false;
  audio.pause();
  renderSongs();
  updatePlayer(null);
}

/* ============ 渲染 ============ */
function fmtTime(ts) {
  const d = new Date(Number(ts) * 1000);
  if (isNaN(d.getTime())) return "未知";
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function renderSongs() {
  const list = document.getElementById("songList");
  const head = document.getElementById("songPanelHead");
  const meta = document.getElementById("playlistMeta");
  const p = activePlaylist();

  if (!p) {
    head.querySelector("h3").textContent = "🎵 暂无歌单";
    meta.textContent = "";
    list.innerHTML = "";
    return;
  }

  head.querySelector("h3").textContent = `🎵 ${p.nickname || p.uid || "歌单"}`;
  meta.textContent = `${p.count} 首 · 更新于 ${fmtTime(p.ts)}`;

  if (SONGS.length === 0) {
    list.innerHTML = `<div class="empty-tip">暂无歌曲</div>`;
    return;
  }

  list.innerHTML = SONGS
    .map(
      (s, i) => `
    <li class="song-item ${i === playingIndex ? "playing" : ""}" data-index="${i}">
      <span class="song-rank">${i + 1}</span>
      <div class="song-cover" style="background:${s.cover ? `center/cover url('${s.cover}')` : 'linear-gradient(135deg,#2a2a33,#1a1a20)'}">${s.cover ? "" : (i === playingIndex && isPlaying ? "🔊" : "🎵")}</div>
      <div class="song-info">
        <div class="song-name">${esc(s.name)}</div>
        <div class="song-artist">${esc(s.artist)}</div>
      </div>
      <span class="song-dur">${fmtDur(s.dur)}</span>
      <button class="song-play" title="播放">${i === playingIndex && isPlaying ? "⏸" : "▶"}</button>
    </li>`
    )
    .join("");
}

/* ============ 播放条交互 ============ */
function updatePlayer(song) {
  document.getElementById("playerTitle").textContent = song ? song.name : "未在播放";
  document.getElementById("playerArtist").textContent = song ? song.artist : "选择一首歌开始吧";
  const cover = document.getElementById("playerCover");
  if (song && song.cover) {
    cover.style.background = `center/cover url('${song.cover}')`;
    cover.textContent = "";
  } else {
    cover.style.background = "";
    cover.textContent = isPlaying ? "🔊" : "♫";
  }
  document.getElementById("playToggle").textContent = isPlaying ? "⏸" : "▶";
}

function playSong(index) {
  const s = SONGS[index];
  if (!s) return;
  if (!s.play) {
    document.getElementById("playerArtist").textContent = "该歌曲无播放地址";
    return;
  }
  playingIndex = index;
  isPlaying = true;
  audio.src = s.play;
  audio.play().catch(() => { isPlaying = false; renderSongs(); updatePlayer(s); });
  renderSongs();
  updatePlayer(s);
}

function togglePlay() {
  if (playingIndex < 0) {
    playSong(0);
    return;
  }
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
  } else {
    audio.play().catch(() => {});
    isPlaying = true;
  }
  renderSongs();
  updatePlayer(SONGS[playingIndex]);
}

function step(dir) {
  if (SONGS.length === 0) return;
  if (playingIndex < 0) return playSong(0);
  if (playMode === "shuffle") {
    if (SONGS.length === 1) return playSong(0);
    let idx;
    do { idx = Math.floor(Math.random() * SONGS.length); } while (idx === playingIndex);
    return playSong(idx);
  }
  const n = SONGS.length;
  playSong((playingIndex + dir + n) % n);
}

/* 播放模式切换：顺序 ↔ 随机 */
document.getElementById("modeBtn").addEventListener("click", () => {
  const btn = document.getElementById("modeBtn");
  if (playMode === "sequence") {
    playMode = "shuffle";
    btn.textContent = "🔀";
    btn.title = "随机播放";
    btn.classList.add("active");
    showToast("已切换为随机播放");
  } else {
    playMode = "sequence";
    btn.textContent = "🔁";
    btn.title = "顺序播放";
    btn.classList.remove("active");
    showToast("已切换为顺序播放");
  }
});

/* 真实进度条 */
audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  document.getElementById("progressBar").style.width = (audio.currentTime / audio.duration * 100) + "%";
});
audio.addEventListener("ended", () => step(1));
audio.addEventListener("error", () => {
  isPlaying = false;
  renderSongs();
  updatePlayer(SONGS[playingIndex]);
});

/* 点击进度条跳转 */
document.querySelector(".progress").addEventListener("click", (e) => {
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
});

/* ============ 事件绑定 ============ */
document.getElementById("songList").addEventListener("click", (e) => {
  const item = e.target.closest(".song-item");
  if (!item) return;
  const idx = Number(item.dataset.index);
  if (idx === playingIndex) {
    togglePlay();
  } else {
    playSong(idx);
  }
});

document.getElementById("playToggle").addEventListener("click", togglePlay);
document.getElementById("prevBtn").addEventListener("click", () => step(-1));
document.getElementById("nextBtn").addEventListener("click", () => step(1));

/* ============ 音量控制 ============ */
const volumeBar = document.getElementById("volumeBar");
const volumeIcon = document.getElementById("volumeIcon");

function setVolume(v) { // v: 0~100
  audio.volume = v / 100;
  volumeBar.value = v;
  volumeIcon.textContent = v == 0 ? "🔇" : v < 50 ? "🔉" : "🔊";
  localStorage.setItem("volume", v);
}
setVolume(localStorage.getItem("volume") ?? 80);

volumeBar.addEventListener("input", () => setVolume(Number(volumeBar.value)));
volumeIcon.addEventListener("click", () => {
  if (audio.volume > 0) {
    volumeBar.dataset.prev = volumeBar.value;
    setVolume(0);
  } else {
    setVolume(Number(volumeBar.dataset.prev || 80));
  }
});

/* ============ 歌单操作 ============ */
/* 更新：有歌单时直接拉取；没有歌单时先弹窗粘贴 cookie（保存到 config/cookies.txt）再拉取 */
async function doRefresh() {
  if (PLAYLISTS.length === 0) {
    openCookieModal();
    return;
  }
  await doFetchMusic();
}

async function doFetchMusic(cookie) {
  const head = document.getElementById("songPanelHead");
  const p = activePlaylist();
  head.querySelector("h3").textContent = "🎵 更新中...";
  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cookie ? { cookie } : {}),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "更新失败");
    await loadMusic();
    showToast(`✅ 更新成功，共 ${data.count} 首`, "success");
  } catch (e) {
    head.querySelector("h3").textContent = "🎵 " + (p ? (p.nickname || p.uid || "歌单") : "暂无歌单");
    showToast("❌ " + e.message, "error");
  }
}

/* cookie 弹窗 */
function openCookieModal() {
  document.getElementById("cookieInput").value = "";
  document.getElementById("cookieModal").hidden = false;
  document.getElementById("cookieInput").focus();
}
function closeCookieModal() {
  document.getElementById("cookieModal").hidden = true;
}
document.getElementById("cookieCancel").addEventListener("click", closeCookieModal);
document.getElementById("cookieSave").addEventListener("click", async () => {
  const cookie = document.getElementById("cookieInput").value.trim();
  if (!cookie) {
    showToast("❌ 请先粘贴 cookie 内容", "error");
    return;
  }
  closeCookieModal();
  await doFetchMusic(cookie);
});

document.getElementById("refreshBtn").addEventListener("click", doRefresh);

/* 全部播放：从第一首开始 */
document.getElementById("playAllBtn").addEventListener("click", () => {
  if (SONGS.length === 0) {
    showToast("当前歌单暂无歌曲", "error");
    return;
  }
  playSong(0);
});

/* ============ 初始化 ============ */
loadMusic();
