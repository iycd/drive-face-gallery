import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Download, X, Loader2, Camera, Upload, RefreshCw, Play, Pause,
  CheckCircle2, Square, CheckSquare, ChevronLeft, Folder, Terminal,
  User, AlertTriangle, Database, Cpu, Search, Layers, Save
} from "lucide-react";

/* ==========================================
   1. GLOBAL AI LOADER (SINGLETON)
========================================== */
let modelsLoaded = false;
const loadModelsOnce = async () => {
  if (modelsLoaded) return;
  const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
  if (!window.faceapi) {
    await new Promise(resolve => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
      s.crossOrigin = "anonymous";
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
};

/* ==========================================
   2. VECTOR DATABASE HELPERS
========================================== */
const getProxyUrl = (file) => {
  const rawUrl = file.full || `https://drive.google.com/uc?id=${file.id}`;
  return `https://wsrv.nl/?url=${encodeURIComponent(rawUrl)}&w=600&output=jpg&q=80`;
};

/* ==========================================
   MAIN APP COMPONENT
========================================== */
export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State Database Vektor
  const [faceDatabase, setFaceDatabase] = useState([]); // Struktur: [{fileId, faces: [descriptor]}]
  const [isDbLoading, setIsDbLoading] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  
  // State Searching
  const [faceDescriptor, setFaceDescriptor] = useState(null);
  const [matches, setMatches] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const [logs, setLogs] = useState([]);
  const stopRef = useRef(false);
  const fileInputRef = useRef(null);

  const currentFolder = history.length > 0 ? history[history.length - 1] : null;

  const log = (msg, type = "info") => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 100));
  };

  /* ==========================================
     FETCH & DB OPERATIONS
  ========================================== */
  
  const fetchDatabase = async () => {
    if (!gasUrl) return;
    setIsDbLoading(true);
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("action", "loadDB");
      const r = await fetch(u.toString());
      const d = await r.json();
      setFaceDatabase(d || []);
      log(`Database Vektor dimuat: ${d.length} foto terindeks.`);
    } catch (e) {
      log("Database belum dibuat atau gagal dimuat.", "warning");
    }
    setIsDbLoading(false);
  };

  const saveDatabaseToCloud = async (dbData) => {
    if (!gasUrl) return;
    log("Menyimpan Database ke Cloud...");
    try {
      const r = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: "saveDB", data: dbData })
      });
      const res = await r.json();
      if (res.success) log("Database berhasil disimpan di Drive!", "success");
    } catch (e) {
      log("Gagal menyimpan database.", "error");
    }
  };

  const fetchData = useCallback(async (id) => {
    if (!gasUrl || !id) return;
    setLoading(true);
    try {
      const u = new URL(gasUrl);
      u.searchParams.set("folderId", id);
      const r = await fetch(u.toString());
      const d = await r.json();
      setFiles(d.files || []);
      setFolders(d.folders || []);
      log(`Memuat ${d.files?.length || 0} foto dari Drive.`);
    } catch (e) {
      log("Koneksi Drive gagal.", "error");
    }
    setLoading(false);
  }, [gasUrl]);

  /* ==========================================
     BUILD DATABASE MODE (ADMIN)
  ========================================== */
  
  const buildDatabase = async () => {
    if (files.length === 0) return;
    await loadModelsOnce();
    setIsScanning(true);
    stopRef.current = false;
    let newDb = [...faceDatabase];
    
    log("Memulai Sinkronisasi Vektor...");
    
    const BATCH_SIZE = 5;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      if (stopRef.current) break;
      const batch = files.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (file) => {
        // Lewati jika sudah ada di DB (O(1) check)
        if (newDb.find(d => d.fileId === file.id)) return;

        try {
          const img = await window.faceapi.fetchImage(getProxyUrl(file));
          const detections = await window.faceapi.detectAllFaces(
            img, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
          ).withFaceLandmarks().withFaceDescriptors();

          if (detections.length > 0) {
            newDb.push({
              fileId: file.id,
              fileName: file.name,
              faces: detections.map(d => Array.from(d.descriptor)), // Simpan sebagai array biasa untuk JSON
              count: detections.length
            });
            log(`Terindeks: ${file.name} (${detections.length} wajah)`);
          }
        } catch (e) {
          log(`Gagal proses: ${file.name}`, "error");
        }
      }));
      
      setProgress(Math.round(((i + batch.length) / files.length) * 100));
      await new Promise(r => setTimeout(r, 100));
    }
    
    setFaceDatabase(newDb);
    setIsScanning(false);
    await saveDatabaseToCloud(newDb);
  };

  /* ==========================================
     SEARCH MODE (SUPER FAST)
  ========================================== */
  
  const searchInDatabase = async (descriptor) => {
    if (faceDatabase.length === 0) {
      alert("Database kosong. Harap sinkronisasi di Admin Mode.");
      return;
    }

    log("Mencocokkan vektor (Vector Search)...");
    const startTime = performance.now();
    
    const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
    const foundIds = [];

    // O(n) Comparison - Sangat cepat karena hanya operasi matematika
    faceDatabase.forEach(entry => {
      let isMatch = false;
      entry.faces.forEach(faceVec => {
        const match = matcher.findBestMatch(new Float32Array(faceVec));
        if (match.label !== "unknown") isMatch = true;
      });
      if (isMatch) foundIds.push(entry.fileId);
    });

    const duration = (performance.now() - startTime).toFixed(2);
    setMatches(foundIds);
    log(`Selesai! ${foundIds.length} foto ditemukan dalam ${duration}ms.`, "success");
  };

  const handleUploadRef = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      await loadModelsOnce();
      const img = await window.faceapi.bufferToImage(file);
      const detection = await window.faceapi.detectSingleFace(
        img, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416 })
      ).withFaceLandmarks().withFaceDescriptor();

      if (!detection) {
        alert("Wajah tidak terdeteksi di foto referensi.");
      } else {
        setFaceDescriptor(detection.descriptor);
        searchInDatabase(detection.descriptor);
      }
    } catch (err) {
      log("Error deteksi referensi", "error");
    }
    setLoading(false);
  };

  /* ==========================================
     INITIALIZATION
  ========================================== */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let u = p.get("api");
    if (u && !u.startsWith("http")) try { u = atob(u); } catch {}
    const finalUrl = u || localStorage.getItem("gas_app_url");
    
    if (finalUrl) {
      setGasUrl(finalUrl);
      localStorage.setItem("gas_app_url", finalUrl);
      const urlObj = new URL(finalUrl);
      const folderId = urlObj.searchParams.get("folderId") || "root";
      setHistory([{ id: folderId, name: "Folder Utama" }]);
    }
  }, []);

  useEffect(() => {
    if (gasUrl) {
      fetchDatabase(); // Load index vektor saat start
    }
  }, [gasUrl]);

  const displayed = faceDescriptor ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-10 text-center">Gunakan Generator Link.</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-48 font-sans select-none">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadRef} />

      {/* HEADER */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-md shadow-sm z-40 p-4 border-b">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-lg text-white">
                <Database size={20} />
             </div>
             <div>
                <h1 className="text-sm font-black text-indigo-900 uppercase tracking-tighter">Vector Gallery</h1>
                <p className="text-[10px] text-slate-400 font-bold">{faceDatabase.length} Indexed Photos</p>
             </div>
          </div>

          <div className="flex gap-2">
            {isAdminMode ? (
              <button onClick={buildDatabase} disabled={isScanning} className="bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg hover:bg-emerald-700 transition-all">
                {isScanning ? <Loader2 size={14} className="animate-spin"/> : <Cpu size={14}/>}
                SINKRONISASI AI
              </button>
            ) : (
              <button onClick={() => fileInputRef.current.click()} className="bg-indigo-600 text-white px-5 py-2 rounded-full text-xs font-black shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2">
                <Search size={14}/> CARI WAJAH
              </button>
            )}
            <button onClick={() => setIsAdminMode(!isAdminMode)} className={`p-2 rounded-full border transition-all ${isAdminMode ? 'bg-indigo-100 border-indigo-200 text-indigo-600' : 'bg-white text-slate-400'}`}>
              <Layers size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* ADMIN PANEL */}
      {isAdminMode && (
        <div className="bg-indigo-900 text-indigo-100 p-4 animate-in slide-in-from-top-4">
           <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-4">
                 <div className="flex flex-col">
                    <span className="text-[10px] font-black opacity-50">ADMIN MODE</span>
                    <span className="text-xs">Database Vektor dikelola secara lokal sebelum disimpan.</span>
                 </div>
              </div>
              <button onClick={() => fetchData(currentFolder.id)} className="p-2 hover:bg-white/10 rounded-lg">
                 <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
           </div>
        </div>
      )}

      {/* GRID */}
      <main className="max-w-7xl mx-auto p-4">
        {history.length > 1 && (
          <button onClick={() => setHistory(h => h.slice(0, -1))} className="mb-4 flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600">
            <ChevronLeft size={14}/> Kembali
          </button>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {displayed.map(f => (
            <div key={f.id} className={`aspect-square rounded-xl overflow-hidden relative border-2 transition-all ${matches.includes(f.id) ? 'border-indigo-500 scale-95 shadow-xl shadow-indigo-100' : 'border-transparent opacity-90 hover:opacity-100'}`}>
              <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" />
              {matches.includes(f.id) && (
                <div className="absolute top-1 right-1 bg-indigo-500 text-white p-1 rounded-full shadow-lg">
                  <CheckCircle2 size={10} />
                </div>
              )}
              {faceDatabase.find(d => d.fileId === f.id) && (
                <div className="absolute bottom-1 left-1 bg-white/80 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-black text-indigo-600">INDEXED</div>
              )}
            </div>
          ))}
        </div>

        {displayed.length === 0 && !loading && (
          <div className="py-20 text-center opacity-20">
             <User size={64} className="mx-auto mb-4" />
             <p className="font-black italic uppercase">No Data Found</p>
          </div>
        )}
      </main>

      {/* PROGRESS OVERLAY */}
      {isScanning && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-6 shadow-2xl z-50 rounded-t-[30px]">
           <div className="max-w-xl mx-auto">
              <div className="flex justify-between items-end mb-2">
                 <span className="text-[10px] font-black text-indigo-600 uppercase">Ekstraksi Biometrik...</span>
                 <span className="text-2xl font-black text-indigo-900">{progress}%</span>
              </div>
              <div className="h-3 bg-indigo-50 rounded-full overflow-hidden border border-indigo-100">
                 <div className="h-full bg-indigo-600 transition-all duration-500" style={{width: `${progress}%`}} />
              </div>
              <button onClick={() => stopRef.current = true} className="mt-4 w-full py-3 bg-red-50 text-red-600 text-xs font-black rounded-xl border border-red-100 uppercase">Hentikan Sinkronisasi</button>
           </div>
        </div>
      )}

      {/* LOG TERMINAL */}
      <div className="fixed bottom-8 left-8 right-8 pointer-events-none z-30">
        <div className="max-w-md ml-auto pointer-events-auto">
           <div className="bg-slate-900/95 text-indigo-300 p-4 rounded-2xl h-40 overflow-y-auto font-mono text-[9px] shadow-2xl backdrop-blur-md border border-white/10">
              <div className="flex justify-between border-b border-white/5 pb-2 mb-2">
                 <span className="text-indigo-400 font-bold uppercase tracking-widest">System Monitor</span>
                 <Terminal size={12}/>
              </div>
              {logs.map((l, i) => <div key={i} className={l.includes('MATCH') ? 'text-white bg-indigo-600/50 px-1 rounded' : ''}>{l}</div>)}
           </div>
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex items-center justify-center">
           <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      )}
    </div>
  );
}
