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
  Search,
  Maximize2,
  ExternalLink
} from "lucide-react";

/* ==========================================
   1. GLOBAL FACE API LOADER (SINGLETON)
========================================== */

const loadFaceApiScript = () =>
  new Promise(resolve => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.id = "face-api-js";
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

      console.log("Memuat model AI...");
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

// Helper untuk URL Gambar yang kompatibel dengan AI menggunakan Proxy High Fidelity
function getAIFriendlyUrl(file) {
  const rawUrl = file.full || `https://drive.google.com/uc?id=${file.id}`;
  // Gunakan Proxy wsrv.nl dengan output JPG 80% dan width 600px untuk keseimbangan akurasi/kecepatan
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=600&output=jpg&q=80&error=404`;
}

// Menunggu gambar benar-benar termuat ke dalam memori browser
const waitImageLoad = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Gagal mengunduh gambar melalui proxy"));
  });
};

async function preprocessImage(imgSource) {
  const canvas = document.createElement('canvas');
  let width = imgSource.width;
  let height = imgSource.height;

  // Normalisasi ukuran untuk AI
  const TARGET_SIZE = 512;
  const scale = Math.max(TARGET_SIZE / width, TARGET_SIZE / height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Tingkatkan detail fitur wajah
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
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [folderError, setFolderError] = useState(false);

  // UI State
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [previewPhoto, setPreviewPhoto] = useState(null); // Fitur Preview Gambar

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
     FETCH DRIVE DATA
  ========================================== */

  const fetchData = useCallback(async (id) => {
    if (!gasUrl || !id) return;

    setLoading(true);
    setFolderError(false);
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("folderId", id);
      const r = await fetch(u.toString());
      
      const contentType = r.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Format Link Apps Script salah atau tidak mengembalikan JSON");
      }

      const d = await r.json();
      if (d.error) throw new Error(d.error);
      
      setFiles(d.files || []);
      setFolders(d.folders || []);
      log(`Berhasil memuat ${d.files?.length || 0} file.`);
    } catch (e) {
      log(`Error: Folder tidak valid atau akses ditolak.`, "error");
      setFolderError(true);
      setFiles([]);
      setFolders([]);
    }
    setLoading(false);
  }, [gasUrl]);

  useEffect(() => {
    if (gasUrl && currentFolder) {
      fetchData(currentFolder.id);
    }
  }, [currentFolder, fetchData, gasUrl]);

  /* ==========================================
     CORE AI ENGINE (STABILITY MODE)
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

      log("Menyiapkan AI...");
      await loadModelsOnce();
      log("Memulai pemindaian mendalam...");

      const matcher = new window.faceapi.FaceMatcher(faceDescriptor, 0.6);
      const BATCH_SIZE = 4; // Mengurangi batch agar lebih stabil di mobile
      let processed = 0;

      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        if (stopRef.current) {
          log("Pemindaian dibatalkan pengguna.");
          break;
        }

        const batch = files.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (file) => {
          try {
            const aiUrl = getAIFriendlyUrl(file);
            
            // Step 1: Tunggu gambar termuat sempurna
            const rawImg = await waitImageLoad(aiUrl);

            // Step 2: Tingkatkan kualitas gambar via Canvas
            const canvas = await preprocessImage(rawImg);

            // Step 3: Deteksi wajah
            const detections = await window.faceapi
              .detectAllFaces(canvas, new window.faceapi.TinyFaceDetectorOptions({
                inputSize: 416,
                scoreThreshold: 0.4
              }))
              .withFaceLandmarks()
              .withFaceDescriptors();

            if (detections.length === 0) {
              log(`${file.name}: 0 Wajah.`);
            }

            let foundMatch = false;
            for (const d of detections) {
              const match = matcher.findBestMatch(d.descriptor);
              if (match.label !== "unknown") {
                foundMatch = true;
                break;
              }
            }

            if (foundMatch) {
              setMatches(prev => [...new Set([...prev, file.id])]);
              log(`COCOK: ${file.name}`, "success");
            }

          } catch (e) {
            log(`Lewati ${file.name}: Masalah unduhan gambar.`, "warning");
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

        // Jeda kecil agar UI tetap responsif
        await new Promise(r => setTimeout(r, 150));
      }

      setScanning(false);
      log(`Pemindaian selesai. Menemukan ${matches.length} kecocokan.`);

    } catch (err) {
      log(`AI Error: ${err.message}`, "error");
      setScanning(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      log("Menganalisis wajah referensi...");
      await loadModelsOnce();

      const img = await window.faceapi.bufferToImage(file);
      const canvas = await preprocessImage(img);
      const detection = await window.faceapi
        .detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert("Wajah tidak terdeteksi. Gunakan foto selfie yang lebih jelas.");
        setLoading(false);
        return;
      }

      setFaceDescriptor(detection.descriptor);
      setMatches([]);
      setLoading(false);
      
      // Auto-start
      setTimeout(startScanning, 500);

    } catch (err) {
      log(`Gagal memuat foto: ${err.message}`, "error");
      setLoading(false);
    }
  };

  /* ==========================================
     UI & NAVIGATION LOGIC
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
      
      try {
        const urlObj = new URL(finalUrl);
        const folderId = urlObj.searchParams.get("folderId") || "root";
        setHistory([{ id: folderId, name: folderId === 'root' ? "Beranda" : "Folder Utama" }]);
      } catch {
        setFolderError(true);
      }
    }
  }, []);

  const navigate = (id, name) => setHistory(h => [...h, { id, name }]);
  const back = () => history.length > 1 && setHistory(h => h.slice(0, -1));
  const toggleSelect = id => setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  
  const displayed = faceDescriptor ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
       <div className="text-center max-w-sm">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Akses Terbatas</h2>
          <p className="text-gray-500 text-sm">Gunakan Generator Link untuk menghubungkan folder Google Drive Anda ke aplikasi ini.</p>
       </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-48 font-sans select-none">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />

      {/* HEADER */}
      <div className="sticky top-0 bg-white shadow-sm z-40 p-3 flex justify-between items-center border-b">
        <div className="flex items-center gap-2 overflow-hidden max-w-[60%]">
          {history.length > 1 && <button onClick={back} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft /></button>}
          <b className="truncate text-gray-800 tracking-tight">{currentFolder?.name || "Memuat..."}</b>
        </div>

        <div className="flex gap-2">
          {faceDescriptor ? (
             <button onClick={() => { setFaceDescriptor(null); setMatches([]); setScanning(false); stopRef.current = true; }} 
                     className="bg-red-50 text-red-600 px-4 py-2 rounded-full text-xs font-bold border border-red-100 flex items-center gap-2 animate-pulse">
                <X size={14}/> Batal Cari
             </button>
          ) : (
             <>
               <button onClick={() => fileInputRef.current.click()} className="bg-blue-600 text-white px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
                 <Camera size={16} /> <span className="hidden sm:inline">Scan Wajah</span>
               </button>
               <button onClick={() => setSelectionMode(s => !s)} className={`p-2 rounded-full border transition-all ${selectionMode ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white text-gray-500 hover:border-gray-300'}`}>
                 {selectionMode ? <CheckSquare size={18} /> : <Square size={18} />}
               </button>
             </>
          )}
          <button onClick={() => fetchData(currentFolder.id)} className="p-2 bg-white border rounded-full text-gray-500 shadow-sm hover:bg-gray-50">
            <RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : ""} />
          </button>
        </div>
      </div>

      {folderError ? (
        <div className="max-w-md mx-auto mt-20 p-8 text-center bg-white rounded-3xl shadow-xl border border-red-50 mx-4">
           <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
           <h2 className="text-xl font-bold text-gray-800 mb-2">Folder Tidak Ditemukan</h2>
           <p className="text-gray-500 text-sm mb-6">Link tidak valid atau Anda tidak memiliki izin akses ke folder ini.</p>
           <button onClick={() => window.location.reload()} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">Coba Lagi</button>
        </div>
      ) : (
        <>
          {/* SUBFOLDERS */}
          {folders.length > 0 && (
            <div className="flex gap-2 p-3 overflow-x-auto bg-gray-100 border-b border-gray-200 scrollbar-hide">
              {folders.map(f => (
                <button key={f.id} onClick={() => navigate(f.id, f.name)} className="bg-white border border-gray-200 px-4 py-2 rounded-full flex items-center gap-2 text-xs font-semibold whitespace-nowrap shadow-sm hover:border-blue-400 transition-colors">
                  <Folder size={14} className="text-yellow-500 fill-yellow-500" /> {f.name}
                </button>
              ))}
            </div>
          )}

          {/* GRID */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 p-1.5 sm:gap-4 sm:p-4">
            {displayed.map(f => (
              <div 
                key={f.id} 
                onClick={() => selectionMode ? toggleSelect(f.id) : setPreviewPhoto(f)}
                className={`aspect-square rounded-2xl overflow-hidden relative cursor-pointer bg-gray-200 transition-all transform active:scale-95 ${selectedIds.includes(f.id) ? "ring-4 ring-blue-600 p-1 bg-blue-100" : ""} ${matches.includes(f.id) ? "ring-4 ring-green-500" : ""}`}
              >
                <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                
                {selectionMode && (
                   <div className={`absolute top-2 left-2 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${selectedIds.includes(f.id) ? 'bg-blue-600 border-blue-600 shadow-md scale-110' : 'bg-black/20 border-white/50 backdrop-blur-sm'}`}>
                      {selectedIds.includes(f.id) && <CheckCircle2 size={18} className="text-white"/>}
                   </div>
                )}
                
                {matches.includes(f.id) && (
                  <div className="absolute bottom-0 inset-x-0 bg-green-500/90 text-white text-[10px] font-black text-center py-1.5 shadow-lg">COCOK</div>
                )}
              </div>
            ))}
          </div>

          {displayed.length === 0 && !loading && (
            <div className="py-32 text-center text-gray-400">
              <User size={64} className="mx-auto mb-4 opacity-10" />
              <p className="text-sm font-medium">{faceDescriptor ? "Tidak ada kecocokan ditemukan." : "Folder ini belum ada isinya."}</p>
            </div>
          )}
        </>
      )}

      {/* LIGHTBOX PREVIEW (DIPULIHKAN) */}
      {previewPhoto && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-200">
          <div className="flex justify-between items-center p-4 text-white bg-gradient-to-b from-black/80 to-transparent">
            <button onClick={() => setPreviewPhoto(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24}/></button>
            <div className="flex gap-3">
              <button onClick={() => window.open(previewPhoto.full || previewPhoto.thumbnail, "_blank")} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Buka Asli"><ExternalLink size={20}/></button>
              <a href={previewPhoto.downloadUrl || '#'} download className="bg-white text-black px-5 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-gray-200">
                <Download size={16}/> Download
              </a>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-2 sm:p-10 overflow-hidden">
             <img src={previewPhoto.full || previewPhoto.thumbnail} className="max-w-full max-h-full object-contain shadow-2xl rounded" alt={previewPhoto.name} />
          </div>
          <div className="p-6 text-center text-white/80 bg-gradient-to-t from-black/80 to-transparent">
             <p className="text-sm font-bold">{previewPhoto.name}</p>
          </div>
        </div>
      )}

      {/* OVERLAYS & PROGRESS */}
      {loading && (
         <div className="fixed inset-0 flex flex-col items-center justify-center bg-white/95 z-50 backdrop-blur-md">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin"/>
              <div className="absolute inset-0 flex items-center justify-center"><Search size={16} className="text-blue-400" /></div>
            </div>
            <span className="mt-6 text-base font-bold text-gray-700">Membuka Folder Drive...</span>
            <span className="text-[11px] text-gray-400 mt-1 uppercase tracking-widest">Sabar, sedang mengindeks data</span>
         </div>
      )}

      {scanning && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-6 shadow-[0_-20px_40px_rgba(0,0,0,0.1)] z-50 animate-in slide-in-from-bottom-10 rounded-t-[40px]">
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="flex flex-col">
                 <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Status AI</span>
                 <span className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    {scanCount} / {files.length} <span className="text-gray-400 font-normal text-sm">Foto</span>
                 </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-blue-600">{Math.round(progress)}%</span>
                {eta && <div className="text-[10px] text-gray-400 font-bold uppercase">Estimasi: {eta}</div>}
              </div>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-6 border border-gray-100 shadow-inner">
              <div className="h-full bg-blue-600 transition-all duration-500 ease-out relative" style={{ width: `${progress}%` }}>
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
            <button onClick={() => (stopRef.current = true)} className="w-full py-4 bg-red-50 text-red-600 rounded-2xl text-sm font-black hover:bg-red-100 border-2 border-red-100 transition-all shadow-sm active:scale-95">
               HENTIKAN PEMINDAIAN
            </button>
          </div>
        </div>
      )}

      {/* LOG TERMINAL */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
         <button onClick={() => setShowLogs(!showLogs)} className={`p-4 rounded-full shadow-2xl border-2 transition-all hover:scale-110 active:scale-90 ${showLogs ? 'bg-black text-green-400 border-green-500/30' : 'bg-gray-900 text-white border-white/10'}`}>
            <Terminal size={22} />
         </button>
      </div>

      {showLogs && logs.length > 0 && (
        <div className="fixed bottom-24 left-4 right-24 bg-black/95 backdrop-blur-xl text-green-400 text-[10px] font-mono p-4 rounded-3xl h-44 overflow-y-auto shadow-2xl z-30 border border-white/10 ring-1 ring-white/5 animate-in zoom-in-95">
           <div className="flex justify-between items-center mb-2 border-b border-green-900/50 pb-2">
              <span className="text-[9px] font-bold opacity-70 uppercase tracking-[0.2em] flex items-center gap-2"><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"/> AI Activity Monitor</span>
              <button onClick={() => setLogs([])} className="text-[9px] hover:text-white px-2 py-1 bg-green-900/30 rounded-lg font-bold border border-green-500/20">RESET</button>
           </div>
           {logs.map((l, i) => (
             <div key={i} className={`whitespace-nowrap py-1 border-b border-white/5 last:border-0 ${l.includes('COCOK') ? 'text-white bg-green-600/30 px-2 rounded font-black' : ''}`}>
               {l}
             </div>
           ))}
        </div>
      )}
    </div>
  );
}
