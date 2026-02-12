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
  AlertTriangle,
  SearchX
} from "lucide-react";

/* ==========================================
   1. GLOBAL FACE API LOADER (SINGLETON)
========================================== */

const loadFaceApiScript = () =>
  new Promise(resolve => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    s.onerror = () => console.error("Gagal memuat library face-api.js");
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
      if (!window.faceapi) throw new Error("Library face-api tidak ditemukan");

      const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";

      console.log("Memuat model AI ke memori...");
      await Promise.all([
        window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      console.log("AI Models Siap!");
    } catch (err) {
      console.error("Kesalahan muat model:", err);
      throw err;
    } finally {
      modelLoadingPromise = null;
    }
  })();

  return modelLoadingPromise;
}

/* ==========================================
   2. IMAGE HELPERS & PREPROCESSING
========================================== */

// Helper untuk URL Gambar yang kompatibel dengan AI
function getAIFriendlyUrl(file) {
  const rawUrl = file.full || `https://drive.google.com/uc?id=${file.id}`;
  // Gunakan Proxy wsrv.nl untuk bypass CORS dan resize agar stabil
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=512&output=jpg&q=80`;
}

async function preprocessImage(imgSource) {
  const canvas = document.createElement('canvas');
  let width = imgSource.width || imgSource.videoWidth;
  let height = imgSource.height || imgSource.videoHeight;

  // Resize ke minimal 512px agar wajah kecil tetap terdeteksi
  const MIN_SIZE = 512;
  if (width < MIN_SIZE || height < MIN_SIZE) {
    const scale = Math.max(MIN_SIZE / width, MIN_SIZE / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Tingkatkan kontras dan kecerahan untuk membantu deteksi
  ctx.filter = 'contrast(1.2) brightness(1.1)';
  ctx.drawImage(imgSource, 0, 0, width, height);
  
  return canvas;
}

/* ==========================================
   MAIN APP COMPONENT
========================================== */

export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [history, setHistory] = useState([]); // Mulai dengan array kosong untuk keamanan
  const [loading, setLoading] = useState(false);
  const [folderError, setFolderError] = useState(false); // Status error folder

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState([]);

  // AI State
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

  const currentFolder = history.length > 0 ? history[history.length - 1] : null;

  const log = (msg, type = "info") => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));
  };

  /* ==========================================
     FETCH DRIVE DATA (SECURITY FIX)
  ========================================== */

  const fetchData = useCallback(async (id) => {
    if (!gasUrl || !id) return;

    setLoading(true);
    setFolderError(false); // Reset error sebelum fetch
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("folderId", id);
      const r = await fetch(u.toString());
      
      // Jika response bukan JSON (misal error HTML dari GAS)
      const contentType = r.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Response tidak valid");
      }

      const d = await r.json();
      
      if (d.error) throw new Error(d.error);
      
      setFiles(d.files || []);
      setFolders(d.folders || []);
      log(`Berhasil memuat ${d.files?.length || 0} file.`);
    } catch (e) {
      log(`Error: Folder tidak ditemukan atau akses ditolak.`, "error");
      setFolderError(true); // Aktifkan UI Folder Tidak Ditemukan
      setFiles([]);
      setFolders([]);
    }
    setLoading(false);
  }, [gasUrl]);

  // Efek Navigasi Folder
  useEffect(() => {
    if (gasUrl && currentFolder) {
      fetchData(currentFolder.id);
    }
  }, [currentFolder, fetchData, gasUrl]);

  /* ==========================================
     CORE AI ENGINE (STABILITY FIX)
  ========================================== */

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

      log("Menyiapkan mesin AI...");
      await loadModelsOnce();
      log("AI Siap. Memulai pemindaian paralel...");

      // Threshold lebih longgar (0.6) agar lebih akurat mencari kecocokan
      const matcher = new window.faceapi.FaceMatcher(faceDescriptor, 0.6);
      const BATCH_SIZE = 5; 
      let processed = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (stopRef.current) {
          log("Pemindaian dihentikan.");
          break;
        }

        const batch = files.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file) => {
          try {
            // Gunakan Proxy untuk semua pengambilan gambar AI
            const aiUrl = getAIFriendlyUrl(file);
            const img = await window.faceapi.fetchImage(aiUrl);

            // Preprocess sebelum deteksi
            const canvas = await preprocessImage(img);

            // Deteksi Wajah (TinyFaceDetector 416, 0.4)
            const detections = await window.faceapi
              .detectAllFaces(canvas, new window.faceapi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.4
              }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            if (detections.length === 0) {
              log(`${file.name}: Tidak ada wajah terdeteksi.`);
            }

            let isMatch = false;
            for (const d of detections) {
              if (matcher.findBestMatch(d.descriptor).label !== "unknown") {
                isMatch = true;
                break;
              }
            }

            if (isMatch) {
              setMatches(prev => [...prev, file.id]);
              log(`COCOK: ${file.name}`, "success");
            }

          } catch (e) {
            log(`Gagal memproses ${file.name}: ${e.message}`, "error");
          }
        }));

        processed += batch.length;
        setScanCount(processed);
        setProgress(Math.round((processed / files.length) * 100));

        // Kalkulasi ETA
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const rate = processed / elapsed;
        const remaining = files.length - processed;
        const etaSec = Math.round(remaining / rate);
        setEta(etaSec > 60 ? `${Math.floor(etaSec/60)}m` : `${etaSec}s`);

        await new Promise(r => setTimeout(r, 100));
      }

      setScanning(false);
      log(`Selesai. Menemukan ${matches.length} foto.`);

    } catch (err) {
      log(`Kesalahan AI: ${err.message}`, "error");
      setScanning(false);
      alert("AI Error: " + err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      log("Menganalisis foto referensi...");
      await loadModelsOnce();

      const img = await window.faceapi.bufferToImage(file);
      const canvas = await preprocessImage(img);
      const detection = await window.faceapi
        .detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert("Wajah tidak ditemukan di foto referensi. Gunakan foto selfie yang jelas.");
        setLoading(false);
        return;
      }

      setFaceDescriptor(detection.descriptor);
      setMatches([]);
      setLoading(false);
      
      // Auto-start scanning
      setTimeout(startScanning, 500);

    } catch (err) {
      log(`Gagal memuat foto: ${err.message}`, "error");
      alert("Gagal memproses foto.");
      setLoading(false);
    }
  };

  /* ==========================================
     BOOTSTRAP & INITIALIZATION
  ========================================== */

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
      
      // Deteksi Folder ID Awal
      try {
        const urlObj = new URL(finalUrl);
        const folderId = urlObj.searchParams.get("folderId") || "root";
        setHistory([{ id: folderId, name: folderId === 'root' ? "Beranda" : "Folder Utama" }]);
      } catch {
        setFolderError(true);
      }
    }
    
    loadModelsOnce().catch(console.warn);
  }, []);

  const navigate = (id, name) => setHistory(h => [...h, { id, name }]);
  const back = () => history.length > 1 && setHistory(h => h.slice(0, -1));
  const toggleSelect = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  
  const displayed = faceDescriptor ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-10 text-center font-sans">Gunakan Generator Link untuk masuk.</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-48 font-sans select-none">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {/* HEADER */}
      <div className="sticky top-0 bg-white shadow-sm z-40 p-3 flex justify-between items-center border-b">
        <div className="flex items-center gap-2 overflow-hidden max-w-[60%]">
          {history.length > 1 && <button onClick={back} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft /></button>}
          <b className="truncate text-gray-700">{currentFolder?.name || "Memuat..."}</b>
        </div>

        <div className="flex gap-2">
          {faceDescriptor ? (
             <button onClick={() => { setFaceDescriptor(null); setMatches([]); setScanning(false); stopRef.current = true; }} 
                     className="bg-red-50 text-red-600 px-4 py-2 rounded-full text-xs font-bold border border-red-100 flex items-center gap-2">
                <X size={14}/> Batal Cari
             </button>
          ) : (
             <>
               <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 text-white px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold shadow-md hover:bg-blue-700">
                 <Camera size={16} /> <span className="hidden sm:inline">Cari Wajah</span>
               </button>
               <button onClick={() => setSelectionMode(s => !s)} className={`p-2 rounded-full border ${selectionMode ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white text-gray-500'}`}>
                 {selectionMode ? <CheckSquare size={18} /> : <Square size={18} />}
               </button>
             </>
          )}
          <button onClick={() => fetchData(currentFolder.id)} className="p-2 bg-white border rounded-full text-gray-500 shadow-sm">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ERROR DISPLAY (SAFETY FEATURE) */}
      {folderError ? (
        <div className="max-w-md mx-auto mt-20 p-8 text-center bg-white rounded-3xl shadow-xl border border-red-50">
           <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
           </div>
           <h2 className="text-xl font-bold text-gray-800 mb-2">Folder Tidak Ditemukan</h2>
           <p className="text-gray-500 text-sm mb-6">Link folder Anda salah, kadaluarsa, atau tidak memiliki izin akses publik.</p>
           <button onClick={() => window.location.reload()} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold">Coba Lagi</button>
        </div>
      ) : (
        <>
          {/* SUBFOLDERS */}
          {folders.length > 0 && (
            <div className="flex gap-2 p-3 overflow-x-auto bg-gray-50 border-b border-gray-100 scrollbar-hide">
              {folders.map(f => (
                <button key={f.id} onClick={() => navigate(f.id, f.name)} className="bg-white border border-gray-200 px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-medium whitespace-nowrap shadow-sm hover:border-blue-300">
                  <Folder size={14} className="text-yellow-500 fill-yellow-500" /> {f.name}
                </button>
              ))}
            </div>
          )}

          {/* PHOTO GRID */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-1 p-1 sm:gap-4 sm:p-4">
            {displayed.map(f => (
              <div 
                key={f.id} 
                onClick={() => selectionMode ? toggleSelect(f.id) : window.open(f.downloadUrl || f.thumbnail, "_blank")}
                className={`aspect-square rounded-xl overflow-hidden relative cursor-pointer bg-gray-200 transition-all ${selected.includes(f.id) ? "ring-4 ring-blue-500 p-1" : ""} ${matches.includes(f.id) ? "ring-4 ring-green-500" : ""}`}
              >
                <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                
                {selectionMode && (
                   <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${selected.includes(f.id) ? 'bg-blue-500 border-blue-500 shadow-lg' : 'bg-black/20 border-white'}`}>
                      {selected.includes(f.id) && <CheckCircle2 size={16} className="text-white"/>}
                   </div>
                )}
                
                {matches.includes(f.id) && (
                  <div className="absolute bottom-0 inset-x-0 bg-green-500/90 text-white text-[9px] font-black text-center py-1 tracking-tighter">COCOK</div>
                )}
              </div>
            ))}
          </div>

          {displayed.length === 0 && !loading && (
            <div className="py-20 text-center text-gray-400">
              <User size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-sm">{faceDescriptor ? "Tidak ditemukan foto yang cocok." : "Folder ini kosong."}</p>
            </div>
          )}
        </>
      )}

      {/* LOADING OVERLAY */}
      {loading && (
         <div className="fixed inset-0 flex flex-col items-center justify-center bg-white/90 z-50 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4"/>
            <span className="text-sm font-bold text-gray-600 animate-pulse text-center">Menghubungkan ke Drive...<br/><span className="text-[10px] font-normal">Sabar ya, lagi baca folder.</span></span>
         </div>
      )}

      {/* SCANNING DRAWER */}
      {scanning && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-5 shadow-2xl z-50 animate-in slide-in-from-bottom-5 rounded-t-3xl">
          <div className="flex justify-between items-center mb-3">
            <div className="flex flex-col">
               <span className="text-xs font-black text-gray-800 flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-blue-600"/> MEMINDAI WAJAH...
               </span>
               <span className="text-[10px] text-gray-500">{scanCount} / {files.length} Foto Diproses</span>
            </div>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{Math.round(progress)}% {eta ? `• ~${eta}` : ''}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-4 border border-gray-50">
            <div className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.5)]" style={{ width: `${progress}%` }} />
          </div>
          <button onClick={() => (stopRef.current = true)} className="w-full py-3 bg-red-50 text-red-600 rounded-2xl text-sm font-black hover:bg-red-100 border border-red-100">
             BERHENTI SCAN
          </button>
        </div>
      )}

      {/* LOG TERMINAL */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
         <button onClick={() => setShowLogs(!showLogs)} className="bg-gray-900 text-white p-3.5 rounded-full shadow-2xl border-2 border-white/20 hover:scale-110 active:scale-95 transition-all">
            <Terminal size={20} />
         </button>
      </div>

      {showLogs && logs.length > 0 && (
        <div className="fixed bottom-24 left-4 right-24 bg-black/95 backdrop-blur-md text-green-400 text-[10px] font-mono p-4 rounded-2xl h-36 overflow-y-auto shadow-2xl z-30 border border-white/10 ring-1 ring-white/5">
           <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-1">
              <span className="text-[9px] font-bold opacity-50 uppercase tracking-widest">AI Scanning Monitor</span>
              <button onClick={() => setLogs([])} className="text-[8px] hover:text-white px-2 py-0.5 bg-green-900/30 rounded">Clear</button>
           </div>
           {logs.map((l, i) => <div key={i} className={`whitespace-nowrap py-0.5 ${l.includes('COCOK') ? 'text-white bg-green-800/40 font-bold' : ''}`}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
