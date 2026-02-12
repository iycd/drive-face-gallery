import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  X,
  Loader2,
  Camera,
  Upload,
  RefreshCw,
  Play,
  Pause,
  CheckCircle2,
  Square,
  CheckSquare,
  ChevronLeft,
  Folder,
  Terminal,
  User,
} from "lucide-react";

/* ================================
   FACE API LOADER
================================ */

const loadFaceApiScript = () =>
  new Promise(resolve => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.onload = resolve;
    document.head.appendChild(s);
  });

let modelsLoaded = false;

async function loadModelsOnce() {
  if (modelsLoaded) return;

  await loadFaceApiScript();

  const MODEL_URL =
    "https://justadudewhohacks.github.io/face-api.js/models";

  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);

  modelsLoaded = true;
}

/* ================================
   DRIVE IMAGE HELPER
================================ */

function getDriveImageUrl(file) {
  if (file.full && file.full.startsWith("http")) return file.full;
  return `https://drive.google.com/uc?id=${file.id}`;
}

/* ================================
   MAIN APP
================================ */

export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [history, setHistory] = useState([{ id: "root", name: "Home" }]);
  const [loading, setLoading] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState([]);

  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanCount, setScanCount] = useState(0);

  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const stopRef = useRef(false);
  const fileInputRef = useRef(null);

  const currentFolder = history[history.length - 1];

  /* ================================
     LOG HELPER
  ================================ */

  const log = msg =>
    setLogs(l => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...l].slice(0, 150));

  /* ================================
     FETCH DRIVE DATA
  ================================ */

  const fetchData = useCallback(async id => {
    setLoading(true);
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("folderId", id);
      const r = await fetch(u.toString());
      const d = await r.json();
      setFiles(d.files || []);
      setFolders(d.folders || []);
      log(`Loaded ${d.files?.length || 0} files`);
    } catch {
      log("Fetch error");
    }
    setLoading(false);
  }, [gasUrl]);

  useEffect(() => {
    fetchData(currentFolder.id);
    setSelectionMode(false);
    setSelected([]);
  }, [currentFolder, fetchData]);

  /* ================================
     FACE SCANNING ENGINE
  ================================ */

  const startScanning = async () => {
    if (!faceDescriptor || files.length === 0) return;

    await loadModelsOnce();

    setScanning(true);
    stopRef.current = false;
    setMatches([]);
    setProgress(0);
    setScanCount(0);
    setLogs([]);

    log("AI scanning started");

    const matcher = new window.faceapi.FaceMatcher(faceDescriptor, 0.6);
    const BATCH = 5;
    let done = 0;

    for (let i = 0; i < files.length; i += BATCH) {
      if (stopRef.current) break;

      const batch = files.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async f => {
          try {
            const img = await window.faceapi.fetchImage(getDriveImageUrl(f));

            const det = await window.faceapi
              .detectAllFaces(
                img,
                new window.faceapi.TinyFaceDetectorOptions({
                  inputSize: 416,
                  scoreThreshold: 0.4,
                })
              )
              .withFaceLandmarks()
              .withFaceDescriptor();

            log(`${f.name}: ${det.length} face`);

            for (const d of det) {
              if (matcher.findBestMatch(d.descriptor).label !== "unknown") {
                setMatches(m => [...m, f.id]);
                log(`MATCH → ${f.name}`);
                break;
              }
            }
          } catch {
            log(`Error ${f.name}`);
          }
        })
      );

      done += batch.length;
      setScanCount(done);
      setProgress(Math.round((done / files.length) * 100));

      await new Promise(r => setTimeout(r, 80));
    }

    setScanning(false);
    log("Scan finished");
  };

  /* ================================
     UPLOAD REFERENCE PHOTO
  ================================ */

  const handleUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;

    await loadModelsOnce();

    const img = await window.faceapi.bufferToImage(file);
    const det = await window.faceapi
      .detectSingleFace(
        img,
        new window.faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.4,
        })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!det) {
      alert("No face detected");
      return;
    }

    setFaceDescriptor(det.descriptor);
    startScanning();
  };

  /* ================================
     UI HELPERS
  ================================ */

  const toggleSelect = id =>
    setSelected(s =>
      s.includes(id) ? s.filter(x => x !== id) : [...s, id]
    );

  const navigate = (id, name) =>
    setHistory(h => [...h, { id, name }]);

  const back = () =>
    history.length > 1 && setHistory(h => h.slice(0, -1));

  const displayed = faceDescriptor
    ? files.filter(f => matches.includes(f.id))
    : files;

  /* ================================
     BOOTSTRAP GAS URL
  ================================ */

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let u = p.get("api");
    if (u && !u.startsWith("http")) {
      try {
        u = atob(u);
      } catch {}
    }
    const saved = localStorage.getItem("gas_app_url");
    if (u || saved) setGasUrl(u || saved);
  }, []);

  if (!gasUrl)
    return <div className="p-10 text-center">Gunakan Generator Link</div>;

  /* ================================
     RENDER
  ================================ */

  return (
    <div className="min-h-screen bg-gray-50 pb-40">

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      {/* HEADER */}
      <div className="sticky top-0 bg-white shadow-sm z-40 p-3 flex justify-between">
        <div className="flex items-center gap-2">
          {history.length > 1 && (
            <button onClick={back}>
              <ChevronLeft />
            </button>
          )}
          <b>{currentFolder.name}</b>
        </div>

        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current.click()}>
            <Upload />
          </button>
          <button onClick={() => setSelectionMode(s => !s)}>
            {selectionMode ? <CheckSquare /> : <Square />}
          </button>
          <button onClick={() => fetchData(currentFolder.id)}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* SUBFOLDERS */}
      <div className="flex gap-2 p-2 overflow-x-auto">
        {folders.map(f => (
          <button
            key={f.id}
            onClick={() => navigate(f.id, f.name)}
            className="bg-white border px-3 py-1 rounded-full flex gap-1"
          >
            <Folder size={14} /> {f.name}
          </button>
        ))}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 p-2">
        {displayed.map(f => (
          <div
            key={f.id}
            onClick={() =>
              selectionMode
                ? toggleSelect(f.id)
                : window.open(f.full, "_blank")
            }
            className={`aspect-square rounded overflow-hidden relative ${
              selected.includes(f.id) ? "ring-2 ring-blue-500" : ""
            } ${matches.includes(f.id) ? "ring-4 ring-green-500" : ""}`}
          >
            <img
              src={f.thumbnail}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {matches.includes(f.id) && (
              <div className="absolute bottom-0 w-full bg-green-500 text-white text-xs text-center">
                MATCH
              </div>
            )}
          </div>
        ))}
      </div>

      {displayed.length === 0 && (
        <div className="py-20 text-center text-gray-400">
          <User size={40} className="mx-auto mb-2" />
          No results
        </div>
      )}

      {/* PROGRESS */}
      {faceDescriptor && (
        <div className="fixed bottom-0 left-0 right-0 bg-white p-3 shadow">
          <div className="flex justify-between text-xs mb-1">
            <span>{scanning ? "Scanning..." : "Done"}</span>
            <span>
              {scanCount}/{files.length}
            </span>
          </div>
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <div
              className={`h-full ${
                scanning ? "bg-blue-600" : "bg-green-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-2 mt-2">
            {scanning ? (
              <button onClick={() => (stopRef.current = true)}>
                <Pause />
              </button>
            ) : (
              <button onClick={startScanning}>
                <Play />
              </button>
            )}
            <button
              onClick={() => {
                setFaceDescriptor(null);
                setMatches([]);
              }}
            >
              <X />
            </button>
          </div>
        </div>
      )}

      {/* LOG PANEL */}
      {showLogs && logs.length > 0 && (
        <div className="fixed bottom-32 left-0 right-0 bg-black text-green-400 text-xs p-3 h-40 overflow-y-auto font-mono">
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}

      <button
        className="fixed bottom-6 right-6 bg-gray-800 text-white w-12 h-12 rounded-full flex items-center justify-center"
        onClick={() => setShowLogs(s => !s)}
      >
        <Terminal size={18} />
      </button>
    </div>
  );
}
