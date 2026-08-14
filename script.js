/* Pong+ Ultimate — script.js
   Full feature set: persistence, shop, achievements, skins, power-ups, particles,
   multi-ball, WebAudio music/SFX, gamepad/touch/keyboard, manual WebRTC P2P.
   Save alongside index.html and styles.css.
*/

(() => {
  // Storage namespace
  const STORAGE_KEY = 'pongplus_full_v1';

  // Default persistent state
  const defaultState = {
    settings: {
      theme: 'dark',
      skin: 'default',
      sfx: true,
      music: true,
      target: 7,
      difficulty: 'normal',
    },
    stats: {
      xp: 0,
      totalMatches: 0,
      wins: 0,
      losses: 0,
      highScore: 0,
    },
    highScores: [], // {name, score, date}
    history: [], // recent matches
    unlockedSkins: ['default'],
    achievements: {},
  };

  // Load and save
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultState));
      const parsed = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(defaultState)), parsed);
    } catch (e) {
      console.warn('Failed to load state', e);
      return JSON.parse(JSON.stringify(defaultState));
    }
  }
  function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  const state = loadState();

  // UI references
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const modeSel = document.getElementById('mode');
  const difficultySel = document.getElementById('difficulty');
  const targetInput = document.getElementById('targetInput');
  const leftScoreEl = document.getElementById('leftScore');
  const rightScoreEl = document.getElementById('rightScore');
  const statusEl = document.getElementById('status');
  const centerMsg = document.getElementById('centerMsg');
  const leftName = document.getElementById('leftName');
  const rightName = document.getElementById('rightName');
  const sfxToggle = document.getElementById('sfxToggle');
  const musicToggle = document.getElementById('musicToggle');
  const shopBtn = document.getElementById('shopBtn');
  const highList = document.getElementById('highList');
  const historyList = document.getElementById('historyList');
  const achBtn = document.getElementById('achBtn');
  const historyBtn = document.getElementById('historyBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const themeSel = document.getElementById('themeSel');
  const skinDefault = document.getElementById('skinDefault');
  const skinRetro = document.getElementById('skinRetro');
  const skinNeon = document.getElementById('skinNeon');
  const skinMono = document.getElementById('skinMono');
  const fullBtn = document.getElementById('fullBtn');

  // Network UI
  const hostBtn = document.getElementById('hostBtn');
  const joinBtn = document.getElementById('joinBtn');
  const signalOut = document.getElementById('signalOut');
  const signalIn = document.getElementById('signalIn');
  const applySignalBtn = document.getElementById('applySignalBtn');
  const closeConnBtn = document.getElementById('closeConnBtn');
  const netStatus = document.getElementById('netStatus');

  // Gameplay variables
  const LOGW = 1000, LOGH = 560;
  let displayScale = 1;

  // HiDPI canvas sizing
  function resizeCanvas() {
    const containerWidth = canvas.parentElement.clientWidth;
    const targetWidth = Math.min(LOGW, containerWidth - 6);
    canvas.style.width = targetWidth + 'px';
    canvas.style.height = (targetWidth * LOGH / LOGW) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(targetWidth * dpr);
    canvas.height = Math.round((targetWidth * LOGH / LOGW) * dpr);
    displayScale = (canvas.width / targetWidth);
    ctx.setTransform(displayScale, 0, 0, displayScale, 0, 0);
  }
  window.addEventListener('resize', resizeCanvas);

  // Game objects and state
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  const paddleW = 12;
  const defaultPaddleH = 110;

  class Paddle {
    constructor(x,name){ this.x = x; this.y = (LOGH - defaultPaddleH)/2; this.w = paddleW; this.h = defaultPaddleH; this.speed = 6; this.name = name; this.skin='default'; }
    draw() {
      ctx.save();
      const grad = ctx.createLinearGradient(this.x,0,this.x+this.w,0);
      const colors = skinColors[state.settings.skin] || skinColors['default'];
      grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
      roundedRect(this.x, this.y, this.w, this.h, 8, grad);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth=1; ctx.stroke();
      ctx.restore();
    }
  }

  class Ball {
    constructor(x,y,vx,vy,r=8,color='#f3f4f6'){ this.x=x;this.y=y;this.vx=vx;this.vy=vy;this.r=r;this.color=color;this.trail=[]; }
    draw(){
      ctx.save();
      for(let i=0;i<this.trail.length;i++){
        const t=this.trail[i];
        ctx.globalAlpha = (1 - i/this.trail.length)*0.16;
        circle(t.x, t.y, this.r*(1 - i/this.trail.length), this.color);
      }
      ctx.globalAlpha=1;
      ctx.shadowBlur=18; ctx.shadowColor=this.color;
      circle(this.x,this.y,this.r,this.color);
      ctx.shadowBlur=0;
      ctx.restore();
    }
    step(dt){ this.x += this.vx*dt; this.y += this.vy*dt; this.trail.unshift({x:this.x,y:this.y}); if(this.trail.length>12)this.trail.pop(); }
  }

  class PowerUp {
    constructor(x,y,type){ this.x=x;this.y=y;this.w=22;this.h=22;this.type=type;this.spawn=Date.now(); }
    draw(){ roundedRect(this.x,this.y,this.w,this.h,6,powerupColor(this.type)); ctx.fillStyle='#022'; ctx.font='bold 12px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(powerupLabel(this.type), this.x+this.w/2, this.y+this.h/2); }
  }

  function roundedRect(x,y,w,h,r,fillStyle){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if (fillStyle){ ctx.fillStyle = fillStyle; ctx.fill(); } }
  function circle(x,y,r,fill){ if (fill) ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
  function rectCircleCollision(rx,ry,rw,rh,cx,cy,cr){ const cx2 = clamp(cx, rx, rx+rw); const cy2 = clamp(cy, ry, ry+rh); const dx = cx - cx2; const dy = cy - cy2; return dx*dx+dy*dy <= cr*cr; }
  function powerupColor(type){ switch(type){ case 'grow': return '#9be8e0'; case 'shrink': return '#ffd27a'; case 'slow': return '#a6b1ff'; case 'multi': return '#ff9bb3'; default: return '#cbd5e1'; } }
  function powerupLabel(type){ switch(type){ case 'grow': return '+P'; case 'shrink': return '-O'; case 'slow': return 'S'; case 'multi': return 'M'; default: return '?'; } }
  function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // skins
  const skinColors = {
    default: ['#e6f0ff','#a6e8e0'],
    retro: ['#ff9bb3','#ffd27a'],
    neon: ['#9be8e0','#7ee7e0'],
    mono: ['#ddd','#bbb']
  };

  // initial entities
  const left = new Paddle(14,'You');
  const right = new Paddle(LOGW - paddleW - 14,'CPU');
  let balls = [];
  let powerups = [];
  let particles = [];
  let leftScore = 0, rightScore = 0;
  let running = false, paused = false;
  let lastHit = null;
  let serveTo = 'left';
  let ai = { speed:4.6, reaction:0.12 };
  let mode = state.settings.mode || 'single';
  let targetScore = state.settings.target || 7;
  let difficulty = state.settings.difficulty || 'normal';
  let centerMessageTimeout = null;

  // audio setup
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let masterGain = audioCtx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(audioCtx.destination);
  let musicGain = audioCtx.createGain(); musicGain.gain.value = 0.06; musicGain.connect(masterGain);
  let sfxGain = audioCtx.createGain(); sfxGain.gain.value = 0.12; sfxGain.connect(masterGain);
  let musicOsc, musicLFO;
  function startMusic(){
    if (!state.settings.music) return;
    if (musicOsc) return;
    musicOsc = audioCtx.createOscillator();
    musicOsc.type = 'sine';
    musicOsc.frequency.value = 110;
    musicLFO = audioCtx.createOscillator();
    musicLFO.frequency.value = 0.12;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 7;
    musicLFO.connect(lfoGain); lfoGain.connect(musicOsc.frequency);
    musicOsc.connect(musicGain); musicOsc.start(); musicLFO.start();
  }
  function stopMusic(){ if (musicOsc){ try{musicOsc.stop(); musicLFO.stop(); }catch(e){} musicOsc=null; musicLFO=null; } }
  function beep(freq=440,type='sine',dur=0.07,volume=0.08){
    if (!state.settings.sfx) return;
    try{
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = volume;
      o.connect(g); g.connect(sfxGain);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur + 0.02);
    }catch(e){}
  }
  function soundHit(){ beep(880+Math.random()*200,'sine',0.06,0.08) }
  function soundWall(){ beep(380,'triangle',0.08,0.06) }
  function soundScore(){ beep(180,'sawtooth',0.18,0.12) }
  function soundPower(){ beep(1400,'square',0.12,0.09) }

  // input
  const keys = {};
  let pointerY = null; let pointerActive = false;
  window.addEventListener('keydown',(e)=>{ keys[e.key]=true; if (e.key===' ') togglePause(); if (e.key==='r' || e.key==='R') resetGame(); if (e.key==='p' || e.key==='P') { spawnRandomPowerup(); } });
  window.addEventListener('keyup',(e)=>keys[e.key]=false);
  canvas.addEventListener('mousemove',(e)=>{ const rect=canvas.getBoundingClientRect(); const y=(e.clientY-rect.top)*(LOGH/rect.height); pointerY = clamp(y,0,LOGH); pointerActive=true; });
  canvas.addEventListener('mouseleave',()=>{ pointerActive=false; pointerY=null; });
  canvas.addEventListener('touchstart',(e)=>{ const t=e.touches[0]; const rect=canvas.getBoundingClientRect(); const y=(t.clientY-rect.top)*(LOGH/rect.height); pointerY=clamp(y,0,LOGH); pointerActive=true; },{passive:true});
  canvas.addEventListener('touchmove',(e)=>{ const t=e.touches[0]; const rect=canvas.getBoundingClientRect(); const y=(t.clientY-rect.top)*(LOGH/rect.height); pointerY=clamp(y,0,LOGH); },{passive:true});
  canvas.addEventListener('touchend',()=>{ pointerActive=false; pointerY=null; });

  // gamepad support
  let gamepadIndex = null;
  window.addEventListener('gamepadconnected',(e)=>{ gamepadIndex=e.gamepad.index; console.log('Gamepad connected',e.gamepad); });
  window.addEventListener('gamepaddisconnected',(e)=>{ if (gamepadIndex === e.gamepad.index) gamepadIndex = null; });

  // messaging UI wiring
  function setStatus(text){ statusEl.textContent = text; }
  function showCenter(text, ms=1500){
    centerMsg.style.display='block'; centerMsg.textContent = text;
    if (centerMessageTimeout) clearTimeout(centerMessageTimeout);
    if (ms>0) centerMessageTimeout = setTimeout(()=>{ centerMsg.style.display='none'; }, ms);
  }

  // update UI from state
  function updateUIFromState(){
    document.documentElement.style.setProperty('--bg', state.settings.theme==='ocean' ? '#052b3b' : state.settings.theme==='sunset' ? '#2b0b12' : state.settings.theme==='matrix' ? '#071207' : '#071125');
    document.documentElement.style.setProperty('--panel', state.settings.theme==='ocean' ? '#093241' : state.settings.theme==='sunset' ? '#2b111a' : state.settings.theme==='matrix' ? '#0b2b0b' : '#0f1724');
    difficultySel.value = state.settings.difficulty || 'normal';
    targetInput.value = state.settings.target || 7;
    sfxToggle.checked = !!state.settings.sfx;
    musicToggle.checked = !!state.settings.music;
    themeSel.value = state.settings.theme || 'dark';
    renderHighScores();
    renderHistory();
  }

  // high-scores and history
  function addHighScore(name, score){
    state.highScores.push({name,score,date:Date.now()});
    state.highScores.sort((a,b)=>b.score - a.score);
    state.highScores = state.highScores.slice(0,30);
    saveState(); renderHighScores();
  }
  function addHistory(entry){
    state.history.unshift(Object.assign({date:Date.now()},entry));
    state.history = state.history.slice(0,200);
    saveState(); renderHistory();
  }
  function renderHighScores(){
    highList.innerHTML = '';
    if (state.highScores.length===0){ highList.textContent = 'No scores yet'; return; }
    for (const s of state.highScores){
      const el = document.createElement('div'); el.className='stat'; el.innerHTML = `<div>${s.name}</div><div class="tiny">${s.score} — ${new Date(s.date).toLocaleString()}</div>`; highList.appendChild(el);
    }
  }
  function renderHistory(){
    historyList.innerHTML = '';
    if (state.history.length===0){ historyList.textContent = 'No matches yet'; return; }
    for (const h of state.history.slice(0,30)){
      const el = document.createElement('div'); el.className='stat';
      el.innerHTML = `<div>${h.mode} — ${h.winner}</div><div class="tiny">${h.score} — ${new Date(h.date).toLocaleString()}</div>`;
      historyList.appendChild(el);
    }
  }

  // shop/unlocks simple modal (native prompt based)
  shopBtn.addEventListener('click', ()=> {
    const skins = Object.keys(skinColors);
    let msg = 'Shop — unlock skins with XP. Your XP: ' + state.stats.xp + '\n';
    skins.forEach((s,i)=> msg += `${i+1}. ${s} ${state.unlockedSkins.includes(s) ? '(owned)' : '(cost 50 XP)'}\n`);
    msg += '\nEnter number to buy/select skin, 0 to cancel';
    const choice = parseInt(prompt(msg,'0') || '0');
    if (!choice || choice < 1 || choice > skins.length) return;
    const skin = skins[choice-1];
    if (!state.unlockedSkins.includes(skin)) {
      if (state.stats.xp >= 50) {
        state.stats.xp -= 50; state.unlockedSkins.push(skin); saveState(); alert('Purchased ' + skin); state.settings.skin=skin; saveState(); updateUIFromState();
      } else {
        alert('Not enough XP. Earn XP by playing.');
      }
    } else {
      state.settings.skin = skin; saveState(); updateUIFromState(); alert('Selected skin: ' + skin);
    }
  });

  // achievements simple
  function grantAchievement(key, desc){
    if (state.achievements[key]) return;
    state.achievements[key]= {desc, date: Date.now()};
    saveState();
    showCenter('Achievement unlocked: ' + desc, 2500);
  }
  achBtn.addEventListener('click', ()=> {
    let msg = 'Achievements:\n';
    const keys = Object.keys(state.achievements);
    if (keys.length===0) msg += 'None yet. Play to unlock.\n';
    keys.forEach(k=> msg += `• ${state.achievements[k].desc} — ${new Date(state.achievements[k].date).toLocaleString()}\n`);
    alert(msg);
  });

  // export/import
  exportBtn.addEventListener('click', ()=> {
    const dump = JSON.stringify(state, null, 2);
    navigator.clipboard.writeText(dump).then(()=> alert('Export copied to clipboard. You can paste to a file.')).catch(()=> { prompt('Export (copy manually):', dump); });
  });
  importBtn.addEventListener('click', ()=> {
    const raw = prompt('Paste exported JSON here:');
    if (!raw) return;
    try{
      const parsed = JSON.parse(raw);
      Object.assign(state, parsed);
      saveState();
      updateUIFromState();
      alert('Imported successfully');
    } catch(e){ alert('Invalid data'); }
  });

  // full screen
  fullBtn.addEventListener('click', ()=> {
    if (!document.fullscreenElement) canvas.parentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
  });

  // theme and skins UI wiring
  themeSel.addEventListener('change', ()=>{ state.settings.theme = themeSel.value; saveState(); updateUIFromState(); });
  skinDefault.addEventListener('click', ()=>{ if (!state.unlockedSkins.includes('default')) state.unlockedSkins.push('default'); state.settings.skin='default'; saveState(); updateUIFromState(); });
  skinRetro.addEventListener('click', ()=>{ if (!state.unlockedSkins.includes('retro')) { if (confirm('Buy retro for 50 XP?')) { if (state.stats.xp>=50){ state.stats.xp-=50; state.unlockedSkins.push('retro'); } else { alert('Not enough XP'); return; } } } state.settings.skin='retro'; saveState(); updateUIFromState(); });
  skinNeon.addEventListener('click', ()=>{ if (!state.unlockedSkins.includes('neon')) { if (confirm('Buy neon for 50 XP?')) { if (state.stats.xp>=50){ state.stats.xp-=50; state.unlockedSkins.push('neon'); } else { alert('Not enough XP'); return; } } } state.settings.skin='neon'; saveState(); updateUIFromState(); });
  skinMono.addEventListener('click', ()=>{ if (!state.unlockedSkins.includes('mono')) { if (confirm('Buy mono for 50 XP?')) { if (state.stats.xp>=50){ state.stats.xp-=50; state.unlockedSkins.push('mono'); } else { alert('Not enough XP'); return; } } } state.settings.skin='mono'; saveState(); updateUIFromState(); });

  // wire some controls
  startBtn.addEventListener('click', ()=> { if (!running) startMatch(); else { serveBall(Math.random()<0.5); } });
  pauseBtn.addEventListener('click', togglePause);
  resetBtn.addEventListener('click', resetGame);
  difficultySel.addEventListener('change', ()=> { state.settings.difficulty = difficultySel.value; saveState(); applyDifficulty(); });
  targetInput.addEventListener('change', ()=> { const v = Math.max(1, parseInt(targetInput.value)||7); state.settings.target = v; saveState(); targetScore = v; });
  sfxToggle.addEventListener('change', ()=>{ state.settings.sfx = sfxToggle.checked; saveState(); });
  musicToggle.addEventListener('change', ()=>{ state.settings.music = musicToggle.checked; saveState(); if (state.settings.music) startMusic(); else stopMusic(); });

  // apply difficulty
  function applyDifficulty(){
    difficulty = state.settings.difficulty || 'normal';
    if (difficulty==='easy'){ ai.speed=3.4; ai.reaction=0.16; }
    else if (difficulty==='normal'){ ai.speed=4.6; ai.reaction=0.12; }
    else { ai.speed=6.2; ai.reaction=0.08; }
  }
  applyDifficulty();

  // game core functions
  function resetEntities(){
    left.y = (LOGH - defaultPaddleH)/2; right.y = (LOGH - defaultPaddleH)/2; left.h = defaultPaddleH; right.h = defaultPaddleH;
    balls = []; particles=[]; powerups=[]; leftScore=0; rightScore=0; updateScoreboard();
  }

  function serveBall(toLeft=true, speed=5){
    balls = []; // start fresh serve
    const dir = toLeft ? -1 : 1;
    const ang = (Math.random()*Math.PI/4) - (Math.PI/8);
    const vx = dir * speed * Math.cos(ang);
    const vy = speed * Math.sin(ang);
    balls.push(new Ball(LOGW/2, LOGH/2, vx, vy));
    serveTo = toLeft ? 'left' : 'right';
    showCenter('Serve: ' + (serveTo==='left' ? leftName.textContent : rightName.textContent), 900);
  }

  function startMatch(){
    running = true; paused = false; resetEntities(); targetScore = state.settings.target || 7; applyDifficulty();
    serveBall(Math.random()<0.5);
    setStatus('Playing');
    showCenter('Match started', 900);
    if (state.settings.music) startMusic();
    loop(performance.now());
  }

  function togglePause(){ if (!running) return; paused = !paused; setStatus(paused ? 'Paused' : 'Playing'); pauseBtn.textContent = paused ? 'Resume' : 'Pause'; if (paused) showCenter('Paused', 1200); else centerMsg.style.display='none'; }

  function resetGame(){ running=false; paused=false; resetEntities(); setStatus('Stopped'); showCenter('Press Start', 1200); stopMusic(); saveState(); }

  function updateScoreboard(){ leftScoreEl.textContent = leftScore; rightScoreEl.textContent = rightScore; }

  // spawn particles
  function spawnParticles(x,y,color='#9be8e0',count=14){
    for(let i=0;i<count;i++){
      const ang=Math.random()*Math.PI*2; const speed=1+Math.random()*3;
      particles.push({x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,life:0.6+Math.random()*0.6,color,size:1+Math.random()*3});
    }
  }

  // 
