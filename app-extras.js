(() => {
  function clamp(value) {
    return Math.max(0, Math.min(1, value));
  }

  function currentVolume() {
    return Math.round((player?.volume ?? 1) * 100);
  }

  function setAppVolume(value) {
    if (!player) return;
    const next = clamp(value);
    player.muted = false;
    player.volume = next;
    localStorage.setItem("simple-music-volume", String(next));
    updateVolumeUi();
  }

  function updateVolumeUi() {
    const value = document.getElementById("volumeValue");
    if (value) value.textContent = `${currentVolume()}%`;

    document.querySelectorAll("[data-volume]").forEach(button => {
      const target = Number(button.dataset.volume);
      button.classList.toggle("active", Math.round(target * 100) === currentVolume());
    });
  }

  function installVolumeControls() {
    const mount = document.querySelector(".play-mode-controls");
    if (!mount || document.querySelector(".volume-controls")) return;

    const wrap = document.createElement("div");
    wrap.className = "volume-controls";
    wrap.innerHTML = `
      <button class="volume-step" type="button" data-volume-down>-</button>
      <button class="volume-preset" type="button" data-volume="0.25">25</button>
      <button class="volume-preset" type="button" data-volume="0.5">50</button>
      <button class="volume-preset" type="button" data-volume="0.75">75</button>
      <button class="volume-preset" type="button" data-volume="1">100</button>
      <button class="volume-step" type="button" data-volume-up>+</button>
      <span id="volumeValue" class="volume-value">100%</span>
    `;

    mount.insertAdjacentElement("afterend", wrap);

    wrap.querySelector("[data-volume-down]").addEventListener("click", () => setAppVolume((player?.volume ?? 1) - 0.25));
    wrap.querySelector("[data-volume-up]").addEventListener("click", () => setAppVolume((player?.volume ?? 1) + 0.25));
    wrap.querySelectorAll("[data-volume]").forEach(button => {
      button.addEventListener("click", () => setAppVolume(Number(button.dataset.volume)));
    });

    updateVolumeUi();
  }

  function installVolumeStyles() {
    if (document.getElementById("volumeControlsStyle")) return;
    const style = document.createElement("style");
    style.id = "volumeControlsStyle";
    style.textContent = `
      .volume-controls{display:grid;grid-template-columns:34px repeat(4,1fr) 34px auto;gap:6px;align-items:center;margin-top:7px}
      .volume-controls button{border:1px solid var(--line);border-radius:10px;min-height:32px;padding:0 6px;background:rgba(255,255,255,.06);color:#dbeafe;font-weight:900;font-size:12px}
      .volume-controls button.active{background:rgba(6,182,212,.22);border-color:rgba(6,182,212,.7);color:#fff}
      .volume-value{color:#cbd5e1;font-weight:900;font-size:12px;text-align:right;min-width:38px}
      @media(max-width:390px){.volume-controls{grid-template-columns:30px repeat(4,1fr) 30px auto;gap:4px}.volume-controls button{font-size:11px;min-height:30px}.volume-value{font-size:11px;min-width:34px}}
    `;
    document.head.appendChild(style);
  }

  function returnToAllSongs() {
    if (!songs.length) {
      setVoiceState("待機中", "曲がありません", "listening");
      return true;
    }

    activePlaylistId = null;
    activeQueue = songs.map(song => song.id);
    activeQueueIndex = currentId ? activeQueue.indexOf(currentId) : 0;
    if (activeQueueIndex < 0) activeQueueIndex = 0;

    if (typeof showLibraryTab === "function") showLibraryTab("songs");
    render();
    setVoiceState("待機中", "全曲一覧に戻しました", "listening");
    return true;
  }

  if (typeof executeVoiceCommand === "function") {
    const previousExecuteVoiceCommand = executeVoiceCommand;
    executeVoiceCommand = raw => {
      const command = typeof normalizeVoiceText === "function"
        ? normalizeVoiceText(raw)
        : String(raw || "").toLowerCase().normalize("NFKC").replace(/[、。,.!?！？\s]/g, "");

      if (["一覧", "全曲", "曲一覧", "全曲一覧", "全部", "全部の曲", "一覧に戻して", "全曲に戻して"].some(word => command.includes(word))) {
        return returnToAllSongs();
      }

      return previousExecuteVoiceCommand(raw);
    };
  }

  installVolumeStyles();
  installVolumeControls();

  const savedVolume = Number(localStorage.getItem("simple-music-volume"));
  if (Number.isFinite(savedVolume)) setAppVolume(savedVolume);
  if (player) player.addEventListener("volumechange", updateVolumeUi);
})();
