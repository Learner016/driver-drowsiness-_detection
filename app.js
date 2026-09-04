import { FilesetResolver, FaceLandmarker } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

const DROWSINESS_SECONDS = 1.5;
const CALIBRATION_SAMPLES = 60;
const THRESHOLD_FACTOR = 0.72;
const SMOOTHING = 0.7;
const LEFT_EYE = [33,160,158,133,153,144];
const RIGHT_EYE = [362,385,387,263,373,380];
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const $ = id => document.getElementById(id);
const video=$('video'), canvas=$('canvas'), ctx=canvas.getContext('2d');
const start=$('start'), stop=$('stop'), recalibrate=$('recalibrate');
const status=$('status'), message=$('message'), errorBox=$('error');

let landmarker=null, stream=null, running=false, raf=0;
let leftSamples=[], rightSamples=[], calibrated=false;
let leftBase=0,rightBase=0,leftThreshold=0,rightThreshold=0;
let smoothL=null,smoothR=null,closedSince=null,alerted=false,alerts=0;
let lastTimestamp=0,audio=null,alarmTimer=null;

function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function eyeEAR(p){
  const angle=Math.atan2(p[3].y-p[0].y,p[3].x-p[0].x), c=Math.cos(-angle), s=Math.sin(-angle);
  const q=p.map(x=>{const dx=x.x-p[0].x,dy=x.y-p[0].y;return {x:dx*c-dy*s,y:dx*s+dy*c}});
  const h=dist(q[0],q[3]); if(!h)return 0;
  return (dist(q[1],q[5])+dist(q[2],q[4]))/(2*h);
}
function smooth(old,v){return old===null?v:SMOOTHING*old+(1-SMOOTHING)*v}
function trimAverage(a){
  const s=[...a].sort((x,y)=>x-y), n=Math.floor(s.length*.1);
  const x=s.slice(n,s.length-n); return x.reduce((p,v)=>p+v,0)/x.length;
}
function setEyes(text,color=''){$('eyes').textContent=text;$('eyes').style.color=color}
function resetDetection(){
  leftSamples=[];rightSamples=[];calibrated=false;leftBase=rightBase=leftThreshold=rightThreshold=0;
  stopAlarm();smoothL=smoothR=null;closedSince=null;alerted=false;alerts=0;
  $('leftEar').textContent=$('rightEar').textContent='--';$('threshold').textContent='--';$('closed').textContent='0.00 s';$('alerts').textContent='0';
}
function resetView(){stopAlarm();ctx.clearRect(0,0,canvas.width,canvas.height);$('face').textContent='NO FACE';$('face').style.color='#9da5a0';setEyes('NO FACE','#9da5a0');$('leftEar').textContent=$('rightEar').textContent='--';$('closed').textContent='0.00 s';closedSince=null;alerted=false}
function draw(landmarks){
  ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#3cc850';ctx.lineWidth=3;
  let minX=1,minY=1,maxX=0,maxY=0;for(const p of landmarks){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)}
  ctx.strokeRect((1-maxX)*canvas.width,minY*canvas.height,(maxX-minX)*canvas.width,(maxY-minY)*canvas.height);
  for(const i of [...LEFT_EYE,...RIGHT_EYE]){const p=landmarks[i];ctx.fillStyle='#3cc850';ctx.beginPath();ctx.arc((1-p.x)*canvas.width,p.y*canvas.height,4,0,Math.PI*2);ctx.fill()}
}
function beep(){
  try{
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    audio.resume();
    const o=audio.createOscillator(),g=audio.createGain();
    o.type='square';o.frequency.value=1000;g.gain.value=.16;
    o.connect(g);g.connect(audio.destination);o.start();
    o.stop(audio.currentTime+.45);
  }catch(e){}
}
function startAlarm(){
  if(alarmTimer!==null)return;
  beep();
  alarmTimer=setInterval(beep,600);
}
function stopAlarm(){
  if(alarmTimer!==null){clearInterval(alarmTimer);alarmTimer=null;}
}
async function loadModel(){
  status.textContent='LOADING AI...';
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
  try{
    landmarker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL_URL,delegate:'GPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5});
  }catch(e){
    landmarker=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:MODEL_URL,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5});
  }
}
function finishCalibration(){
  leftBase=trimAverage(leftSamples);rightBase=trimAverage(rightSamples);leftThreshold=leftBase*THRESHOLD_FACTOR;rightThreshold=rightBase*THRESHOLD_FACTOR;calibrated=true;$('threshold').textContent=`${leftThreshold.toFixed(3)} / ${rightThreshold.toFixed(3)}`;status.textContent='RUNNING';
}
function process(landmarks,now){
  draw(landmarks);$('face').textContent='DETECTED';$('face').style.color='#3cc850';
  const l=eyeEAR(LEFT_EYE.map(i=>landmarks[i])),r=eyeEAR(RIGHT_EYE.map(i=>landmarks[i]));
  smoothL=smooth(smoothL,l);smoothR=smooth(smoothR,r);$('leftEar').textContent=smoothL.toFixed(3);$('rightEar').textContent=smoothR.toFixed(3);
  if(!calibrated){leftSamples.push(smoothL);rightSamples.push(smoothR);setEyes(`CALIBRATING ${leftSamples.length}/${CALIBRATION_SAMPLES}`,'#ffd21a');status.textContent='CALIBRATING...';if(leftSamples.length>=CALIBRATION_SAMPLES)finishCalibration();return}
  const lc=smoothL<leftThreshold,rc=smoothR<rightThreshold;
  if(!lc&&!rc){stopAlarm();setEyes('BOTH EYES OPEN','#3cc850');closedSince=null;alerted=false;$('closed').textContent='0.00 s'}
  else if(lc!==rc){stopAlarm();setEyes('ONE EYE CLOSED','#ffd21a');closedSince=null;alerted=false;$('closed').textContent='0.00 s'}
  else{
    if(closedSince===null)closedSince=now;const seconds=(now-closedSince)/1000;$('closed').textContent=seconds.toFixed(2)+' s';
    if(seconds>=DROWSINESS_SECONDS){setEyes('DROWSINESS ALERT!','#ff3d45');if(!alerted){alerts++;$('alerts').textContent=alerts;alerted=true}startAlarm()}else{stopAlarm();setEyes('BOTH EYES CLOSED','#ff8c24');}
  }
}
function frame(t){
  if(!running)return;
  if(video.readyState>=2 && video.currentTime!==lastTimestamp){
    try{const result=landmarker.detectForVideo(video,Math.max(1,Math.round(t)));lastTimestamp=video.currentTime;if(result.faceLandmarks?.length)process(result.faceLandmarks[0],performance.now());else resetView()}catch(e){errorBox.textContent='Detection error: '+e.message;console.error(e)}
  }
  raf=requestAnimationFrame(frame);
}
async function startCamera(){
  errorBox.textContent='';
  try{
    if(location.protocol==='file:')throw new Error('Do not open index.html directly. Double-click RUN.bat instead.');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera is not available. Use Chrome/Edge over localhost or HTTPS.');
    if(!landmarker)await loadModel();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:540}},audio:false});
    video.srcObject=stream;await video.play();canvas.width=video.videoWidth;canvas.height=video.videoHeight;resetDetection();running=true;start.disabled=true;stop.disabled=false;recalibrate.disabled=false;message.style.display='none';status.textContent='CALIBRATING...';raf=requestAnimationFrame(frame);
    try{audio=new (window.AudioContext||window.webkitAudioContext)();await audio.resume()}catch(e){}
  }catch(e){status.textContent='ERROR';errorBox.textContent=e.message;console.error(e)}
}
function stopCamera(){running=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;start.disabled=false;stop.disabled=true;recalibrate.disabled=true;message.style.display='block';status.textContent='STOPPED';resetView();resetDetection()}
start.onclick=startCamera;stop.onclick=stopCamera;window.addEventListener('beforeunload',stopAlarm);recalibrate.onclick=()=>{resetDetection();status.textContent='CALIBRATING...'};
window.addEventListener('resize',()=>{if(video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight}});
