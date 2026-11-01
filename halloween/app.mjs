import {QUESTIONS} from './questions.mjs';
import {newGame,addPlayer,beginQuestion,advance,submit,pauseGame,publicState,rewards,PHASE_LABELS,TEAM_NAMES} from './core.mjs';
const $=s=>document.querySelector(s),app=$('#app');
const params=new URLSearchParams(location.search);let role='home',game=null,view=null,peer=null,conn=null,connections=new Map(),status='',online=false,pending=null,demoStudent=false,lastRevision=-1,joinInfo=null,retryTimer=null,lastScreen='';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const teamName=i=>`${i+1}班 ${TEAM_NAMES[i%TEAM_NAMES.length]}`;
const codeGen=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
const hostId=code=>`tot-halloween-v1-${code}`;
const playerId=code=>{let v=sessionStorage.getItem(`tot-player-${code}`);if(!v){v=crypto.randomUUID();sessionStorage.setItem(`tot-player-${code}`,v);}return v;};
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',5000);}
function setStatus(s,ok=false){status=s;online=ok;const el=$('#connection-status');if(el){el.textContent=s;el.className=`status ${ok?'':'off'}`;}}
function header(){return `<header><a class="brand" href="./">TRICK OR TREAT!<small>みんなで、お菓子争奪クイズ。</small></a><span id="connection-status" class="status ${online?'':'off'}">${esc(status||'HALLOWEEN CLASSROOM')}</span></header>`;}
function shell(body){app.innerHTML=header()+`<main class="shell">${body}</main>`;bind();updateTimer();const s=role==='student'?view:game;const key=`${role}:${s?.index}:${demoStudent}:${s?.phase==='finished'}`;if(key!==lastScreen){window.scrollTo(0,0);lastScreen=key;}}
function home(){role='home';shell(`<section class="hero"><div><div class="eyebrow">50 MINUTES / EVERYONE PLAYS</div><h1>TRICK<br>OR <span>TREAT!</span></h1><p>ひとりで考える。みんなで相談する。<br>全員の答えで、班のお菓子を増やそう。</p></div><div class="hero-illustration" aria-hidden="true">🎃<span class="ghost">👻</span><span class="hero-tag">A LITTLE SPOOKY. A LOT OF FUN.</span></div></section><section class="entry-grid"><form id="join-form" class="card"><div class="eyebrow">FOR STUDENTS</div><h3>クイズに参加する</h3><label for="room-code">先生の画面に出ている6文字</label><input id="room-code" name="code" placeholder="例：AB3D7K" maxlength="6" autocomplete="off" autocapitalize="characters" required value="${esc((params.get('room')||'').replace(/[^A-Z0-9]/gi,'').slice(0,6).toUpperCase())}"><div class="input-row"><div><label for="nickname">ニックネーム（16文字まで）</label><input id="nickname" name="name" maxlength="16" placeholder="例：かぼちゃ太郎" required autocomplete="off"></div><div><label for="team">先生に指定された班</label><select name="team" id="team">${Array.from({length:12},(_,i)=>`<option value="${i}">${teamName(i)}</option>`).join('')}</select></div></div><button class="primary full" style="margin-top:20px">このスマホで参加する →</button><p class="tiny muted" style="margin-top:12px">1人1台で参加。画面を開いたまま待っていてください。</p></form><section class="card"><div class="eyebrow">FOR TEACHERS</div><h3>先生はこちら</h3><p class="small muted" style="margin-top:14px">英語8問＋観察・記憶・ひらめき16問。<br>練習2問を含む、50分のハロウィーン。</p><div class="stack" style="margin-top:24px"><button id="setup-button" class="soft">授業の部屋を作る</button><button id="demo-button">接続なしで画面を試す</button><a href="guide.html" class="small">先生用ガイド・問題一覧 ↗</a></div><div class="divider"></div><p class="tiny muted">生徒はアカウント登録不要。先生のPCは授業中、この画面を開いたままにします。</p></section></section><footer>L7 Section 1–2 ／ 単語アプリ第6回 Lesson 50–56。<br>音声・カメラは使いません。スマホ同士の通信ではなく、各スマホと先生のPCを接続します。</footer>`);}
function setup(){shell(`<div class="eyebrow">MAKE A CLASSROOM</div><h2>お菓子争奪戦の準備。</h2><p class="muted" style="margin:15px 0 25px">生徒が使う班の数と、今日配るマシュマロの合計を決めます。</p><form id="host-form" class="card host-note"><div class="input-row"><div><label for="teams">班の数</label><select id="teams" name="teams">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===9?'selected':''}>${i+1}班</option>`).join('')}</select></div><div><label for="budget">マシュマロの合計個数</label><input type="number" name="budget" id="budget" value="160" min="0" max="5000" step="1" required></div></div><p class="small muted" style="margin:20px 0">正解した割合で班に加点。全員正解はボーナス。人数の違う班も、同じ満点を目指せます。<br>最後の4問は得点2倍です。</p><button class="primary">部屋を作って受付を始める →</button></form><div class="teacher-nav"><button id="restore-button">このPCの前回の部屋を再開</button><a href="guide.html">使い方を見る</a></div>`);}
function startHost(teams,budget,restore=false){
 if(!window.Peer){toast('通信ライブラリを読み込めませんでした。再読み込みしてください。');return;}
 try{game=restore?JSON.parse(localStorage.getItem('tot-host-game')):newGame(codeGen(),QUESTIONS,teams,budget);if(!game)throw Error();if(restore&&game.deadline){game.remaining=game.paused?game.remaining:Math.max(10000,game.deadline-Date.now());game.paused=true;}}catch{toast('保存された部屋がありません。');return;}
 role='host';status='部屋を準備しています…';online=false;renderHost();
 peer=new Peer(hostId(game.code),{debug:0});
 peer.on('open',()=>{setStatus('部屋を開いています',true);saveBroadcast();});
 peer.on('connection',c=>{
  c.on('data',data=>{
   if(!data||typeof data!=='object')return;
   if(data.type==='join'){
    try{
     if(typeof data.id!=='string'||data.id.length>60||typeof data.name!=='string')throw Error('参加情報を確認してください。');
     addPlayer(game,data.id,data.name,Number(data.team));
     const old=connections.get(data.id);connections.set(data.id,c);c.playerId=data.id;if(old&&old!==c)old.close();
     c.send({type:'welcome',id:data.id});saveBroadcast();
    }catch(e){c.send({type:'reject',message:e.message});}
   }else if(data.type==='answer'&&c.playerId&&connections.get(c.playerId)===c){
    if(data.index!==game.index||data.phase!==game.phase){c.send({type:'notice',message:'回答時間が切り替わりました。画面を確認してください。'});sendView(c,c.playerId);return;}
    const ok=submit(game,c.playerId,data.choice);if(ok)saveBroadcast();
    else{c.send({type:'notice',message:game.paused?'先生が一時停止しています。':'現在は回答を受け付けていません。'});sendView(c,c.playerId);}
   }else if(data.type==='ping'&&c.playerId)sendView(c,c.playerId);
  });
  c.on('close',()=>{if(c.playerId&&connections.get(c.playerId)===c){connections.delete(c.playerId);if(game.phase==='lobby')renderHost();}});
  c.on('error',()=>{});
 });
 peer.on('error',err=>{setStatus('接続を確認してください');toast(err.type==='unavailable-id'?'この部屋は別のタブで開かれています。そのタブに戻ってください。':'部屋の接続に失敗しました。学校の回線で接続できるか確認してください。');});
 peer.on('disconnected',()=>{setStatus('接続し直しています…');if(!peer.destroyed)peer.reconnect();});
}
function sendView(c,id){if(c.open)c.send({type:'state',state:publicState(game,id)});}
function saveBroadcast(){
 if(!game)return;game.revision++;
 if(role==='host'){localStorage.setItem('tot-host-game',JSON.stringify(game));for(const [id,c] of connections)sendView(c,id);renderHost();}
 else if(role==='demo'){renderDemo();}
}
function startStudent(code,name,team){
 if(!/^[A-Z0-9]{6}$/.test(code)){toast('部屋の6文字を確認してください。');return;}
 if(!window.Peer){toast('通信の準備ができませんでした。再読み込みしてください。');return;}
 role='student';joinInfo={code,name,team,id:playerId(code)};status='先生の部屋につないでいます…';view=null;online=false;renderStudent();
 sessionStorage.setItem('tot-last-join',JSON.stringify(joinInfo));
 peer=new Peer({debug:0});
 peer.on('open',connectStudent);
 peer.on('disconnected',()=>{setStatus('通信が切れました。再接続中…');if(!peer.destroyed)peer.reconnect();});
 peer.on('error',()=>{setStatus('接続待ち・部屋の文字を確認');toast('先生の部屋に接続できません。部屋の文字と回線を確認してください。');scheduleRetry();});
}
function scheduleRetry(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(role==='student'&&peer&&!peer.destroyed&&!conn?.open)connectStudent();},6000);}
function connectStudent(){
 if(conn?.open)return;
 conn=peer.connect(hostId(joinInfo.code),{reliable:true});
 const current=conn;
 current.on('open',()=>{clearTimeout(retryTimer);setStatus('接続しています',true);current.send({type:'join',...joinInfo});});
 current.on('data',data=>{
  if(data?.type==='state'){
   if(!data.state||data.state.revision<lastRevision)return;
   lastRevision=data.state.revision;view=data.state;pending=null;setStatus('接続しています',true);renderStudent();
  }else if(data?.type==='reject'){const message=data.message;clearTimeout(retryTimer);role='home';sessionStorage.removeItem('tot-last-join');const oldPeer=peer;peer=null;conn=null;joinInfo=null;view=null;lastRevision=-1;oldPeer?.destroy();setStatus('入室情報を確認してください');home();toast(message);}
  else if(data?.type==='notice'){pending=null;toast(data.message);}
 });
 current.on('close',()=>{if(current===conn){setStatus('通信が切れました。再接続中…');scheduleRetry();renderStudent();}});
 current.on('error',()=>{setStatus('先生との接続を確認');scheduleRetry();});
}
function scoreboard(s,ownTeam){const max=Math.max(1,...s.scores);return `<div class="score-list">${s.scores.map((score,i)=>({i,score})).sort((a,b)=>b.score-a.score||a.i-b.i).map((x,rank)=>`<div class="score-row ${x.i===ownTeam?'self':''}"><span>${rank+1}</span><span>${esc(teamName(x.i))}</span><strong>${x.score}</strong><div class="bar"><i style="width:${x.score/max*100}%"></i></div></div>`).join('')}</div>`;}
function renderVisual(q){if(!q.visual||q.kind==='english')return '';const v=q.visual;return `<div class="visual type-${esc(v.type)} ${v.columns>=9?'wide-visual':''} ${v.columns===1&&v.type==='grid'?'text-rows':''}" style="grid-template-columns:repeat(${Math.max(1,Math.min(12,v.columns||1))},minmax(0,1fr))" aria-label="問題の図">${v.items.map((x,i)=>`<span class="${v.highlight===i?'highlight':''}">${esc(x)}</span>`).join('')}</div>`;}
function renderPrompt(q,phase){if(phase==='memory')return '<h2 class="prompt">絵の位置・順番・数を覚えよう。</h2>';if(q.kind!=='english')return `<h2 class="prompt">${esc(q.prompt)}</h2>`;const [sentence,target,...help]=q.prompt.split('\n');return `<h2 class="prompt">${esc(sentence)}</h2><p class="prompt-target">${esc(target)}</p>${help.length?`<p class="prompt-help">${esc(help.join('\n'))}</p>`:''}`;}
function questionContent(s,student=false){
 const q=s.question,phase=s.phase;if(!q)return '';
 const active=student&&(phase==='think'||phase==='final')&&!s.paused&&online&&s.roster.includes(s.own?.id);
 const selected=phase==='think'?s.draft:s.answer;
 const info=q.practice?'練習問題':q.final?'FINAL / 得点2倍':`QUESTION ${s.index-1} / 24`;
 const phaseHint={memory:'絵が消えるまで、全体を覚えよう。',think:'相談の前に、自分の予想を送ろう。',discuss:'スマホから顔を上げて、班で理由を話そう。',final:'全員、自分のスマホで最終回答を送ろう。',reveal:'答えと理由を確認しよう。'}[phase];
 return `<div class="row spread"><span class="pill orange">${esc(info)}</span><span class="pill">${esc(q.category)}</span></div><div class="steps">${['think','discuss','final'].map((p,i)=>`<div class="step ${phase===p?'active':''}">${i+1}. ${PHASE_LABELS[p]}</div>`).join('')}</div><div class="row spread"><strong>${esc(phaseHint)}</strong><span class="timer" data-deadline="${s.deadline}" data-paused="${s.paused}" data-remaining="${s.remaining||0}"></span></div><p class="question-title">${esc(q.title)}</p>${renderPrompt(q,phase)}${phase==='memory'?renderVisual(q):q.kind==='memory'&&phase!=='reveal'?`<div class="memory-mask"><strong>👻</strong><span class="muted">絵は消えました。思い出してみよう。</span></div>`:renderVisual(q)}${phase==='memory'?'':`<div class="options">${q.options.map((o,i)=>`<button class="option ${selected===i?'selected':''} ${phase==='reveal'&&q.answer===i?'correct':''} ${phase==='reveal'&&selected===i&&selected!==q.answer?'wrong':''}" ${active?'':'disabled'} data-choice="${i}"><b>${'ABCD'[i]}</b><span>${esc(o)}</span></button>`).join('')}</div>`}${student&&['think','final'].includes(phase)?`<div class="${selected!==null?'confirm':'small muted'}" style="margin-top:16px">${pending!==null?'<span class="sending">送信しています…</span>':selected!==null?`${phase==='think'?'予想':'最終回答'} ${'ABCD'[selected]} を受け付けました。時間内なら変更できます。`:'選択肢をタップすると送信されます。'}</div>`:''}${phase==='discuss'&&student?`<p class="small muted" style="margin-top:18px">最初の予想：${s.draft!==null?'ABCD'[s.draft]:'未送信'}。最終回答の時間に、もう一度送信してください。</p>`:''}${phase==='reveal'?`<div class="explanation"><strong>正解：${'ABCD'[q.answer]} ${esc(q.options[q.answer])}</strong><p style="margin-top:8px">${esc(q.explanation)}</p></div>`:''}`;
}
function renderHost(){
 if(!game)return;const s=publicState(game),players=Object.values(game.players);
 if(game.phase==='lobby'){
  const url=new URL(location.href);url.search='';url.searchParams.set('room',game.code);
  shell(`<div class="eyebrow">THE CLASSROOM IS OPEN</div><h2>全員のスマホで、ここに集合。</h2><section class="card" style="margin-top:24px"><div class="row spread"><div><p class="muted">部屋の6文字</p><div class="big-code">${game.code}</div><div class="row"><button id="copy-link">参加リンクをコピー</button><span class="tiny muted">同じURLを全員に配布できます。</span></div></div><div><span class="count">${players.length}</span><span class="muted">人 入室済み ／ 接続中 ${connections.size}人</span><p class="small muted">${game.teamCount}班 ／ マシュマロ${game.budget}個</p></div></div></section><div class="roster">${Array.from({length:game.teamCount},(_,i)=>`<div class="team-card"><h3>${teamName(i)}</h3><div class="names">${players.filter(p=>p.team===i).map(p=>`<div class="${connections.has(p.id)?'':'offline'}">${connections.has(p.id)?'●':'○'} ${esc(p.name)}</div>`).join('')||'参加待ち'}</div></div>`).join('')}</div><div class="teacher-nav"><button class="primary" data-action="next" ${players.length&&online?'':'disabled'}>全員そろったら練習を始める →</button><button id="export-roster">参加者一覧を保存</button></div><p class="tiny muted" style="margin-top:15px">開始時に参加している人数で各問の得点を計算します。欠席者・重複入室は開始前に下の一覧で確認してください。</p><details style="margin-top:20px"><summary>入室の修正・重複を取り消す</summary><div class="stack" style="margin-top:12px">${players.map(p=>`<div class="row spread"><span>${teamName(p.team)} / ${esc(p.name)}</span><button data-remove="${esc(p.id)}">この参加を取り消す</button></div>`).join('')}</div></details><footer>50分の目安：入室5分 → 練習5分 → 通常20問30分 → 最後4問5分 → 結果・配布5分。</footer>`);return;
 }
 if(game.phase==='finished'){renderResults(s,true);return;}
 shell(`<div class="row spread topline"><span class="eyebrow" style="margin:0">ROOM ${game.code} / TEACHER</span><span class="small muted">${connections.size}人接続中 ／ ${players.length}人登録</span></div><div class="stage-grid"><section class="card question-card">${questionContent(s)}</section><aside class="sidebar stack"><section class="card"><div class="eyebrow">CLASS PROGRESS</div><h3>${PHASE_LABELS[game.phase]}</h3><p style="margin-top:15px"><span class="count">${game.phase==='think'?s.draftCount:s.answerCount}</span> / ${s.roster.length} 人 ${game.phase==='think'?'予想済み':'最終回答済み'}</p><div class="stack" style="margin-top:20px">${game.phase==='reveal'?`<button class="primary" data-action="next">${game.index===game.questions.length-1?'結果を発表する →':'次の問題へ →'}</button>`:`<button class="primary" data-action="advance">${{memory:'絵を隠して予想へ',think:'相談の時間へ',discuss:'最終回答へ',final:'回答を締め切って正解発表'}[game.phase]}</button><button data-action="pause">${game.paused?'タイマーを再開':'タイマーを一時停止'}</button>`}</div><p class="tiny muted" style="margin-top:14px">時間が0になると次の段階に進みます。答え合わせの後は、先生が「次の問題へ」を押します。</p></section><section class="card"><h3>お菓子ポイント</h3>${scoreboard(s)}</section><section class="card"><label style="margin:0"><input type="checkbox" id="late-toggle" ${game.allowLate?'checked':''} style="width:auto"> 途中参加を受け付ける</label><p class="tiny muted">新しい参加者は次の問題から得点対象です。同じ端末の再接続は常に受け付けます。</p></section></aside></div>`);
}
function renderStudent(){
 if(!view){shell(`<div class="memory-mask" style="margin-top:45px"><strong>🎃</strong><h2>先生の部屋に接続しています。</h2><p class="muted">${esc(joinInfo?.name)} ／ ${esc(teamName(joinInfo?.team||0))}</p></div><div class="row"><button id="retry-button">接続をやり直す</button><button id="leave-button">入室画面へ戻る</button></div>`);return;}
 const s=view;if(s.phase==='finished'){renderResults(s,false);return;}
 if(s.phase==='lobby'){
  const team=s.players.filter(p=>p.team===s.own?.team);
  shell(`<div class="eyebrow">YOU'RE IN!</div><h2>${esc(s.own?.name)}、準備OK。</h2><section class="card" style="margin-top:25px"><div class="winner">🎃 👻</div><h3>${esc(teamName(s.own?.team||0))}</h3><p class="muted" style="margin-top:10px">班のメンバー：${team.map(p=>esc(p.name)).join('・')}</p><div class="divider"></div><p>先生が始めるまで、この画面で待っていてください。</p><div class="steps"><div class="step">1. 自分で予想</div><div class="step">2. 班で相談</div><div class="step">3. 全員が最終回答</div></div><p class="tiny muted">最初の予想だけでは得点になりません。最終回答も忘れずに。通信が切れたら自動で接続し直します。</p></section>`);return;
 }
 shell(`<div class="row spread topline"><span class="pill green">${esc(teamName(s.own?.team||0))}</span><span class="small muted">${esc(s.own?.name)}</span></div>${!online?'<div class="banner">接続を戻しています。送信完了の表示が出るまで、この画面で待っていてください。</div>':''}${!s.roster.includes(s.own?.id)?'<div class="banner">途中参加を受け付けました。次の問題から得点対象です。</div>':''}<div class="stage-grid"><section class="card question-card">${questionContent(s,true)}</section><aside class="sidebar card"><h3>班のお菓子ポイント</h3>${scoreboard(s,s.own?.team)}</aside></div>`);
}
function renderResults(s,teacher){const count=i=>s.players.filter(p=>p.team===i).length;const ranking=s.scores.map((score,i)=>({score,i})).filter(x=>count(x.i)).sort((a,b)=>b.score-a.score||a.i-b.i);shell(`<div class="eyebrow">HAPPY HALLOWEEN!</div><h2>みんなの答えが、お菓子になった。</h2><p class="muted" style="margin-top:16px">24問、おつかれさま！ ${ranking[0]?`最多ポイントは ${esc(teamName(ranking[0].i))}。`:''}</p><div class="result-grid">${ranking.map(x=>`<section class="card result-card"><span class="pill">${1+ranking.filter(t=>t.score>x.score).length}位</span><h3 style="margin:20px 0 8px">${esc(teamName(x.i))}</h3><p class="muted">${x.score}ポイント ／ ${count(x.i)}人</p><div style="margin-top:18px">👻 <span class="reward">${s.rewards[x.i]}</span> 個</div><p class="tiny muted">班で分けるマシュマロの目安</p></section>`).join('')}</div><div class="banner" style="margin-top:25px">マシュマロは班で分けます。合計${s.rewards.reduce((a,b)=>a+b,0)}個。半分を人数、半分を獲得ポイントに応じて配分しています。</div>${teacher?'<button class="primary" id="export-results">結果をCSVで保存</button>':''}<footer>来年も、TRICK OR TREAT!</footer>`);}
function startDemo(){role='demo';online=true;status='体験モード・本番の部屋ではありません';game=newGame('DEMO00',QUESTIONS,2,32);for(let i=0;i<8;i++)addPlayer(game,`demo${i}`,['かぼちゃ','おばけ','ねこ','こうもり','つき','ほし','あめ','まほう'][i],i<4?0:1);beginQuestion(game);renderDemo();}
function renderDemo(){
 view=publicState(game,'demo0');if(demoStudent){renderStudent();}else{renderHost();}
 const bar=document.createElement('div');bar.className='banner row';bar.style.marginTop='25px';bar.innerHTML=`<span class="demo-badge">画面体験中</span><button id="demo-switch">${demoStudent?'先生の表示へ':'生徒の表示へ'}</button><button id="demo-skip">${game.phase==='reveal'?'次の問題へ':'次の段階へ'}</button><button id="demo-end">結果を試す</button><a href="./">戻る</a>`;$('main').append(bar);
 $('#demo-switch').onclick=()=>{demoStudent=!demoStudent;renderDemo();};
 $('#demo-skip').onclick=()=>{demoFill();if(game.phase==='reveal')beginQuestion(game);else advance(game);saveBroadcast();};
 $('#demo-end').onclick=()=>{game.phase='finished';saveBroadcast();};
}
function demoFill(){if(game.phase==='final')for(const id of game.roster){const n=Number(id.replace('demo',''));submit(game,id,n%3===0?(game.questions[game.index].answer+1)%4:game.questions[game.index].answer,Math.min(Date.now(),game.deadline-1));}}
function updateTimer(){for(const el of document.querySelectorAll('[data-deadline]')){const d=Number(el.dataset.deadline),left=el.dataset.paused==='true'?Number(el.dataset.remaining):d-Date.now();el.textContent=d?(el.dataset.paused==='true'?'⏸ ':'')+`${Math.max(0,Math.ceil(left/1000))}s`:'';el.classList.toggle('urgent',left<6000);}}
function download(filename,content,type='text/csv;charset=utf-8'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF',content],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function csvCell(x){let t=String(x??'');if(/^[=+@-]/.test(t))t="'"+t;return '"'+t.replace(/"/g,'""')+'"';}
function bind(){
 $('#join-form')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);startStudent(String(f.get('code')).trim().toUpperCase(),String(f.get('name')).trim(),Number(f.get('team')));});
 $('#setup-button')?.addEventListener('click',setup);$('#demo-button')?.addEventListener('click',startDemo);
 $('#host-form')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.target);startHost(Number(f.get('teams')),Number(f.get('budget')));});
 $('#restore-button')?.addEventListener('click',()=>startHost(0,0,true));
 $('#copy-link')?.addEventListener('click',async()=>{const url=new URL(location.href);url.search='';url.searchParams.set('room',game.code);try{await navigator.clipboard.writeText(url.href);toast('参加リンクをコピーしました。');}catch{toast(url.href);}});
 document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',()=>{try{if(el.dataset.action==='next')beginQuestion(game);else if(el.dataset.action==='advance'){if(role==='demo')demoFill();advance(game);}else pauseGame(game);saveBroadcast();}catch(e){toast(e.message);}}));
 document.querySelectorAll('[data-choice]').forEach(el=>el.addEventListener('click',()=>{
  const choice=Number(el.dataset.choice);pending=choice;
  if(role==='demo'){submit(game,'demo0',choice);pending=null;saveBroadcast();}
  else if(conn?.open){conn.send({type:'answer',choice,index:view.index,phase:view.phase});renderStudent();}else{pending=null;toast('接続待ちです。送信完了まで待ってください。');}
 }));
 $('#late-toggle')?.addEventListener('change',e=>{game.allowLate=e.target.checked;saveBroadcast();});
 document.querySelectorAll('[data-remove]').forEach(el=>el.addEventListener('click',()=>{const id=el.dataset.remove;connections.get(id)?.send({type:'reject',message:'先生が入室を取り消しました。正しい班で入り直してください。'});connections.get(id)?.close();connections.delete(id);delete game.players[id];saveBroadcast();}));
 $('#export-roster')?.addEventListener('click',()=>download('halloween-roster.csv',[['班','ニックネーム'],...Object.values(game.players).map(p=>[teamName(p.team),p.name])].map(r=>r.map(csvCell).join(',')).join('\r\n')));
 $('#export-results')?.addEventListener('click',()=>download('halloween-results.csv',[['班','人数','ポイント','マシュマロ個数'],...game.scores.map((score,i)=>[teamName(i),Object.values(game.players).filter(p=>p.team===i).length,score,rewards(game)[i]])].map(r=>r.map(csvCell).join(',')).join('\r\n')));
 $('#retry-button')?.addEventListener('click',()=>{if(peer&&!peer.destroyed){if(peer.disconnected)peer.reconnect();else connectStudent();}});
 $('#leave-button')?.addEventListener('click',()=>{peer?.destroy();sessionStorage.removeItem('tot-last-join');location.href='./';});
}
setInterval(()=>{updateTimer();if(['host','demo'].includes(role)&&game?.deadline&&!game.paused&&Date.now()>=game.deadline){if(role==='demo')demoFill();advance(game);saveBroadcast();}},250);
setInterval(()=>{if(role==='student'&&conn?.open)conn.send({type:'ping'});},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&role==='student'){if(conn?.open)conn.send({type:'ping'});else scheduleRetry();}});
if(params.has('demo'))startDemo();else{
 let last;try{last=JSON.parse(sessionStorage.getItem('tot-last-join'));}catch{}
 if(last&&(!params.get('room')||params.get('room')===last.code))startStudent(last.code,last.name,last.team);else home();
}
