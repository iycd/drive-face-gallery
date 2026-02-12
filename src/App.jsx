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
  AlertCircle
} from "lucide-react";

/* ================================
   1. GLOBAL FACE API LOADER
================================ */

const loadFaceApiScript = () =>
  new Promise(resolve => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    s.onerror = () => console.error("Gagal memuat face-api.js");
    document.head.appendChild(s);
  });

let modelsLoaded = false;
let modelLoadingPromise = null;

async function loadModelsOnce() {
  if (modelsLoaded) return;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      await loadFaceApiScript();
      if (!window.faceapi) throw new Error("face-api tidak ditemukan");

      const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

      console.log("Memuat model AI...");
      await Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      console.log("Model AI Berhasil Dimuat");
    } catch (err) {
      console.error("Gagal memuat model:", err);
      throw err;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

/* ================================
   2. IMAGE HELPERS & PREPROCESSING
================================ */

function getDriveImageUrl(file) {
  if (file.full && file.full.startsWith("http")) return file.full;
  return `https://drive.google.com/uc?id=${file.id}`;
}

async function preprocessImage(imgSource) {
  const canvas = document.createElement('canvas');
  let width = imgSource.width || imgSource.videoWidth;
  let height = imgSource.height || imgSource.videoHeight;

  const MIN_SIZE = 512;
  if (width < MIN_SIZE || height < MIN_SIZE) {
    const scale = Math.max(MIN_SIZE / width, MIN_SIZE / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.filter = 'contrast(1.2) brightness(1.1)';
  ctx.drawImage(imgSource, 0, 0, width, height);
  
  return canvas;
}

/* ================================
   MAIN APP COMPONENT
================================ */

export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [history, setHistory] = useState([{ id: "root", name: "Beranda" }]);
  const [loading, setLoading] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState([]);

  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [matches, setMatches] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [eta, setEta] = useState(null);

  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);

  const stopRef = useRef(false);
  const fileInputRef = useRef(null);
  const startTimeRef = useRef(0);

  const currentFolder = history[history.length - 1];

  const log = (msg, type = "info") => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));
    if (type === "error") console.error(msg);
  };

  const fetchData = useCallback(async id => {
    // Perbaikan: Jangan lanjutkan jika gasUrl kosong untuk mencegah "Invalid URL" error
    if (!gasUrl) return;

    setLoading(true);
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("folderId", id);
      const r = await fetch(u.toString());
      const d = await r.json();
      
      if (d.error) throw new Error(d.error);
      
      setFiles(d.files || []);
      setFolders(d.folders || []);
      log(`Berhasil memuat ${d.files?.length || 0} file dari ${id === 'root' ? 'Beranda' : 'Folder'}`);
    } catch (e) {
      log(`Fetch Error: ${e.message}`, "error");
    }
    setLoading(false);
  }, [gasUrl]);

  useEffect(() => {
    // Hanya panggil fetchData jika gasUrl sudah tersedia
    if (gasUrl) {
      fetchData(currentFolder.id);
    }
    setSelectionMode(false);
    setSelected([]);
    setMatches([]);
    setFaceDescriptor(null);
    setScanning(false);
  }, [currentFolder, fetchData, gasUrl]);

  const detectFaceInImage = async (imageSource) => {
    const options = new window.faceapi.TinyFaceDetectorOptions({
      inputSize: 416, 
      scoreThreshold: 0.4
    });

    const canvas = await preprocessImage(imageSource);

    return await window.faceapi
      .detectSingleFace(canvas, options)
      .withFaceLandmarks()
      .withFaceDescriptor();
  };

  const startScanning = async () => {
    if (!faceDescriptor || files.length === 0) return;

    try {
      setScanning(true);
      stopRef.current = false;
      setMatches([]);
      setProgress(0);
      setScanCount(0);
      setLogs([]);
      startTimeRef.current = Date.now();

      log("Menyiapkan model AI...");
      await loadModelsOnce();
      log("AI Siap. Memulai pemindaian batch...");

      const matcher = new window.faceapi.FaceMatcher(faceDescriptor, 0.6);
      const BATCH_SIZE = 5; 
      let processed = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (stopRef.current) {
          log("Pemindaian dihentikan oleh pengguna.");
          break;
        }

        const batch = files.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file) => {
          try {
            let img;
            const directUrl = getDriveImageUrl(file);
            
            try {
              img = await window.faceapi.fetchImage(directUrl);
            } catch (err) {
              const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(directUrl)}&w=512&output=jpg`;
              img = await window.faceapi.fetchImage(proxyUrl);
            }

            const canvas = await preprocessImage(img);

            const detections = await window.faceapi
              .detectAllFaces(canvas, new window.faceapi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.4
              }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            let isMatch = false;
            for (const d of detections) {
              if (matcher.findBestMatch(d.descriptor).label !== "unknown") {
                isMatch = true;
                break;
              }
            }

            if (isMatch) {
              setMatches(prev => [...prev, file.id]);
              log(`COCOK DITEMUKAN: ${file.name}`);
            }

          } catch (e) {
            log(`Gagal memindai ${file.name}: ${e.message}`, "error");
          }
        }));

        processed += batch.length;
        setScanCount(processed);
        setProgress(Math.round((processed / files.length) * 100));

        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const rate = processed / elapsed;
        const remaining = files.length - processed;
        const etaSeconds = Math.round(remaining / rate);
        setEta(etaSeconds > 60 ? `${Math.floor(etaSeconds/60)}m` : `${etaSeconds}s`);

        await new Promise(r => setTimeout(r, 100));
      }

      setScanning(false);
      log(`Pemindaian selesai. Menemukan ${matches.length} foto yang cocok.`);

    } catch (err) {
      log(`ERROR KRITIS AI: ${err.message}`, "error");
      setScanning(false);
      alert("Mesin AI Gagal: " + err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      log("Memuat AI untuk foto referensi...");
      await loadModelsOnce();

      log("Memproses foto referensi...");
      const img = await window.faceapi.bufferToImage(file);
      const detection = await detectFaceInImage(img);

      if (!detection) {
        alert("Wajah tidak terdeteksi pada foto referensi. Gunakan foto yang lebih jelas.");
        log("Foto referensi ditolak: Tidak ada wajah.");
        setLoading(false);
        return;
      }

      setFaceDescriptor(detection.descriptor);
      setMatches([]);
      log("Wajah referensi disetel. Memulai pemindaian...");
      setLoading(false);
      
      setTimeout(startScanning, 500);

    } catch (err) {
      log(`Kesalahan Unggah: ${err.message}`, "error");
      alert("Gagal memproses foto.");
      setLoading(false);
    }
  };

  const toggleSelect = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const navigate = (id, name) => setHistory(h => [...h, { id, name }]);
  const back = () => history.length > 1 && setHistory(h => h.slice(0, -1));
  
  const displayed = faceDescriptor ? files.filter(f => matches.includes(f.id)) : files;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let u = p.get("api");
    if (u && !u.startsWith("http")) {
      try { u = atob(u); } catch {}
    }
    const saved = localStorage.getItem("gas_app_url");
    const finalUrl = u || saved;
    if (finalUrl) {
      setGasUrl(finalUrl);
      localStorage.setItem("gas_app_url", finalUrl);
    }
    
    loadModelsOnce().catch(e => console.warn("Pemuatan model di latar belakang gagal", e));
  }, []);

  if (!gasUrl) return <div className="p-10 text-center">Gunakan Generator Link</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-48 font-sans">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      <div className="sticky top-0 bg-white shadow-sm z-40 p-3 flex justify-between items-center">
        <div className="flex items-center gap-2 overflow-hidden max-w-[60%]">
          {history.length > 1 && <button onClick={back} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>}
          <b className="truncate">{currentFolder.name}</b>
        </div>

        <div className="flex gap-2">
          {faceDescriptor ? (
             <button onClick={() => {
                setFaceDescriptor(null);
                setMatches([]);
                setScanning(false);
                stopRef.current = true;
             }} className="bg-red-100 text-red-600 px-3 py-2 rounded-full text-sm font-bold flex items-center gap-2">
                <X size={16}/> Hapus Pencarian
             </button>
          ) : (
             <>
               <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 text-white px-4 py-2 rounded-full flex items-center gap-2 text-sm hover:bg-blue-700 transition-colors">
                 <Camera size={18} /> <span className="hidden sm:inline">Pindai Wajah</span>
               </button>
               <button onClick={() => setSelectionMode(s => !s)} className="p-2 bg-gray-100 rounded-full text-gray-600">
                 {selectionMode ? <CheckSquare size={20} /> : <Square size={20} />}
               </button>
             </>
          )}
          <button onClick={() => fetchData(currentFolder.id)} className="p-2 bg-gray-100 rounded-full text-gray-600">
            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="flex gap-2 p-2 overflow-x-auto border-b bg-white">
          {folders.map(f => (
            <button key={f.id} onClick={() => navigate(f.id, f.name)} className="bg-gray-100 border px-3 py-1.5 rounded-full flex items-center gap-2 text-sm whitespace-nowrap hover:bg-gray-200">
              <Folder size={14} className="text-yellow-500 fill-yellow-500" /> {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1 p-1 sm:gap-3 sm:p-3">
        {displayed.map(f => (
          <div 
            key={f.id} 
            onClick={() => selectionMode ? toggleSelect(f.id) : window.open(f.downloadUrl || getDriveImageUrl(f), "_blank")}
            className={`aspect-square rounded-lg overflow-hidden relative cursor-pointer bg-gray-200 transition-all ${selected.includes(f.id) ? "ring-4 ring-blue-500 p-1" : ""} ${matches.includes(f.id) ? "ring-4 ring-green-500" : ""}`}
          >
            <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
            
            {selectionMode && (
               <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${selected.includes(f.id) ? 'bg-blue-500 border-blue-500' : 'bg-black/30 border-white'}`}>
                  {selected.includes(f.id) && <CheckCircle2 size={16} className="text-white"/>}
               </div>
            )}
            
            {matches.includes(f.id) && (
              <div className="absolute bottom-0 inset-x-0 bg-green-500/90 text-white text-[10px] font-bold text-center py-1">COCOK</div>
            )}
          </div>
        ))}
      </div>

      {displayed.length === 0 && !loading && (
        <div className="py-20 text-center text-gray-400">
          <User size={48} className="mx-auto mb-4 opacity-50" />
          <p>{faceDescriptor ? "Tidak ada yang cocok ditemukan." : "Folder kosong."}</p>
        </div>
      )}

      {loading && files.length === 0 && (
         <div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin"/>
         </div>
      )}

      {scanning && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-lg z-50 animate-in slide-in-from-bottom-5">
          <div className="flex justify-between text-xs font-bold text-gray-600 mb-2">
            <span className="flex items-center gap-2">
               <Loader2 size={12} className="animate-spin"/> Memindai... ({scanCount}/{files.length})
            </span>
            <span>{Math.round(progress)}% {eta ? `• ~${eta} tersisa` : ''}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
          </div>
          <button onClick={() => (stopRef.current = true)} className="mt-3 w-full py-2 bg-red-100 text-red-600 rounded-lg text-sm font-bold hover:bg-red-200">
             Hentikan Pemindaian
          </button>
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
         <button onClick={() => setShowLogs(!showLogs)} className="bg-gray-900 text-white p-3 rounded-full shadow-xl hover:scale-105 transition-transform">
            <Terminal size={20} />
         </button>
      </div>

      {showLogs && logs.length > 0 && (
        <div className="fixed bottom-20 left-4 right-20 bg-black/90 backdrop-blur text-green-400 text-[10px] font-mono p-3 rounded-xl h-32 overflow-y-auto shadow-2xl z-30 border border-gray-700">
           {logs.map((l, i) => <div key={i} className="whitespace-nowrap">{l}</div>)}
        </div>
      )}
    </div>
  );
}
