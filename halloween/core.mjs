export const PHASE_LABELS = {lobby:'入室受付',memory:'覚える',think:'まず自分で',discuss:'班で相談',final:'最終回答',reveal:'答え合わせ',finished:'結果発表'};
export const TEAM_NAMES = ['パンプキン','ゴースト','ブラックキャット','バット','ウィッチ','ムーン','スパイダー','キャンディ','ヴァンパイア','スケルトン','ランタン','マジック'];
export function newGame(code,questions,teams=10,budget=160){return {version:1,code,questions,teamCount:teams,budget,phase:'lobby',index:-1,players:{},roster:[],drafts:{},answers:{},scores:Array(teams).fill(0),history:[],deadline:0,paused:false,remaining:0,allowLate:false,revision:0};}
export function addPlayer(s,id,name,team){
 if(s.players[id])return s.players[id];
 if(s.phase!=='lobby'&&!s.allowLate)throw Error('授業が始まっています。先生に途中参加の受付をお願いしてください。');
 if(!name.trim()||name.trim().length>16)throw Error('ニックネームは1〜16文字で入力してください。');
 if(!Number.isInteger(team)||team<0||team>=s.teamCount)throw Error('班を選んでください。');
 if(Object.keys(s.players).length>=80)throw Error('定員に達しました。');
 return s.players[id]={id,name:name.trim(),team,joined:Date.now()};
}
export function beginQuestion(s,now=Date.now()){
 if(!['lobby','reveal'].includes(s.phase))throw Error('答え合わせの後に次の問題へ進めます。');
 if(s.index+1>=s.questions.length){s.phase='finished';s.deadline=0;return;}
 if(!Object.keys(s.players).length)throw Error('参加者が入室してから始めてください。');
 s.index++;s.roster=Object.keys(s.players);s.drafts={};s.answers={};s.paused=false;
 s.phase=s.questions[s.index].kind==='memory'?'memory':'think';
 s.deadline=now+(s.phase==='memory'?(s.questions[s.index].memorySeconds||8):15)*1000;
}
export function submit(s,id,choice,now=Date.now()){
 if(!s.roster.includes(id)||!Number.isInteger(choice)||choice<0||choice>3) return false;
 if(s.paused||now>=s.deadline)return false;
 if(s.phase==='think'){s.drafts[id]=choice;return true;}
 if(s.phase==='final'){s.answers[id]=choice;return true;}
 return false;
}
export function scoreQuestion(s){
 if(s.history.some(x=>x.index===s.index))return;
 const q=s.questions[s.index];const multiplier=q.practice?0:(q.final?2:1);
 const round=Array.from({length:s.teamCount},(_,team)=>{
  const members=s.roster.filter(id=>s.players[id].team===team);
  const correct=members.filter(id=>s.answers[id]===q.answer).length;
  const points=members.length?Math.round((100*correct/members.length+(correct===members.length?20:0))*multiplier):0;
  s.scores[team]+=points;
  return {team,count:members.length,correct,points};
 });
 s.history.push({index:s.index,id:q.id,round});
}
export function advance(s,now=Date.now()){
 if(s.phase==='memory'){s.phase='think';s.deadline=now+15000;}
 else if(s.phase==='think'){s.phase='discuss';s.deadline=now+30000;}
 else if(s.phase==='discuss'){s.phase='final';s.deadline=now+15000;}
 else if(s.phase==='final'){scoreQuestion(s);s.phase='reveal';s.deadline=0;}
 else return false;
 s.paused=false;return true;
}
export function pauseGame(s,now=Date.now()){
 if(!s.deadline)return;
 if(s.paused){s.deadline=now+s.remaining;s.paused=false;}
 else{s.remaining=Math.max(0,s.deadline-now);s.paused=true;}
}
export function rewards(s){
 const counts=Array.from({length:s.teamCount},(_,i)=>Object.values(s.players).filter(p=>p.team===i).length);
 const active=counts.map((n,i)=>n?i:-1).filter(i=>i>=0);
 const budget=Math.max(0,Math.floor(s.budget));
 if(!active.length)return counts.map(()=>0);
 // Allocate half equally per pupil, half by team achievement. Integer largest-remainder rounding preserves the budget.
 const totalPupils=counts.reduce((a,b)=>a+b,0);const totalScore=active.reduce((a,i)=>a+s.scores[i],0);
 const raw=counts.map((n,i)=>n?budget*(.5*n/totalPupils+.5*(totalScore?s.scores[i]/totalScore:n/totalPupils)):0);
 const allocated=raw.map(Math.floor);let left=budget-allocated.reduce((a,b)=>a+b,0);
 const order=active.slice().sort((a,b)=>(raw[b]-allocated[b])-(raw[a]-allocated[a])||a-b);
 for(let n=0;n<left;n++)allocated[order[n%order.length]]++;
 return allocated;
}
export function publicState(s,playerId){
 const current=s.questions[s.index];
 const question=current?{...current}:null;
 if(question&&s.phase!=='reveal'&&s.phase!=='finished'){delete question.answer;delete question.explanation;delete question.source;}
 return {code:s.code,phase:s.phase,index:s.index,total:s.questions.length,teamCount:s.teamCount,deadline:s.deadline,paused:s.paused,remaining:s.remaining,question,players:Object.values(s.players),roster:s.roster,scores:s.scores,history:s.history,revision:s.revision,
 draftCount:Object.keys(s.drafts).length,answerCount:Object.keys(s.answers).length,
 draft:playerId in s.drafts?s.drafts[playerId]:null,answer:playerId in s.answers?s.answers[playerId]:null,
 own:playerId?s.players[playerId]:null,rewards:s.phase==='finished'?rewards(s):null};
}
