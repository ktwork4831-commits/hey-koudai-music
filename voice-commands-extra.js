(() => {
  if (typeof executeVoiceCommand !== "function") return;

  const originalExecuteVoiceCommand = executeVoiceCommand;

  function normalized(text) {
    if (typeof normalizeVoiceText === "function") return normalizeVoiceText(text);
    return String(text || "").toLowerCase().normalize("NFKC").replace(/[、。,.!?！？\s]/g, "");
  }

  function keepMusicVolume() {
    if (!player) return;
    player.muted = false;
    player.volume = 1;
  }

  function stopDrivingModeByVoice() {
    voiceModeEnabled = false;
    if (recognitionRunning && recognition) recognition.stop();
    voiceStartBtn.disabled = false;
    voiceStopBtn.disabled = true;
    setVoiceState("停止中", "運転モードを停止しました");
  }

  function setRandomPlayback(enabled) {
    shuffleMode = enabled;
    localStorage.setItem("simple-music-shuffle", String(enabled));
  }

  executeVoiceCommand = raw => {
    keepMusicVolume();
    const command = normalized(raw);

    if (
      command.includes("運転モード停止") ||
      command.includes("運転モードを停止") ||
      command.includes("音声モード停止") ||
      command.includes("音声停止") ||
      command.includes("マイク停止")
    ) {
      stopDrivingModeByVoice();
      return true;
    }

    if (
      command.includes("ランダム解除") ||
      command.includes("ランダムやめて") ||
      command.includes("ランダム停止")
    ) {
      setRandomPlayback(false);
      setVoiceState("待機中", "ランダム再生を解除しました", "listening");
      return true;
    }

    if (command.includes("ランダム") || command.includes("シャッフル")) {
      setRandomPlayback(true);
      nextSong();
      setVoiceState("待機中", "ランダム再生", "listening");
      return true;
    }

    return originalExecuteVoiceCommand(raw);
  };

  if (voiceStartBtn) voiceStartBtn.addEventListener("click", keepMusicVolume);
  if (player) {
    player.addEventListener("play", keepMusicVolume);
    player.addEventListener("volumechange", () => {
      if (voiceModeEnabled && player.volume < 1) player.volume = 1;
    });
  }
})();
