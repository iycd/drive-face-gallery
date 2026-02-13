import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Loader2, RefreshCw, Database, Camera, X, 
  CheckCircle2, User, Upload, Image as ImageIcon, ScanFace
} from "lucide-react";

/* ==========================================
   AI LOADER
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
   CAMERA MODAL
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

    const interval = setInterval(async () => {
      if (videoRef.current && ready) {
        const det = await window.faceapi.detectSingleFace(videoRef.current, new window.faceapi.TinyFaceDetectorOptions());
        setIsFaceInFrame(!!det);
      }
    }, 500);

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
    else alert("Wajah tidak terdeteksi.");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] overflow-hidden max-w-sm w-full shadow-2xl relative border-8 border-white">
        <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-square object-cover scale-x-[-1] bg-slate-900" />
        <div className={`absolute inset-10 border-[6px] border-dashed rounded-full transition-all duration-500 ${isFaceInFrame ? 'border-green-500 scale-105' : 'border-white/20'}`} />
        <div className="p-6 flex justify-between items-center bg-white">
          <button onClick={onClose} className="p-3 bg-slate-100 rounded-full"><X size={20}/></button>
          <button onClick={capture} disabled={!ready} className={`w-16 h-16 rounded-full border-4 flex items-center justify-center ${ready && isFaceInFrame ? 'border-indigo-600 shadow-xl active:scale-90' : 'border-slate-100'}`}>
            {ready ? <div className={`w-12 h-12 rounded-full ${isFaceInFrame ? 'bg-indigo-600' : 'bg-slate-200'}`}/> : <Loader2 className="animate-spin text-indigo-600"/>}
          </button>
          <div className="w-10" />
        </div>
      </div>
    </div>
  );
};

/* ==========================================
   APP COMPONENT
========================================== */
export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [faceDB, setFaceDB] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let api = params.get("api");
    if(api && !api.startsWith("http")) try { api = atob(api); } catch(e){}
    const finalUrl = api || localStorage.getItem("gas_app_url");
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

  const processSearch = (descriptor) => {
    if (!faceDB.length) return alert("Database biometrik belum ada. Lakukan sinkronisasi terlebih dahulu.");
    setSearching(true);
    const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
    const results = [];
    faceDB.forEach(entry => {
      const isMatch = entry.faces.some(vec => 
        matcher.findBestMatch(new Float32Array(vec)).label !== "unknown"
      );
      if (isMatch) results.push(entry.fileId);
    });
    setMatches(results);
    setSearching(false);
    setCamOpen(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSearching(true);
    try {
      await initModels();
      const img = await window.faceapi.bufferToImage(file);
      const det = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
      if (det) processSearch(det.descriptor);
      else alert("Wajah tidak terdeteksi.");
    } catch (e) { alert("Error AI"); }
    setSearching(false);
  };

  const displayed = matches.length > 0 ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-20 text-center font-black italic opacity-20">LINK TIDAK VALID.</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <CameraModal isOpen={camOpen} onClose={() => setCamOpen(false)} onCapture={processSearch} />

      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b p-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><Database size={20}/></div>
          <div className="hidden sm:block">
            <h1 className="text-xs font-black uppercase text-indigo-900">Biometric Gallery</h1>
            <p className="text-[9px] font-bold text-slate-400">{faceDB.length} Indexed</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCamOpen(true)} className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full"><Camera size={20}/></button>
          <label className="p-2.5 bg-indigo-50 text-indigo-600 rounded-full cursor-pointer">
            <ImageIcon size={20}/><input type="file" className="hidden" onChange={handleUpload} accept="image/*" />
          </label>
          {matches.length > 0 && <button onClick={() => setMatches([])} className="p-2.5 bg-red-50 text-red-500 rounded-full"><RefreshCw size={18}/></button>}
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {displayed.map(f => (
          <div key={f.id} onClick={() => window.open(f.full, "_blank")} className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${matches.includes(f.id) ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-transparent opacity-95'}`}>
            <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" />
          </div>
        ))}
      </main>

      {(loading || searching) && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center z-[110]">
          <Loader2 className="animate-spin text-indigo-600 mb-4" size={40}/>
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">{searching ? 'MENCARI...' : 'MEMUAT...'}</span>
        </div>
      )}
    </div>
  );
}
