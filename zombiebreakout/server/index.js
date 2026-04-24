'use strict';
const express=require('express');
const {createServer}=require('http');
const {Server}=require('socket.io');

const app=express();
const httpServer=createServer(app);
const io=new Server(httpServer,{
  cors:{origin:'*',methods:['GET','POST']},
  pingInterval:10000, // ping every 10s — keeps Railway proxy from timing out (Railway idle timeout ~60s)
  pingTimeout:5000,
});
const PORT=process.env.PORT||3000;

// ── Shared constants ───────────────────────────────────────────────
const WW=2400,WH=2000,PR=15,BR=5,PSPD=3.2,WT=14;
const GCELL=50,GCOLS=48,GROWS=40;

const ZT={
  basic:   {r:19,spd:1.0, hp:1,xp:10},
  runner:  {r:13,spd:1.85,hp:1,xp:15},
  tank:    {r:26,spd:0.55,hp:4,xp:35},
  exploder:{r:18,spd:1.1, hp:1,xp:25},
  boss:    {r:42,spd:0.85,hp:20,xp:500},
};
const WPN={
  pistol:  {dmg:1,cd:17,bspd:9, pellts:1,sprd:0,   ammo:Infinity},
  shotgun: {dmg:1,cd:30,bspd:8, pellts:7,sprd:0.38, ammo:25},
  assault: {dmg:1,cd:6, bspd:11,pellts:1,sprd:0.05, ammo:50},
  sniper:  {dmg:4,cd:42,bspd:24,pellts:1,sprd:0,    ammo:12},
  smg:     {dmg:1,cd:4, bspd:13,pellts:1,sprd:0.12, ammo:80},
  flame:   {dmg:1,cd:4, bspd:6, pellts:1,sprd:0.35, ammo:60},
  rocket:  {dmg:8,cd:65,bspd:12,pellts:1,sprd:0,    ammo:6},
};
const DIFF={
  easy:  {playerHp:140,dmgBonus:1,dmgMult:1.25,reloadMult:0.75,grenades:4,zombieHpMult:0.55,zombieSpeedMult:0.8, zombieCountMult:0.65},
  medium:{playerHp:100,dmgBonus:0,dmgMult:1.0, reloadMult:1.0, grenades:2,zombieHpMult:1.0, zombieSpeedMult:1.0, zombieCountMult:1.0},
  hard:  {playerHp:70, dmgBonus:0,dmgMult:0.75,reloadMult:1.35,grenades:1,zombieHpMult:1.7, zombieSpeedMult:1.25,zombieCountMult:1.45},
};

// ── World geometry ─────────────────────────────────────────────────
const EBLDS=[
  {x:82,  y:82,  w:360,h:220,doorX:222, doorW:60,furniture:[{x:98, y:96,  w:330,h:14,solid:true},{x:98, y:120,w:60,h:50,solid:true},{x:170,y:120,w:60,h:50,solid:true},{x:320,y:120,w:80,h:60,solid:true}]},
  {x:148, y:700, w:320,h:195,doorX:258, doorW:60,furniture:[]},
  {x:848, y:95,  w:275,h:185,doorX:942, doorW:60,furniture:[{x:864,y:108,w:240,h:14,solid:true},{x:885,y:130,w:130,h:75,solid:true}]},
  {x:1360,y:122, w:340,h:215,doorX:1474,doorW:60,furniture:[{x:1376,y:136,w:308,h:14,solid:true},{x:1430,y:160,w:14,h:90,solid:true},{x:1560,y:160,w:14,h:90,solid:true},{x:1630,y:180,w:45,h:50,solid:true}]},
  {x:1528,y:812, w:280,h:188,doorX:1628,doorW:60,furniture:[{x:1544,y:826,w:248,h:14,solid:true},{x:1600,y:848,w:80,h:60,solid:true},{x:1720,y:840,w:50,h:50,solid:true}]},
  {x:218, y:1380,w:295,h:195,doorX:328, doorW:60,furniture:[{x:234,y:1394,w:262,h:14,solid:true},{x:290,y:1415,w:100,h:60,solid:true},{x:420,y:1410,w:60,h:55,solid:true}]},
  {x:858, y:1688,w:315,h:195,doorX:972, doorW:60,furniture:[{x:874,y:1702,w:284,h:14,solid:true},{x:920,y:1720,w:80,h:55,solid:true}]},
  {x:1662,y:1498,w:350,h:220,doorX:1787,doorW:65,furniture:[{x:1678,y:1512,w:318,h:14,solid:true},{x:1710,y:1534,w:140,h:65,solid:true},{x:1870,y:1534,w:50,h:25,solid:true},{x:1920,y:1534,w:50,h:25,solid:true}]},
];
function eWalls(b){
  let d0=b.doorX,d1=b.doorX+b.doorW;
  return[
    {x:b.x,       y:b.y,         w:b.w,               h:WT},
    {x:b.x,       y:b.y+WT,      w:WT,                 h:b.h-WT*2},
    {x:b.x+b.w-WT,y:b.y+WT,      w:WT,                 h:b.h-WT*2},
    {x:b.x,       y:b.y+b.h-WT,  w:Math.max(0,d0-b.x), h:WT},
    {x:d1,        y:b.y+b.h-WT,  w:Math.max(0,b.x+b.w-d1),h:WT},
  ];
}
for(let b of EBLDS)b._walls=eWalls(b);

const BLDS=[
  {x:510,y:82,w:115,h:88},{x:680,y:82,w:110,h:88},{x:510,y:200,w:115,h:88},{x:680,y:200,w:110,h:88},
  {x:730,y:82,w:95,h:75},{x:1220,y:82,w:120,h:90},{x:1350,y:82,w:95,h:75},
  {x:1760,y:100,w:110,h:88},{x:1900,y:100,w:120,h:88},{x:2060,y:100,w:110,h:88},{x:2200,y:100,w:115,h:88},{x:2060,y:210,w:260,h:88},
  {x:82,y:340,w:115,h:90},{x:82,y:450,w:115,h:90},{x:82,y:560,w:115,h:90},
  {x:2220,y:380,w:115,h:90},{x:2220,y:490,w:115,h:90},{x:2220,y:600,w:115,h:90},
  {x:660,y:1800,w:120,h:88},{x:770,y:1910,w:110,h:88},{x:1220,y:1800,w:120,h:88},{x:1360,y:1800,w:115,h:90},{x:1500,y:1800,w:110,h:88},
  {x:82,y:1700,w:115,h:90},{x:82,y:1810,w:115,h:90},{x:2200,y:1700,w:115,h:88},{x:2200,y:1810,w:120,h:88},
  {x:1220,y:340,w:115,h:88},{x:1220,y:450,w:115,h:88},{x:1920,y:440,w:120,h:90},{x:2060,y:440,w:110,h:90},
];

// ── Collision helpers ──────────────────────────────────────────────
function crCol(cx,cy,r,rx,ry,rw,rh){
  if(rw<=0||rh<=0)return false;
  let nx=Math.max(rx,Math.min(cx,rx+rw)),ny=Math.max(ry,Math.min(cy,ry+rh));
  return Math.hypot(cx-nx,cy-ny)<r;
}
function resCR(cx,cy,r,rx,ry,rw,rh){
  if(!crCol(cx,cy,r,rx,ry,rw,rh))return null;
  let nx=Math.max(rx,Math.min(cx,rx+rw)),ny=Math.max(ry,Math.min(cy,ry+rh));
  let ddx=cx-nx,ddy=cy-ny,d=Math.hypot(ddx,ddy);
  if(d>0)return[cx+ddx/d*(r-d+1),cy+ddy/d*(r-d+1)];
  let dl=cx-rx,dr=rx+rw-cx,dt=cy-ry,db=ry+rh-cy,m=Math.min(dl,dr,dt,db);
  if(m===dl)return[rx-r-1,cy];if(m===dr)return[rx+rw+r+1,cy];
  if(m===dt)return[cx,ry-r-1];return[cx,ry+rh+r+1];
}
function resAll(x,y,r){
  for(let b of BLDS){let res=resCR(x,y,r,b.x,b.y,b.w,b.h);if(res){x=res[0];y=res[1];}}
  for(let b of EBLDS){
    for(let wl of b._walls){let res=resCR(x,y,r,wl.x,wl.y,wl.w,wl.h);if(res){x=res[0];y=res[1];}}
    for(let f of b.furniture)if(f.solid){let res=resCR(x,y,r,f.x,f.y,f.w,f.h);if(res){x=res[0];y=res[1];}}
  }
  return[Math.max(PR,Math.min(WW-PR,x)),Math.max(PR,Math.min(WH-PR,y))];
}
function bulletHitsWall(bx,by){
  for(let b of BLDS)if(bx>b.x&&bx<b.x+b.w&&by>b.y&&by<b.y+b.h)return true;
  for(let b of EBLDS){
    for(let wl of b._walls)if(crCol(bx,by,2,wl.x,wl.y,wl.w,wl.h))return true;
    for(let f of b.furniture)if(f.solid&&crCol(bx,by,2,f.x,f.y,f.w,f.h))return true;
  }
  return false;
}
function dst(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1]);}
function nrm(dx,dy){let d=Math.hypot(dx,dy);return d?[dx/d,dy/d]:[0,0];}

// ── Flow field (shared, rebuilt lazily per target) ─────────────────
let _blockedBitmap=null;
function getBlockedBitmap(){
  if(_blockedBitmap)return _blockedBitmap;
  _blockedBitmap=new Uint8Array(GCOLS*GROWS);
  for(let cy=0;cy<GROWS;cy++)for(let cx=0;cx<GCOLS;cx++)
    _blockedBitmap[cy*GCOLS+cx]=cellBlocked(cx,cy)?1:0;
  return _blockedBitmap;
}
function cellBlocked(cx,cy){
  let x1=cx*GCELL+7,y1=cy*GCELL+7,x2=(cx+1)*GCELL-7,y2=(cy+1)*GCELL-7;
  function ov(rx,ry,rw,rh){return rw>0&&rh>0&&x1<rx+rw&&x2>rx&&y1<ry+rh&&y2>ry;}
  for(let b of BLDS)if(ov(b.x,b.y,b.w,b.h))return true;
  for(let b of EBLDS){
    for(let wl of b._walls)if(ov(wl.x,wl.y,wl.w,wl.h))return true;
    for(let f of b.furniture)if(f.solid&&ov(f.x,f.y,f.w,f.h))return true;
  }
  return false;
}
function buildFF(tx,ty){
  let bm=getBlockedBitmap();
  let dist=new Int32Array(GCOLS*GROWS).fill(-1),q=new Int32Array(GCOLS*GROWS*2),head=0,tail=0;
  let pcx=Math.max(0,Math.min(GCOLS-1,tx/GCELL|0));
  let pcy=Math.max(0,Math.min(GROWS-1,ty/GCELL|0));
  dist[pcy*GCOLS+pcx]=0;q[tail++]=pcx;q[tail++]=pcy;
  while(head<tail){
    let cx=q[head++],cy=q[head++],d=dist[cy*GCOLS+cx];
    for(let ny=cy-1;ny<=cy+1;ny++)for(let nx=cx-1;nx<=cx+1;nx++){
      if(nx===cx&&ny===cy)continue;if(nx<0||nx>=GCOLS||ny<0||ny>=GROWS)continue;
      let ni=ny*GCOLS+nx;if(dist[ni]!==-1||bm[ni])continue;
      dist[ni]=d+1;q[tail++]=nx;q[tail++]=ny;
    }
  }
  let ff=new Array(GCOLS*GROWS);
  for(let cy=0;cy<GROWS;cy++)for(let cx=0;cx<GCOLS;cx++){
    let i=cy*GCOLS+cx;if(dist[i]===-1){ff[i]=[0,0];continue;}
    let best=Infinity,bdx=0,bdy=0;
    for(let ny=cy-1;ny<=cy+1;ny++)for(let nx=cx-1;nx<=cx+1;nx++){
      if(nx===cx&&ny===cy)continue;if(nx<0||nx>=GCOLS||ny<0||ny>=GROWS)continue;
      let nd=dist[ny*GCOLS+nx];if(nd!==-1&&nd<best){best=nd;bdx=nx-cx;bdy=ny-cy;}
    }
    let d2=Math.hypot(bdx,bdy);ff[i]=d2>0?[bdx/d2,bdy/d2]:[0,0];
  }
  return ff;
}
function getFlowDir(ff,tx,ty,x,y){
  if(!ff)return nrm(tx-x,ty-y);
  let cx=Math.max(0,Math.min(GCOLS-1,x/GCELL|0));
  let cy=Math.max(0,Math.min(GROWS-1,y/GCELL|0));
  let[fdx,fdy]=ff[cy*GCOLS+cx];
  if(fdx===0&&fdy===0)return nrm(tx-x,ty-y);
  let d=Math.hypot(tx-x,ty-y);
  if(d<80){let t=1-d/80;let[dx2,dy2]=nrm(tx-x,ty-y);return nrm(fdx*(1-t)+dx2*t,fdy*(1-t)+dy2*t);}
  return[fdx,fdy];
}

// ── Wave helpers ───────────────────────────────────────────────────
function waveComp(lv,diff){
  let d=DIFF[diff]||DIFF.medium;
  let zc=Math.round((4+Math.floor(lv*2.0)+(lv>5?Math.floor(lv*0.6):0))*d.zombieCountMult);
  let hasBoss=lv%5===0;
  let out={basic:0,runner:0,tank:0,exploder:0,boss:hasBoss?1:0},rem=zc;
  if(lv>=7){out.exploder=Math.max(1,Math.floor(rem*0.12));rem-=out.exploder;}
  if(lv>=5){out.tank=Math.max(1,Math.floor(rem*0.20));rem-=out.tank;}
  if(lv>=3){out.runner=Math.floor(rem*0.40);rem-=out.runner;}
  out.basic=Math.max(1,rem);
  return out;
}
function zHp(baseHp,lv,diff){
  let d=DIFF[diff]||DIFF.medium;
  return Math.ceil(baseHp*(1+lv*0.55)*d.zombieHpMult);
}
function zDmg(lv,armor){return Math.max(1,6+Math.floor(lv*1.8)-armor);}
function randEdge(){
  let s=Math.floor(Math.random()*4);
  if(s===0)return[Math.random()*WW,-40];if(s===1)return[Math.random()*WW,WH+40];
  if(s===2)return[-40,Math.random()*WH];return[WW+40,Math.random()*WH];
}

// ── Room management ────────────────────────────────────────────────
const rooms=new Map();
let _uid=0;
function genId(){return(++_uid).toString(36)+(Math.random()*1e9|0).toString(36);}

function mkPlayer(id,name,charIdx,diff){
  let d=DIFF[diff]||DIFF.medium;
  return{
    id,name,char:charIdx||0,
    x:WW/2+(Math.random()-0.5)*300,y:WH/2+(Math.random()-0.5)*300,
    hp:d.playerHp,maxHp:d.playerHp,inv:0,scd:0,
    kills:0,score:0,
    inventory:[{w:'pistol',ammo:Infinity}],slot:0,
    reloadMult:d.reloadMult,dmgBonus:d.dmgBonus,dmgMult:d.dmgMult,
    speedMult:1.0,armor:0,grenades:d.grenades,
    keys:{w:false,a:false,s:false,d:false},
    shoot:false,angle:0,alive:true,
  };
}

function roomList(){
  let out=[];
  for(let[,r] of rooms){
    if(r.private)continue;
    out.push({id:r.id,name:r.name,host:r.host,playerCount:r.players.size,
      inGame:r.inGame,hasPassword:!!r.password,difficulty:r.difficulty});
  }
  return out;
}
function playerRoom(sid){for(let[,r] of rooms)if(r.players.has(sid))return r;return null;}
function roomPlayers(room){
  let out=[];
  for(let[,p] of room.players)out.push({id:p.id,name:p.name,char:p.char,kills:p.kills,score:p.score,alive:p.alive});
  return out;
}

// ── Game loop ──────────────────────────────────────────────────────
function spawnWave(room){
  room.zs=[];
  let comp=waveComp(room.lv,room.difficulty);
  let d=DIFF[room.difficulty]||DIFF.medium;
  let zsp=(1.0+room.lv*0.22)*d.zombieSpeedMult;
  let idx=0,total=Object.values(comp).reduce((a,b)=>a+b,0);
  for(let[type,count] of Object.entries(comp)){
    let zt=ZT[type];if(!zt||count<=0)continue;
    for(let i=0;i<count;i++){
      let p=randEdge(),hp=zHp(zt.hp,room.lv,room.difficulty);
      room.zs.push({
        id:genId(),x:p[0],y:p[1],sp:zt.spd*zsp+Math.random()*0.2,
        hp,mhp:hp,type,pulse:Math.random()*6.28,
        surroundAng:(idx/Math.max(1,total))*Math.PI*2+Math.random()*0.5,
        attackT:Math.floor(Math.random()*30),swingT:0,swingSide:1,staggerT:0,
        chargeTimer:0,charging:false,chargeDx:0,chargeDy:0,
        flashT:0,dying:false,dyingVx:0,dyingVy:0,dyingTimer:0,
        zigzagTimer:0,zigzagOffset:0,flankSide:Math.random()<0.5?1:-1,flankTimer:0,
      });
      idx++;
    }
  }
  // Clients run zombie AI locally — send spawn data so all clients start with the same zombie list
  room.killedCount=0;room.totalZombies=room.zs.length;
  if(!room.killedIds)room.killedIds=new Set();else room.killedIds.clear();
  io.to(room.id).emit('wave:zombies',{lv:room.lv,zombies:room.zs.map(z=>({
    id:z.id,x:z.x,y:z.y,type:z.type,hp:z.hp,mhp:z.mhp,sp:z.sp,
    pulse:z.pulse,surroundAng:z.surroundAng,attackT:z.attackT,
    swingT:z.swingT,swingSide:z.swingSide,chargeTimer:0,
    zigzagTimer:0,zigzagOffset:0,flankSide:z.flankSide,staggerT:0,
  }))});
}

function closestPlayer(room,x,y){
  let best=null,bestD=Infinity;
  for(let[,p] of room.players){
    if(!p.alive)continue;
    let d=Math.hypot(p.x-x,p.y-y);
    if(d<bestD){bestD=d;best=p;}
  }
  return best||{x:WW/2,y:WH/2,hp:0,alive:false};
}

function killZombie(room,idx,vx,vy,killerId){
  let z=room.zs[idx];if(!z)return;
  z.dying=true;z.dyingVx=vx||0;z.dyingVy=vy||0;z.dyingTimer=25;
  let pts=(ZT[z.type]?.xp||10)+(room.lv-1)*5;
  if(killerId){let kp=room.players.get(killerId);if(kp){kp.kills++;kp.score+=pts;}}
  io.to(room.id).emit('zombie:died',{id:z.id});
}

function gameTick(room){
  room.tk++;
  if(room.gst==='wave_clear'){
    if(--room.waveClearTimer<=0){
      room.lv++;room.gst='playing';
      let tgt=closestPlayer(room,WW/2,WH/2);
      room.ff=buildFF(tgt.x,tgt.y);room.ffTimer=30;
      spawnWave(room);
      io.to(room.id).emit('wave:start',{lv:room.lv});
    }
    broadcastState(room);return;
  }
  if(room.gst!=='playing'){broadcastState(room);return;}

  // Rebuild flow field toward centroid of alive players
  if(--room.ffTimer<=0){
    let tgt=closestPlayer(room,WW/2,WH/2);
    room.ff=buildFF(tgt.x,tgt.y);room.ffTimer=30;
  }
  if(room.tk%120===0&&room.zs.length>0)
    for(let i=0;i<room.zs.length;i++)room.zs[i].surroundAng=(i/room.zs.length)*Math.PI*2+Math.random()*0.5;

  // ── Players ────────────────────────────────────────────────────
  for(let[,p] of room.players){
    if(!p.alive)continue;
    // Decrement by 2 per tick: server runs at 30 TPS but all cooldowns/timers are in 60fps frames.
    if(p.inv>0)p.inv=Math.max(0,p.inv-2);
    if(p.scd>0)p.scd=Math.max(0,p.scd-2);
    // Bullets are now fired via bullet:fire events from the client (instant relay to others).
    // No server-side bullet creation needed — clients emit bullet:fire on every fb() call.
  }

  // ── Bullets (movement + wall — zombie damage is client-side) ──
  // Advance by 2× vx/vy because server runs at 30 TPS but bullet velocities are scaled for 60fps.
  // This keeps server positions in sync with client-side visual interpolation (which uses /16.67ms).
  for(let i=room.bl.length-1;i>=0;i--){
    let b=room.bl[i];b.x+=b.vx*2;b.y+=b.vy*2;b.l-=2;
    if(b.l<=0||bulletHitsWall(b.x,b.y)||b.x<-20||b.x>WW+20||b.y<-20||b.y>WH+20)room.bl.splice(i,1);
  }
  // Zombie AI removed — clients simulate locally for zero-lag feel.
  // Wave end is triggered by zombie:killed events from clients.

  broadcastState(room);
}

function broadcastState(room){
  let players=[];
  for(let[,p] of room.players){
    players.push({id:p.id,name:p.name,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,
      alive:p.alive,angle:p.angle,slot:p.slot,kills:p.kills,score:p.score,char:p.char,
      inv:p.inv>0,
      inventory:p.inventory.map(s=>({w:s.w,ammo:s.ammo===Infinity?-1:s.ammo}))
    });
  }
  io.to(room.id).emit('state',{
    tk:room.tk,lv:room.lv,gst:room.gst,
    players,
    // zombies omitted: clients simulate AI locally at 60fps for singleplayer feel
    bullets:room.bl.map(b=>({id:b.id,x:b.x,y:b.y,vx:b.vx,vy:b.vy,wtype:b.wtype,owner:b.owner})),
  });
}

function startGame(room){
  // Reset all players
  let d=DIFF[room.difficulty]||DIFF.medium;
  for(let[,p] of room.players){
    p.x=WW/2+(Math.random()-0.5)*300;p.y=WH/2+(Math.random()-0.5)*300;
    p.hp=d.playerHp;p.maxHp=d.playerHp;p.inv=0;p.scd=0;
    p.kills=0;p.score=0;p.alive=true;
    p.inventory=[{w:'pistol',ammo:Infinity}];p.slot=0;
    p.reloadMult=d.reloadMult;p.dmgBonus=d.dmgBonus;p.dmgMult=d.dmgMult;
    p.speedMult=1.0;p.armor=0;p.grenades=d.grenades;
  }
  room.inGame=true;room.lv=1;room.gst='playing';room.bl=[];room.tk=0;room.waveClearTimer=0;
  let tgt=closestPlayer(room,WW/2,WH/2);
  room.ff=buildFF(tgt.x,tgt.y);room.ffTimer=30;
  room.gameLoop=setInterval(()=>gameTick(room),33); // ~30 TPS
  // Emit game:started — clients enter 10-second prep phase.
  // wave:zombies arrives 10s later so players can grab weapons first.
  io.to(room.id).emit('game:started',{difficulty:room.difficulty,lv:room.lv,prepTime:30,
    waveComp:waveComp(1,room.difficulty)});
  if(room.prepTimeout)clearTimeout(room.prepTimeout);
  room.prepTimeout=setTimeout(()=>{if(room.inGame)spawnWave(room);},30000);
  io.emit('lobby:rooms',{rooms:roomList()});
}

function stopGame(room){
  if(room.gameLoop){clearInterval(room.gameLoop);room.gameLoop=null;}
  if(room.prepTimeout){clearTimeout(room.prepTimeout);room.prepTimeout=null;}
  room.inGame=false;room.gst='waiting';room.zs=[];room.bl=[];
}

function transferOrClose(room){
  if(room.players.size===0){stopGame(room);rooms.delete(room.id);return;}
  room.host=[...room.players.keys()][0];
  io.to(room.id).emit('room:hostChange',{newHost:room.host});
}

function leaveRoom(socket,room){
  room.players.delete(socket.id);
  socket.leave(room.id);
  if(room.players.size===0){stopGame(room);rooms.delete(room.id);io.emit('lobby:rooms',{rooms:roomList()});return;}
  if(room.host===socket.id)transferOrClose(room);
  io.to(room.id).emit('room:update',{players:roomPlayers(room),host:room.host});
  io.emit('lobby:rooms',{rooms:roomList()});
}

// ── Socket events ──────────────────────────────────────────────────
io.on('connection',socket=>{
  console.log('[+]',socket.id);

  // List public rooms
  socket.on('lobby:list',cb=>{
    if(typeof cb==='function')cb({rooms:roomList()});
    else socket.emit('lobby:rooms',{rooms:roomList()});
  });

  // Create room
  socket.on('room:create',(data,cb)=>{
    let existing=playerRoom(socket.id);
    if(existing)leaveRoom(socket,existing);
    let name=String(data.name||'').trim().slice(0,32)||`Room`;
    let pw=data.password?String(data.password).slice(0,32):null;
    let r={
      id:genId(),name,host:socket.id,password:pw,private:!!data.private,
      inGame:false,difficulty:data.difficulty||'medium',
      players:new Map(),banned:new Set(),
      zs:[],bl:[],lv:1,gst:'waiting',tk:0,
      ff:null,ffTimer:0,waveClearTimer:0,gameLoop:null,
    };
    r.players.set(socket.id,mkPlayer(socket.id,data.playerName||'Player',data.char||0,r.difficulty));
    rooms.set(r.id,r);
    socket.join(r.id);
    let out={id:r.id,name:r.name,host:r.host,difficulty:r.difficulty,players:roomPlayers(r)};
    if(typeof cb==='function')cb({ok:true,room:out});
    io.emit('lobby:rooms',{rooms:roomList()});
  });

  // Join room
  socket.on('room:join',(data,cb)=>{
    let r=rooms.get(data.roomId);
    if(!r)return typeof cb==='function'&&cb({ok:false,error:'Room not found'});
    if(r.banned.has(socket.id))return typeof cb==='function'&&cb({ok:false,error:'Banned'});
    if(r.password&&r.password!==data.password)return typeof cb==='function'&&cb({ok:false,error:'Wrong password'});
    if(r.inGame)return typeof cb==='function'&&cb({ok:false,error:'Game in progress'});
    if(r.players.size>=8)return typeof cb==='function'&&cb({ok:false,error:'Room full'});
    let existing=playerRoom(socket.id);
    if(existing)leaveRoom(socket,existing);
    r.players.set(socket.id,mkPlayer(socket.id,data.playerName||'Player',data.char||0,r.difficulty));
    socket.join(r.id);
    io.to(r.id).emit('room:update',{players:roomPlayers(r),host:r.host});
    let out={id:r.id,name:r.name,host:r.host,difficulty:r.difficulty,players:roomPlayers(r)};
    if(typeof cb==='function')cb({ok:true,room:out});
    io.emit('lobby:rooms',{rooms:roomList()});
  });

  // Leave room
  socket.on('room:leave',()=>{
    let r=playerRoom(socket.id);
    if(r)leaveRoom(socket,r);
  });

  // Start game (host only)
  socket.on('room:start',(data,cb)=>{
    let r=playerRoom(socket.id);
    if(!r||r.host!==socket.id)return typeof cb==='function'&&cb({ok:false,error:'Not host'});
    if(r.inGame)return typeof cb==='function'&&cb({ok:false,error:'Already started'});
    startGame(r);
    if(typeof cb==='function')cb({ok:true});
  });

  // Kick player (host only)
  socket.on('room:kick',(data,cb)=>{
    let r=playerRoom(socket.id);
    if(!r||r.host!==socket.id)return typeof cb==='function'&&cb({ok:false,error:'Not host'});
    let tid=data.targetId;
    if(!r.players.has(tid))return typeof cb==='function'&&cb({ok:false,error:'Not in room'});
    r.players.delete(tid);
    let ts=io.sockets.sockets.get(tid);if(ts){ts.leave(r.id);}
    io.to(tid).emit('room:kicked',{reason:'Kicked by host'});
    io.to(r.id).emit('room:update',{players:roomPlayers(r),host:r.host});
    if(typeof cb==='function')cb({ok:true});
  });

  // Ban player (host only)
  socket.on('room:ban',(data,cb)=>{
    let r=playerRoom(socket.id);
    if(!r||r.host!==socket.id)return typeof cb==='function'&&cb({ok:false,error:'Not host'});
    let tid=data.targetId;
    r.banned.add(tid);
    if(r.players.has(tid)){
      r.players.delete(tid);
      let ts=io.sockets.sockets.get(tid);if(ts)ts.leave(r.id);
      io.to(tid).emit('room:kicked',{reason:'Banned by host'});
      io.to(r.id).emit('room:update',{players:roomPlayers(r),host:r.host});
    }
    if(typeof cb==='function')cb({ok:true});
  });

  // Set room privacy (host only)
  socket.on('room:setPrivate',(data,cb)=>{
    let r=playerRoom(socket.id);
    if(!r||r.host!==socket.id)return;
    r.private=!!data.private;
    io.emit('lobby:rooms',{rooms:roomList()});
    if(typeof cb==='function')cb({ok:true});
  });

  // Player input (in-game)
  socket.on('input',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    let p=r.players.get(socket.id);
    if(!p||!p.alive)return;
    if(data.keys)p.keys=data.keys;
    if(typeof data.angle==='number')p.angle=data.angle;
    if(typeof data.shoot==='boolean')p.shoot=data.shoot;
    if(typeof data.slot==='number'&&data.slot>=0&&data.slot<p.inventory.length)p.slot=data.slot;
    // Client is authoritative for its own position — accept it (clamped to world)
    if(typeof data.x==='number'&&typeof data.y==='number'){
      p.x=Math.max(PR,Math.min(WW-PR,data.x));
      p.y=Math.max(PR,Math.min(WH-PR,data.y));
    }
  });

  // Weapon pickup (server grants it)
  socket.on('player:pickupWeapon',(data,cb)=>{
    let r=playerRoom(socket.id);
    if(!r)return;
    let p=r.players.get(socket.id);
    if(!p)return;
    let wpn=WPN[data.weapon];if(!wpn)return;
    let already=p.inventory.find(s=>s.w===data.weapon);
    if(already){already.ammo=Math.min(already.ammo+Math.floor(wpn.ammo*0.5),wpn.ammo);}
    else if(p.inventory.length<4){p.inventory.push({w:data.weapon,ammo:wpn.ammo});}
    if(typeof cb==='function')cb({ok:true,inventory:p.inventory.map(s=>({w:s.w,ammo:s.ammo===Infinity?-1:s.ammo}))});
  });

  // Respawn
  socket.on('player:respawn',()=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    let p=r.players.get(socket.id);
    if(!p||p.alive)return;
    let d=DIFF[r.difficulty]||DIFF.medium;
    p.alive=true;p.hp=Math.floor(d.playerHp*0.5);p.inv=120;
    p.x=WW/2+(Math.random()-0.5)*400;p.y=WH/2+(Math.random()-0.5)*400;
  });

  // Client picked up a weapon crate locally — sync inventory to server
  // so server-side shooting uses the correct weapon stats
  socket.on('player:setInventory',(data)=>{
    let r=playerRoom(socket.id);
    if(!r)return;
    let p=r.players.get(socket.id);
    if(!p)return;
    let inv=data.inventory;
    if(!Array.isArray(inv)||inv.length>8)return;
    p.inventory=inv.map(s=>{
      let wpn=WPN[s.w];if(!wpn)return null;
      return{w:s.w,ammo:s.ammo===-1?Infinity:Math.min(s.ammo,wpn.ammo*2)};
    }).filter(Boolean);
    if(p.inventory.length===0)p.inventory=[{w:'pistol',ammo:Infinity}];
  });

  // Client fired a bullet — relay immediately to all other clients for instant local simulation
  socket.on('bullet:fire',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    // Relay to everyone else in the room — they'll simulate the bullet locally at 60fps
    socket.to(r.id).emit('bullet:fired',{
      x:data.x,y:data.y,vx:data.vx,vy:data.vy,l:data.l||85,
      wtype:data.wtype,dmg:data.dmg||1,pierce:data.pierce||0,
    });
  });

  // Host client sends authoritative boss position — relay to others so boss stays in sync across clients
  socket.on('zombie:pos',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    if(r.host!==socket.id)return; // only host is position authority
    socket.to(r.id).emit('zombie:pos',{id:data.id,x:data.x,y:data.y,
      charging:data.charging,chargeDx:data.chargeDx,chargeDy:data.chargeDy});
  });

  // Client hit a zombie — relay damage to other clients so HP bars stay in sync
  socket.on('zombie:damage',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    socket.to(r.id).emit('zombie:damage',{id:data.id,damage:data.damage});
  });

  // Client reports a zombie kill (client simulates AI locally)
  socket.on('zombie:killed',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame||r.gst!=='playing')return;
    if(!r.killedIds)r.killedIds=new Set();
    if(r.killedIds.has(data.id))return; // already counted
    r.killedIds.add(data.id);
    // Award score/kills
    let p=r.players.get(socket.id);
    if(p){let pts=(ZT[data.type||'basic']?.xp||10)+(r.lv-1)*5;p.kills++;p.score+=pts;}
    r.killedCount=(r.killedCount||0)+1;
    // Tell all other clients (sender already killed it locally)
    socket.to(r.id).emit('zombie:died',{id:data.id});
    // Wave end when all zombies accounted for
    if(r.killedCount>=(r.totalZombies||Infinity)&&r.gst==='playing'){
      r.gst='wave_clear';r.waveClearTimer=60; // 60 ticks × 33ms = 2s
      io.to(r.id).emit('wave:clear',{lv:r.lv});
      // Tell clients what's coming next so they can show it during the break
      io.to(r.id).emit('wave:preview',{comp:waveComp(r.lv+1,r.difficulty),lv:r.lv+1});
    }
  });

  // Client reports zombie attack damage (client runs zombie AI)
  socket.on('player:hit',data=>{
    let r=playerRoom(socket.id);
    if(!r||!r.inGame)return;
    let p=r.players.get(socket.id);
    if(!p||!p.alive||p.inv>0)return;
    let dmg=Math.min(Math.max(0,data.damage||0),50); // cap prevents abuse
    p.hp=Math.max(0,p.hp-dmg);p.inv=50;
    if(p.hp<=0){p.hp=0;p.alive=false;socket.emit('player:died');}
  });

  socket.on('disconnect',()=>{
    console.log('[-]',socket.id);
    let r=playerRoom(socket.id);
    if(r)leaveRoom(socket,r);
  });
});

// Health check
app.get('/',(req,res)=>res.send('Zombie Breakout Server OK'));

httpServer.listen(PORT,()=>console.log(`Zombie Breakout server on port ${PORT}`));
