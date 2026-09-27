/* ============ 数据（从 /api/music 读本地缓存的全部歌单） ============ */
let PLAYLISTS = []; // [{ uid, nickname, ts, count, list }]
let SONGS = [];     // 当前歌单的歌曲 { name, artist, dur, cover, play }

/* ============ 状态 ============ */
let playingIndex = -1;
let isPlaying = false;
let activePlaylistIndex = -1;
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
  try {
    const res = await fetch("/api/music");
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "接口错误");
    PLAYLISTS = data.playlists || [];
    if (PLAYLISTS.length > 0) {
      if (activePlaylistIndex < 0 || activePlaylistIndex >= PLAYLISTS.length) {
        activePlaylistIndex = 0;
      }
      selectPlaylist(activePlaylistIndex);
    } else {
      activePlaylistIndex = -1;
      SONGS = [];
      renderPlaylists();
      renderSongs();
      updatePlayer(null);
    }
  } catch (e) {
    head.querySelector("h3").textContent = "🎵 加载失败：" + e.message;
  }
}

function selectPlaylist(index) {
  activePlaylistIndex = index;
  const p = PLAYLISTS[index];
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
  renderPlaylists();
  renderSongs();
  updatePlayer(null);
}

/* ============ 渲染 ============ */
function renderPlaylists() {
  const grid = document.getElementById("myPlaylistGrid");
  if (PLAYLISTS.length === 0) {
    grid.innerHTML = `<div class="empty-tip">暂无歌单，点「+ 新建歌单」粘贴 cookie 添加</div>`;
    return;
  }
  grid.innerHTML = PLAYLISTS.map(
    (p, i) => `
    <div class="playlist-card ${i === activePlaylistIndex ? 'active' : ''}" data-index="${i}">
      <div class="playlist-title">${esc(p.nickname || p.uid)}</div>
      <span class="playlist-count">${p.count} 首</span>
    </div>`
  ).join("");
}

function renderSongs() {
  const list = document.getElementById("songList");
  const head = document.getElementById("songPanelHead");
  const p = PLAYLISTS[activePlaylistIndex];

  if (!p) {
    head.querySelector("h3").textContent = "🎵 暂无歌单";
    list.innerHTML = "";
    return;
  }

  head.querySelector("h3").textContent = `🎵 ${p.nickname || p.uid}`;

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
document.getElementById("myPlaylistGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".playlist-card");
  if (!card) return;
  selectPlaylist(Number(card.dataset.index));
});

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
/* 更新：按当前歌单 uid 重新拉取 */
document.getElementById("refreshBtn").addEventListener("click", async () => {
  const p = PLAYLISTS[activePlaylistIndex];
  if (!p) return;
  const head = document.getElementById("songPanelHead");
  head.querySelector("h3").textContent = "🎵 更新中...";
  try {
    const res = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: p.uid }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "更新失败");
    await loadMusic();
    // 更新后仍停留在该歌单
    const idx = PLAYLISTS.findIndex((x) => x.uid === p.uid);
    if (idx >= 0) selectPlaylist(idx);
    showToast(`✅ 更新成功，共 ${data.count} 首`, "success");
  } catch (e) {
    head.querySelector("h3").textContent = "🎵 " + (p.nickname || p.uid);
    showToast("❌ " + e.message, "error");
    if (/cookie/i.test(e.message)) openCookieModal(p.uid, p.nickname);
  }
});

/* 全部播放：从第一首开始 */
document.getElementById("playAllBtn").addEventListener("click", () => {
  if (SONGS.length === 0) {
    showToast("当前歌单暂无歌曲", "error");
    return;
  }
  playSong(0);
});

/* 删除当前歌单（同时删除本地缓存，cookie 保留） */
document.getElementById("deleteBtn").addEventListener("click", async () => {
  const p = PLAYLISTS[activePlaylistIndex];
  if (!p) return;
  if (!confirm(`确定删除歌单「${p.nickname || p.uid}」吗？仅删除本地缓存，cookie 会保留。`)) return;
  try {
    const res = await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: p.uid }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "删除失败");
    showToast("🗑 歌单已删除", "success");
    await loadMusic();
  } catch (e) {
    showToast("❌ " + e.message, "error");
  }
});

/* ============ Cookie 弹窗（新建歌单 / 补充 cookie 共用） ============ */
const cookieOverlay = document.getElementById("cookieOverlay");
const cookieInput = document.getElementById("cookieInput");
const cookieTip = document.getElementById("cookieTip");
let cookieMode = "create"; // 'create' 新建歌单 | 'fix' 补充指定 uid
let cookieUid = "";

function openCookieModal(uid = "", nickname = "") {
  cookieUid = uid;
  cookieMode = uid ? "fix" : "create";
  document.getElementById("cookieModalTitle").textContent =
    cookieMode === "fix" ? `🍪 更新「${nickname}」的 Cookie` : "🍪 粘贴 Cookie 新建歌单";
  cookieTip.textContent = cookieMode === "fix"
    ? "该用户的 cookie 缺失或已失效，请从浏览器重新复制后粘贴到下面"
    : "从浏览器 F12 复制抖音 cookie 粘贴到下面，保存后会自动拉取该用户的收藏音乐";
  cookieInput.value = "";
  cookieOverlay.classList.add("active");
  cookieInput.focus();
}

function closeCookieModal() {
  cookieOverlay.classList.remove("active");
}

document.getElementById("newPlaylistBtn").addEventListener("click", () => openCookieModal());
document.getElementById("cookieClose").addEventListener("click", closeCookieModal);
document.getElementById("cookieCancel").addEventListener("click", closeCookieModal);
cookieOverlay.addEventListener("click", (e) => {
  if (e.target === cookieOverlay) closeCookieModal();
});

document.getElementById("cookieConfirm").addEventListener("click", async () => {
  const raw = cookieInput.value.trim();
  if (!raw) { cookieInput.focus(); return; }
  const btn = document.getElementById("cookieConfirm");
  btn.disabled = true;
  btn.textContent = "校验中...";
  try {
    // 1. 保存 cookie
    const res = await fetch("/api/cookie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cookie: raw, uid: cookieUid || undefined }),
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg || "cookie 校验失败");
    // 2. 拉取该用户收藏
    btn.textContent = "拉取中...";
    const r2 = await fetch("/api/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: data.uid }),
    });
    const d2 = await r2.json();
    if (d2.code !== 0) throw new Error(d2.msg || "拉取失败");
    closeCookieModal();
    await loadMusic();
    const idx = PLAYLISTS.findIndex((x) => x.uid === data.uid);
    if (idx >= 0) selectPlaylist(idx);
    showToast(`✅ 「${d2.nickname}」更新成功，共 ${d2.count} 首`, "success");
  } catch (e) {
    cookieTip.textContent = "⚠️ " + e.message;
    showToast("❌ " + e.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "确定";
  }
});

/* ============ 初始化 ============ */
loadMusic();
