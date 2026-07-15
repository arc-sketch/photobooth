// ============================================================
// GUN.JS - No account needed, P2P sync
// ============================================================
const gun = Gun(['https://gun-manhattan.herokuapp.com/', 'https://gun-us.herokuapp.com/']);
const photos = gun.get('our-photos');
const messages = gun.get('our-messages');
const reactions = gun.get('our-reactions');

// ============================================================
// STATE
// ============================================================
const myId = localStorage.getItem('pb_id') || ('u-' + Math.random().toString(36).slice(2, 8));
localStorage.setItem('pb_id', myId);
let currentFilter = 'none', currentTemplate = 'none', currentEffect = 'none';
let currentStream = null, facingMode = 'user';
let faceApiLoaded = false, lastFaceDetection = null, animFrame = null, effectAnimTime = 0;
let captureMode = 'single';
let multiPoses = [], currentPoseIndex = 0;
let selectedSticker = null, stickers = [];
let overlayText = '', textFont = 'Space Mono', textColor = '#ffffff', textSize = 32;
let allGalleryPhotos = [], slideshowIndex = 0;
let currentModalPhotoId = null;
let photoCount = 0;

// ============================================================
// DOM
// ============================================================
const $ = id => document.getElementById(id);
const video = $('camera');
const canvas = $('capture-canvas');
const ctx = canvas.getContext('2d');
const effectCanvas = $('effect-canvas');
const effectCtx = effectCanvas.getContext('2d');
const resultCanvas = $('result-canvas');
const resultCtx = resultCanvas.getContext('2d');
const stickerCanvas = $('sticker-canvas');
const stickerCtx = stickerCanvas.getContext('2d');
const flash = $('flash-global');
const countdownOverlay = $('countdown-overlay');
const countdownNumber = $('countdown-number');
const toast = $('notification-toast');
const previewOverlay = $('preview-overlay');

// ============================================================
// GENERATE STICKER BUTTONS
// ============================================================
const stickerEmojis = ['\u2764','\uD83D\uDC95','\uD83D\uDC96','\u2728','\u2B50','\uD83C\uDF1F','\uD83E\uDD8B','\uD83C\uDF38','\uD83C\uDF3A','\uD83D\uDC51','\uD83D\uDC8D','\uD83C\uDFB5','\uD83D\uDD4A','\uD83C\uDF39','\uD83D\uDC90','\uD83C\uDF82','\uD83C\uDF70','\uD83E\uDDF9','\uD83D\uDC8B','\uD83D\uDD25'];
const stickerList = $('sticker-list');
stickerEmojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'sticker-btn';
    btn.dataset.sticker = emoji;
    btn.textContent = emoji;
    stickerList.appendChild(btn);
});

// ============================================================
// AUDIO
// ============================================================
let audioCtx;
function playShutterSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o1 = audioCtx.createOscillator(), g1 = audioCtx.createGain();
        o1.type = 'square'; o1.frequency.value = 800;
        g1.gain.setValueAtTime(0.3, audioCtx.currentTime);
        g1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        o1.connect(g1); g1.connect(audioCtx.destination); o1.start(); o1.stop(audioCtx.currentTime + 0.08);
        const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
        o2.type = 'sawtooth'; o2.frequency.value = 200;
        g2.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.02);
        g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
        o2.connect(g2); g2.connect(audioCtx.destination);
        o2.start(audioCtx.currentTime + 0.02); o2.stop(audioCtx.currentTime + 0.12);
    } catch(e) {}
}
function playBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = 600;
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.15);
    } catch(e) {}
}

// ============================================================
// SCREENS & NAVIGATION
// ============================================================
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (name === 'home') {
        $('screen-landing').classList.add('active');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.nav === 'home'));
    } else if (name === 'booth') {
        $('screen-booth').classList.add('active');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.nav === 'booth'));
        init();
    }
}

$('btn-enter').addEventListener('click', () => showScreen('booth'));
$('btn-enter-2').addEventListener('click', () => showScreen('booth'));
$('btn-enter-3').addEventListener('click', () => showScreen('booth'));
$('btn-enter-4').addEventListener('click', () => showScreen('booth'));
$('btn-back-home').addEventListener('click', (e) => { e.preventDefault(); showScreen('home'); });
$('nav-open-booth').addEventListener('click', () => { showScreen('booth'); switchView('camera'); });

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const nav = link.dataset.nav;
        if (nav === 'home') showScreen('home');
        else if (nav === 'booth') { showScreen('booth'); switchView('camera'); }
        else if (nav === 'gallery') { showScreen('booth'); switchView('gallery'); }
        else if (nav === 'exchange') { showScreen('booth'); switchView('exchange'); }
    });
});

// Booth tabs
document.querySelectorAll('.booth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
});

function switchView(name) {
    document.querySelectorAll('#screen-booth .view').forEach(v => v.classList.remove('active'));
    const view = $('view-' + name);
    if (view) view.classList.add('active');
    document.querySelectorAll('.booth-tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    document.querySelectorAll('.nav-link').forEach(l => {
        l.classList.toggle('active', l.dataset.nav === name);
    });
}

// ============================================================
// INIT
// ============================================================
let initialized = false;
async function init() {
    if (initialized) return;
    initialized = true;
    startCamera();
    listenToGallery();
    listenToExchange();
    requestNotificationPermission();
    await loadFaceApi();
}

async function loadFaceApi() {
    try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        faceApiLoaded = true;
    } catch (e) { console.warn('Face API unavailable', e); }
}

// ============================================================
// CAMERA
// ============================================================
async function startCamera() {
    try {
        if (currentStream) currentStream.getTracks().forEach(t => t.stop());
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
        });
        video.srcObject = currentStream;
        video.onloadedmetadata = () => { sizeEffectCanvas(); startEffectLoop(); };
    } catch (err) { alert('Could not access camera.'); }
}
$('switch-camera').addEventListener('click', () => { facingMode = facingMode === 'user' ? 'environment' : 'user'; startCamera(); });
window.addEventListener('resize', sizeEffectCanvas);
function sizeEffectCanvas() { const r = video.getBoundingClientRect(); effectCanvas.width = r.width; effectCanvas.height = r.height; }

// ============================================================
// CAPTURE MODE
// ============================================================
$('btn-mode-single').addEventListener('click', () => { captureMode = 'single'; $('btn-mode-single').classList.add('active'); $('btn-mode-multi').classList.remove('active'); });
$('btn-mode-multi').addEventListener('click', () => { captureMode = 'multi'; $('btn-mode-multi').classList.add('active'); $('btn-mode-single').classList.remove('active'); });

// ============================================================
// FACE DETECTION LOOP
// ============================================================
function startEffectLoop() {
    if (animFrame) cancelAnimationFrame(animFrame);
    let lastDetect = 0;
    function loop(ts) {
        animFrame = requestAnimationFrame(loop);
        effectAnimTime = ts || 0;
        const w = effectCanvas.width, h = effectCanvas.height;
        effectCtx.clearRect(0, 0, w, h);
        if (currentEffect === 'none') return;
        if (faceApiLoaded && ts - lastDetect > 150) { lastDetect = ts; detectFace(); }
        drawEffect(effectCtx, w, h, lastFaceDetection);
    }
    animFrame = requestAnimationFrame(loop);
}
async function detectFace() {
    try {
        const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })).withFaceLandmarks();
        if (det) lastFaceDetection = faceapi.resizeResults(det, { width: effectCanvas.width, height: effectCanvas.height });
    } catch(e) {}
}

// ============================================================
// EFFECTS
// ============================================================
function drawEffect(ctx, w, h, face) {
    const t = effectAnimTime;
    const lm = face ? face.landmarks : null, box = face ? face.detection.box : null;
    const f = face ? {
        cx: lm.getNose()[0].x, cy: (lm.getLeftEye()[0].y + lm.getRightEye()[0].y) / 2,
        leftEye: { x: lm.getLeftEye()[0].x, y: lm.getLeftEye()[0].y },
        rightEye: { x: lm.getRightEye()[0].x, y: lm.getRightEye()[0].y },
        nose: { x: lm.getNose()[0].x, y: lm.getNose()[3].y },
        mouth: { x: lm.getMouth()[3].x, y: lm.getMouth()[3].y },
        headTop: { x: box.x + box.width / 2, y: box.y }, box
    } : { cx: w/2, cy: h/2, leftEye:{x:w*0.38,y:h*0.38}, rightEye:{x:w*0.62,y:h*0.38},
        nose:{x:w*0.5,y:h*0.5}, mouth:{x:w*0.5,y:h*0.62},
        headTop:{x:w/2,y:h*0.15}, box:{x:w*0.2,y:h*0.1,width:w*0.6,height:h*0.7} };
    switch(currentEffect) {
        case 'sparkles': fxSparkles(ctx,f,t); break; case 'hearts': fxHearts(ctx,f,t); break;
        case 'rainbow': fxRainbow(ctx,f,t); break; case 'neon': fxNeon(ctx,f,t,face); break;
        case 'stars': fxStars(ctx,f,t); break; case 'confetti': fxConfetti(ctx,f,t); break;
        case 'butterflies': fxButterflies(ctx,f,t); break; case 'glitter': fxGlitter(ctx,f,t); break;
        case 'sunglasses': fxSunglasses(ctx,f,t); break; case 'blush': fxBlush(ctx,f,t); break;
        case 'dogface': fxDogFace(ctx,f,t); break; case 'crown': fxCrown(ctx,f,t); break;
    }
}

function fxSparkles(ctx,f,t){for(let i=0;i<35;i++){const s=i*137.508,px=f.cx+Math.sin(s+t*0.001)*f.box.width*0.8,py=f.cy+Math.cos(s*1.3+t*0.0015)*f.box.height*0.7,ph=Math.sin(t*0.005+s),sz=2+ph*2,al=0.4+ph*0.4;if(al<=0)continue;ctx.save();ctx.translate(px,py);ctx.rotate(t*0.002+s);ctx.fillStyle=`rgba(255,255,255,${al})`;ctx.beginPath();for(let j=0;j<4;j++){ctx.lineTo(0,-sz*2.5);ctx.lineTo(sz*0.4,-sz*0.4);ctx.rotate(Math.PI/2);}ctx.closePath();ctx.fill();ctx.restore();}}
const heartsPool=[];
function fxHearts(ctx,f,t){while(heartsPool.length<12)heartsPool.push({x:Math.random(),y:Math.random(),speed:0.3+Math.random()*0.5,size:14+Math.random()*12,w:Math.random()*Math.PI*2,em:['\u2764','\uD83D\uDC95','\uD83D\uDC96','\uD83D\uDC97','\uD83D\uDC98'][Math.floor(Math.random()*5)]});heartsPool.forEach(p=>{p.y-=p.speed*0.008;if(p.y<-0.2){p.y=1.1;p.x=Math.random();}const px=f.cx+(p.x-0.5)*f.box.width*1.4,py=f.box.y+p.y*f.box.height;ctx.globalAlpha=0.7;ctx.font=`${p.size}px serif`;ctx.textAlign='center';ctx.fillText(p.em,px+Math.sin(t*0.003+p.w)*10,py);ctx.globalAlpha=1;});}
function fxRainbow(ctx,f,t){const c=['#ff0000','#ff7700','#ffff00','#00ff00','#0000ff','#8b00ff'];ctx.save();ctx.globalAlpha=0.6;c.forEach((co,i)=>{ctx.beginPath();ctx.arc(f.mouth.x,f.mouth.y+f.box.height*0.05,f.box.height*0.3+i*8,0.7*Math.PI,0.3*Math.PI,true);ctx.strokeStyle=co;ctx.lineWidth=6;ctx.lineCap='round';ctx.stroke();});ctx.globalAlpha=1;ctx.restore();}
function fxNeon(ctx,f,t,face){if(!face)return;const pts=face.landmarks.getJawOutline();['#FF7BA3','#c44dff','#5FA0FF'].forEach((c,i)=>{ctx.beginPath();ctx.strokeStyle=c;ctx.lineWidth=3;ctx.shadowColor=c;ctx.shadowBlur=15+Math.sin(t*0.005+i)*8;pts.forEach((p,j)=>j===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y));ctx.stroke();});ctx.shadowBlur=0;}
function fxStars(ctx,f,t){for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2+t*0.002,px=f.cx+Math.cos(a)*f.box.width*0.65,py=(f.headTop.y+f.box.y+f.box.height)/2+Math.sin(a)*f.box.height*0.55;ctx.fillStyle='#FFD700';ctx.globalAlpha=0.7+Math.sin(t*0.004+i*2)*0.3;drawStarShape(ctx,px,py,6+Math.sin(t*0.006+i)*2,5);ctx.globalAlpha=1;}}
function drawStarShape(ctx,cx,cy,r,pts){ctx.beginPath();for(let i=0;i<pts*2;i++){const rad=i%2===0?r:r*0.4,a=(i*Math.PI)/pts-Math.PI/2;i===0?ctx.moveTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad):ctx.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad);}ctx.closePath();ctx.fill();}
const confettiP=[];
function fxConfetti(ctx,f,t){while(confettiP.length<40)confettiP.push({x:Math.random(),y:-Math.random(),vx:(Math.random()-0.5)*0.003,vy:0.002+Math.random()*0.004,c:['#FF7BA3','#c44dff','#5FA0FF','#FFD700','#00ff88','#ff4444'][Math.floor(Math.random()*6)],w:4+Math.random()*6,h:3+Math.random()*4,r:Math.random()*Math.PI*2,rs:(Math.random()-0.5)*0.1});confettiP.forEach(p=>{p.y+=p.vy;p.x+=p.vx+Math.sin(t*0.002+p.r)*0.001;p.r+=p.rs;if(p.y>1.2){p.y=-0.1;p.x=Math.random();}const px=f.headTop.x+(p.x-0.5)*f.box.width*1.8,py=f.headTop.y+p.y*f.box.height;ctx.save();ctx.translate(px,py);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.globalAlpha=0.7;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore();});ctx.globalAlpha=1;}
const bflyP=[];
function fxButterflies(ctx,f,t){while(bflyP.length<5)bflyP.push({a:Math.random()*Math.PI*2,d:0.3+Math.random()*0.4,sp:0.001+Math.random()*0.002,sz:16+Math.random()*10,w:Math.random()*Math.PI*2,em:['\uD83E\uDD8B','\uD83C\uDF38','\uD83C\uDF3A','\u2728'][Math.floor(Math.random()*4)]});bflyP.forEach(p=>{p.a+=p.sp;const px=f.cx+Math.cos(p.a)*f.box.width*p.d+Math.sin(t*0.003+p.w)*15,py=f.cy+Math.sin(p.a)*f.box.height*p.d*0.8+Math.cos(t*0.004+p.w)*10;ctx.globalAlpha=0.75;ctx.font=`${p.sz}px serif`;ctx.textAlign='center';ctx.fillText(p.em,px,py);});ctx.globalAlpha=1;}
function fxGlitter(ctx,f,t){for(let i=0;i<80;i++){const s=i*97.3,px=f.cx+Math.sin(s)*f.box.width*0.7,py=f.cy+Math.cos(s*1.7)*f.box.height*0.6,ph=Math.sin(t*0.008+s);if(ph<0.2)continue;const r=128+Math.sin(s*3)*127,g=128+Math.sin(s*5)*127,b=128+Math.sin(s*7)*127;ctx.fillStyle=`rgba(${r|0},${g|0},${b|0},${ph*0.8})`;ctx.beginPath();ctx.arc(px,py,1.5+ph*1.5,0,Math.PI*2);ctx.fill();}}
function fxSunglasses(ctx,f,t){const lx=f.leftEye.x,ly=f.leftEye.y,rx=f.rightEye.x,ry=f.rightEye.y,ed=Math.sqrt((rx-lx)**2+(ry-ly)**2),tilt=Math.atan2(ry-ly,rx-lx);ctx.save();ctx.translate((lx+rx)/2,(ly+ry)/2);ctx.rotate(tilt);ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-ed*0.08,0);ctx.quadraticCurveTo(0,-ed*0.12,ed*0.08,0);ctx.stroke();ctx.fillStyle='rgba(0,0,0,0.85)';ctx.beginPath();ctx.ellipse(-ed*0.3,0,ed*0.35*0.5,ed*0.28*0.5,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(ed*0.3,0,ed*0.35*0.5,ed*0.28*0.5,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-ed*0.65,0);ctx.lineTo(-ed*0.9,-ed*0.15);ctx.stroke();ctx.beginPath();ctx.moveTo(ed*0.65,0);ctx.lineTo(ed*0.9,-ed*0.15);ctx.stroke();ctx.fillStyle='rgba(255,255,255,0.18)';ctx.beginPath();ctx.ellipse(-ed*0.38,-ed*0.08,ed*0.04,ed*0.06,-0.3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(ed*0.22,-ed*0.08,ed*0.04,ed*0.06,-0.3,0,Math.PI*2);ctx.fill();ctx.restore();}
function fxBlush(ctx,f,t){const cy=f.leftEye.y+f.box.height*0.18,sp=Math.abs(f.rightEye.x-f.leftEye.x)*0.85,br=f.box.width*0.12,pulse=0.25+Math.sin(t*0.003)*0.08;[f.cx-sp/2,f.cx+sp/2].forEach(bx=>{const g=ctx.createRadialGradient(bx,cy,0,bx,cy,br);g.addColorStop(0,`rgba(255,107,157,${pulse})`);g.addColorStop(1,'rgba(255,107,157,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(bx,cy,br,0,Math.PI*2);ctx.fill();});ctx.font=`${f.box.width*0.06}px serif`;ctx.textAlign='center';ctx.globalAlpha=0.5+Math.sin(t*0.005)*0.3;ctx.fillText('\u2728',f.cx-sp/2,cy-br*0.8);ctx.fillText('\u2728',f.cx+sp/2,cy-br*0.8);ctx.globalAlpha=1;}
function fxDogFace(ctx,f,t){const bx=f.box.x,by=f.box.y,bw=f.box.width,bh=f.box.height;ctx.fillStyle='#8B6914';ctx.beginPath();ctx.ellipse(bx+bw*0.15,by-bh*0.02,bw*0.14,bh*0.16,-0.4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(bx+bw*0.85,by-bh*0.02,bw*0.14,bh*0.16,0.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#D4956A';ctx.beginPath();ctx.ellipse(bx+bw*0.15,by+bh*0.01,bw*0.08,bh*0.09,-0.4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(bx+bw*0.85,by+bh*0.01,bw*0.08,bh*0.09,0.4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#222';ctx.beginPath();ctx.ellipse(f.nose.x,f.nose.y,bw*0.04,bh*0.025,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#222';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(f.nose.x,f.nose.y+bh*0.03);ctx.lineTo(f.nose.x,f.mouth.y-bh*0.02);ctx.stroke();ctx.beginPath();ctx.moveTo(f.nose.x,f.mouth.y-bh*0.02);ctx.quadraticCurveTo(f.nose.x-bw*0.04,f.mouth.y+bh*0.03,f.nose.x-bw*0.06,f.mouth.y);ctx.stroke();ctx.beginPath();ctx.moveTo(f.nose.x,f.mouth.y-bh*0.02);ctx.quadraticCurveTo(f.nose.x+bw*0.04,f.mouth.y+bh*0.03,f.nose.x+bw*0.06,f.mouth.y);ctx.stroke();const tl=bh*0.06+Math.sin(t*0.004)*bh*0.015;ctx.fillStyle='#ff6b8a';ctx.beginPath();ctx.ellipse(f.nose.x,f.mouth.y+tl*0.5,bw*0.025,tl*0.5,0,0,Math.PI);ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=1.5;[-1,1].forEach(side=>{for(let i=-1;i<=1;i++){ctx.beginPath();ctx.moveTo(f.nose.x+side*bw*0.06,f.mouth.y+i*3);ctx.lineTo(f.nose.x+side*bw*0.2,f.mouth.y+i*8-bh*0.01);ctx.stroke();}});}
function fxCrown(ctx,f,t){const cx=f.headTop.x,cy=f.headTop.y-f.box.height*0.05,cw=f.box.width*0.4,ch=f.box.height*0.14,bob=Math.sin(t*0.003)*3;ctx.save();ctx.translate(cx,cy+bob);ctx.shadowColor='rgba(255,215,0,0.6)';ctx.shadowBlur=15+Math.sin(t*0.005)*8;ctx.fillStyle='#FFD700';ctx.strokeStyle='#DAA520';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-cw/2,ch);ctx.lineTo(-cw/2,0);ctx.lineTo(-cw/4,ch*0.5);ctx.lineTo(0,-ch*0.3);ctx.lineTo(cw/4,ch*0.5);ctx.lineTo(cw/2,0);ctx.lineTo(cw/2,ch);ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;['#ff0000','#00ff00','#0066ff'].forEach((c,i)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc([-cw*0.2,0,cw*0.2][i],ch*0.6,3+Math.sin(t*0.008)*1.5,0,Math.PI*2);ctx.fill();});ctx.restore();}

// ============================================================
// FILTERS + EFFECTS BUTTONS
// ============================================================
document.querySelectorAll('#filter-bar .pill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#filter-bar .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        video.className = currentFilter !== 'none' ? 'filter-' + currentFilter : '';
    });
});
function getCSSFilter(f) { return { grayscale:'grayscale(100%)', sepia:'sepia(80%)', vintage:'sepia(40%) contrast(1.1) brightness(0.95) saturate(1.3)', warm:'sepia(20%) saturate(1.4) brightness(1.05)', cool:'saturate(0.8) brightness(1.05) hue-rotate(20deg)', rosy:'saturate(1.3) hue-rotate(-10deg) brightness(1.05)', dreamy:'contrast(0.85) brightness(1.15) saturate(1.2)' }[f] || 'none'; }
document.querySelectorAll('#effect-bar .pill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#effect-bar .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentEffect = btn.dataset.effect;
    });
});

// ============================================================
// CAPTURE
// ============================================================
$('capture-btn').addEventListener('click', () => { if (captureMode === 'multi') startMultiPose(); else startCountdown(); });

function startCountdown(callback) {
    countdownOverlay.classList.add('active');
    let count = 3; countdownNumber.textContent = count;
    const iv = setInterval(() => { count--;
        if (count > 0) { countdownNumber.textContent = count; playBeep(); }
        else { clearInterval(iv); countdownOverlay.classList.remove('active'); triggerFlash(); playShutterSound(); if (callback) callback(); else captureSingle(); }
    }, 800);
}
function triggerFlash() { flash.classList.add('active'); setTimeout(() => flash.classList.remove('active'), 400); }

function startMultiPose() {
    multiPoses = []; currentPoseIndex = 0;
    const prog = $('multi-pose-progress'); prog.innerHTML = '';
    for (let i = 0; i < 4; i++) { const d = document.createElement('div'); d.className = 'pose-dot'; d.id = 'pose-dot-' + i; prog.appendChild(d); }
    countdownOverlay.classList.add('active'); doMultiPoseCount();
}

function doMultiPoseCount() {
    let count = 3; countdownNumber.textContent = count;
    $('multi-pose-progress').style.display = 'flex'; updatePoseDots();
    const iv = setInterval(() => { count--;
        if (count > 0) { countdownNumber.textContent = count; playBeep(); }
        else { clearInterval(iv); triggerFlash(); playShutterSound(); multiPoses.push(captureToCanvas()); $('pose-dot-' + currentPoseIndex).classList.add('done'); currentPoseIndex++;
            if (currentPoseIndex < 4) doMultiPoseCount();
            else { countdownOverlay.classList.remove('active'); $('multi-pose-progress').style.display = 'none'; showMultiPosePreview(); }
        }
    }, 800);
}

function updatePoseDots() { for (let i = 0; i < 4; i++) { const dot = $('pose-dot-' + i); if (!dot) continue; dot.classList.remove('current','done'); if (i < currentPoseIndex) dot.classList.add('done'); else if (i === currentPoseIndex) dot.classList.add('current'); } }

function captureToCanvas() {
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const cx = c.getContext('2d'); cx.save();
    if (facingMode === 'user') { cx.translate(c.width, 0); cx.scale(-1, 1); }
    cx.filter = getCSSFilter(currentFilter); cx.drawImage(video, 0, 0); cx.restore();
    if (currentEffect !== 'none') cx.drawImage(effectCanvas, 0, 0, c.width, c.height);
    return c;
}

function captureSingle() { multiPoses = [captureToCanvas()]; showSinglePreview(); }

// ============================================================
// PREVIEW
// ============================================================
function showSinglePreview() {
    previewOverlay.style.display = 'block';
    $('preview-title').textContent = 'Nice shot!';
    stickers = []; overlayText = ''; selectedSticker = null; currentTemplate = 'none';
    document.querySelectorAll('#template-selector .pill').forEach(b => b.classList.remove('active'));
    document.querySelector('#template-selector .pill[data-template="none"]').classList.add('active');
    $('photo-caption').value = ''; $('overlay-text').value = '';
    document.querySelectorAll('.sticker-btn').forEach(b => b.classList.remove('active'));
    renderResult();
}
function showMultiPosePreview() {
    previewOverlay.style.display = 'block';
    $('preview-title').textContent = 'Your 4-pose strip!';
    stickers = []; overlayText = ''; currentTemplate = 'strip4';
    document.querySelectorAll('#template-selector .pill').forEach(b => b.classList.remove('active'));
    document.querySelector('#template-selector .pill[data-template="strip4"]').classList.add('active');
    $('photo-caption').value = ''; $('overlay-text').value = '';
    renderResult();
}

document.querySelectorAll('#template-selector .pill').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#template-selector .pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTemplate = btn.dataset.template;
        renderResult();
    });
});
$('retake-btn').addEventListener('click', () => { previewOverlay.style.display = 'none'; });
$('download-btn').addEventListener('click', () => { composeFinalImage(); const link = document.createElement('a'); link.download = 'our-photo-' + Date.now() + '.png'; link.href = resultCanvas.toDataURL('image/png'); link.click(); });
$('share-btn').addEventListener('click', shareToGallery);

function shareToGallery() {
    composeFinalImage();
    const caption = $('photo-caption').value.trim();
    const imageData = resultCanvas.toDataURL('image/jpeg', 0.7);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    photos.get(id).put({ url: imageData, caption, by: myId, time: Date.now(), id });
    previewOverlay.style.display = 'none'; showToast('Photo shared!'); switchView('gallery');
}

// ============================================================
// STICKERS
// ============================================================
document.querySelectorAll('.sticker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sticker-btn').forEach(b => b.classList.remove('active'));
        if (selectedSticker === btn.dataset.sticker) selectedSticker = null;
        else { btn.classList.add('active'); selectedSticker = btn.dataset.sticker; }
    });
});
$('btn-clear-stickers').addEventListener('click', () => { stickers = []; renderStickers(); });
function initStickerCanvas() { const rect = resultCanvas.getBoundingClientRect(); stickerCanvas.width = resultCanvas.width; stickerCanvas.height = resultCanvas.height; stickerCanvas.style.width = rect.width + 'px'; stickerCanvas.style.height = rect.height + 'px'; }
stickerCanvas.addEventListener('click', (e) => { if (!selectedSticker) return; const rect = stickerCanvas.getBoundingClientRect(); const sx = stickerCanvas.width / rect.width, sy = stickerCanvas.height / rect.height; const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy; stickers.push({ emoji: selectedSticker, x, y, size: stickerCanvas.width * 0.08 }); renderStickers(); });
function renderStickers() { stickerCtx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height); stickers.forEach(s => { stickerCtx.font = `${s.size}px serif`; stickerCtx.textAlign = 'center'; stickerCtx.fillText(s.emoji, s.x, s.y); }); }

// ============================================================
// TEXT OVERLAY
// ============================================================
$('text-font').addEventListener('change', (e) => { textFont = e.target.value; });
$('text-color').addEventListener('input', (e) => { textColor = e.target.value; });
$('text-size').addEventListener('input', (e) => { textSize = parseInt(e.target.value); });
$('btn-apply-text').addEventListener('click', () => { overlayText = $('overlay-text').value.trim(); renderResult(); });

// ============================================================
// COMPOSE FINAL
// ============================================================
function composeFinalImage() {
    renderResult();
    if (stickers.length > 0) stickers.forEach(s => { resultCtx.font = `${s.size}px serif`; resultCtx.textAlign = 'center'; resultCtx.fillText(s.emoji, s.x * (resultCanvas.width / stickerCanvas.width), s.y * (resultCanvas.height / stickerCanvas.height)); });
    if (overlayText) { resultCtx.save(); resultCtx.font = `${textSize}px '${textFont}', cursive`; resultCtx.textAlign = 'center'; resultCtx.fillStyle = textColor; resultCtx.shadowColor = 'rgba(0,0,0,0.6)'; resultCtx.shadowBlur = 6; resultCtx.fillText(overlayText, resultCanvas.width / 2, resultCanvas.height - textSize); resultCtx.shadowBlur = 0; resultCtx.restore(); }
}

// ============================================================
// TEMPLATE RENDERERS
// ============================================================
function renderResult() { const src = multiPoses[0]; if (!src) return; const w = src.width, h = src.height; switch(currentTemplate) { case 'strip4': renderPhotoStrip(w,h); break; case 'heart': renderHeart(w,h); break; case 'polaroid': renderPolaroid(w,h); break; case 'film': renderFilm(w,h); break; case 'roses': renderRoses(w,h); break; case 'starry': renderStarry(w,h); break; case 'blush': renderBlushT(w,h); break; case 'vintage-frame': renderVintageFrame(w,h); break; case 'comic': renderComic(w,h); break; case 'elegant': renderElegant(w,h); break; default: renderNone(w,h); } initStickerCanvas(); renderStickers(); }
function renderNone(w,h){resultCanvas.width=w;resultCanvas.height=h;resultCtx.drawImage(multiPoses[0],0,0);}
function renderPhotoStrip(w,h){if(multiPoses.length>=4){const g=8,p=16;resultCanvas.width=w+p*2;resultCanvas.height=h*4+g*3+p*2;resultCtx.fillStyle='#F8F9FB';resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);for(let i=0;i<4;i++)resultCtx.drawImage(multiPoses[i],p,p+i*(h+g),w,h);}else renderNone(w,h);}
function renderPolaroid(w,h){const p=40,b=80;resultCanvas.width=w+p*2;resultCanvas.height=h+p+b;resultCtx.fillStyle='#fff';resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);resultCtx.drawImage(multiPoses[0],p,p,w,h);resultCtx.fillStyle='#17181C';resultCtx.font='20px Space Mono,monospace';resultCtx.textAlign='center';resultCtx.fillText('\u2764 Our Moment \u2764',resultCanvas.width/2,h+p+50);}
function renderHeart(w,h){const sz=Math.max(w,h)+100;resultCanvas.width=sz;resultCanvas.height=sz;const cx=sz/2,cy=sz/2-20,s=sz*0.38;resultCtx.save();resultCtx.beginPath();resultCtx.moveTo(cx,cy+s*0.7);resultCtx.bezierCurveTo(cx-s*1.2,cy-s*0.2,cx-s*0.6,cy-s*1.2,cx,cy-s*0.5);resultCtx.bezierCurveTo(cx+s*0.6,cy-s*1.2,cx+s*1.2,cy-s*0.2,cx,cy+s*0.7);resultCtx.closePath();resultCtx.clip();const ia=w/h;let dw,dh;if(ia>1){dh=s*2.2;dw=dh*ia}else{dw=s*2;dh=dw/ia}if(facingMode==='user'){resultCtx.translate(cx,0);resultCtx.scale(-1,1);resultCtx.drawImage(multiPoses[0],-dw/2,cy-s*1.2,dw,dh)}else resultCtx.drawImage(multiPoses[0],cx-dw/2,cy-s*1.2,dw,dh);resultCtx.restore();}
function renderFilm(w,h){const sh=18,sw=40;resultCanvas.width=w+sw*2;resultCanvas.height=h+sh*2;resultCtx.fillStyle='#111';resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);resultCtx.drawImage(multiPoses[0],sw,sh,w,h);resultCtx.fillStyle='#333';for(let i=0;i<12;i++){const y=sh+i*(h/11);resultCtx.fillRect(10,y,20,10);resultCtx.fillRect(resultCanvas.width-30,y,20,10);}}
function renderRoses(w,h){const b=50;resultCanvas.width=w+b*2;resultCanvas.height=h+b*2;resultCtx.fillStyle='#fff0f3';resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);resultCtx.drawImage(multiPoses[0],b,b,w,h);resultCtx.font='30px serif';resultCtx.textAlign='center';[[b/2,b/2+10],[resultCanvas.width-b/2,b/2+10],[b/2,resultCanvas.height-b/2+10],[resultCanvas.width-b/2,resultCanvas.height-b/2+10]].forEach(([x,y])=>resultCtx.fillText('\uD83C\uDF39',x,y));resultCtx.font='20px Space Mono,monospace';resultCtx.fillStyle='#FF7BA3';resultCtx.fillText('Forever & Always \u2764',resultCanvas.width/2,resultCanvas.height-12);}
function renderStarry(w,h){resultCanvas.width=w;resultCanvas.height=h;const g=resultCtx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#0a0a2e');g.addColorStop(0.5,'#1a1a4e');g.addColorStop(1,'#2a1a3e');resultCtx.fillStyle=g;resultCtx.fillRect(0,0,w,h);resultCtx.globalAlpha=0.5;resultCtx.drawImage(multiPoses[0],0,0,w,h);resultCtx.globalAlpha=1;for(let i=0;i<60;i++){const x=Math.random()*w,y=Math.random()*h,r=Math.random()*2+0.5;resultCtx.beginPath();resultCtx.arc(x,y,r,0,Math.PI*2);resultCtx.fillStyle=`rgba(255,255,${200+Math.random()*55},${0.5+Math.random()*0.5})`;resultCtx.fill();}resultCtx.font='24px Space Mono,monospace';resultCtx.textAlign='center';resultCtx.fillStyle='#ffe4ec';resultCtx.fillText('\u2728 You are my star \u2728',w/2,h-20);}
function renderBlushT(w,h){resultCanvas.width=w;resultCanvas.height=h;resultCtx.drawImage(multiPoses[0],0,0);const g=resultCtx.createRadialGradient(w/2,h/2,0,w/2,h/2,w*0.7);g.addColorStop(0,'rgba(255,182,193,0)');g.addColorStop(1,'rgba(255,105,140,0.35)');resultCtx.fillStyle=g;resultCtx.fillRect(0,0,w,h);resultCtx.font='20px Space Mono,monospace';resultCtx.textAlign='center';resultCtx.fillStyle='#fff';resultCtx.shadowColor='rgba(0,0,0,0.5)';resultCtx.shadowBlur=4;resultCtx.fillText('\uD83D\uDC95 Us \uD83D\uDC95',w/2,h-18);resultCtx.shadowBlur=0;}
function renderVintageFrame(w,h){const b=30;resultCanvas.width=w+b*2;resultCanvas.height=h+b*2;const g=resultCtx.createLinearGradient(0,0,resultCanvas.width,resultCanvas.height);g.addColorStop(0,'#d4a574');g.addColorStop(0.5,'#c4956a');g.addColorStop(1,'#b8866a');resultCtx.fillStyle=g;resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);resultCtx.shadowColor='rgba(0,0,0,0.5)';resultCtx.shadowBlur=15;resultCtx.drawImage(multiPoses[0],b,b,w,h);resultCtx.shadowBlur=0;resultCtx.strokeStyle='#8b6914';resultCtx.lineWidth=2;resultCtx.strokeRect(b-5,b-5,w+10,h+10);}
function renderComic(w,h){resultCanvas.width=w;resultCanvas.height=h;resultCtx.drawImage(multiPoses[0],0,0);resultCtx.globalCompositeOperation='color-dodge';const g=resultCtx.createLinearGradient(0,0,w,h);g.addColorStop(0,'rgba(255,0,100,0.3)');g.addColorStop(0.5,'rgba(0,100,255,0.3)');g.addColorStop(1,'rgba(255,255,0,0.3)');resultCtx.fillStyle=g;resultCtx.fillRect(0,0,w,h);resultCtx.globalCompositeOperation='source-over';resultCtx.strokeStyle='#000';resultCtx.lineWidth=6;resultCtx.strokeRect(3,3,w-6,h-6);const bx=w-160,by=15,bw=145,bh=55;resultCtx.fillStyle='#fff';resultCtx.fillRect(bx,by,bw,bh);resultCtx.strokeStyle='#000';resultCtx.lineWidth=3;resultCtx.strokeRect(bx,by,bw,bh);resultCtx.beginPath();resultCtx.moveTo(bx+bw/2,by+bh);resultCtx.lineTo(bx+bw/2+10,by+bh+15);resultCtx.lineTo(bx+bw/2-10,by+bh);resultCtx.fill();resultCtx.stroke();resultCtx.fillStyle='#000';resultCtx.font='bold 18px Pretendard,sans-serif';resultCtx.textAlign='center';resultCtx.fillText('POW! \u2764',bx+bw/2,by+35);}
function renderElegant(w,h){const b=50;resultCanvas.width=w+b*2;resultCanvas.height=h+b*2+40;resultCtx.fillStyle='#faf8f5';resultCtx.fillRect(0,0,resultCanvas.width,resultCanvas.height);resultCtx.strokeStyle='#c9a96e';resultCtx.lineWidth=2;resultCtx.strokeRect(b-10,b-10,w+20,h+20);resultCtx.strokeStyle='#d4b896';resultCtx.lineWidth=1;resultCtx.strokeRect(b-15,b-15,w+30,h+30);resultCtx.drawImage(multiPoses[0],b,b,w,h);resultCtx.fillStyle='#8b6914';resultCtx.font='22px Space Mono,monospace';resultCtx.textAlign='center';resultCtx.fillText('Love is in the air',resultCanvas.width/2,h+b+35);}

// ============================================================
// GALLERY - Gun.js real-time sync
// ============================================================
function listenToGallery() {
    let firstLoad = true;
    photos.map().on((photo, id) => {
        if (!photo || !photo.url) return;
        if (firstLoad) { allGalleryPhotos.push(photo); addPhotoToGallery(photo); photoCount++; $('photo-count').textContent = photoCount + ' photos together'; }
        else {
            const exists = allGalleryPhotos.find(p => p.id === photo.id);
            if (!exists) {
                allGalleryPhotos.push(photo); addPhotoToGallery(photo); photoCount++;
                $('photo-count').textContent = photoCount + ' photos together';
                if (photo.by !== myId) { showToast('Your partner shared a photo!'); sendBrowserNotification('Your partner shared a photo!'); }
            }
        }
        firstLoad = false;
    });
}

function addPhotoToGallery(photo) {
    $('gallery-empty').style.display = 'none';
    const grid = $('gallery-grid');
    const item = document.createElement('div');
    item.className = 'gallery-item new-item';
    const byText = photo.by === myId ? 'You' : 'Your partner';
    item.innerHTML = `<img src="${photo.url}" alt="Photo"><div class="gallery-item-info">${photo.caption ? `<div class="caption">${photo.caption}</div>` : ''}<div class="by-who">${byText}</div></div>`;
    item.addEventListener('click', () => openModal(photo));
    grid.prepend(item);
    setTimeout(() => item.classList.remove('new-item'), 500);
}

// ============================================================
// SLIDESHOW
// ============================================================
$('btn-slideshow').addEventListener('click', startSlideshow);
function startSlideshow() { if (allGalleryPhotos.length === 0) return; slideshowIndex = 0; $('slideshow-overlay').style.display = 'flex'; renderSlideshow(); }
function renderSlideshow() { const photo = allGalleryPhotos[slideshowIndex]; if (!photo) { $('slideshow-overlay').style.display = 'none'; return; } $('slideshow-img').src = photo.url; $('slideshow-caption').textContent = photo.caption || ''; const dots = $('slideshow-dots'); dots.innerHTML = ''; allGalleryPhotos.forEach((_, i) => { const d = document.createElement('div'); d.className = 'slideshow-dot' + (i === slideshowIndex ? ' active' : ''); d.addEventListener('click', () => { slideshowIndex = i; renderSlideshow(); }); dots.appendChild(d); }); }
$('slideshow-prev').addEventListener('click', () => { slideshowIndex = Math.max(0, slideshowIndex - 1); renderSlideshow(); });
$('slideshow-next').addEventListener('click', () => { slideshowIndex = Math.min(allGalleryPhotos.length - 1, slideshowIndex + 1); renderSlideshow(); });
$('slideshow-close').addEventListener('click', () => { $('slideshow-overlay').style.display = 'none'; });
$('slideshow-overlay').querySelector('.slideshow-backdrop').addEventListener('click', () => { $('slideshow-overlay').style.display = 'none'; });

// ============================================================
// REACTIONS - Gun.js
// ============================================================
function openModal(photo) {
    $('modal-image').src = photo.url;
    $('modal-caption').textContent = photo.caption || '';
    $('modal-by').textContent = photo.by === myId ? 'You' : 'Your partner';
    currentModalPhotoId = photo.id;
    $('image-modal').style.display = 'flex';
    $('modal-download').onclick = () => { const l = document.createElement('a'); l.download = 'photo-' + Date.now() + '.png'; l.href = photo.url; l.click(); };
    renderModalReactions(photo.id);
}

document.querySelectorAll('.react-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentModalPhotoId) return;
        const emoji = btn.dataset.react;
        const ref = reactions.get(currentModalPhotoId).get(myId);
        ref.once((val) => {
            if (val === emoji) ref.put(null);
            else ref.put(emoji);
            renderModalReactions(currentModalPhotoId);
        });
    });
});

function renderModalReactions(photoId) {
    const list = $('modal-reaction-list'); list.innerHTML = '';
    reactions.get(photoId).map().on((emoji, userId) => {
        if (emoji && !list.querySelector(`[data-uid="${userId}"]`)) {
            const span = document.createElement('span'); span.textContent = emoji; span.dataset.uid = userId; list.appendChild(span);
        }
    });
    reactions.get(photoId).get(myId).once((emoji) => {
        document.querySelectorAll('.react-btn').forEach(b => b.classList.toggle('reacted', b.dataset.react === emoji));
    });
}

$('image-modal').querySelector('.modal-backdrop').addEventListener('click', () => $('image-modal').style.display = 'none');
$('image-modal').querySelector('.modal-close').addEventListener('click', () => $('image-modal').style.display = 'none');

// ============================================================
// EXCHANGE - Gun.js
// ============================================================
function listenToExchange() {
    let firstLoad = true;
    messages.map().on((msg, id) => {
        if (!msg || !msg.text) return;
        if (!firstLoad && msg.by !== myId) {
            if (msg.type === 'photo') { showToast('Your partner sent a photo!'); sendBrowserNotification('Your partner sent you a photo!'); }
            else showToast('Your partner: ' + msg.text);
        }
        addMessageToChat(msg);
        firstLoad = false;
    });
}

$('btn-send-text').addEventListener('click', sendMessage);
$('exchange-text').addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
    const text = $('exchange-text').value.trim();
    if (!text) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    messages.get(id).put({ type: 'text', text, by: myId, time: Date.now(), id });
    $('exchange-text').value = '';
}

$('btn-send-photo').addEventListener('click', () => {
    previewOverlay.style.display = 'block'; $('preview-title').textContent = 'Send a photo!';
    stickers = []; overlayText = ''; $('overlay-text').value = '';
    currentTemplate = 'none'; document.querySelectorAll('#template-selector .pill').forEach(b => b.classList.remove('active'));
    document.querySelector('#template-selector .pill[data-template="none"]').classList.add('active');
    $('photo-caption').value = ''; renderResult();
    $('share-btn').textContent = 'Send'; $('share-btn').onclick = sendExchangePhoto;
});

function sendExchangePhoto() {
    composeFinalImage();
    const caption = $('photo-caption').value.trim();
    const imageData = resultCanvas.toDataURL('image/jpeg', 0.7);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    messages.get(id).put({ type: 'photo', url: imageData, caption, by: myId, time: Date.now(), id });
    previewOverlay.style.display = 'none'; $('share-btn').textContent = 'Share \u2665'; $('share-btn').onclick = shareToGallery;
    showToast('Photo sent!'); switchView('exchange');
}

function addMessageToChat(msg) {
    const container = $('exchange-messages');
    const div = document.createElement('div');
    const isMine = msg.by === myId;
    div.className = 'exchange-msg ' + (isMine ? 'mine' : 'theirs');
    const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const byText = isMine ? 'You' : 'Your partner';
    if (msg.type === 'photo') {
        div.innerHTML = `<img src="${msg.url}" alt="Photo" onclick="openModal({url:this.src,id:'temp',caption:'',by:''})">${msg.caption ? `<div class="msg-caption">${msg.caption}</div>` : ''}<div class="msg-time">${byText} \u00b7 ${timeStr}</div>`;
    } else {
        div.innerHTML = `<div>${msg.text}</div><div class="msg-time">${byText} \u00b7 ${timeStr}</div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ============================================================
// TOAST + NOTIFICATIONS
// ============================================================
function showToast(msg) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3500); }
function requestNotificationPermission() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
function sendBrowserNotification(text) { if ('Notification' in window && Notification.permission === 'granted') new Notification('Our Photobooth', { body: text }); }
