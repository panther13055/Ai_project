# OrbitFind AI — AI Lost & Found Prototype

Premium dark UI + browser-based computer vision prototype for an AI Lost & Found college project.

## Features
- Register a lost item (category, color, details, location)
- Live phone/laptop camera scanning
- Image upload scanning
- TensorFlow.js + COCO-SSD object detection
- Lightweight dominant-color matching
- Match confidence UI
- Local case history via `localStorage`
- Demo mode for presentations when camera/model access is unavailable
- Fully static and Vercel-ready

## Run locally
Use any static server, for example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy on Vercel
1. Upload this folder to a GitHub repository.
2. Import the repo in Vercel.
3. Framework preset: **Other**.
4. Build command: leave empty.
5. Output directory: leave empty / root.
6. Deploy.

## Phone demo
Open the deployed Vercel URL on the phone itself and tap **Start phone camera**. The browser will request camera permission and prefer the rear camera.

## AI model note
The model loads in the browser from TensorFlow.js/CDN on first use, so an internet connection is required for live AI detection. Demo mode works without the model.
