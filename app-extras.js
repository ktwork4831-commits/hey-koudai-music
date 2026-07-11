(() => {
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
})();
