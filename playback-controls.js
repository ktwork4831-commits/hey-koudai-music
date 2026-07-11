(() => {
  const shuffleBtn = document.getElementById("shuffleBtn");
  const loopBtn = document.getElementById("loopBtn");
  if (!shuffleBtn || !loopBtn || !player) return;

  const savedShuffle = localStorage.getItem("simple-music-shuffle") === "true";
  const savedLoop = localStorage.getItem("simple-music-loop-one") === "true";

  shuffleMode = savedShuffle;
  player.loop = savedLoop;

  function updateButtons() {
    shuffleBtn.classList.toggle("active", Boolean(shuffleMode));
    shuffleBtn.setAttribute("aria-pressed", String(Boolean(shuffleMode)));
    shuffleBtn.textContent = shuffleMode ? "🔀 シャッフル ON" : "🔀 シャッフル";

    loopBtn.classList.toggle("active", player.loop);
    loopBtn.setAttribute("aria-pressed", String(player.loop));
    loopBtn.textContent = player.loop ? "🔁 1曲ループ ON" : "🔁 1曲ループ";
  }

  shuffleBtn.addEventListener("click", () => {
    shuffleMode = !shuffleMode;
    localStorage.setItem("simple-music-shuffle", String(shuffleMode));
    updateButtons();
  });

  loopBtn.addEventListener("click", () => {
    player.loop = !player.loop;
    localStorage.setItem("simple-music-loop-one", String(player.loop));
    updateButtons();
  });

  // 音声操作でシャッフル状態が変わった場合も表示を同期する。
  window.setInterval(updateButtons, 800);
  updateButtons();
})();
