import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Search, 
  Loader2, 
  User, 
  RefreshCw, 
  Database, 
  Camera, 
  X, 
  ScanFace, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";

/* ==========================================
   1. GLOBAL AI LOADER (SINGLETON)
========================================== */
const loadFaceApiScript = () =>
  new Promise((resolve) => {
    if (window.faceapi) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    document.head.appendChild(s);
  });

let modelsLoaded = false;
async function loadModelsOnce() {
  if (modelsLoaded) return;
  await loadFaceApiScript();
  const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoaded = true;
}

/* ==========================================
   2. COMPONENT: CAMERA MODAL
========================================== */
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadModelsOnce().then(() => setIsReady(true));
      startCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Gagal mengakses kamera: " + err.message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  // Loop deteksi wajah sederhana untuk feedback visual
  useEffect(() => {
    let interval;
    if (isReady && isOpen) {
      interval = setInterval(async () => {
        if (videoRef.current && !isProcessing) {
          const det = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
          setFaceDetected(!!det);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isReady, isOpen, isProcessing]);

  const handleCapture = async () => {
    if (!videoRef.current || isProcessing) return;
    setIsProcessing(true);
    try {
      const detection = await window.faceapi
        .detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        onCapture(detection.descriptor);
      } else {
        alert("Wajah tidak terdeteksi. Posisikan wajah di tengah.");
      }
    } catch (e) {
      alert("Gagal memproses gambar kamera.");
    }
    setIsProcessing(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl overflow-hidden max-w-md w-full shadow-2xl relative">
        <div className="relative aspect-square bg-slate-200 overflow-hidden">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          
          <div className={`absolute inset-0 border-4 border-dashed m-12 rounded-full transition-colors duration-500 ${faceDetected ? 'border-green-500' : 'border-white/30'}`} />
          
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-1.5 rounded-full text-white text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
            {isReady ? (faceDetected ? "Siap Ambil" : "Cari Wajah...") : "Menyiapkan AI..."}
          </div>

          <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/50 text-white rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex justify-center bg-white">
          <button 
            onClick={handleCapture}
            disabled={!faceDetected || isProcessing}
            className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${faceDetected ? 'border-indigo-600 bg-indigo-50 active:scale-90 shadow-lg' : 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-50'}`}
          >
            {isProcessing ? <Loader2 className="animate-spin text-indigo-600" /> : <div className="w-12 h-12 rounded-full bg-indigo-600" />}
          </button>
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
  const [isSearching, setIsSearching] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [aiReady, setAiReady] = useState(false);

  // 1. Inisialisasi URL & Database
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

    // Preload AI di latar belakang
    loadModelsOnce().then(() => setAiReady(true));
  }, []);

  const initApp = async (url) => {
    setLoading(true);
    try {
      const [resFiles, resDB] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${url}?action=getDB`).then(r => r.json())
      ]);
      setFiles(resFiles.files || []);
      setFaceDB(resDB || []);
    } catch (e) {
      console.error("Init Error", e);
    }
    setLoading(false);
  };

  // 2. Logika Pencarian Vektor (Perbaikan Krusial)
  const processMatch = async (descriptor) => {
    if (faceDB.length === 0) return alert("Database biometrik belum tersedia.");
    
    setIsSearching(true);
    try {
      const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
      const results = [];

      faceDB.forEach(entry => {
        const isMatch = entry.faces.some(faceVec => {
          // KONVERSI WAJIB: Dari Array biasa ke Float32Array agar dikenali AI
          const floatVector = new Float32Array(faceVec);
          return matcher.findBestMatch(floatVector).label !== "unknown";
        });
        if (isMatch) results.push(entry.fileId);
      });

      setMatches(results);
      if (results.length === 0) {
        alert("Wajah tidak ditemukan di dalam galeri ini.");
      }
    } catch (e) {
      alert("Terjadi kesalahan saat mencocokkan wajah.");
    }
    setIsSearching(false);
  };

  // 3. Pencarian via Upload File
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsSearching(true);
    try {
      await loadModelsOnce();
      const img = await window.faceapi.bufferToImage(file);
      const detection = await window.faceapi
        .detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        alert("Wajah tidak terdeteksi pada foto. Gunakan foto selfie yang jelas.");
      } else {
        processMatch(detection.descriptor);
      }
    } catch (e) {
      alert("Gagal memproses file gambar.");
    }
    setIsSearching(false);
  };

  const handleCameraCapture = (descriptor) => {
    setIsCameraOpen(false);
    processMatch(descriptor);
  };

  const displayed = matches.length > 0 ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-20 text-center font-bold text-slate-400">Silakan gunakan Generator Link.</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <CameraModal 
        isOpen={isCameraOpen} 
        onClose={() => setIsCameraOpen(false)} 
        onCapture={handleCameraCapture} 
      />

      <header className="sticky top-0 bg-white/80 backdrop-blur-md p-4 shadow-sm flex justify-between items-center z-50 border-b">
        <div className="flex items-center gap-2 text-indigo-900">
           <Database size={20}/>
           <b className="text-xs uppercase tracking-widest hidden sm:block">Biometric Gallery</b>
        </div>

        <div className="flex gap-2">
          {/* Tombol Kamera */}
          <button 
            onClick={() => setIsCameraOpen(true)}
            className="p-2 bg-indigo-100 text-indigo-600 rounded-full hover:bg-indigo-200 transition-colors"
            title="Scan Kamera"
          >
            <Camera size={20} />
          </button>

          {/* Tombol Upload */}
          <label className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black cursor-pointer hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200">
            <Search size={14}/> {isSearching ? "MENCARI..." : "UPLOAD FOTO"}
            <input type="file" className="hidden" onChange={handleUpload} accept="image/*" />
          </label>

          {/* Reset */}
          <button onClick={() => setMatches([])} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors">
            <RefreshCw size={18}/>
          </button>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        {matches.length > 0 && (
          <div className="mb-6 flex items-center gap-2 bg-green-50 border border-green-100 p-3 rounded-2xl animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <span className="text-xs font-bold text-green-700">Ditemukan {matches.length} foto yang cocok.</span>
            <button onClick={() => setMatches([])} className="ml-auto text-[10px] uppercase font-black text-green-600 hover:underline">Hapus Filter</button>
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-4">
          {displayed.map(f => (
            <div 
              key={f.id} 
              onClick={() => window.open(f.full, "_blank")}
              className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer group hover:scale-95 ${matches.includes(f.id) ? 'border-indigo-500 ring-4 ring-indigo-100 shadow-xl' : 'border-transparent opacity-90 hover:opacity-100'}`}
            >
              <img src={f.thumbnail} className="w-full h-full object-cover transition-transform group-hover:scale-110" loading="lazy" />
              {matches.includes(f.id) && (
                <div className="absolute top-2 right-2 bg-indigo-600 text-white p-1 rounded-full shadow-lg">
                  <CheckCircle2 size={10} />
                </div>
              )}
            </div>
          ))}
        </div>

        {displayed.length === 0 && !loading && (
          <div className="py-32 text-center text-slate-300 flex flex-col items-center">
             <User size={64} className="mb-4 opacity-20" />
             <p className="font-black italic uppercase text-xs tracking-widest">Wajah tidak ditemukan di folder ini.</p>
          </div>
        )}
      </main>

      {/* OVERLAYS */}
      {(loading || isSearching) && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center z-[100] animate-in fade-in">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={40}/>
          <span className="text-xs font-black text-indigo-900 uppercase tracking-[0.3em]">{isSearching ? 'Memproses Biometrik...' : 'Memuat Database...'}</span>
        </div>
      )}

      {!aiReady && (
        <div className="fixed bottom-4 left-4 bg-slate-900 text-white px-4 py-2 rounded-2xl flex items-center gap-3 shadow-2xl animate-in slide-in-from-left-4">
          <Loader2 className="animate-spin text-indigo-400" size={14} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Menyiapkan Mesin AI...</span>
        </div>
      )}
    </div>
  );
}
