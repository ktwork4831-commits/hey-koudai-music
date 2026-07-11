const DB_NAME="simple-music-import-db-noaccept";
const DB_VERSION=1;
const STORE="songs";
const PLAYLIST_KEY="simple-music-playlists-v1";

const filePicker=document.getElementById("filePicker");
const importBtn=document.getElementById("importBtn");
const player=document.getElementById("player");
const nowTitle=document.getElementById("nowTitle");
const songList=document.getElementById("songList");
const playlistList=document.getElementById("playlistList");
const search=document.getElementById("search");
const clearBtn=document.getElementById("clearBtn");
const count=document.getElementById("count");
const message=document.getElementById("message");
const createPlaylistBtn=document.getElementById("createPlaylistBtn");
const playlistDialog=document.getElementById("playlistDialog");
const playlistDialogTitle=document.getElementById("playlistDialogTitle");
const playlistNameInput=document.getElementById("playlistNameInput");
const playlistSongChoices=document.getElementById("playlistSongChoices");
const savePlaylistBtn=document.getElementById("savePlaylistBtn");

let db;
let songs=[];
let playlists=[];
let editingPlaylistId=null;
let currentId=null;
let currentObjectUrl=null;
let activeQueue=[];
let activeQueueIndex=-1;
let activePlaylistId=null;
let shuffleMode=false;

function openDB(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{
   const database=req.result;
   if(!database.objectStoreNames.contains(STORE)){
    const store=database.createObjectStore(STORE,{keyPath:"id"});
    store.createIndex("fingerprint","fingerprint",{unique:false});
    store.createIndex("createdAt","createdAt",{unique:false});
   }
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
function store(mode="readonly"){return db.transaction(STORE,mode).objectStore(STORE)}
function getAllSongs(){return new Promise((resolve,reject)=>{const req=store().getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>b.createdAt-a.createdAt));req.onerror=()=>reject(req.error)})}
function saveSong(song){return new Promise((resolve,reject)=>{const req=store("readwrite").put(song);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
function deleteSong(id){return new Promise((resolve,reject)=>{const req=store("readwrite").delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
function loadPlaylists(){try{playlists=JSON.parse(localStorage.getItem(PLAYLIST_KEY)||"[]")}catch{playlists=[]}}
function savePlaylists(){localStorage.setItem(PLAYLIST_KEY,JSON.stringify(playlists))}
function makeFingerprint(file){return `${file.name}__${file.size}__${file.lastModified||0}`}
function cleanFileName(name){return name.replace(/\.[^/.]+$/,'')}
function formatSize(bytes){return bytes<1024*1024?Math.round(bytes/1024)+"KB":(bytes/1024/1024).toFixed(1)+"MB"}
function extensionOf(name){const m=name.toLowerCase().match(/\.([a-z0-9]+)$/);return m?m[1]:""}
function fileKind(file){const ext=extensionOf(file.name);return ext?ext.toUpperCase():(file.type||"audio")}
function isSupportedAudio(file){const ext=extensionOf(file.name);return ["mp3","m4a","aac","wav"].includes(ext)||file.type.startsWith("audio/")}
function escapeHtml(str){return String(str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function showMessage(text,isError=false){
 message.textContent=text;message.hidden=false;
 message.style.color=isError?"#fee2e2":"#dcfce7";
 message.style.background=isError?"rgba(251,113,133,.13)":"rgba(34,197,94,.13)";
 message.style.borderColor=isError?"rgba(251,113,133,.28)":"rgba(34,197,94,.28)";
 clearTimeout(showMessage.timer);showMessage.timer=setTimeout(()=>message.hidden=true,5000);
}
async function refresh(){
 songs=await getAllSongs();
 const validIds=new Set(songs.map(s=>s.id));
 let changed=false;
 playlists=playlists.map(p=>{const songIds=p.songIds.filter(id=>validIds.has(id));if(songIds.length!==p.songIds.length)changed=true;return {...p,songIds}});
 if(changed)savePlaylists();
 render();
}
function filteredSongs(){const q=search.value.trim().toLowerCase();return q?songs.filter(s=>s.title.toLowerCase().includes(q)):songs}
function render(){renderPlaylists();renderSongs()}
function renderSongs(){
 const list=filteredSongs();count.textContent=`${songs.length}曲`;songList.innerHTML="";
 if(!songs.length){songList.innerHTML='<div class="empty">まだ曲がありません。</div>';return}
 if(!list.length){songList.innerHTML='<div class="empty">見つかりませんでした。</div>';return}
 list.forEach(song=>{
  const row=document.createElement("div");row.className="song"+(song.id===currentId?" active":"");
  row.innerHTML=`<div class="thumb">♪</div><div><div class="title">${escapeHtml(song.title)}</div><div class="sub">${escapeHtml(song.kind||song.type||"audio")} ・ ${formatSize(song.size||0)}</div></div><div class="actions"><button class="icon play" title="再生">▶</button><button class="icon add" title="再生リストへ追加">＋</button><button class="icon danger del" title="削除">×</button></div>`;
  row.querySelector(".play").onclick=()=>playSong(song.id);
  row.querySelector(".add").onclick=()=>addSongToPlaylist(song.id);
  row.querySelector(".del").onclick=async()=>{
   if(confirm(`「${song.title}」を削除しますか？`)){
    if(currentId===song.id)stopPlayer();
    await deleteSong(song.id);await refresh();
   }
  };
  songList.appendChild(row);
 });
}
function renderPlaylists(){
 playlistList.innerHTML="";
 if(!playlists.length){playlistList.innerHTML='<div class="empty">再生リストはまだありません。</div>';return}
 playlists.forEach(list=>{
  const card=document.createElement("div");card.className="playlist-card"+(activePlaylistId===list.id?" active":"");
  card.innerHTML=`<div class="thumb">♫</div><div><div class="title">${escapeHtml(list.name)}</div><div class="sub">${list.songIds.length}曲</div></div><div class="actions"><button class="icon play" title="再生">▶</button><button class="icon edit" title="編集">✎</button><button class="icon danger del" title="削除">×</button></div>`;
  card.querySelector(".play").onclick=()=>playPlaylist(list.id);
  card.querySelector(".edit").onclick=()=>openPlaylistDialog(list.id);
  card.querySelector(".del").onclick=()=>removePlaylist(list.id);
  playlistList.appendChild(card);
 });
}
async function playSong(id,queue=null){
 const song=songs.find(s=>s.id===id);if(!song)return false;
 if(queue){activeQueue=[...queue];activeQueueIndex=activeQueue.indexOf(id)}
 else if(!activeQueue.includes(id)||activePlaylistId===null){activeQueue=songs.map(s=>s.id);activeQueueIndex=activeQueue.indexOf(id);activePlaylistId=null}
 currentId=id;
 if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);
 currentObjectUrl=URL.createObjectURL(song.file);
 player.src=currentObjectUrl;nowTitle.textContent=song.title;
 try{await player.play()}catch{}
 render();return true;
}
function stopPlayer(){
 currentId=null;player.pause();player.removeAttribute("src");nowTitle.textContent="まだ選択されていません";
 if(currentObjectUrl){URL.revokeObjectURL(currentObjectUrl);currentObjectUrl=null}
 render();
}
function playPlaylist(id){
 const list=playlists.find(p=>p.id===id);if(!list||!list.songIds.length){showMessage("再生できる曲がありません",true);return false}
 activePlaylistId=id;activeQueue=list.songIds.filter(songId=>songs.some(s=>s.id===songId));activeQueueIndex=0;
 playSong(activeQueue[0],activeQueue);return true;
}
function nextSong(){
 const queue=activeQueue.length?activeQueue:songs.map(s=>s.id);if(!queue.length)return false;
 if(shuffleMode&&queue.length>1){let next=activeQueueIndex;while(next===activeQueueIndex)next=Math.floor(Math.random()*queue.length);activeQueueIndex=next}
 else activeQueueIndex=(activeQueueIndex+1+queue.length)%queue.length;
 return playSong(queue[activeQueueIndex],queue);
}
function previousSong(){
 const queue=activeQueue.length?activeQueue:songs.map(s=>s.id);if(!queue.length)return false;
 activeQueueIndex=(activeQueueIndex-1+queue.length)%queue.length;
 return playSong(queue[activeQueueIndex],queue);
}
function openPlaylistDialog(id=null){
 editingPlaylistId=id;
 const list=playlists.find(p=>p.id===id);
 playlistDialogTitle.textContent=list?"再生リストを編集":"再生リストを作成";
 playlistNameInput.value=list?.name||"";
 const selected=new Set(list?.songIds||[]);
 playlistSongChoices.innerHTML=songs.length?songs.map(song=>`<label class="choice"><input type="checkbox" value="${song.id}" ${selected.has(song.id)?"checked":""}><span>${escapeHtml(song.title)}</span></label>`).join(""):'<div class="empty">先に曲を取り込んでください。</div>';
 playlistDialog.showModal();
 setTimeout(()=>playlistNameInput.focus(),50);
}
function addSongToPlaylist(songId){
 if(!playlists.length){openPlaylistDialog();setTimeout(()=>{const box=playlistSongChoices.querySelector(`input[value="${songId}"]`);if(box)box.checked=true},60);return}
 const names=playlists.map((p,i)=>`${i+1}. ${p.name}`).join("\n");
 const answer=prompt(`追加する再生リストの番号を入力してください\n${names}`);
 const index=Number(answer)-1;if(!Number.isInteger(index)||!playlists[index])return;
 if(!playlists[index].songIds.includes(songId)){playlists[index].songIds.push(songId);savePlaylists();renderPlaylists();showMessage(`「${playlists[index].name}」に追加しました`)}
}
function removePlaylist(id){
 const list=playlists.find(p=>p.id===id);if(!list||!confirm(`「${list.name}」を削除しますか？`))return;
 playlists=playlists.filter(p=>p.id!==id);if(activePlaylistId===id){activePlaylistId=null;activeQueue=[];activeQueueIndex=-1}
 savePlaylists();render();
}
createPlaylistBtn.onclick=()=>openPlaylistDialog();
savePlaylistBtn.onclick=event=>{
 event.preventDefault();
 const name=playlistNameInput.value.trim();if(!name){showMessage("再生リスト名を入力してください",true);return}
 const songIds=[...playlistSongChoices.querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value);
 if(editingPlaylistId){const list=playlists.find(p=>p.id===editingPlaylistId);if(list){list.name=name;list.songIds=songIds}}
 else playlists.push({id:crypto.randomUUID(),name,songIds,createdAt:Date.now()});
 savePlaylists();playlistDialog.close();render();showMessage("再生リストを保存しました");
};

importBtn.onclick=()=>filePicker.click();
filePicker.onchange=async()=>{
 const files=[...filePicker.files];if(!files.length)return;
 const existing=new Set(songs.map(s=>s.fingerprint).filter(Boolean));let added=0,skipped=0,unsupported=0;
 for(const file of files){
  if(!isSupportedAudio(file)){unsupported++;continue}
  const fingerprint=makeFingerprint(file);if(existing.has(fingerprint)){skipped++;continue}
  await saveSong({id:crypto.randomUUID(),title:cleanFileName(file.name),type:file.type||`audio/${extensionOf(file.name)||"unknown"}`,kind:fileKind(file),size:file.size,createdAt:Date.now(),fingerprint,file});
  existing.add(fingerprint);added++;
 }
 filePicker.value="";await refresh();
 const parts=[];if(added)parts.push(`${added}曲取り込みました`);if(skipped)parts.push(`${skipped}曲は重複のためスキップ`);if(unsupported)parts.push(`${unsupported}件は未対応形式`);
 showMessage(parts.join(" / ")||"取り込みはありませんでした",unsupported>0&&added===0);
};
search.oninput=renderSongs;clearBtn.onclick=()=>{search.value="";renderSongs()};

const tabButtons=document.querySelectorAll("[data-tab]");
const tabPanels={songs:document.getElementById("songsPanel"),playlists:document.getElementById("playlistsPanel")};
const libraryTitle=document.getElementById("libraryTitle");
function showLibraryTab(tab){
 tabButtons.forEach(button=>{const active=button.dataset.tab===tab;button.classList.toggle("active",active);button.setAttribute("aria-selected",String(active))});
 Object.entries(tabPanels).forEach(([key,panel])=>{const active=key===tab;panel.hidden=!active;panel.classList.toggle("active",active)});
 libraryTitle.textContent=tab==="playlists"?"再生リスト":"曲一覧";
}
tabButtons.forEach(button=>button.addEventListener("click",()=>showLibraryTab(button.dataset.tab)));

if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js"));
openDB().then(database=>{db=database;loadPlaylists();refresh()});

const voicePanel=document.querySelector(".voice-panel");
const voiceStartBtn=document.getElementById("voiceStartBtn");
const voiceStopBtn=document.getElementById("voiceStopBtn");
const voiceStatus=document.getElementById("voiceStatus");
const voiceTranscript=document.getElementById("voiceTranscript");
const SpeechRecognitionAPI=window.SpeechRecognition||window.webkitSpeechRecognition;
let recognition=null,voiceModeEnabled=false,recognitionRunning=false,lastVoiceCommandAt=0,lastVoiceCommandKey="";

function normalizeVoiceText(text){return String(text||"").toLowerCase().normalize("NFKC").replace(/[、。,.!?！？\s]/g,"").replace(/曲を/g,"").replace(/音楽を/g,"")}
function setVoiceState(status,transcript="",mode="idle"){voiceStatus.textContent=status;voiceTranscript.textContent=transcript;voicePanel.classList.toggle("active",mode==="listening");voicePanel.classList.toggle("command",mode==="command")}
function commandWasJustHandled(key){const now=Date.now();if(lastVoiceCommandKey===key&&now-lastVoiceCommandAt<1600)return true;lastVoiceCommandKey=key;lastVoiceCommandAt=now;return false}
function isNextCommand(c){return ["次","つぎ","次へ","つぎへ","次の曲","つぎのきょく","次お願い","次にして"].some(w=>c===normalizeVoiceText(w))||c.includes("次の曲")}
function isPreviousCommand(c){return ["前","まえ","前へ","まえへ","前の曲","まえのきょく","前お願い","前にして"].some(w=>c===normalizeVoiceText(w))||c.includes("前の曲")}
function stripPlayWords(text){return normalizeVoiceText(text).replace(/(を)?(再生して|再生|流して|かけて|聞かせて|聴かせて)$/g,"").replace(/(の曲|曲)$/g,"")}
function findPlaylistFromVoice(request){const cleaned=stripPlayWords(request).replace(/再生リスト|プレイリスト/g,"");return playlists.find(p=>normalizeVoiceText(p.name)===cleaned)||playlists.find(p=>{const n=normalizeVoiceText(p.name);return n.includes(cleaned)||cleaned.includes(n)})}
function findSongFromVoice(request){const cleaned=stripPlayWords(request);if(!cleaned)return null;return songs.find(s=>normalizeVoiceText(s.title)===cleaned)||songs.find(s=>{const t=normalizeVoiceText(s.title);return t.includes(cleaned)||cleaned.includes(t)})}
function executeVoiceCommand(raw){
 const command=normalizeVoiceText(raw);if(!command)return false;setVoiceState("命令を実行中",`認識：${raw}`,"command");
 if(isNextCommand(command)){if(commandWasJustHandled("next"))return true;nextSong();setVoiceState("待機中","次の曲へ進みました","listening");return true}
 if(isPreviousCommand(command)){if(commandWasJustHandled("previous"))return true;previousSong();setVoiceState("待機中","前の曲へ戻りました","listening");return true}
 if(["止めて","停止","一時停止","ストップ"].some(w=>command.includes(normalizeVoiceText(w)))){player.pause();setVoiceState("待機中","停止しました","listening");return true}
 if(["再生","再生して","続き","続けて","スタート"].some(w=>command===normalizeVoiceText(w))){player.play().catch(()=>{});setVoiceState("待機中","再生しました","listening");return true}
 if(command.includes("シャッフル")){shuffleMode=true;nextSong();setVoiceState("待機中","シャッフル再生","listening");return true}
 if(command.includes("順番")||command.includes("シャッフル解除")){shuffleMode=false;setVoiceState("待機中","順番再生","listening");return true}
 const playlist=findPlaylistFromVoice(command);if(playlist){playPlaylist(playlist.id);setVoiceState("待機中",`再生リスト：${playlist.name}`,"listening");return true}
 const song=findSongFromVoice(command);if(song){activePlaylistId=null;activeQueue=songs.map(s=>s.id);playSong(song.id,activeQueue);setVoiceState("待機中",`再生：${song.title}`,"listening");return true}
 setVoiceState("待機中",`見つかりません：${raw}`,"listening");return false;
}
function startRecognition(){if(!recognition||!voiceModeEnabled||recognitionRunning)return;try{recognition.start()}catch{}}
function setupRecognition(){
 if(!SpeechRecognitionAPI){voiceStartBtn.disabled=true;setVoiceState("音声認識に対応していません");return}
 recognition=new SpeechRecognitionAPI();recognition.lang="ja-JP";recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=3;
 recognition.onstart=()=>{recognitionRunning=true;setVoiceState("待機中","","listening")};
 recognition.onresult=event=>{
  const latest=event.results[event.results.length-1];
  const alternatives=[...latest].map(r=>r.transcript).filter(Boolean);
  for(const text of alternatives){if(executeVoiceCommand(text))break}
 };
 recognition.onerror=event=>{
  if(event.error==="not-allowed"||event.error==="service-not-allowed"){voiceModeEnabled=false;voiceStartBtn.disabled=false;voiceStopBtn.disabled=true;setVoiceState("マイクを使用できません")}
 };
 recognition.onend=()=>{recognitionRunning=false;if(voiceModeEnabled)setTimeout(startRecognition,350)};
}
voiceStartBtn.onclick=()=>{if(!recognition)return;voiceModeEnabled=true;voiceStartBtn.disabled=true;voiceStopBtn.disabled=false;startRecognition()};
voiceStopBtn.onclick=()=>{voiceModeEnabled=false;if(recognitionRunning)recognition.stop();voiceStartBtn.disabled=false;voiceStopBtn.disabled=true;setVoiceState("停止中")};
player.addEventListener("ended",()=>nextSong());
setupRecognition();
