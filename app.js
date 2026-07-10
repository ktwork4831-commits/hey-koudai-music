const DB_NAME = "simple-music-import-db-noaccept";
const DB_VERSION = 1;
const STORE = "songs";

const filePicker = document.getElementById("filePicker");
const importBtn = document.getElementById("importBtn");
const player = document.getElementById("player");
const nowTitle = document.getElementById("nowTitle");
const songList = document.getElementById("songList");
const search = document.getElementById("search");
const clearBtn = document.getElementById("clearBtn");
const count = document.getElementById("count");
const message = document.getElementById("message");

let db;
let songs = [];
let currentId = null;
let currentObjectUrl = null;

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if(!database.objectStoreNames.contains(STORE)){
        const store = database.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("fingerprint", "fingerprint", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function store(mode="readonly"){
  return db.transaction(STORE, mode).objectStore(STORE);
}

function getAllSongs(){
  return new Promise((resolve, reject) => {
    const req = store().getAll();
    req.onsuccess = () => resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt));
    req.onerror = () => reject(req.error);
  });
}

function saveSong(song){
  return new Promise((resolve, reject) => {
    const req = store("readwrite").put(song);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function deleteSong(id){
  return new Promise((resolve, reject) => {
    const req = store("readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function makeFingerprint(file){
  return `${file.name}__${file.size}__${file.lastModified || 0}`;
}

function cleanFileName(name){
  return name.replace(/\.[^/.]+$/, "");
}

function formatSize(bytes){
  if(bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

function extensionOf(name){
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function fileKind(file){
  const ext = extensionOf(file.name);
  if(ext) return ext.toUpperCase();
  return file.type || "audio";
}

function isSupportedAudio(file){
  const ext = extensionOf(file.name);
  return ["mp3","m4a","aac","wav"].includes(ext) || file.type.startsWith("audio/");
}

async function refresh(){
  songs = await getAllSongs();
  render();
}

function filteredSongs(){
  const q = search.value.trim().toLowerCase();
  if(!q) return songs;
  return songs.filter(s => s.title.toLowerCase().includes(q));
}

function showMessage(text, isError=false){
  message.textContent = text;
  message.hidden = false;
  message.style.color = isError ? "#fee2e2" : "#dcfce7";
  message.style.background = isError ? "rgba(251,113,133,.13)" : "rgba(34,197,94,.13)";
  message.style.borderColor = isError ? "rgba(251,113,133,.28)" : "rgba(34,197,94,.28)";
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => message.hidden = true, 5000);
}

function render(){
  const list = filteredSongs();
  count.textContent = `${songs.length}曲`;
  songList.innerHTML = "";

  if(!songs.length){
    songList.innerHTML = `<div class="empty">まだ曲がありません。<br>iPhoneの「ファイル」アプリに音楽を保存してから、<br>「ファイルから取り込む」でまとめて選んでください。</div>`;
    return;
  }

  if(!list.length){
    songList.innerHTML = `<div class="empty">見つかりませんでした。</div>`;
    return;
  }

  list.forEach(song => {
    const row = document.createElement("div");
    row.className = "song" + (song.id === currentId ? " active" : "");
    row.innerHTML = `
      <div class="thumb">♪</div>
      <div>
        <div class="title">${escapeHtml(song.title)}</div>
        <div class="sub">${escapeHtml(song.kind || song.type || "audio")} ・ ${formatSize(song.size || 0)}</div>
      </div>
      <div class="actions">
        <button class="icon play" title="再生">▶</button>
        <button class="icon danger del" title="削除">×</button>
      </div>
    `;
    row.querySelector(".play").onclick = () => playSong(song.id);
    row.querySelector(".del").onclick = async () => {
      if(confirm(`「${song.title}」を削除しますか？`)){
        if(currentId === song.id) stopPlayer();
        await deleteSong(song.id);
        await refresh();
      }
    };
    row.ondblclick = () => playSong(song.id);
    songList.appendChild(row);
  });
}

async function playSong(id){
  const song = songs.find(s => s.id === id);
  if(!song) return;

  currentId = id;
  if(currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(song.file);

  player.src = currentObjectUrl;
  nowTitle.textContent = song.title;
  await player.play().catch(() => {});
  render();
}

function stopPlayer(){
  currentId = null;
  player.pause();
  player.removeAttribute("src");
  nowTitle.textContent = "まだ選択されていません";
  if(currentObjectUrl){
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

importBtn.onclick = () => filePicker.click();

filePicker.onchange = async () => {
  const files = [...filePicker.files];
  if(!files.length) return;

  const existingFingerprints = new Set(songs.map(s => s.fingerprint).filter(Boolean));
  let added = 0;
  let skipped = 0;
  let unsupported = 0;

  for(const file of files){
    if(!isSupportedAudio(file)){
      unsupported++;
      continue;
    }

    const fingerprint = makeFingerprint(file);
    if(existingFingerprints.has(fingerprint)){
      skipped++;
      continue;
    }

    const song = {
      id: crypto.randomUUID(),
      title: cleanFileName(file.name),
      type: file.type || `audio/${extensionOf(file.name) || "unknown"}`,
      kind: fileKind(file),
      size: file.size,
      createdAt: Date.now(),
      fingerprint,
      file
    };

    await saveSong(song);
    existingFingerprints.add(fingerprint);
    added++;
  }

  filePicker.value = "";
  await refresh();

  const parts = [];
  if(added) parts.push(`${added}曲取り込みました`);
  if(skipped) parts.push(`${skipped}曲は重複のためスキップ`);
  if(unsupported) parts.push(`${unsupported}件は未対応形式のためスキップ`);
  showMessage(parts.join(" / ") || "取り込みはありませんでした", unsupported > 0 && added === 0);
};

search.oninput = render;
clearBtn.onclick = () => {
  search.value = "";
  render();
};

function escapeHtml(str){
  return String(str || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

if("serviceWorker" in navigator){
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
}

openDB().then(database => {
  db = database;
  refresh();
});

// ===== 音声運転モード =====
const voicePanel = document.querySelector(".voice-panel");
const voiceStartBtn = document.getElementById("voiceStartBtn");
const voiceStopBtn = document.getElementById("voiceStopBtn");
const voiceStatus = document.getElementById("voiceStatus");
const voiceTranscript = document.getElementById("voiceTranscript");

const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let voiceModeEnabled = false;
let recognitionRunning = false;
let shuffleMode = false;
let lastVoiceCommandAt = 0;
let lastVoiceCommandKey = "";

function normalizeVoiceText(text){
  return String(text || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[、。,.!?！？\s]/g, "")
    .replace(/曲を/g, "")
    .replace(/音楽を/g, "");
}

function setVoiceState(status, transcript="", mode="idle"){
  voiceStatus.textContent = status;
  if(transcript) voiceTranscript.textContent = transcript;
  voicePanel.classList.toggle("active", mode === "listening");
  voicePanel.classList.toggle("command", mode === "command");
}

function speakFeedback(text){
  if(!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = 1.05;
  speechSynthesis.speak(utterance);
}

function nextSong(){
  if(!songs.length) return false;
  let index = songs.findIndex(song => song.id === currentId);
  if(shuffleMode && songs.length > 1){
    let next = index;
    while(next === index) next = Math.floor(Math.random() * songs.length);
    playSong(songs[next].id);
  }else{
    playSong(songs[(index + 1 + songs.length) % songs.length].id);
  }
  return true;
}

function previousSong(){
  if(!songs.length) return false;
  const index = songs.findIndex(song => song.id === currentId);
  playSong(songs[(index - 1 + songs.length) % songs.length].id);
  return true;
}

function findSongFromVoice(request){
  const cleaned = normalizeVoiceText(request)
    .replace(/(を)?(再生して|再生|流して|かけて|聞かせて|聴かせて)$/g, "")
    .replace(/(の曲|曲)$/g, "");
  if(!cleaned) return null;

  const exact = songs.find(song => normalizeVoiceText(song.title) === cleaned);
  if(exact) return exact;

  return songs.find(song => {
    const title = normalizeVoiceText(song.title);
    return title.includes(cleaned) || cleaned.includes(title);
  }) || null;
}

function isNextCommand(command){
  const exact = ["次", "つぎ", "次へ", "つぎへ", "次の曲", "つぎのきょく", "次お願い", "次にして"];
  if(exact.some(word => command === normalizeVoiceText(word))) return true;
  return command.includes("次の曲") || command.startsWith("次へ") || command.startsWith("つぎへ");
}

function isPreviousCommand(command){
  const exact = ["前", "まえ", "前へ", "まえへ", "前の曲", "まえのきょく", "前お願い", "前にして"];
  if(exact.some(word => command === normalizeVoiceText(word))) return true;
  return command.includes("前の曲") || command.startsWith("前へ") || command.startsWith("まえへ");
}

function commandWasJustHandled(key){
  const now = Date.now();
  if(lastVoiceCommandKey === key && now - lastVoiceCommandAt < 1600) return true;
  lastVoiceCommandKey = key;
  lastVoiceCommandAt = now;
  return false;
}

function executeVoiceCommand(rawCommand){
  const command = normalizeVoiceText(rawCommand);
  if(!command) return false;

  setVoiceState("命令を実行中", `認識：${rawCommand}`, "command");

  if(isNextCommand(command)){
    if(commandWasJustHandled("next")) return true;
    if(nextSong()) setVoiceState("待機中", "次の曲へ進みました", "listening");
    else setVoiceState("待機中", "曲がありません", "listening");
    return true;
  }

  if(isPreviousCommand(command)){
    if(commandWasJustHandled("previous")) return true;
    if(previousSong()) setVoiceState("待機中", "前の曲へ戻りました", "listening");
    else setVoiceState("待機中", "曲がありません", "listening");
    return true;
  }

  if(["止めて", "停止", "一時停止", "ストップ"].some(word => command.includes(normalizeVoiceText(word)))){
    if(commandWasJustHandled("pause")) return true;
    player.pause();
    setVoiceState("待機中", "停止しました", "listening");
    return true;
  }

  if(["再生", "再生して", "続き", "続けて", "スタート"].some(word => command === normalizeVoiceText(word))){
    if(commandWasJustHandled("play")) return true;
    player.play()
      .then(() => setVoiceState("待機中", "再生しました", "listening"))
      .catch(() => setVoiceState("待機中", "再生できませんでした", "listening"));
    return true;
  }

  if(command.includes("シャッフル")){
    if(commandWasJustHandled("shuffle")) return true;
    shuffleMode = true;
    if(nextSong()) setVoiceState("待機中", "シャッフル再生しました", "listening");
    else setVoiceState("待機中", "曲がありません", "listening");
    return true;
  }

  if(command.includes("順番") || command.includes("シャッフル解除")){
    if(commandWasJustHandled("ordered")) return true;
    shuffleMode = false;
    setVoiceState("待機中", "順番再生に戻しました", "listening");
    return true;
  }

  const song = findSongFromVoice(command);
  if(song){
    if(commandWasJustHandled(`song:${song.id}`)) return true;
    playSong(song.id);
    setVoiceState("待機中", `再生：${song.title}`, "listening");
    return true;
  }

  setVoiceState("待機中", `認識した言葉：${rawCommand}`, "listening");
  return false;
}

function processVoiceAlternatives(alternatives){
  const texts = alternatives.filter(Boolean);
  if(!texts.length) return;
  voiceTranscript.textContent = `認識候補：${texts.join(" / ")}`;

  // iPhoneが「次」を別表記で認識することがあるため、候補を順番に試す。
  for(const text of texts){
    if(executeVoiceCommand(text)) return;
  }
}

function startRecognition(){
  if(!recognition || !voiceModeEnabled || recognitionRunning) return;
  try{
    recognition.start();
  }catch(error){
    console.warn("音声認識を開始できませんでした", error);
  }
}

function setupRecognition(){
  if(!SpeechRecognitionAPI){
    voiceStartBtn.disabled = true;
    setVoiceState("このブラウザは音声認識に対応していません", "Safari/iOSのバージョンによっては利用できません");
    return;
  }

  recognition = new SpeechRecognitionAPI();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    recognitionRunning = true;
    setVoiceState("待機中", "「次」「前」「停止」または曲名を話してください", "listening");
  };

  recognition.onresult = event => {
    const latest = event.results[event.results.length - 1];
    const alternatives = [];
    for(let i = 0; i < latest.length; i++){
      alternatives.push(latest[i]?.transcript || "");
    }

    // 確定結果を優先。短い基本操作は途中結果でも反応を試す。
    if(latest.isFinal){
      processVoiceAlternatives(alternatives);
      return;
    }

    const interim = alternatives[0] || "";
    const normalized = normalizeVoiceText(interim);
    if(isNextCommand(normalized) || isPreviousCommand(normalized)){
      processVoiceAlternatives([interim]);
    }else if(interim){
      voiceTranscript.textContent = `聞き取り中：${interim}`;
    }
  };

  recognition.onerror = event => {
    if(event.error === "not-allowed" || event.error === "service-not-allowed"){
      voiceModeEnabled = false;
      setVoiceState("マイクを使用できません", "iPhoneの設定で、このアプリのマイクを許可してください");
      voiceStartBtn.disabled = false;
      voiceStopBtn.disabled = true;
      return;
    }
    if(event.error !== "no-speech" && event.error !== "aborted"){
      setVoiceState("音声認識エラー", `エラー：${event.error}`);
    }
  };

  recognition.onend = () => {
    recognitionRunning = false;
    if(voiceModeEnabled) setTimeout(startRecognition, 350);
  };
}

voiceStartBtn.onclick = () => {
  if(!recognition) return;
  voiceModeEnabled = true;
  voiceStartBtn.disabled = true;
  voiceStopBtn.disabled = false;
  startRecognition();
};

voiceStopBtn.onclick = () => {
  voiceModeEnabled = false;
  if(recognitionRunning) recognition.stop();
  voiceStartBtn.disabled = false;
  voiceStopBtn.disabled = true;
  setVoiceState("停止中", "「音声運転モードを開始」を押すと再開します");
};

player.addEventListener("ended", () => nextSong());
setupRecognition();
