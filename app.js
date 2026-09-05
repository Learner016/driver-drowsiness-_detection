import { FilesetResolver, FaceLandmarker } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";

const DROWSINESS_SECONDS = 1.5;
const CALIBRATION_SAMPLES = 60;
const THRESHOLD_FACTOR = 0.72;
const SMOOTHING = 0.7;

const LEFT_EYE = [33, 160, 158, 133, 153, 144];
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const $ = id => document.getElementById(id);

const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

const start = $("start");
const stop = $("stop");
const recalibrate = $("recalibrate");

const status = $("status");
const message = $("message");
const errorBox = $("error");

let landmarker = null;
let stream = null;
let running = false;
let raf = 0;

let leftSamples = [];
let rightSamples = [];
let calibrated = false;

let leftBase = 0;
let rightBase = 0;
let leftThreshold = 0;
let rightThreshold = 0;

let smoothL = null;
let smoothR = null;

let closedSince = null;
let alerted = false;
let alerts = 0;

let lastTimestamp = 0;

let audio = null;
let alarmTimer = null;


/* =========================
   BASIC FUNCTIONS
========================= */

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}


/* =========================
   EYE EAR
========================= */

function eyeEAR(p) {

  const angle = Math.atan2(
    p[3].y - p[0].y,
    p[3].x - p[0].x
  );

  const c = Math.cos(-angle);
  const s = Math.sin(-angle);

  const q = p.map(x => {

    const dx = x.x - p[0].x;
    const dy = x.y - p[0].y;

    return {
      x: dx * c - dy * s,
      y: dx * s + dy * c
    };

  });

  const h = dist(q[0], q[3]);

  if (!h) return 0;

  return (
    dist(q[1], q[5]) +
    dist(q[2], q[4])
  ) / (2 * h);
}


/* =========================
   SMOOTHING
========================= */

function smooth(old, value) {

  if (old === null) {
    return value;
  }

  return SMOOTHING * old + (1 - SMOOTHING) * value;
}


/* =========================
   CALIBRATION
========================= */

function trimAverage(values) {

  const sorted = [...values].sort((a, b) => a - b);

  const n = Math.floor(sorted.length * 0.1);

  const trimmed = sorted.slice(
    n,
    sorted.length - n
  );

  return trimmed.reduce(
    (sum, value) => sum + value,
    0
  ) / trimmed.length;
}


/* =========================
   EYE STATUS
========================= */

function setEyes(text, color = "") {

  $("eyes").textContent = text;
  $("eyes").style.color = color;
}


/* =========================
   RESET DETECTION
========================= */

function resetDetection() {

  leftSamples = [];
  rightSamples = [];

  calibrated = false;

  leftBase = 0;
  rightBase = 0;

  leftThreshold = 0;
  rightThreshold = 0;

  stopAlarm();

  smoothL = null;
  smoothR = null;

  closedSince = null;
  alerted = false;

  alerts = 0;

  /*
     IMPORTANT:
     MediaPipe VIDEO mode requires timestamps
     to continuously increase.
  */
  lastTimestamp = 0;

  $("leftEar").textContent = "--";
  $("rightEar").textContent = "--";

  $("threshold").textContent = "--";

  $("closed").textContent = "0.00 s";

  $("alerts").textContent = "0";
}


/* =========================
   RESET VIEW
========================= */

function resetView() {

  stopAlarm();

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  $("face").textContent = "NO FACE";
  $("face").style.color = "#9da5a0";

  setEyes(
    "NO FACE",
    "#9da5a0"
  );

  $("leftEar").textContent = "--";
  $("rightEar").textContent = "--";

  $("closed").textContent = "0.00 s";

  closedSince = null;
  alerted = false;
}


/* =========================
   DRAW FACE
========================= */

function draw(landmarks) {

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.strokeStyle = "#3cc850";
  ctx.lineWidth = 3;

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const p of landmarks) {

    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);

    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  ctx.strokeRect(
    (1 - maxX) * canvas.width,
    minY * canvas.height,
    (maxX - minX) * canvas.width,
    (maxY - minY) * canvas.height
  );


  for (const i of [
    ...LEFT_EYE,
    ...RIGHT_EYE
  ]) {

    const p = landmarks[i];

    ctx.fillStyle = "#3cc850";

    ctx.beginPath();

    ctx.arc(
      (1 - p.x) * canvas.width,
      p.y * canvas.height,
      4,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }
}


/* =========================
   BEEP
========================= */

function beep() {

  try {

    if (!audio) {

      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContext) {
        return;
      }

      audio = new AudioContext();
    }

    audio.resume();

    const oscillator =
      audio.createOscillator();

    const gain =
      audio.createGain();

    oscillator.type = "square";

    oscillator.frequency.value = 1000;

    gain.gain.value = 0.16;

    oscillator.connect(gain);

    gain.connect(audio.destination);

    oscillator.start();

    oscillator.stop(
      audio.currentTime + 0.45
    );

  } catch (e) {

    console.error(
      "Audio error:",
      e
    );
  }
}


/* =========================
   START ALARM
========================= */

function startAlarm() {

  if (alarmTimer !== null) {
    return;
  }

  beep();

  alarmTimer = setInterval(
    beep,
    600
  );
}


/* =========================
   STOP ALARM
========================= */

function stopAlarm() {

  if (alarmTimer !== null) {

    clearInterval(alarmTimer);

    alarmTimer = null;
  }
}


/* =========================
   LOAD AI MODEL
========================= */

async function loadModel() {

  status.textContent = "LOADING AI...";

  const vision =
    await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm"
    );


  try {

    landmarker =
      await FaceLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU"
          },

          runningMode: "VIDEO",

          numFaces: 1,

          minFaceDetectionConfidence: 0.5,

          minFacePresenceConfidence: 0.5,

          minTrackingConfidence: 0.5
        }
      );

  } catch (gpuError) {

    console.warn(
      "GPU failed. Using CPU instead.",
      gpuError
    );

    landmarker =
      await FaceLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU"
          },

          runningMode: "VIDEO",

          numFaces: 1,

          minFaceDetectionConfidence: 0.5,

          minFacePresenceConfidence: 0.5,

          minTrackingConfidence: 0.5
        }
      );
  }
}


/* =========================
   FINISH CALIBRATION
========================= */

function finishCalibration() {

  leftBase =
    trimAverage(leftSamples);

  rightBase =
    trimAverage(rightSamples);


  leftThreshold =
    leftBase * THRESHOLD_FACTOR;

  rightThreshold =
    rightBase * THRESHOLD_FACTOR;


  calibrated = true;


  $("threshold").textContent =
    `${leftThreshold.toFixed(3)} / ${rightThreshold.toFixed(3)}`;


  status.textContent = "RUNNING";
}


/* =========================
   PROCESS FACE
========================= */

function process(landmarks, now) {

  draw(landmarks);

  $("face").textContent = "DETECTED";

  $("face").style.color = "#3cc850";


  const leftPoints =
    LEFT_EYE.map(
      i => landmarks[i]
    );

  const rightPoints =
    RIGHT_EYE.map(
      i => landmarks[i]
    );


  const l =
    eyeEAR(leftPoints);

  const r =
    eyeEAR(rightPoints);


  smoothL =
    smooth(smoothL, l);

  smoothR =
    smooth(smoothR, r);


  $("leftEar").textContent =
    smoothL.toFixed(3);

  $("rightEar").textContent =
    smoothR.toFixed(3);


  /* =====================
     CALIBRATION
  ===================== */

  if (!calibrated) {

    leftSamples.push(smoothL);

    rightSamples.push(smoothR);


    setEyes(
      `CALIBRATING ${leftSamples.length}/${CALIBRATION_SAMPLES}`,
      "#ffd21a"
    );


    status.textContent =
      "CALIBRATING...";


    if (
      leftSamples.length >=
      CALIBRATION_SAMPLES
    ) {

      finishCalibration();
    }

    return;
  }


  /* =====================
     EYE STATE
  ===================== */

  const leftClosed =
    smoothL < leftThreshold;

  const rightClosed =
    smoothR < rightThreshold;


  /* BOTH OPEN */

  if (!leftClosed && !rightClosed) {

    stopAlarm();

    setEyes(
      "BOTH EYES OPEN",
      "#3cc850"
    );

    closedSince = null;

    alerted = false;

    $("closed").textContent =
      "0.00 s";

    return;
  }


  /* ONE EYE CLOSED */

  if (leftClosed !== rightClosed) {

    stopAlarm();

    setEyes(
      "ONE EYE CLOSED",
      "#ffd21a"
    );

    closedSince = null;

    alerted = false;

    $("closed").textContent =
      "0.00 s";

    return;
  }


  /* BOTH EYES CLOSED */

  if (closedSince === null) {

    closedSince = now;
  }


  const seconds =
    (now - closedSince) / 1000;


  $("closed").textContent =
    seconds.toFixed(2) + " s";


  /* DROWSINESS ALERT */

  if (
    seconds >=
    DROWSINESS_SECONDS
  ) {

    setEyes(
      "DROWSINESS ALERT!",
      "#ff3d45"
    );


    /*
       Count only once for the
       current eye-closure event.
    */

    if (!alerted) {

      alerts++;

      $("alerts").textContent =
        alerts;

      alerted = true;
    }


    /*
       Continuous alarm while
       both eyes remain closed.
    */

    startAlarm();

  } else {

    stopAlarm();

    setEyes(
      "BOTH EYES CLOSED",
      "#ff8c24"
    );
  }
}


/* =========================
   VIDEO FRAME LOOP
========================= */

function frame(t) {

  if (!running) {
    return;
  }


  if (video.readyState >= 2) {

    try {

      /*
         IMPORTANT ANDROID FIX

         MediaPipe VIDEO mode requires
         strictly increasing timestamps.

         Some browsers can produce the
         same rounded timestamp twice.

         Therefore force every timestamp
         to be at least 1ms newer.
      */

      const timestamp =
        Math.max(
          lastTimestamp + 1,
          Math.floor(t)
        );


      lastTimestamp =
        timestamp;


      const result =
        landmarker.detectForVideo(
          video,
          timestamp
        );


      if (
        result.faceLandmarks?.length
      ) {

        process(
          result.faceLandmarks[0],
          performance.now()
        );

      } else {

        resetView();
      }

    } catch (e) {

      errorBox.textContent =
        "Detection error: " +
        e.message;

      console.error(e);
    }
  }


  raf =
    requestAnimationFrame(frame);
}


/* =========================
   CAMERA FUNCTION
========================= */

async function getCameraStream() {

  /*
     First try the normal laptop/mobile
     camera configuration.
  */

  try {

    return await navigator.mediaDevices.getUserMedia({

      video: {
        width: {
          ideal: 1280
        },

        height: {
          ideal: 720
        },

        facingMode: "user"
      },

      audio: false
    });

  } catch (e) {

    /*
       Some laptops do not like the
       requested camera constraints.

       Try a completely basic camera
       request as fallback.
    */

    if (
      e.name === "OverconstrainedError" ||
      e.name === "ConstraintNotSatisfiedError"
    ) {

      return await navigator.mediaDevices.getUserMedia({

        video: true,

        audio: false
      });
    }

    throw e;
  }
}


/* =========================
   START CAMERA
========================= */

async function startCamera() {

  errorBox.textContent = "";

  start.disabled = true;


  try {

    /* =====================
       SECURITY CHECK
    ===================== */

    if (location.protocol === "file:") {

      throw new Error(
        "Please open the GitHub Pages HTTPS link. Do not open index.html directly."
      );
    }


    if (!window.isSecureContext) {

      throw new Error(
        "Camera requires HTTPS. Please open the GitHub Pages link using https://"
      );
    }


    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      throw new Error(
        "Your browser does not provide camera access. Please use the latest Chrome or Microsoft Edge."
      );
    }


    /* =====================
       REQUEST CAMERA FIRST
    ===================== */

    status.textContent =
      "REQUESTING CAMERA...";


    message.style.display =
      "none";


    /*
       IMPORTANT:

       Camera permission is requested BEFORE
       loading MediaPipe.

       This fixes the problem where the AI
       model could prevent the permission
       request from appearing.
    */

    stream =
      await getCameraStream();


    /* =====================
       CAMERA STARTED
    ===================== */

    video.srcObject =
      stream;


    /*
       Helps mobile browsers handle
       camera video correctly.
    */

    video.setAttribute(
      "playsinline",
      ""
    );

    video.setAttribute(
      "autoplay",
      ""
    );


    await video.play();


    /*
       Wait until video dimensions
       are available.
    */

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {

      await new Promise(resolve => {

        video.addEventListener(
          "loadedmetadata",
          resolve,
          { once: true }
        );

      });
    }


    canvas.width =
      video.videoWidth;

    canvas.height =
      video.videoHeight;


    /* =====================
       RESET DETECTION
    ===================== */

    resetDetection();


    running = true;


    stop.disabled = false;

    recalibrate.disabled = false;

    status.textContent =
      "LOADING AI...";


    /* =====================
       LOAD MODEL
    ===================== */

    if (!landmarker) {

      await loadModel();
    }


    /* =====================
       READY
    ===================== */

    status.textContent =
      "CALIBRATING...";


    /*
       Start audio while the Start button
       interaction is still fresh.
    */

    try {

      const AudioContext =
        window.AudioContext ||
        window.webkitAudioContext;

      if (AudioContext) {

        audio =
          new AudioContext();

        await audio.resume();
      }

    } catch (audioError) {

      console.warn(
        "Audio could not start:",
        audioError
      );
    }


    raf =
      requestAnimationFrame(frame);


  } catch (e) {

    console.error(
      "Camera start error:",
      e
    );


    running = false;


    if (stream) {

      stream
        .getTracks()
        .forEach(track => track.stop());

      stream = null;
    }


    video.srcObject = null;


    start.disabled = false;

    stop.disabled = true;

    recalibrate.disabled = true;


    status.textContent =
      "ERROR";


    /*
       Give useful messages for
       common Windows browser errors.
    */

    if (
      e.name === "NotAllowedError" ||
      e.name === "PermissionDeniedError"
    ) {

      errorBox.textContent =
        "Camera permission was denied. Click the camera icon 🔒 in the browser address bar and allow camera access, then reload the page.";

    } else if (
      e.name === "NotFoundError"
    ) {

      errorBox.textContent =
        "No camera was found on this laptop. Connect or enable a webcam and try again.";

    } else if (
      e.name === "NotReadableError"
    ) {

      errorBox.textContent =
        "The camera is already being used by another application. Close Zoom, Teams, Discord, Camera, or another browser using the webcam, then try again.";

    } else if (
      e.name === "SecurityError"
    ) {

      errorBox.textContent =
        "The browser blocked camera access. Make sure you are using the HTTPS GitHub Pages link.";

    } else {

      errorBox.textContent =
        e.message ||
        "Unable to start the camera.";
    }
  }
}


/* =========================
   STOP CAMERA
========================= */

function stopCamera() {

  running = false;


  cancelAnimationFrame(
    raf
  );


  if (stream) {

    stream
      .getTracks()
      .forEach(track => track.stop());
  }


  stream = null;


  video.srcObject = null;


  start.disabled = false;

  stop.disabled = true;

  recalibrate.disabled = true;


  message.style.display =
    "block";


  status.textContent =
    "STOPPED";


  resetView();

  resetDetection();
}


/* =========================
   BUTTONS
========================= */

start.onclick =
  startCamera;


stop.onclick =
  stopCamera;


recalibrate.onclick = () => {

  resetDetection();

  status.textContent =
    "CALIBRATING...";
};


/* =========================
   PAGE CLOSE
========================= */

window.addEventListener(
  "beforeunload",
  stopAlarm
);


/* =========================
   WINDOW RESIZE
========================= */

window.addEventListener(
  "resize",
  () => {

    if (video.videoWidth) {

      canvas.width =
        video.videoWidth;

      canvas.height =
        video.videoHeight;
    }
  }
);
