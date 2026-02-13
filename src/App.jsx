import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Search, Loader2, RefreshCw, Database, Camera, X, 
  CheckCircle2, AlertTriangle, Layers, Cpu, User, ChevronLeft
} from "lucide-react";

/* ==========================================
   1. GLOBAL AI LOADER & HELPERS
========================================== */
const loadFaceApi = () =>
  new Promise((resolve) => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    document.head.appendChild(s);
  });

let modelsLoaded = false;
async function initModels() {
  if (modelsLoaded) return;
  await loadFaceApi();
  const URL = "https://justadudewhohacks.github.io/face-api.js/models";
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(URL),
  ]);
  modelsLoaded = true;
}

const getAIFriendlyUrl = (file) => {
  const raw = file.full || `https://drive.google.com/uc?id=${file.id}`;
  return `https://wsrv.nl/?url=${encodeURIComponent(raw)}&w=600&output=jpg&q=80`;
};

/* ==========================================
   2. CAMERA COMPONENT
========================================== */
const CameraView = ({ onCapture, onClose }) => {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initModels().then(() => setReady(true));
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; });
    return () => {
      if (videoRef.current?.srcObject) 
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };
  }, []);

  const capture = async () => {
    const det = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
    if (det) onCapture(det.descriptor);
    else alert("Wajah tidak ditemukan.");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl overflow-hidden max-w-sm w-full relative">
        <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-square object-cover scale-x-[-1]" />
        <div className="absolute inset-0 border-4 border-dashed m-10 rounded-full border-white/30 pointer-events-none" />
        <div className="p-6 flex justify-between items-center bg-white">
          <button onClick={onClose} className="p-3 bg-slate-100 rounded-full text-slate-500"><X size={20}/></button>
          <button onClick={capture} disabled={!ready} className="w-16 h-16 bg-indigo-600 rounded-full border-4 border-indigo-100 flex items-center justify-center shadow-xl active:scale-90 transition-all">
             {ready ? <div className="w-12 h-12 rounded-full border-2 border-white/20"/> : <Loader2 className="animate-spin text-white"/>}
          </button>
          <div className="w-10" />
        </div>
      </div>
    </div>
  );
};

/* ==========================================
   3. MAIN APP
========================================== */
export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [faceDB, setFaceDB] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

  // Load Awal
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let u = p.get("api");
    if (u && !u.startsWith("http")) try { u = atob(u); } catch {}
    const finalUrl = u || localStorage.getItem("gas_app_url");
    if (finalUrl) {
      setGasUrl(finalUrl);
      localStorage.setItem("gas_app_url", finalUrl);
      initApp(finalUrl);
    }
  }, []);

  const initApp = async (url) => {
    setLoading(true);
    try {
      const [fRes, dbRes] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${url}?action=getDB`).then(r => r.json())
      ]);
      setFiles(fRes.files || []);
      setFaceDB(dbRes || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // PEMINDAIAN ADMIN (INDEXING)
  const runIndexer = async () => {
    const unindexed = files.filter(f => !faceDB.find(db => db.fileId === f.id));
    if (unindexed.length === 0) return alert("Semua foto sudah terindeks.");

    await initModels();
    setIsScanning(true);
    let newDb = [...faceDB];
    
    for (let i = 0; i < unindexed.length; i++) {
      const file = unindexed[i];
      try {
        const img = await window.faceapi.fetchImage(getAIFriendlyUrl(file));
        const dets = await window.faceapi.detectAllFaces(img, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
          .withFaceLandmarks().withFaceDescriptors();
        
        if (dets.length > 0) {
          newDb.push({
            fileId: file.id,
            faces: dets.map(d => Array.from(d.descriptor)) // Simpan sebagai array biasa
          });
        }
      } catch (e) { console.log("Skip:", file.name); }
      setProgress(Math.round(((i + 1) / unindexed.length) * 100));
    }

    await fetch(gasUrl, { method: 'POST', body: JSON.stringify({ action: "saveDB", data: newDb }) });
    setFaceDB(newDb);
    setIsScanning(false);
    alert("Sinkronisasi Selesai!");
  };

  // PENCARIAN INSTAN (VECTOR SEARCH)
  const searchInDB = (descriptor) => {
    const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
    const results = [];
    faceDB.forEach(entry => {
      const isMatch = entry.faces.some(vec => 
        matcher.findBestMatch(new Float32Array(vec)).label !== "unknown"
      );
      if (isMatch) results.push(entry.fileId);
    });
    setMatches(results);
    setCamOpen(false);
  };

  const displayed = matches.length > 0 ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-20 text-center text-slate-400 font-bold">Gunakan Generator Link.</div>;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans">
      {camOpen && <CameraView onCapture={searchInDB} onClose={() => setCamOpen(false)} />}

      <header className="sticky top-0 bg-white/80 backdrop-blur-md p-4 shadow-sm flex justify-between items-center z-50 border-b">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100">
             <Database size={18} />
          </div>
          <div>
            <h1 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest">Biometric System</h1>
            <p className="text-[9px] text-slate-400 font-bold">{faceDB.length} Photos Indexed</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setCamOpen(true)} className="p-2 bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-200 transition-colors">
            <Camera size={20} />
          </button>
          <button onClick={() => setIsAdmin(!isAdmin)} className={`p-2 rounded-full border transition-all ${isAdmin ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-400'}`}>
            <Layers size={18} />
          </button>
        </div>
      </header>

      {isAdmin && (
        <div className="bg-indigo-900 text-white p-4 animate-in slide-in-from-top-2">
           <div className="flex justify-between items-center max-w-7xl mx-auto">
              <span className="text-xs font-bold opacity-70">Admin Mode: Sinkronisasi database biometrik secara manual.</span>
              <button onClick={runIndexer} disabled={isScanning} className="bg-white text-indigo-900 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-2">
                {isScanning ? <Loader2 size={12} className="animate-spin"/> : <Cpu size={12}/>} Sinkronisasi AI
              </button>
           </div>
        </div>
      )}

      <main className="p-4 max-w-7xl mx-auto">
        {matches.length > 0 && (
          <div className="mb-4 flex items-center justify-between bg-green-50 p-3 rounded-2xl border border-green-100">
             <span className="text-xs font-bold text-green-700">Ditemukan {matches.length} foto.</span>
             <button onClick={() => setMatches([])} className="text-[10px] font-black text-green-600 uppercase hover:underline">Reset Pencarian</button>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {displayed.map(f => (
            <div key={f.id} onClick={() => window.open(f.full, "_blank")} className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer group hover:scale-95 ${matches.includes(f.id) ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-xl' : 'border-transparent opacity-90 hover:opacity-100'}`}>
              <img src={f.thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
            </div>
          ))}
        </div>

        {displayed.length === 0 && !loading && (
          <div className="py-32 text-center opacity-20">
             <User size={64} className="mx-auto mb-4" />
             <p className="font-black text-xs tracking-[0.3em] uppercase">No Matches Found</p>
          </div>
        )}
      </main>

      {isScanning && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t p-6 z-[110] shadow-2xl animate-in slide-in-from-bottom-5">
           <div className="max-w-md mx-auto">
              <div className="flex justify-between items-end mb-2">
                 <span className="text-[10px] font-black text-indigo-600 uppercase">Scanning Faces...</span>
                 <span className="text-2xl font-black text-indigo-900">{progress}%</span>
              </div>
              <div className="h-3 bg-indigo-50 rounded-full overflow-hidden border border-indigo-100">
                 <div className="h-full bg-indigo-600 transition-all duration-500" style={{width: `${progress}%`}} />
              </div>
           </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex items-center justify-center">
           <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
        </div>
      )}
    </div>
  );
}
