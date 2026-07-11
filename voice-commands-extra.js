(() => {
  if (typeof executeVoiceCommand !== "function") return;

  const originalExecuteVoiceCommand = executeVoiceCommand;

  function normalized(text) {
    if (typeof normalizeVoiceText === "function") return normalizeVoiceText(text);
    return String(text || "").toLowerCase().normalize("NFKC").replace(/[、。,.!?！？\s]/g, "");
  }

  function cleanRequest(text) {
    return normalized(text)
      .replace(/(を)?(再生して|再生|流して|かけて|聞かせて|聴かせて)$/g, "")
      .replace(/(お願い|おねがい|して|ください|曲|音楽|プレイリスト|再生リスト)/g, "")
      .trim();
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

  function findLooseMatch(items, getName, request) {
    const cleaned = cleanRequest(request);
    if (cleaned.length < 2) return null;

    let best = null;
    let bestScore = 0;

    for (const item of items) {
      const name = normalized(getName(item));
      if (!name) continue;

      let score = 0;
      if (name === cleaned) score = 100;
      else if (name.includes(cleaned)) score = 80 + cleaned.length;
      else if (cleaned.includes(name)) score = 70 + name.length;
      else {
        const chunks = cleaned.split(/[-_ー・]/).filter(part => part.length >= 2);
        for (const chunk of chunks) {
          if (name.includes(chunk)) score += 12 + chunk.length;
        }

        for (let size = Math.min(cleaned.length, 6); size >= 2; size--) {
          for (let i = 0; i <= cleaned.length - size; i++) {
            if (name.includes(cleaned.slice(i, i + size))) {
              score += size;
              break;
            }
          }
        }
      }

      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    return bestScore >= 8 ? best : null;
  }

  function playLooseNamedItem(raw) {
    const playlist = findLooseMatch(playlists, item => item.name, raw);
    if (playlist) {
      playPlaylist(playlist.id);
      setVoiceState("待機中", `認識：${raw} / リスト：${playlist.name}`, "listening");
      return true;
    }

    const song = findLooseMatch(songs, item => item.title, raw);
    if (song) {
      activePlaylistId = null;
      activeQueue = songs.map(item => item.id);
      playSong(song.id, activeQueue);
      setVoiceState("待機中", `認識：${raw} / 再生：${song.title}`, "listening");
      return true;
    }

    return false;
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

    if (playLooseNamedItem(raw)) return true;

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
