

const $=id=>document.getElementById(id);
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
const norm=s=>String(s).toLowerCase().trim().replace(/[’']/g,"'").replace(/\s+/g," ");
const W=w=>Array.isArray(w)?{english:w[0],japanese:w[1],reading:"",emoji:w[2]||"📝",example:w[3]||"",section:"Main Lesson",category:"word",difficulty:1}:typeof w==="string"?{english:w,japanese:"",reading:"",emoji:"📝",example:"",section:"Main Lesson",category:"word",difficulty:1}:w;
const en=w=>W(w).english, jp=w=>W(w).japanese, emoji=w=>W(w).emoji||"📝", example=w=>W(w).example||"";
let grade=null,unit=null,words=[],xp=Number(localStorage.getItem("portalXP")||0),flashDirection=localStorage.getItem("flashDirection")||"en-jp";
let studied=new Set(),favorites=new Set(),wrong=new Set();
let quizItems=[],quizIndex=0,quizScore=0,spellItems=[],spellIndex=0,spellScore=0;
let fillItems=[],fillIndex=0,fillScore=0,speedTimer=null,speedCurrent=null,speedPoints=0,speedSeconds=30;
const colors=["#ffdada","#dcecff","#e3f4db","#fff0c8","#eadcff","#d9f3ef","#ffe2ef","#e9e3ff"];

function showView(id){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(id).classList.add("active")}
function saveSets(){localStorage.setItem(`studied-${grade}-${unit}`,JSON.stringify([...studied]));localStorage.setItem(`favorites-${grade}-${unit}`,JSON.stringify([...favorites]));localStorage.setItem(`wrong-${grade}-${unit}`,JSON.stringify([...wrong]))}
function loadSets(){studied=new Set(JSON.parse(localStorage.getItem(`studied-${grade}-${unit}`)||"[]"));favorites=new Set(JSON.parse(localStorage.getItem(`favorites-${grade}-${unit}`)||"[]"));wrong=new Set(JSON.parse(localStorage.getItem(`wrong-${grade}-${unit}`)||"[]"))}
function addXP(n){
  xp+=n;
  localStorage.setItem("portalXP",xp);
  const today=getTodayKey();
  const daily=getDailyData(today);daily.correct++;saveDailyData(today,daily);
  localStorage.setItem("portalCorrect",Number(localStorage.getItem("portalCorrect")||0)+1);
  updateStats();toast(`+${n} XP`);renderDashboard();
}
function updateStats(){$("xpValue").textContent=xp;$("levelValue").textContent=Math.floor(xp/250)+1;$("studiedCount").textContent=studied.size;$("favoriteCount").textContent=favorites.size;$("wrongCount").textContent=wrong.size;$("progressText").textContent=`${studied.size} of ${words.length} words studied`;$("progressBar").style.width=`${words.length?studied.size/words.length*100:0}%`}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),1100)}
function speak(text){if(!window.speechSynthesis||$("soundBtn").dataset.off==="1")return;const u=new SpeechSynthesisUtterance(text);u.lang="en-US";speechSynthesis.cancel();speechSynthesis.speak(u)}
function wordKey(w){return typeof w==="string"?w:en(w)}
function markStudied(w){
  const key=wordKey(w),wasNew=!studied.has(key);
  studied.add(key);saveSets();updateStats();
  if(wasNew){const today=getTodayKey();const daily=getDailyData(today);daily.words++;saveDailyData(today,daily);}
  renderDashboard();
}
function markWrong(w){wrong.add(wordKey(w));saveSets();updateStats()}
function clearWrongWord(w){wrong.delete(wordKey(w));saveSets();updateStats()}

function updateStreak(){
  const today=new Date();
  const key=today.toISOString().slice(0,10);
  const last=localStorage.getItem("portalLastStudy");
  let streak=Number(localStorage.getItem("portalStreak")||0);
  if(last!==key){
    const yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
    streak=last===yesterday.toISOString().slice(0,10)?streak+1:1;
    localStorage.setItem("portalLastStudy",key);localStorage.setItem("portalStreak",streak);
  }
  $("streakValue").textContent=streak||1;
}
function goHome(){showView("homeView");renderDashboard()}
function openGrade(g){
  grade=g;
  const d=PORTAL_DATA[g];
  $("gradeLabel").textContent=d.label.toUpperCase();
  $("gradeTitle").textContent=d.title;
  $("unitGrid").innerHTML="";
  for(let i=1;i<=d.unitCount;i++){
    const u=d.units[String(i)];
    const b=document.createElement("button");
    b.className="unit-card"+(u?"":" locked");
    b.innerHTML=`<span class="badge">${u?"AVAILABLE":"COMING SOON"}</span><h3>📖 Unit ${i}</h3><p>${u?u.subtitle:"Vocabulary will be added later."}</p>`;
    if(u)b.onclick=()=>openContent(u,`Unit ${i}`);
    $("unitGrid").appendChild(b);
  }
  (d.extras||[]).forEach(extra=>{
    const b=document.createElement("button");
    b.className="unit-card special-card";
    const icon=extra.kind==="Story"?"🦊":"💬";
    b.innerHTML=`<span class="badge">${extra.kind.toUpperCase()}</span><h3>${icon} ${extra.title}</h3><p>${extra.subtitle}</p>`;
    b.onclick=()=>openContent(extra,extra.title);
    $("unitGrid").appendChild(b);
  });
  showView("unitsView");
}
function openContent(d,label){
  unit=label;
  words=d.words||[];
  localStorage.setItem("portalRecent",JSON.stringify({grade,label,title:d.title,subtitle:d.subtitle||"",wordCount:words.length}));
  loadSets();
  $("studyLabel").textContent=`${PORTAL_DATA[grade].title} · ${label}`;
  $("studyTitle").textContent=d.title;
  $("studySubtitle").textContent=d.subtitle||"";
  $("wordCount").textContent=words.length;
  setupFilters();
  updateStats();
  switchMode("flashcards");
  showView("studyView");
}
function openUnit(n){const d=PORTAL_DATA[grade].units[String(n)];if(d)openContent(d,`Unit ${n}`)}

function renderFlashcards(arr,container){
  container.innerHTML="";
  if(!arr.length){container.innerHTML="<p>No words found.</p>";return}
  arr.forEach((raw,i)=>{
    const x=W(raw),card=document.createElement("div");
    card.className="flashcard";
    const fav=favorites.has(x.english);
    const reading=x.reading?`<div>${x.reading}</div>`:"";
    const meta=`<div class="word-meta"><span class="word-chip">${x.category||"word"}</span><span class="word-chip">${x.section||"Main Lesson"}</span></div>`;
    const front=flashDirection==="en-jp"?`<div class="flash-emoji">${x.emoji||"📝"}</div><div class="flash-word">${x.english}</div>${meta}`:`<div class="flash-word">${x.japanese}</div>${reading}${meta}`;
    const back=flashDirection==="en-jp"?`<div class="flash-word">${x.japanese}</div>${reading}<small>${x.example||""}</small>`:`<div class="flash-emoji">${x.emoji||"📝"}</div><div class="flash-word">${x.english}</div><small>${x.example||""}</small>`;
    card.innerHTML=`<button class="favorite-star" title="Favorite">${fav?"⭐":"☆"}</button><div class="flash-inner"><div class="flash-face" style="background:${colors[i%colors.length]}">${front}</div><div class="flash-face flash-back" style="background:${colors[(i+3)%colors.length]}">${back}</div></div>`;
    card.querySelector(".favorite-star").onclick=e=>{e.stopPropagation();favorites.has(x.english)?favorites.delete(x.english):favorites.add(x.english);saveSets();updateStats();applyFilters()};
    card.onclick=()=>{card.classList.toggle("flipped");markStudied(x);speak(x.english)};
    container.appendChild(card);
  });
}
function setupFilters(){
  const cats=[...new Set(words.map(w=>W(w).category||"word"))].sort();
  const sections=[...new Set(words.map(w=>W(w).section||"Main Lesson"))].sort();
  $("categoryFilter").innerHTML='<option value="all">All word types</option>'+cats.map(x=>`<option value="${x}">${x}</option>`).join("");
  $("sectionFilter").innerHTML='<option value="all">All sections</option>'+sections.map(x=>`<option value="${x}">${x}</option>`).join("");
  $("wordSearch").value="";
  $("categoryFilter").value="all";
  $("sectionFilter").value="all";
  $("directionBtn").textContent=flashDirection==="en-jp"?"EN → JP":"JP → EN";
  applyFilters();
}
function applyFilters(){
  const q=norm($("wordSearch")?.value||"");
  const cat=$("categoryFilter")?.value||"all";
  const section=$("sectionFilter")?.value||"all";
  const result=words.filter(raw=>{
    const x=W(raw);
    return (!q||norm(`${x.english} ${x.japanese} ${x.reading||""}`).includes(q))&&(cat==="all"||x.category===cat)&&(section==="all"||(x.section||"Main Lesson")===section);
  });
  $("filterResultText").textContent=`Showing ${result.length} of ${words.length} words`;
  renderFlashcards(result,$("flashcardGrid"));
}

function switchMode(id){
  if(id!=="flashcards"&&grade&&unit){const today=getTodayKey();const daily=getDailyData(today);daily.games++;saveDailyData(today,daily);}
  document.querySelectorAll(".mode-btn").forEach(b=>b.classList.toggle("active",b.dataset.mode===id));document.querySelectorAll(".game").forEach(g=>g.classList.toggle("active",g.id===id));if(id==="quiz")startQuiz();if(id==="spelling")startSpelling();if(id==="matching")startMatching();if(id==="memory")startMemory();if(id==="hangman")startHangman();if(id==="fillblank")startFill();if(id==="favorites")renderFlashcards(words.filter(w=>favorites.has(en(w))),$("favoriteGrid"));if(id==="wrong")renderFlashcards(words.filter(w=>wrong.has(en(w))),$("wrongGrid"));renderDashboard()}

function startQuiz(){quizItems=shuffle(words).slice(0,Math.min(10,words.length));quizIndex=0;quizScore=0;renderQuiz()}
function renderQuiz(){const c=quizItems[quizIndex];if(!c){$("quizPrompt").textContent=`Finished! ${quizScore} / ${quizItems.length}`;$("quizChoices").innerHTML="";$("quizFeedback").textContent="Great job!";$("quizNextBtn").classList.add("hidden");return}$("quizProgress").textContent=`Question ${quizIndex+1} / ${quizItems.length}`;$("quizScore").textContent=`Score: ${quizScore}`;$("quizPrompt").textContent=jp(c);$("quizFeedback").textContent="";$("quizNextBtn").classList.add("hidden");$("quizChoices").innerHTML="";const opts=shuffle([c,...shuffle(words.filter(x=>en(x)!==en(c))).slice(0,3)]);opts.forEach(o=>{const b=document.createElement("button");b.className="choice";b.textContent=en(o);b.onclick=()=>{document.querySelectorAll("#quizChoices .choice").forEach(x=>x.disabled=true);if(en(o)===en(c)){b.classList.add("correct");quizScore++;addXP(10);markStudied(c);clearWrongWord(c);$("quizFeedback").textContent="Correct! 正解！";speak(en(c))}else{b.classList.add("wrong");markWrong(c);$("quizFeedback").textContent=`Answer: ${en(c)}`}$("quizScore").textContent=`Score: ${quizScore}`;$("quizNextBtn").classList.remove("hidden")};$("quizChoices").appendChild(b)})}

function startSpelling(){spellItems=shuffle(words).slice(0,Math.min(10,words.length));spellIndex=0;spellScore=0;renderSpelling()}
function renderSpelling(){const c=spellItems[spellIndex];if(!c){$("spellPrompt").textContent=`Finished! ${spellScore} / ${spellItems.length}`;$("spellInput").disabled=true;$("spellCheckBtn").disabled=true;$("spellNextBtn").classList.add("hidden");return}$("spellProgress").textContent=`Word ${spellIndex+1} / ${spellItems.length}`;$("spellScore").textContent=`Score: ${spellScore}`;$("spellPrompt").textContent=jp(c);$("spellInput").value="";$("spellInput").disabled=false;$("spellCheckBtn").disabled=false;$("spellFeedback").textContent="";$("spellNextBtn").classList.add("hidden");$("spellInput").focus()}
function checkSpelling(){const c=spellItems[spellIndex];if(!c)return;const ok=norm($("spellInput").value)===norm(en(c));$("spellInput").disabled=true;$("spellCheckBtn").disabled=true;if(ok){spellScore++;addXP(12);markStudied(c);clearWrongWord(c);$("spellFeedback").textContent="Correct! 正解！";speak(en(c))}else{markWrong(c);$("spellFeedback").textContent=`Answer: ${en(c)}`}$("spellScore").textContent=`Score: ${spellScore}`;$("spellNextBtn").classList.remove("hidden")}

function startMatching(){const round=shuffle(words).slice(0,Math.min(6,words.length)),eng=round.map((x,i)=>({text:en(x),id:i,word:en(x)})),jpn=shuffle(round.map((x,i)=>({text:jp(x),id:i,word:en(x)})));$("matchingBoard").innerHTML='<div id="engCol" class="match-column"></div><div id="jpnCol" class="match-column"></div>';let a=null,b=null,count=0;const check=()=>{if(!a||!b)return;if(a.dataset.id===b.dataset.id){a.classList.add("matched");b.classList.add("matched");count++;$("matchingCount").textContent=`${count} / ${round.length}`;addXP(8);markStudied(a.dataset.word)}else{setTimeout(()=>{a?.classList.remove("selected");b?.classList.remove("selected");a=b=null},250);return}a.classList.remove("selected");b.classList.remove("selected");a=b=null};eng.forEach(x=>{const c=document.createElement("button");c.className="match-item";c.textContent=x.text;c.dataset.id=x.id;c.dataset.word=x.word;c.onclick=()=>{document.querySelectorAll("#engCol .match-item").forEach(e=>e.classList.remove("selected"));a=c;c.classList.add("selected");check()};$("engCol").appendChild(c)});jpn.forEach(x=>{const c=document.createElement("button");c.className="match-item";c.textContent=x.text;c.dataset.id=x.id;c.dataset.word=x.word;c.onclick=()=>{document.querySelectorAll("#jpnCol .match-item").forEach(e=>e.classList.remove("selected"));b=c;c.classList.add("selected");check()};$("jpnCol").appendChild(c)});$("matchingCount").textContent=`0 / ${round.length}`}

function startMemory(){const round=shuffle(words).slice(0,Math.min(6,words.length));const cards=shuffle(round.flatMap((x,i)=>[{text:en(x),id:i,word:en(x)},{text:jp(x),id:i,word:en(x)}]));$("memoryBoard").innerHTML="";let first=null,lock=false,count=0;cards.forEach(x=>{const b=document.createElement("button");b.className="memory-card";b.textContent="?";b.dataset.id=x.id;b.dataset.text=x.text;b.dataset.word=x.word;b.onclick=()=>{if(lock||b.classList.contains("matched")||b===first)return;b.textContent=b.dataset.text;b.classList.add("revealed");if(!first){first=b;return}if(first.dataset.id===b.dataset.id){first.classList.add("matched");b.classList.add("matched");count++;$("memoryCount").textContent=`${count} / ${round.length}`;addXP(10);markStudied(b.dataset.word);first=null}else{lock=true;setTimeout(()=>{first.textContent="?";b.textContent="?";first.classList.remove("revealed");b.classList.remove("revealed");first=null;lock=false},650)}};$("memoryBoard").appendChild(b)});$("memoryCount").textContent=`0 / ${round.length}`}

function startSpeed(){clearInterval(speedTimer);speedSeconds=30;speedPoints=0;$("speedTime").textContent=speedSeconds;$("speedScore").textContent="Score: 0";$("speedStartBtn").classList.add("hidden");nextSpeed();speedTimer=setInterval(()=>{speedSeconds--;$("speedTime").textContent=speedSeconds;if(speedSeconds<=0){clearInterval(speedTimer);$("speedPrompt").textContent=`Finished! Score: ${speedPoints}`;$("speedChoices").innerHTML="";$("speedStartBtn").classList.remove("hidden")}},1000)}
function nextSpeed(){speedCurrent=shuffle(words)[0];$("speedPrompt").textContent=jp(speedCurrent);$("speedChoices").innerHTML="";shuffle([speedCurrent,...shuffle(words.filter(x=>en(x)!==en(speedCurrent))).slice(0,3)]).forEach(o=>{const b=document.createElement("button");b.className="choice";b.textContent=en(o);b.onclick=()=>{if(en(o)===en(speedCurrent)){speedPoints++;addXP(3);markStudied(speedCurrent);clearWrongWord(speedCurrent)}else{markWrong(speedCurrent)}$("speedScore").textContent=`Score: ${speedPoints}`;nextSpeed()};$("speedChoices").appendChild(b)})}

function startHangman(){const c=shuffle(words)[0],answer=en(c).toLowerCase();let guessed=new Set(),mistakes=0;$("hangmanMeaning").textContent=jp(c);$("hangmanFeedback").textContent="";$("hangmanLetters").innerHTML="";const display=()=>{$("hangmanWord").textContent=[...answer].map(ch=>/[a-z]/.test(ch)?(guessed.has(ch)?ch:"_"):ch).join(" ");$("hangmanMistakes").textContent=mistakes;const won=[...answer].every(ch=>!/[a-z]/.test(ch)||guessed.has(ch));if(won){$("hangmanFeedback").textContent="You got it!";addXP(15);markStudied(c);clearWrongWord(c);document.querySelectorAll("#hangmanLetters button").forEach(b=>b.disabled=true)}if(mistakes>=6){$("hangmanFeedback").textContent=`Answer: ${en(c)}`;markWrong(c);document.querySelectorAll("#hangmanLetters button").forEach(b=>b.disabled=true)}};"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter=>{const b=document.createElement("button");b.textContent=letter;b.onclick=()=>{b.disabled=true;const ch=letter.toLowerCase();guessed.add(ch);if(!answer.includes(ch))mistakes++;display()};$("hangmanLetters").appendChild(b)});display()}

function startFill(){fillItems=shuffle(words.filter(w=>example(w))).slice(0,Math.min(10,words.length));fillIndex=0;fillScore=0;renderFill()}
function renderFill(){const c=fillItems[fillIndex];if(!c){$("fillPrompt").textContent=`Finished! ${fillScore} / ${fillItems.length}`;$("fillJapaneseHint").textContent="";$("fillInput").disabled=true;$("fillCheckBtn").disabled=true;$("fillNextBtn").classList.add("hidden");return}const escaped=en(c).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");$("fillPrompt").textContent=example(c).replace(new RegExp(escaped,"i"),"_____");$("fillJapaneseHint").textContent=`Hint: ${jp(c)}${W(c).reading?`（${W(c).reading}）`:""}`;$("fillProgress").textContent=`Sentence ${fillIndex+1} / ${fillItems.length}`;$("fillScore").textContent=`Score: ${fillScore}`;$("fillInput").value="";$("fillInput").disabled=false;$("fillCheckBtn").disabled=false;$("fillFeedback").textContent="";$("fillNextBtn").classList.add("hidden")}
function checkFill(){const c=fillItems[fillIndex];if(!c)return;const ok=norm($("fillInput").value)===norm(en(c));$("fillInput").disabled=true;$("fillCheckBtn").disabled=true;if(ok){fillScore++;addXP(12);markStudied(c);clearWrongWord(c);$("fillFeedback").textContent="Correct! 正解！"}else{markWrong(c);$("fillFeedback").textContent=`Answer: ${en(c)}`}$("fillScore").textContent=`Score: ${fillScore}`;$("fillNextBtn").classList.remove("hidden")}


function getTodayKey(){return new Date().toISOString().slice(0,10)}
function getDailyData(key=getTodayKey()){
  try{return Object.assign({words:0,correct:0,games:0,reward:false},JSON.parse(localStorage.getItem(`portalDaily-${key}`)||"{}"))}
  catch{return {words:0,correct:0,games:0,reward:false}}
}
function saveDailyData(key,data){localStorage.setItem(`portalDaily-${key}`,JSON.stringify(data))}
function allStudiedWords(){
  const unique=new Set();
  Object.keys(localStorage).filter(k=>k.startsWith("studied-")).forEach(k=>{try{JSON.parse(localStorage.getItem(k)||"[]").forEach(x=>unique.add(x))}catch{}});
  return unique.size;
}
function totalFavorites(){
  const unique=new Set();
  Object.keys(localStorage).filter(k=>k.startsWith("favorites-")).forEach(k=>{try{JSON.parse(localStorage.getItem(k)||"[]").forEach(x=>unique.add(x))}catch{}});
  return unique.size;
}
function achievementData(){
  const streak=Number(localStorage.getItem("portalStreak")||1),total=allStudiedWords(),correct=Number(localStorage.getItem("portalCorrect")||0);
  const opened=new Set();
  Object.keys(localStorage).filter(k=>k.startsWith("studied-")).forEach(k=>{try{if(JSON.parse(localStorage.getItem(k)||"[]").length)opened.add(k.split("-")[1])}catch{}});
  return [
    {icon:"🃏",name:"First Flip",desc:"Study your first word",ok:total>=1},
    {icon:"⭐",name:"100 XP",desc:"Earn 100 experience points",ok:xp>=100},
    {icon:"📚",name:"Word Explorer",desc:"Study 50 different words",ok:total>=50},
    {icon:"🎯",name:"Quiz Hero",desc:"Get 25 correct answers",ok:correct>=25},
    {icon:"🔥",name:"On Fire",desc:"Reach a 3-day streak",ok:streak>=3},
    {icon:"❤️",name:"Collector",desc:"Save 10 favorite words",ok:totalFavorites()>=10},
    {icon:"🌈",name:"All Grades",desc:"Study from NH1, NH2, and NH3",ok:opened.size>=3},
    {icon:"👑",name:"Vocabulary King",desc:"Study 500 different words",ok:total>=500}
  ];
}
function claimDailyReward(data){
  if(data.reward||data.words<10||data.correct<5||data.games<1)return data;
  data.reward=true;xp+=100;localStorage.setItem("portalXP",xp);saveDailyData(getTodayKey(),data);toast("Daily missions complete! +100 XP");return data;
}
function renderDashboard(){
  if(!$("dashboardLevel"))return;
  const hour=new Date().getHours(),greeting=hour<12?"Good morning!":hour<18?"Good afternoon!":"Good evening!";
  $("dashboardGreeting").textContent=greeting;
  $("dashboardLevel").textContent=Math.floor(xp/250)+1;$("dashboardXP").textContent=`${xp} XP`;
  $("dashboardStreak").textContent=Number(localStorage.getItem("portalStreak")||1);
  $("dashboardWords").textContent=allStudiedWords();$("dashboardCorrect").textContent=Number(localStorage.getItem("portalCorrect")||0);
  const achievements=achievementData();$("dashboardAchievementCount").textContent=achievements.filter(a=>a.ok).length;
  $("achievementGrid").innerHTML=achievements.map(a=>`<article class="achievement ${a.ok?"unlocked":""}"><div class="achievement-icon">${a.ok?a.icon:"🔒"}</div><b>${a.name}</b><small>${a.desc}</small></article>`).join("");
  let daily=claimDailyReward(getDailyData());
  const missions=[{icon:"📖",name:"Study 10 words",value:daily.words,target:10},{icon:"🎯",name:"Get 5 correct answers",value:daily.correct,target:5},{icon:"🎮",name:"Play one game",value:daily.games,target:1}];
  $("missionList").innerHTML=missions.map(m=>`<div class="mission-item ${m.value>=m.target?"done":""}"><span class="mission-check">${m.value>=m.target?"✓":m.icon}</span><span class="mission-copy"><b>${m.name}</b><small>${Math.min(m.value,m.target)} of ${m.target}</small></span><span class="mission-progress">${Math.min(100,Math.round(m.value/m.target*100))}%</span></div>`).join("");
  const reward=document.querySelector(".mission-reward");reward.classList.toggle("claimed",daily.reward);reward.innerHTML=daily.reward?"✅ Daily reward claimed: <b>+100 XP</b>":"Complete all missions: <b>+100 XP</b>";
  let recent=null;try{recent=JSON.parse(localStorage.getItem("portalRecent")||"null")}catch{}
  if(recent){
    const key=`studied-${recent.grade}-${recent.label}`,count=JSON.parse(localStorage.getItem(key)||"[]").length,pct=recent.wordCount?Math.round(count/recent.wordCount*100):0;
    $("continueCard").innerHTML=`<h3>${recent.title}</h3><p>${PORTAL_DATA[recent.grade]?.title||""} · ${recent.label}</p><div class="progress-track"><i style="width:${pct}%"></i></div><p>${count} of ${recent.wordCount} words studied · ${pct}%</p><button id="resumeRecentBtn" class="primary-btn">Continue →</button>`;
    $("resumeRecentBtn").onclick=()=>{const d=recent.label.startsWith("Unit ")?PORTAL_DATA[recent.grade].units[recent.label.replace("Unit ","")]:[...(PORTAL_DATA[recent.grade].extras||[])].find(x=>x.title===recent.label);if(d){grade=recent.grade;openContent(d,recent.label)}};
    $("continueBtn").disabled=false;$("continueBtn").onclick=$("resumeRecentBtn").onclick;
  }else{$("continueBtn").disabled=true;$("continueBtn").onclick=()=>$("textbookSection").scrollIntoView({behavior:"smooth"})}
}


document.querySelectorAll(".grade-card").forEach(b=>b.onclick=()=>openGrade(b.dataset.grade));
$("logoBtn").onclick=goHome;$("browseBooksBtn").onclick=()=>$("textbookSection").scrollIntoView({behavior:"smooth"});$("backHomeBtn").onclick=goHome;$("backUnitsBtn").onclick=()=>openGrade(grade);
document.querySelectorAll(".mode-btn").forEach(b=>b.onclick=()=>switchMode(b.dataset.mode));
$("shuffleCardsBtn").onclick=()=>renderFlashcards(shuffle(words),$("flashcardGrid"));
$("quizNextBtn").onclick=()=>{quizIndex++;renderQuiz()};
$("spellCheckBtn").onclick=checkSpelling;$("spellInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("spellCheckBtn").disabled)checkSpelling()});$("spellNextBtn").onclick=()=>{spellIndex++;renderSpelling()};
$("newMatchingBtn").onclick=startMatching;$("newMemoryBtn").onclick=startMemory;
$("speedStartBtn").onclick=startSpeed;$("newHangmanBtn").onclick=startHangman;
$("fillCheckBtn").onclick=checkFill;$("fillInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("fillCheckBtn").disabled)checkFill()});$("fillNextBtn").onclick=()=>{fillIndex++;renderFill()};
$("clearWrongBtn").onclick=()=>{wrong.clear();saveSets();updateStats();renderFlashcards([],$("wrongGrid"))};
$("soundBtn").onclick=()=>{const off=$("soundBtn").dataset.off==="1";$("soundBtn").dataset.off=off?"0":"1";$("soundBtn").textContent=off?"🔊":"🔇"};
$("themeBtn").onclick=()=>{document.body.classList.toggle("dark");$("themeBtn").textContent=document.body.classList.contains("dark")?"🌙":"☀️"};
$("wordSearch").addEventListener("input",applyFilters);
$("categoryFilter").addEventListener("change",applyFilters);
$("sectionFilter").addEventListener("change",applyFilters);
$("directionBtn").onclick=()=>{flashDirection=flashDirection==="en-jp"?"jp-en":"en-jp";localStorage.setItem("flashDirection",flashDirection);$("directionBtn").textContent=flashDirection==="en-jp"?"EN → JP":"JP → EN";applyFilters()};
$("resetProgressBtn").onclick=()=>{if(!confirm("Reset studied, favorites, and wrong answers for this unit?"))return;studied.clear();favorites.clear();wrong.clear();saveSets();updateStats();applyFilters();toast("Unit progress reset")};
$("clearFiltersBtn").onclick=()=>{$("wordSearch").value="";$("categoryFilter").value="all";$("sectionFilter").value="all";applyFilters()};
updateStreak();
updateStats();
renderDashboard();
/* v1.4.1 multilingual interface */
const UI_TRANSLATIONS={
  en:{
    dashboardEyebrow:"YOUR LEARNING DASHBOARD",dashboardIntro:"Keep your streak alive and continue building your English power.",continue:"▶ Continue Learning",browse:"📚 Browse Textbooks",studyStreak:"Study Streak",wordsStudied:"Words Studied",correctAnswers:"Correct Answers",achievements:"Achievements",pickup:"PICK UP WHERE YOU LEFT OFF",continueTitle:"Continue Learning",daily:"DAILY CHALLENGE",missions:"Today’s Missions",reward:"Complete all missions:",trophy:"YOUR TROPHY CASE",chooseGrade:"CHOOSE YOUR GRADE",textbooks:"New Horizon Textbooks",chooseBook:"Choose a textbook and start learning.",home:"🏠 Home",unitsBack:"← Units",unitHelp:"Choose a unit, Real Life English lesson, or story.",words:"Words",studied:"Studied",favorites:"Favorites",wrong:"Wrong",progress:"Unit progress",flip:"Flip Flashcards",flipHelp:"Tap a card to reveal the Japanese meaning.",reset:"↺ Reset Unit",shuffle:"🔀 Shuffle",clear:"Clear"
  },
  ja:{
    dashboardEyebrow:"学習ダッシュボード",dashboardIntro:"連続学習を続けて、英語力を高めましょう。",continue:"▶ 続きから学習",browse:"📚 教科書を見る",studyStreak:"連続学習",wordsStudied:"学習した単語",correctAnswers:"正解数",achievements:"実績",pickup:"前回の続き",continueTitle:"続きから学習",daily:"今日のチャレンジ",missions:"今日のミッション",reward:"全部クリアすると：",trophy:"トロフィー",chooseGrade:"学年を選ぶ",textbooks:"NEW HORIZON 教科書",chooseBook:"教科書を選んで学習を始めましょう。",home:"🏠 ホーム",unitsBack:"← 単元",unitHelp:"単元、Real Life English、または物語を選んでください。",words:"単語",studied:"学習済み",favorites:"お気に入り",wrong:"まちがい",progress:"単元の進み具合",flip:"フラッシュカード",flipHelp:"カードをタップして意味を確認しましょう。",reset:"↺ 単元をリセット",shuffle:"🔀 シャッフル",clear:"クリア"
  }
};
let interfaceLanguage=localStorage.getItem("portalLanguage")||"";
function bilingual(enText,jaText){return `<span class="en-part">${enText}</span><span class="ja-part bi-line">${jaText}</span>`}
function setHTML(selector,html){const el=document.querySelector(selector);if(el)el.innerHTML=html}
function setText(selector,text){const el=document.querySelector(selector);if(el)el.textContent=text}
function applyInterfaceLanguage(){
  const mode=interfaceLanguage||"bi",enT=UI_TRANSLATIONS.en,jaT=UI_TRANSLATIONS.ja;
  document.documentElement.lang=mode==="ja"?"ja":"en";
  document.body.classList.toggle("ja-only",mode==="ja");document.body.classList.toggle("en-only",mode==="en");
  const v=k=>mode==="en"?enT[k]:mode==="ja"?jaT[k]:bilingual(enT[k],jaT[k]);
  setHTML("#homeView .dashboard-hero .eyebrow",v("dashboardEyebrow"));setHTML("#homeView .dashboard-hero>div>p:not(.eyebrow)",v("dashboardIntro"));
  setHTML("#continueBtn",v("continue"));setHTML("#browseBooksBtn",v("browse"));
  const statLabels=document.querySelectorAll(".dashboard-stat small");["studyStreak","wordsStudied","correctAnswers","achievements"].forEach((k,i)=>{if(statLabels[i])statLabels[i].innerHTML=v(k)});
  const panels=document.querySelectorAll(".dashboard-panel .panel-title");if(panels[0]){panels[0].querySelector(".eyebrow").innerHTML=v("pickup");panels[0].querySelector("h2").innerHTML=v("continueTitle")};if(panels[1]){panels[1].querySelector(".eyebrow").innerHTML=v("daily");panels[1].querySelector("h2").innerHTML=v("missions")};if(panels[2]){panels[2].querySelector(".eyebrow").innerHTML=v("trophy");panels[2].querySelector("h2").innerHTML=v("achievements")}
  const th=document.querySelector("#textbookSection");if(th){th.querySelector(".eyebrow").innerHTML=v("chooseGrade");th.querySelector("h2").innerHTML=v("textbooks");th.querySelector("p:not(.eyebrow)").innerHTML=v("chooseBook")}
  setHTML("#backHomeBtn",v("home"));setHTML("#backUnitsBtn",v("unitsBack"));setHTML("#unitsView .page-heading p:not(.eyebrow)",v("unitHelp"));
  const ss=document.querySelectorAll("#studyView .stats small");["words","studied","favorites","wrong"].forEach((k,i)=>{if(ss[i])ss[i].innerHTML=v(k)});setHTML(".progress-label b",v("progress"));
  setHTML("#flashcards .game-head h2",v("flip"));setHTML("#flashcards .game-head p",v("flipHelp"));setHTML("#resetProgressBtn",v("reset"));setHTML("#shuffleCardsBtn",v("shuffle"));setHTML("#clearFiltersBtn",v("clear"));
  document.querySelectorAll(".mode-btn").forEach(btn=>{const small=btn.querySelector("small");if(!small)return;const raw=[...btn.childNodes].find(n=>n.nodeType===3);if(!raw)return;const enLabel=raw.textContent.trim();const jaLabel=small.textContent.trim();btn.innerHTML=mode==="en"?`${btn.textContent.trim().split(/\s/)[0]} ${enLabel}`:mode==="ja"?`${btn.textContent.trim().split(/\s/)[0]} ${jaLabel}`:`${btn.textContent.trim().split(/\s/)[0]} ${enLabel}<small>${jaLabel}</small>`});
  document.querySelectorAll(".language-option").forEach(b=>b.classList.toggle("active",b.dataset.language===mode));
  renderDashboard();
}
function chooseLanguage(lang){interfaceLanguage=lang;localStorage.setItem("portalLanguage",lang);$("languageWelcome").classList.add("hidden");$("languageSettings").classList.add("hidden");applyInterfaceLanguage();toast(lang==="ja"?"日本語に変更しました":lang==="en"?"Language changed to English":"Bilingual mode selected")}
$("languageBtn").onclick=()=>$("languageSettings").classList.remove("hidden");$("closeLanguageSettings").onclick=()=>$("languageSettings").classList.add("hidden");
document.querySelectorAll(".language-option").forEach(b=>b.onclick=()=>chooseLanguage(b.dataset.language));
["languageWelcome","languageSettings"].forEach(id=>$(id).addEventListener("click",e=>{if(e.target===$(id)&&id==="languageSettings")$(id).classList.add("hidden")}));
if(!interfaceLanguage)$("languageWelcome").classList.remove("hidden");
applyInterfaceLanguage();

/* v1.5 Adventure Mode */
let adventureCoins=Number(localStorage.getItem("adventureCoins")||0);
let adventureProgress=JSON.parse(localStorage.getItem("adventureProgress")||'{"nh1":0,"nh2":0,"nh3":0}');
let activeWorld=null,battleWords=[],battleIndex=0,playerHealth=100,enemyHealth=100,battleIsBoss=false;
const ADVENTURE_WORLDS=[
  {id:"nh1",icon:"🏫",name:"School World",ja:"スクールワールド",desc:"Begin your journey with New Horizon 1.",className:"world-school",enemy:"Word Slime",boss:"School Dragon",bossIcon:"🐲"},
  {id:"nh2",icon:"🌳",name:"Forest World",ja:"フォレストワールド",desc:"Explore New Horizon 2 vocabulary.",className:"world-forest",enemy:"Forest Goblin",boss:"Forest Guardian",bossIcon:"🦖"},
  {id:"nh3",icon:"🏰",name:"Castle World",ja:"キャッスルワールド",desc:"Master New Horizon 3 and conquer the castle.",className:"world-castle",enemy:"Castle Knight",boss:"Vocabulary Dragon",bossIcon:"🐉"}
];
function saveAdventure(){localStorage.setItem("adventureCoins",adventureCoins);localStorage.setItem("adventureProgress",JSON.stringify(adventureProgress));}
function getWorldWords(id){const d=PORTAL_DATA[id];return Object.values(d.units||{}).flatMap(u=>u.words||[]).map(W);}
function renderAdventure(){
  $("coinValue").textContent=adventureCoins;
  $("avatarCoinValue").textContent=adventureCoins.toLocaleString();
  $("worldGrid").innerHTML="";
  ADVENTURE_WORLDS.forEach((w,i)=>{
    const unlocked=i===0||adventureProgress[ADVENTURE_WORLDS[i-1].id]>=4;
    const card=document.createElement("button");card.className=`world-card ${w.className}${unlocked?"":" locked"}`;
    card.innerHTML=`<div class="world-icon">${unlocked?w.icon:"🔒"}</div><h2>${w.name}</h2><b>${w.ja}</b><p>${w.desc}</p><div class="world-progress"><i style="width:${Math.min(100,(adventureProgress[w.id]||0)/4*100)}%"></i></div><small>${adventureProgress[w.id]||0} / 4 stages cleared</small>`;
    if(unlocked)card.onclick=()=>openAdventureWorld(w.id);$("worldGrid").appendChild(card);
  });
}
function openAdventure(){showView("adventureView");$("stagePanel").classList.add("hidden");$("battlePanel").classList.add("hidden");renderAdventure();}
function openAdventureWorld(id){activeWorld=id;const w=ADVENTURE_WORLDS.find(x=>x.id===id);$("worldGrid").classList.add("hidden");$("stagePanel").classList.remove("hidden");$("worldLabel").textContent=`${PORTAL_DATA[id].title} · ADVENTURE`;$("worldTitle").textContent=`${w.icon} ${w.name} / ${w.ja}`;$("worldDescription").textContent=w.desc;renderStages();}
function renderStages(){const cleared=adventureProgress[activeWorld]||0;$("stageGrid").innerHTML="";[1,2,3,4].forEach(n=>{const boss=n===4,unlocked=n<=cleared+1,complete=n<=cleared;const b=document.createElement("button");b.className=`stage-card${boss?" boss-stage":""}${unlocked?"":" locked"}${complete?" complete":""}`;b.innerHTML=`<div class="stage-icon">${complete?"✅":boss?"🐉":"⭐"}</div><h3>${boss?"Boss Battle":`Stage ${n}`}</h3><small>${boss?"ボスバトル":`ステージ ${n}`}</small>`;if(unlocked)b.onclick=()=>startAdventureBattle(n,boss);$("stageGrid").appendChild(b);});}
function startAdventureBattle(stage,boss){
  battleIsBoss=Boolean(boss);
  battleIndex=0;
  playerHealth=100;
  enemyHealth=battleIsBoss?150:100;
  const pool=shuffle(getWorldWords(activeWorld));
  battleWords=pool.slice(0,battleIsBoss?10:5);
  $("stagePanel").classList.add("hidden");
  $("battlePanel").classList.remove("hidden");
  const w=ADVENTURE_WORLDS.find(x=>x.id===activeWorld);
  $("bossArt").textContent=battleIsBoss?w.bossIcon:"👾";
  $("enemyName").textContent=battleIsBoss?w.boss:w.enemy;
  $("battleStageLabel").textContent=battleIsBoss?"FINAL BOSS / 最終ボス":`STAGE ${stage} / ステージ ${stage}`;
  $("battleTitle").textContent=battleIsBoss?`${w.boss} Battle`:`${w.enemy} Battle`;
  $("battlePanel").dataset.stage=String(stage);
  updateBattleBars();
  renderBattleQuestion();
}
function updateBattleBars(){
  const maxEnemy=battleIsBoss?150:100;
  $("playerHP").style.width=`${Math.max(0,Math.min(100,playerHealth))}%`;
  $("enemyHP").style.width=`${Math.max(0,Math.min(100,(enemyHealth/maxEnemy)*100))}%`;
}
function renderBattleQuestion(){
  if(enemyHealth<=0){finishBattle(true);return;}
  if(playerHealth<=0){finishBattle(false);return;}
  if(battleIndex>=battleWords.length){finishBattle(enemyHealth<=0);return;}
  const current=battleWords[battleIndex];
  const distractors=shuffle(getWorldWords(activeWorld).filter(x=>x.english!==current.english)).slice(0,3);
  $("battlePrompt").textContent=current.japanese;
  $("battleFeedback").textContent=`Question ${battleIndex+1} / ${battleWords.length}`;
  $("battleChoices").innerHTML="";
  shuffle([current,...distractors]).forEach(c=>{
    const b=document.createElement("button");
    b.className="choice";
    b.textContent=c.english;
    b.onclick=()=>answerBattle(b,c.english===current.english,current);
    $("battleChoices").appendChild(b);
  });
}
function answerBattle(btn,correct,word){
  const buttons=[...document.querySelectorAll("#battleChoices .choice")];
  buttons.forEach(b=>b.disabled=true);
  if(correct){
    btn.classList.add("correct");
    enemyHealth=Math.max(0,enemyHealth-(battleIsBoss?18:25));
    $("battleFeedback").textContent=battleIsBoss?"⚔️ Critical Hit!":"⚔️ Great attack!";
  }else{
    btn.classList.add("wrong");
    const right=buttons.find(b=>norm(b.textContent)===norm(word.english));
    if(right)right.classList.add("correct");
    playerHealth=Math.max(0,playerHealth-25);
    $("battleFeedback").textContent=`💥 The answer was ${word.english}.`;
  }
  battleIndex++;
  updateBattleBars();
  try{
    if(correct){addXP(10);markStudied(word);clearWrongWord(word);}
    else markWrong(word);
  }catch(error){console.error("Battle stats error:",error);}
  setTimeout(()=>{
    if(enemyHealth<=0)finishBattle(true);
    else if(playerHealth<=0)finishBattle(false);
    else renderBattleQuestion();
  },850);
}
function finishBattle(win){if(win){const stage=Number($("battlePanel").dataset.stage),reward=battleIsBoss?100:30;adventureCoins+=reward;adventureProgress[activeWorld]=Math.max(adventureProgress[activeWorld]||0,stage);saveAdventure();$("battlePrompt").textContent=battleIsBoss?"🏆 BOSS DEFEATED!":"🎉 STAGE CLEAR!";$("battleChoices").innerHTML=`<button class="primary-btn" id="battleContinue">Collect ${reward} coins and continue</button>`;$("battleFeedback").textContent=`You earned ${reward} coins! / ${reward}コインをゲット！`;$ ("battleContinue").onclick=()=>{renderAdventure();openAdventureWorld(activeWorld)};}else{$("battlePrompt").textContent="Try Again! / もう一度挑戦！";$("battleChoices").innerHTML='<button class="primary-btn" id="battleRetry">Retry Battle</button>';$("battleFeedback").textContent="Review the words and defeat the enemy next time.";$ ("battleRetry").onclick=()=>startAdventureBattle(Number($("battlePanel").dataset.stage),battleIsBoss);}}
$("adventureBtn").onclick=openAdventure;$("backAdventureHomeBtn").onclick=()=>{showView("homeView");$("worldGrid").classList.remove("hidden")};$("closeWorldBtn").onclick=()=>{$("stagePanel").classList.add("hidden");$("worldGrid").classList.remove("hidden");renderAdventure()};$("battleExitBtn").onclick=()=>{openAdventureWorld(activeWorld)};
renderAdventure();

// Refresh multiplayer rewards when returning to NH Interactive
function refreshMultiplayerRewards() {
  xp = Number(localStorage.getItem("portalXP") || 0);
  adventureCoins = Number(localStorage.getItem("adventureCoins") || 0);

  updateStats();
  renderDashboard();
  renderAdventure();
}

window.addEventListener("pageshow", refreshMultiplayerRewards);

$("avatarBtn").onclick=()=>{
  console.log("Avatar clicked:", $("nhAvatarModal"));
  $("nhAvatarModal").classList.remove("hidden");
};

$("nhAvatarClose").onclick=()=>{
  $("nhAvatarModal").classList.add("hidden");
};

