export async function createPeerOptions() {
 return {debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:['turn:eu-0.turn.peerjs.com:3478','turn:us-0.turn.peerjs.com:3478','turn:eu-0.turn.peerjs.com:3478?transport=tcp','turn:us-0.turn.peerjs.com:3478?transport=tcp'],username:'peerjs',credential:'peerjsp'}]}};
}

// A fresh Peer instance on each failed attempt also closes stalled ICE negotiations.
// Generation checks prevent an old attempt from replacing a newer connection.
export class StudentTransport {
 constructor({makePeer,target,info,onState,onStatus,onReject,onNotice,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,random=Math.random}) {
  Object.assign(this,{makePeer,target,info,onState,onStatus,onReject,onNotice,setTimer,clearTimer,now,random});
  this.epoch=0;this.attempts=0;this.stopped=false;this.connected=false;this.lastStateAt=0;
 }
 start(){this.stopped=false;this._attempt();}
 _clear(){this.clearTimer(this.timer);this.clearTimer(this.retryTimer);this.timer=null;this.retryTimer=null;}
 _dispose(){const c=this.connection,p=this.peer;this.connection=null;this.peer=null;try{c?.close();}catch{}try{p?.destroy();}catch{}}
 _attempt(){
  if(this.stopped)return;
  const epoch=++this.epoch;this._clear();this._dispose();this.connected=false;this.attempts++;
  const valid=()=>!this.stopped&&epoch===this.epoch;
  this.onStatus(this.attempts===1?'先生の部屋につないでいます…':`接続を再試行しています（${this.attempts}回目）`,false);
  this.timer=this.setTimer(()=>{if(valid())this._retry('接続に時間がかかっています。接続を作り直します。');},16000);
  let p;try{p=this.makePeer();this.peer=p;}catch{this._retry('このブラウザでは通信を開始できません。Safari / Chromeで開いてください。');return;}
  p.on('open',()=>{
   if(!valid())return;
   if(this.connection?.open&&this.connected)return;
   let c;try{c=p.connect(this.target,{reliable:true});this.connection=c;}catch{this._retry('先生への接続をやり直しています。');return;}
   c.on('open',()=>{if(!valid())return;this.onStatus('入室を確認しています…',false);try{c.send({type:'join',...this.info});}catch{this._retry('入室情報を送信し直しています。');}});
   c.on('data',data=>{
    if(!valid())return;
    if(data?.type==='state'&&data.state){this.clearTimer(this.timer);this.timer=null;this.connected=true;this.lastStateAt=this.now();this.onStatus('接続しています',true);this.onState(data.state);}
    else if(data?.type==='reject'){this.stop();this.onReject(data.message);}
    else if(data?.type==='notice')this.onNotice(data.message);
   });
   c.on('close',()=>{if(valid())this._retry('接続が切れました。自動で接続し直します。');});
   c.on('error',()=>{if(valid())this._retry('先生との接続を作り直しています。');});
  });
  p.on('error',error=>{if(valid())this._retry(error?.type==='peer-unavailable'?'先生の部屋を確認中です。6文字が合っているか確認してください。':'通信を再試行しています。');});
  p.on('disconnected',()=>{if(!valid())return;if(this.connected&&this.connection?.open){try{p.reconnect();}catch{this._retry('通信を再開しています。');}}else this._retry('通信サーバーへ再接続しています。');});
 }
 _retry(message){if(this.stopped)return;this.epoch++;this._clear();this._dispose();this.connected=false;this.onStatus(message,false);this.retryTimer=this.setTimer(()=>this._attempt(),1800+Math.floor(this.random()*1200));}
 retryNow(){if(this.stopped)return;this._attempt();}
 send(data){if(!this.connected||!this.connection?.open)return false;try{this.connection.send(data);return true;}catch{this._retry('送信できませんでした。接続し直しています。');return false;}}
 ping(){if(this.stopped)return;if(this.connected&&this.now()-this.lastStateAt>20000){this._retry('応答が止まったため、接続を作り直しています。');return;}this.send({type:'ping'});}
 stop(){this.stopped=true;this.epoch++;this._clear();this._dispose();this.connected=false;}
}
