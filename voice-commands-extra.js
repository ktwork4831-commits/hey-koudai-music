(() => {
  if (typeof executeVoiceCommand !== "function") return;

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

  function keepMusicAudible() {
    if (player) player.muted = false;
  }

  function setShuffleMode(enabled) {
    shuffleMode = enabled;
    localStorage.setItem("simple-music-shuffle", String(enabled));
  }

  function setLoopPlayback(enabled) {
    if (!player) return true;
    player.loop = enabled;
    localStorage.setItem("simple-music-loop-one", String(enabled));
    setVoiceState("待機中", enabled ? "ループ再生 ON" : "ループ再生 OFF", "listening");
    return true;
  }

  function startDrivingModeByVoice() {
    voiceModeEnabled = true;
    voiceStartBtn.disabled = true;
    voiceStopBtn.disabled = false;
    startRecognition();
    setVoiceState("待機中", "運転モードを開始しました", "listening");
    return true;
  }

  function stopDrivingModeByVoice() {
    voiceModeEnabled = false;
    if (recognitionRunning && recognition) recognition.stop();
    voiceStartBtn.disabled = false;
    voiceStopBtn.disabled = true;
    setVoiceState("停止中", "運転モードを停止しました");
    return true;
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

  function resumePlayback() {
    keepMusicAudible();

    if (!player.src) {
      const queue = activeQueue.length ? activeQueue : songs.map(item => item.id);
      const nextId = queue[activeQueueIndex >= 0 ? activeQueueIndex : 0] || songs[0]?.id;
      if (nextId) prepareSongSource(nextId);
    }

    if (!player.src) {
      setVoiceState("待機中", "再生できる曲がありません", "listening");
      return true;
    }

    player.play()
      .then(() => setVoiceState("待機中", "再生しました", "listening"))
      .catch(() => setVoiceState("待機中", "画面の再生ボタンを一度押してください", "listening"));
    return true;
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

  function hasAny(command, words) {
    return words.some(word => command.includes(normalized(word)));
  }

  function equalsAny(command, words) {
    return words.some(word => command === normalized(word));
  }

  function isNextVoiceCommand(command) {
    return equalsAny(command, ["次", "つぎ", "次へ", "つぎへ", "次の曲", "つぎの曲", "ネクスト", "ねくすと", "next", "nextsong", "nexttrack"]);
  }

  function isPreviousVoiceCommand(command) {
    return equalsAny(command, ["前", "まえ", "前へ", "まえへ", "前の曲", "まえの曲", "バック", "戻って", "previous", "prev"]);
  }

  function isPauseCommand(command) {
    return equalsAny(command, ["止めて", "停止", "一時停止", "ストップ", "stop", "pause"]);
  }

  function isVolumeCommand(command) {
    return hasAny(command, ["音量", "ボリューム", "ミュート", "消音", "大きく", "小さく", "上げ", "あげ", "下げ", "さげ"]);
  }

  function hasCancelWord(command) {
    return hasAny(command, ["解除", "取り消し", "取消", "やめ", "停止", "オフ", "off"]);
  }

  function isShuffleCancelCommand(command) {
    return (
      (command.includes("シャッフル") && hasCancelWord(command)) ||
      hasAny(command, ["順番再生", "順番に戻して", "通常再生", "普通に戻して", "元に戻して"])
    );
  }

  function isRandomPickCommand(command) {
    if (command.includes("シャッフル") || hasCancelWord(command)) return false;
    return hasAny(command, ["ランダム", "無作為", "適当に", "おまかせ", "なんか選んで"]);
  }

  function playRandomSongOnce() {
    if (!songs.length) {
      setVoiceState("待機中", "曲がありません", "listening");
      return true;
    }

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
    return equalsAny(command, ["再生", "再生して", "流して", "かけて", "スタート", "続き", "続けて", "play", "start"]);
  }

  executeVoiceCommand = raw => {
    keepMusicAudible();
    const command = normalized(raw);

    if (hasAny(command, ["運転モード開始", "運転モードを開始", "音声モード開始", "マイクオン", "マイクをオン"])) {
      return startDrivingModeByVoice();
    }

    if (hasAny(command, ["運転モード停止", "運転モードを停止", "音声モード停止", "音声停止", "マイク停止", "マイクオフ", "マイクをオフ"])) {
      return stopDrivingModeByVoice();
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

    if (isPauseCommand(command)) {
      player.pause();
      setVoiceState("待機中", "停止しました", "listening");
      return true;
    }

    if (isVolumeCommand(command)) {
      setVoiceState("待機中", "音量は端末本体のボタンで調整してください", "listening");
      return true;
    }

    if (hasAny(command, ["ループ解除", "ループやめて", "ループ停止", "ループオフ"])) return setLoopPlayback(false);
    if (command.includes("ループ")) return setLoopPlayback(true);

    if (isShuffleCancelCommand(command)) {
      setShuffleMode(false);
      setVoiceState("待機中", "シャッフルを解除しました", "listening");
      return true;
    }

    if (command.includes("シャッフル")) {
      setShuffleMode(true);
      setVoiceState("待機中", "シャッフルをONにしました", "listening");
      return true;
    }

    if (isRandomPickCommand(command)) return playRandomSongOnce();
    if (playLooseNamedItem(raw)) return true;
    if (isResumeCommand(command)) return resumePlayback();

    setVoiceState("待機中", `聞き取れませんでした：${raw}`, "listening");
    return true;
  };

  if (voiceStartBtn) voiceStartBtn.addEventListener("click", keepMusicAudible);
  if (player) player.addEventListener("play", keepMusicAudible);
})();
