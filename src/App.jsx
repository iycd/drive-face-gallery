import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Loader2, RefreshCw, Database, Camera, X, 
  CheckCircle2, User, Upload, Image as ImageIcon, ScanFace
} from "lucide-react";

/* ==========================================
   1. GLOBAL AI LOADER
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

/* ==========================================
   2. CAMERA MODAL COMPONENT
========================================== */
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [isFaceInFrame, setIsFaceInFrame] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    initModels().then(() => setReady(true));
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      .then(s => { if (videoRef.current) videoRef.current.srcObject = s; });

    // Loop feedback wajah
    const interval = setInterval(async () => {
      if (videoRef.current && ready) {
        const det = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
        setIsFaceInFrame(!!det);
      }
    }, 400);

    return () => {
      clearInterval(interval);
      if (videoRef.current?.srcObject) 
        videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };
  }, [isOpen, ready]);

  const capture = async () => {
    const det = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor();
    if (det) onCapture(det.descriptor);
    else alert("Wajah tidak terdeteksi jelas.");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] overflow-hidden max-w-sm w-full shadow-2xl relative border-8 border-white">
        <div className="relative aspect-square bg-slate-900">
           <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
           <div className={`absolute inset-0 border-[6px] border-dashed m-12 rounded-full transition-all duration-500 ${isFaceInFrame ? 'border-green-500 rotate-12 scale-105' : 'border-white/20'}`} />
           <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/40 text-white rounded-full"><X size={20}/></button>
           <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/50 px-4 py-1.5 rounded-full text-white text-[9px] font-black uppercase tracking-widest">
              {isFaceInFrame ? 'Siap Ambil' : 'Posisikan Wajah'}
           </div>
        </div>
        <div className="p-6 flex justify-center bg-white">
           <button onClick={capture} disabled={!ready} className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all ${isFaceInFrame ? 'border-indigo-600 bg-indigo-50 shadow-xl' : 'border-slate-100 bg-slate-50'}`}>
              {ready ? <div className={`w-12 h-12 rounded-full ${isFaceInFrame ? 'bg-indigo-600' : 'bg-slate-200'}`}/> : <Loader2 className="animate-spin text-indigo-600"/>}
           </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================
   3. MAIN APPLICATION
========================================== */
export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [faceDB, setFaceDB] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

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

  // Logika Pencarian Vektor Super Cepat
  const searchInDB = (descriptor) => {
    setIsSearching(true);
    const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
    const results = [];
    faceDB.forEach(entry => {
      const isMatch = entry.faces.some(vec => 
        matcher.findBestMatch(new Float32Array(vec)).label !== "unknown"
      );
      if (isMatch) results.push(entry.fileId);
    });
    setMatches(results);
    setIsSearching(false);
    setCamOpen(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsSearching(true);
    try {
      await initModels();
      const img = await window.faceapi.bufferToImage(file);
      const det = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
      if (det) searchInDB(det.descriptor);
      else alert("Wajah tidak ditemukan di foto upload.");
    } catch (e) { alert("Error memproses gambar."); }
    setIsSearching(false);
  };

  const displayed = matches.length > 0 ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-20 text-center font-black italic opacity-20">LINK TIDAK VALID.</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans select-none">
      <CameraModal isOpen={camOpen} onClose={() => setCamOpen(false)} onCapture={searchInDB} />

      {/* MODERN NAVBAR */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200 p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                <Database size={18} />
             </div>
             <div className="hidden sm:block">
                <h1 className="text-xs font-black uppercase tracking-tighter text-indigo-900">Vector Gallery</h1>
                <p className="text-[9px] font-bold text-slate-400">{faceDB.length} Foto Terindeks</p>
             </div>
          </div>

          <div className="flex items-center gap-2">
             <button onClick={() => setCamOpen(true)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all">
                <Camera size={20}/>
             </button>
             <label className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all cursor-pointer">
                <ImageIcon size={20}/>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*" />
             </label>
             {matches.length > 0 && (
                <button onClick={() => setMatches([])} className="p-2.5 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-all">
                   <RefreshCw size={18}/>
                </button>
             )}
          </div>
        </div>
      </header>

      {/* FEEDBACK STATUS */}
      {matches.length > 0 && (
         <div className="max-w-7xl mx-auto px-4 mt-6">
            <div className="bg-indigo-900 text-white p-4 rounded-3xl flex items-center justify-between shadow-2xl shadow-indigo-200 animate-in slide-in-from-top-4">
               <div className="flex items-center gap-3 px-2">
                  <ScanFace className="text-indigo-400" />
                  <span className="text-xs font-black uppercase tracking-widest">Ditemukan {matches.length} Foto</span>
               </div>
               <button onClick={() => setMatches([])} className="bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                  Tampilkan Semua
               </button>
            </div>
         </div>
      )}

      {/* GRID */}
      <main className="max-w-7xl mx-auto p-4 md:p-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-4">
          {displayed.map(f => (
            <div key={f.id} onClick={() => window.open(f.full, "_blank")} className={`group aspect-square rounded-[1.5rem] overflow-hidden border-2 transition-all cursor-pointer hover:scale-95 active:scale-90 ${matches.includes(f.id) ? 'border-indigo-500 ring-4 ring-indigo-50 shadow-2xl' : 'border-transparent opacity-95 hover:opacity-100 shadow-sm'}`}>
              <img src={f.thumbnail} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-125" loading="lazy" />
              {matches.includes(f.id) && (
                <div className="absolute top-2 right-2 bg-indigo-500 text-white p-1 rounded-full shadow-lg border-2 border-white animate-bounce">
                  <CheckCircle2 size={10} />
                </div>
              )}
            </div>
          ))}
        </div>

        {displayed.length === 0 && !loading && (
          <div className="py-40 text-center flex flex-col items-center opacity-10">
             <User size={80} className="mb-4" />
             <p className="font-black text-xs uppercase tracking-[0.5em]">No Data Found</p>
          </div>
        )}
      </main>

      {/* LOADING OVERLAYS */}
      {(loading || isSearching) && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center z-[110] animate-in fade-in">
           <div className="w-16 h-16 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6">
              <Loader2 className="animate-spin text-indigo-600" size={32}/>
           </div>
           <span className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.4em]">{isSearching ? 'Membandingkan Vektor...' : 'Menghubungkan Drive...'}</span>
        </div>
      )}
    </div>
  );
}
