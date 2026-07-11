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
  }

  function setPlayerVolume(value) {
    if (!player) return;
    const next = Math.max(0, Math.min(1, value));
    player.muted = false;
    player.volume = next;
    localStorage.setItem("simple-music-volume", String(next));
  }

  function announceVolume() {
    if (!player) return;
    setVoiceState("待機中", `音量：${Math.round(player.volume * 100)}%`, "listening");
  }

  function changeVolume(delta) {
    if (!player) return true;
    setPlayerVolume(player.volume + delta);
    announceVolume();
    return true;
  }

  function stopDrivingModeByVoice() {
    voiceModeEnabled = false;
    if (recognitionRunning && recognition) recognition.stop();
    voiceStartBtn.disabled = false;
    voiceStopBtn.disabled = true;
    setVoiceState("停止中", "運転モードを停止しました");
  }

  function startDrivingModeByVoice() {
    voiceModeEnabled = true;
    voiceStartBtn.disabled = true;
    voiceStopBtn.disabled = false;
    primeFirstSongForVoice();
    startRecognition();
    setVoiceState("待機中", "運転モードを開始しました", "listening");
  }

  function prepareSongSource(id) {
    const song = songs.find(item => item.id === id);
    if (!song) return false;

    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = URL.createObjectURL(song.file);
    player.src = currentObjectUrl;
    nowTitle.textContent = song.title;
    currentId = song.id;
    activeQueue = activeQueue.length ? activeQueue : songs.map(item => item.id);
    activeQueueIndex = activeQueue.indexOf(song.id);
    if (activeQueueIndex < 0) activeQueueIndex = 0;
    render();
    return true;
  }

  function primeFirstSongForVoice() {
    if (!player || player.src || currentId || !songs.length) return;
    const firstId = songs[0].id;
    prepareSongSource(firstId);

    const wasMuted = player.muted;
    player.muted = true;
    player.play()
      .then(() => {
        player.pause();
        player.currentTime = 0;
        player.muted = wasMuted;
      })
      .catch(() => {
        player.muted = wasMuted;
      });
  }

  function resumePlayback() {
    keepMusicVolume();

    if (!player.src) {
      const queue = activeQueue.length ? activeQueue : songs.map(item => item.id);
      const nextId = queue[activeQueueIndex >= 0 ? activeQueueIndex : 0] || songs[0]?.id;
      if (nextId) prepareSongSource(nextId);
    }

    if (player.src) {
      player.play()
        .then(() => setVoiceState("待機中", "再生しました", "listening"))
        .catch(() => setVoiceState("待機中", "画面の再生ボタンを一度押してください", "listening"));
      return true;
    }

    setVoiceState("待機中", "再生できる曲がありません", "listening");
    return true;
  }

  function setRandomPlayback(enabled) {
    shuffleMode = enabled;
    localStorage.setItem("simple-music-shuffle", String(enabled));
  }

  function setLoopPlayback(enabled) {
    if (!player) return;
    player.loop = enabled;
    localStorage.setItem("simple-music-loop-one", String(enabled));
    setVoiceState("待機中", enabled ? "ループ再生 ON" : "ループ再生 OFF", "listening");
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

  function volumeFromCommand(command) {
    const direct = command.match(/(?:音量|ボリューム)(100|75|50|25|0|ゼロ|百|ひゃく|七十五|ななじゅうご|五十|ごじゅう|二十五|にじゅうご|半分)/);
    if (!direct) return null;
    const value = direct[1];
    if (["100", "百", "ひゃく"].includes(value)) return 1;
    if (["75", "七十五", "ななじゅうご"].includes(value)) return 0.75;
    if (["50", "五十", "ごじゅう", "半分"].includes(value)) return 0.5;
    if (["25", "二十五", "にじゅうご"].includes(value)) return 0.25;
    if (["0", "ゼロ"].includes(value)) return 0;
    return null;
  }

  function handleVolumeCommand(command) {
    const specifiedVolume = volumeFromCommand(command);
    if (specifiedVolume !== null) {
      setPlayerVolume(specifiedVolume);
      announceVolume();
      return true;
    }

    if (command.includes("ミュート解除") || command.includes("消音解除")) {
      player.muted = false;
      announceVolume();
      return true;
    }

    if (command.includes("ミュート") || command.includes("消音")) {
      player.muted = true;
      setVoiceState("待機中", "ミュートしました", "listening");
      return true;
    }

    if (command.includes("音量最大") || command.includes("最大音量") || command.includes("音量マックス") || command.includes("ボリューム最大")) {
      setPlayerVolume(1);
      announceVolume();
      return true;
    }

    if (command.includes("音量半分") || command.includes("半分") || command.includes("ボリューム半分")) {
      setPlayerVolume(0.5);
      announceVolume();
      return true;
    }

    if (command.includes("音量ゼロ") || command.includes("音量0") || command.includes("ボリュームゼロ")) {
      setPlayerVolume(0);
      announceVolume();
      return true;
    }

    if (
      command.includes("音量上げ") ||
      command.includes("音量あげ") ||
      command.includes("音大きく") ||
      command.includes("大きくして") ||
      command.includes("ボリューム上げ") ||
      command.includes("ボリュームあげ")
    ) {
      return changeVolume(0.25);
    }

    if (
      command.includes("音量下げ") ||
      command.includes("音量さげ") ||
      command.includes("音小さく") ||
      command.includes("小さくして") ||
      command.includes("ボリューム下げ") ||
      command.includes("ボリュームさげ")
    ) {
      return changeVolume(-0.25);
    }

    return false;
  }

  function isNextVoiceCommand(command) {
    return [
      "次", "つぎ", "次へ", "つぎへ", "次の曲", "つぎの曲", "次お願い", "次にして",
      "ネクスト", "ねくすと", "next", "nextsong", "nexttrack"
    ].some(word => command === normalized(word) || command.includes(normalized(word)));
  }

  function isPreviousVoiceCommand(command) {
    return ["前", "まえ", "前へ", "まえへ", "前の曲", "まえの曲", "バック", "戻って", "previous", "prev"].some(word => command === normalized(word) || command.includes(normalized(word)));
  }

  function hasCancelWord(command) {
    return ["解除", "取り消し", "取消", "やめ", "停止", "オフ", "off"].some(word => command.includes(normalized(word)));
  }

  function isShuffleCancelCommand(command) {
    return (
      (command.includes("シャッフル") && hasCancelWord(command)) ||
      ["順番再生", "順番に戻して", "通常再生", "普通に戻して", "元に戻して"].some(word => command.includes(normalized(word)))
    );
  }

  function isRandomPickCommand(command) {
    if (command.includes("シャッフル") || hasCancelWord(command)) return false;
    return ["ランダム", "無作為", "適当に", "おまかせ", "なんか選んで"].some(word => command.includes(normalized(word)));
  }

  function playRandomSongOnce() {
    if (!songs.length) {
      setVoiceState("待機中", "曲がありません", "listening");
      return true;
    }

    setRandomPlayback(false);
    activePlaylistId = null;
    activeQueue = songs.map(item => item.id);

    let candidates = songs;
    if (songs.length > 1 && currentId) candidates = songs.filter(item => item.id !== currentId);

    const song = candidates[Math.floor(Math.random() * candidates.length)];
    playSong(song.id, activeQueue);
    setVoiceState("待機中", `ランダム：${song.title}`, "listening");
    return true;
  }

  function isResumeCommand(command) {
    return ["再生", "再生して", "流して", "かけて", "スタート", "続き", "続けて"].some(word => command.includes(normalized(word)));
  }

  executeVoiceCommand = raw => {
    keepMusicVolume();
    const command = normalized(raw);

    if (
      command.includes("運転モード開始") ||
      command.includes("運転モードを開始") ||
      command.includes("音声モード開始") ||
      command.includes("マイクオン") ||
      command.includes("マイクをオン")
    ) {
      startDrivingModeByVoice();
      return true;
    }

    if (
      command.includes("運転モード停止") ||
      command.includes("運転モードを停止") ||
      command.includes("音声モード停止") ||
      command.includes("音声停止") ||
      command.includes("マイク停止") ||
      command.includes("マイクオフ") ||
      command.includes("マイクをオフ")
    ) {
      stopDrivingModeByVoice();
      return true;
    }

    if (isNextVoiceCommand(command)) {
      nextSong();
      setVoiceState("待機中", "次の曲へ進みました", "listening");
      return true;
    }

    if (isPreviousVoiceCommand(command)) {
      previousSong();
      setVoiceState("待機中", "前の曲へ戻りました", "listening");
      return true;
    }

    if (handleVolumeCommand(command)) return true;

    if (command.includes("ループ解除") || command.includes("ループやめて") || command.includes("ループ停止")) {
      setLoopPlayback(false);
      return true;
    }

    if (command.includes("ループ")) {
      setLoopPlayback(true);
      return true;
    }

    if (isShuffleCancelCommand(command)) {
      setRandomPlayback(false);
      setVoiceState("待機中", "シャッフルを解除しました", "listening");
      return true;
    }

    if (command.includes("シャッフル")) {
      setRandomPlayback(true);
      nextSong();
      setVoiceState("待機中", "シャッフル再生", "listening");
      return true;
    }

    if (isRandomPickCommand(command)) return playRandomSongOnce();

    if (playLooseNamedItem(raw)) return true;
    if (isResumeCommand(command)) return resumePlayback();

    return originalExecuteVoiceCommand(raw);
  };

  if (voiceStartBtn) voiceStartBtn.addEventListener("click", () => {
    keepMusicVolume();
    const savedVolume = Number(localStorage.getItem("simple-music-volume"));
    if (Number.isFinite(savedVolume)) setPlayerVolume(savedVolume);
    primeFirstSongForVoice();
  });

  if (player) {
    const savedVolume = Number(localStorage.getItem("simple-music-volume"));
    if (Number.isFinite(savedVolume)) setPlayerVolume(savedVolume);
    player.addEventListener("play", keepMusicVolume);
  }
})();
