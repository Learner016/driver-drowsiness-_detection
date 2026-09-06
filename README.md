# Driver Drowsiness Detection System

A browser-based Computer Vision project that detects eye closure in real time using **MediaPipe Face Landmarker** and **Eye Aspect Ratio (EAR)**.

The system is designed as a simple web application that can run on a laptop or Android phone through a modern browser. No Python installation is required when using the deployed GitHub Pages version.

## Live Demo

**GitHub Pages:**  
https://learner016.github.io/driver-drowsiness-_detection/

Open the link using **HTTPS**, allow camera permission, and press **START CAMERA**.

---

## Features

- Real-time face landmark detection using MediaPipe Face Landmarker
- Detection of one face at a time
- Six eye landmarks for each eye
- Roll-normalized Eye Aspect Ratio (EAR)
- Automatic eye calibration
- Personalized eye-closure thresholds
- EAR smoothing for more stable detection
- Detection of:
  - **BOTH EYES OPEN**
  - **ONE EYE CLOSED**
  - **BOTH EYES CLOSED**
  - **DROWSINESS ALERT!**
  - **NO FACE**
- Drowsiness alert after both eyes remain closed continuously for **1.5 seconds**
- Continuous browser alarm while drowsiness continues
- Alert counter that counts each continuous eye-closure event once
- Recalibration option
- Start/Stop camera controls
- GPU acceleration with automatic CPU fallback
- Camera-permission-first startup
- Camera constraint fallback for different laptops and phones
- Android-safe MediaPipe video timestamps
- Runs directly from GitHub Pages over HTTPS
- Camera processing is performed in the browser

---

## How It Works

The detection process follows this pipeline:

**Camera → Face Landmarks → Eye Landmarks → EAR Calculation → Calibration → Eye State → Drowsiness Timer → Alarm**

### 1. Camera Input

The browser requests access to the device camera using the Web Camera API (`getUserMedia`).

### 2. Face Landmark Detection

MediaPipe Face Landmarker detects facial landmarks from the camera frames.

The application uses one detected face at a time.

### 3. Eye Landmark Extraction

Six landmarks are selected for each eye:

- Left eye: `33, 160, 158, 133, 153, 144`
- Right eye: `362, 385, 387, 263, 373, 380`

### 4. Eye Aspect Ratio (EAR)

EAR is calculated from the selected eye landmarks.

The basic formula used is:

```text
EAR = (vertical_distance_1 + vertical_distance_2)
      / (2 × horizontal_distance)
```

The eye points are first rotation-normalized so that the calculation is more stable when the user's head is rotated sideways.

### 5. Automatic Calibration

When the camera starts, the application automatically collects **60 samples** while the user keeps both eyes open.

The samples are used to calculate a personalized baseline for each eye.

The highest and lowest 10% of samples are trimmed before calculating the average. This reduces the effect of unusual frames during calibration.

### 6. Personalized Threshold

The eye-closure threshold is calculated separately for each eye:

```text
Eye Threshold = Calibrated EAR × 0.72
```

This allows the system to adapt to different users instead of relying on one fixed EAR value.

### 7. EAR Smoothing

The EAR values are smoothed using an exponential smoothing factor of:

```text
0.7
```

This helps reduce sudden frame-to-frame fluctuations.

### 8. Eye-State Detection

After calibration:

| Condition | Detected State |
|---|---|
| Both eyes above threshold | BOTH EYES OPEN |
| One eye below threshold | ONE EYE CLOSED |
| Both eyes below threshold for less than 1.5 s | BOTH EYES CLOSED |
| Both eyes below threshold for 1.5 s or more | DROWSINESS ALERT! |
| No face detected | NO FACE |

### 9. Drowsiness Alert

If both eyes remain closed continuously for **1.5 seconds**, the application enters **DROWSINESS ALERT!** mode.

The alarm repeatedly beeps approximately every **0.6 seconds** while both eyes remain closed.

The alarm stops when:

- Both eyes open
- One eye becomes open
- The face is no longer detected
- The camera is stopped

One continuous eye-closure event is counted as **one alert**.

---

## Project Structure

```text
driver-drowsiness-_detection/
│
├── index.html      # Main web page and user interface
├── style.css       # Application styling
├── app.js          # Face detection, EAR calculation and drowsiness logic
├── RUN.bat         # Optional local Windows launcher
└── README.md       # Project documentation
```

---

## Technologies Used

| Technology | Purpose |
|---|---|
| HTML5 | Web page structure |
| CSS3 | User interface styling |
| JavaScript ES Modules | Application logic |
| MediaPipe Tasks Vision 1.0.1 | Face landmark detection |
| MediaPipe Face Landmarker | Facial landmark tracking |
| Eye Aspect Ratio (EAR) | Eye-state measurement |
| Web Camera API (`getUserMedia`) | Camera access |
| Web Audio API | Drowsiness alarm |
| HTML Canvas | Face/eye landmark visualization |

---

## Dependencies

The project does not require an npm installation.

The browser loads the MediaPipe library from jsDelivr:

```text
@mediapipe/tasks-vision@1.0.1
```

The Face Landmarker model is loaded from Google's MediaPipe model storage.

A modern browser with JavaScript, camera access, and HTTPS support is required for the deployed version.

---

# Running the Project

## Option 1 — GitHub Pages

This is the recommended method for normal users and Android devices.

### Step 1: Open the project

Open:

https://learner016.github.io/driver-drowsiness-_detection/

### Step 2: Allow camera access

Press:

**START CAMERA**

When the browser asks for permission, select:

**Allow**

### Step 3: Calibration

Keep your face visible and keep **both eyes open**.

The application automatically performs calibration for the first 60 detected samples.

### Step 4: Detection

After calibration, the system starts monitoring your eye state.

No Python, OpenCV, Pydroid, or Android application installation is required for the GitHub Pages version.

---

## Option 2 — Windows Local Version

The repository contains `RUN.bat` for convenient local testing.

### Requirements

- Windows
- Python 3 installed
- A working webcam
- Modern web browser

### Steps

1. Download or clone this repository.
2. Open the project folder.
3. Double-click `RUN.bat`.
4. The local server starts at:

```text
http://localhost:8000/index.html
```

5. Allow camera permission.
6. Keep both eyes open during calibration.

### Important

Do **not** open `index.html` directly using a `file://` URL.

Camera access requires a secure browser context. Use:

- GitHub Pages HTTPS, or
- the local HTTP server started by `RUN.bat`.

---

# Android Support

The web application can run on Android using a modern browser such as Chrome.

The recommended method is GitHub Pages:

```text
https://learner016.github.io/driver-drowsiness-_detection/
```

### Android steps

1. Open the GitHub Pages link.
2. Press **START CAMERA**.
3. Allow camera permission.
4. Keep both eyes open during calibration.
5. Use the application normally.

### Android does not require

- Python
- Pydroid
- OpenCV installation
- MediaPipe Android SDK
- A separate Android application

The project runs as a web application.

---

# Controls

| Button | Function |
|---|---|
| START CAMERA | Starts the camera and detection system |
| RECALIBRATE | Clears the current calibration and performs calibration again |
| STOP | Stops the camera, alarm and detection |

---

# Detection Parameters

The current implementation uses:

```text
Drowsiness duration: 1.5 seconds
Calibration samples: 60
Threshold factor: 0.72
EAR smoothing factor: 0.7
Faces processed: 1
```

These values are defined in `app.js`.

---

# Important Implementation Details

## Automatic Calibration

Different people naturally have different eye shapes and EAR values.

Instead of using one universal threshold, the application measures the user's normal open-eye EAR during startup.

This produces separate baselines for the left and right eyes.

## Per-Eye Threshold

The left and right eyes receive separate thresholds.

This is important because the measured EAR of the two eyes may not be exactly identical.

## Roll Normalization

Before calculating EAR, the eye coordinates are rotated so that the eye's horizontal reference is aligned.

This helps make the EAR calculation less sensitive to sideways head rotation.

## GPU and CPU Fallback

The application first attempts to initialize MediaPipe Face Landmarker using the GPU delegate.

If GPU initialization fails, it automatically tries the CPU delegate.

This improves compatibility across different computers and browsers.

## Camera Compatibility

The application first requests a normal front-facing camera configuration.

If the browser or device does not support those requested camera constraints, it falls back to a basic camera request.

## Android Timestamp Handling

MediaPipe VIDEO mode requires increasing timestamps.

Some browsers can produce timestamps that are equal after rounding. The application therefore forces every detection timestamp to be at least 1 millisecond newer than the previous timestamp.

This improves compatibility with Android browsers.

---

# Problems Faced and Solutions

During development, several practical issues were addressed.

### 1. Eye detection was not sufficient for drowsiness detection

Face detection alone cannot determine whether the driver's eyes are open or closed.

**Solution:** Eye landmarks were extracted and EAR was implemented to measure eye openness.

### 2. Head rotation affected eye measurements

Direct EAR calculation can become less stable when the head is rotated.

**Solution:** Eye coordinates are rotation-normalized before calculating EAR.

### 3. One fixed EAR threshold was not suitable for every user

Different users can have different normal EAR values.

**Solution:** The application performs automatic calibration and calculates personalized left/right thresholds.

### 4. Camera permission did not always appear correctly

Loading the AI model before requesting the camera could delay or interfere with the camera permission flow on some devices.

**Solution:** The application requests camera access first and loads the MediaPipe model afterward.

### 5. Some laptops rejected the requested camera constraints

Camera capabilities differ between devices.

**Solution:** A basic `getUserMedia({ video: true })` request is used as a fallback when the preferred camera constraints are rejected.

### 6. Browser popup appeared instead of the alarm

An earlier implementation used a browser `alert()` for the drowsiness warning.

**Solution:** The popup was removed and the project now uses the Web Audio API for a repeating alarm.

### 7. Alarm and detection state did not reset correctly

Stopping and restarting the camera could leave previous detection state active.

**Solution:** Camera stop/restart resets calibration, timer, alert count, thresholds and alarm state.

### 8. Android MediaPipe timestamp mismatch

Some Android browsers produced repeated/rounded timestamps that MediaPipe rejected in VIDEO mode.

**Solution:** Detection timestamps are forced to increase by at least 1 millisecond for every processed frame.

---

# Troubleshooting

## Camera permission is not appearing

Make sure you are using the GitHub Pages **HTTPS** link.

Also check the browser's camera permission settings.

Try:

1. Reload the page.
2. Press **START CAMERA** again.
3. Allow camera access.
4. Check the camera icon/permission settings in the browser address bar.

## "Camera permission was denied"

Allow camera permission for the website and reload the page.

## "No camera was found"

Make sure:

- The webcam is connected.
- The webcam is enabled.
- Another application is not disabling the camera.

## "The camera is already being used"

Close applications such as:

- Zoom
- Microsoft Teams
- Discord
- Windows Camera
- Another browser tab using the webcam

Then try again.

## Alarm is not audible

Make sure:

- Device volume is turned up.
- Browser audio is not muted.
- The browser allows audio playback.
- Both eyes remain closed continuously for at least 1.5 seconds.

The alarm is intentionally not triggered for normal blinking or short eye closures.

## Detection is slow

Performance depends on the device, browser, camera resolution and available GPU/CPU resources.

Closing unnecessary applications may improve performance.

---

# Privacy

Camera frames are processed by the web application in the browser for face landmark and eye-state detection.

The project does not contain code that uploads camera frames to a project server.

The application does download the MediaPipe JavaScript package and Face Landmarker model required for detection.

---

# Limitations

This project is intended for **academic and educational Computer Vision purposes**.

It is not a certified automotive safety system and should not be relied upon as the only protection against driver fatigue.

Detection can be affected by:

- Poor lighting
- Face partially outside the camera view
- Very large head rotations
- Camera quality
- Occlusion of the eyes
- Sunglasses or other objects covering the eyes
- Browser/device performance

---

# Future Scope

Possible future improvements include:

- Yawning detection
- Head-pose and head-nodding detection
- Longer-term driver fatigue analysis
- Mobile/PWA packaging
- Improved low-light performance
- More advanced alert sounds
- Additional face/eye tracking robustness
- Driver session statistics
- Optional local data storage
- Integration with vehicle safety systems in a properly validated environment

---

# GitHub Repository

**Repository:**  
https://github.com/Learner016/driver-drowsiness-_detection

**Live Project:**  
https://learner016.github.io/driver-drowsiness-_detection/

---

# References

- Google MediaPipe Face Landmarker documentation  
  https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js

- MediaPipe Tasks Vision package  
  https://www.npmjs.com/package/@mediapipe/tasks-vision

- MDN Web Docs — MediaDevices `getUserMedia()`  
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia

- MDN Web Docs — Web Audio API  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

- GitHub Pages documentation  
  https://docs.github.com/en/pages

---

## Disclaimer

This project is a student/academic Computer Vision project created for learning and demonstration purposes. It should not be considered a certified driver-safety or medical system.
