import React, { useState, useRef, useEffect } from "react";
import { Search, Camera, Loader2, RefreshCw, X, Database, CheckCircle2, User } from "lucide-react";

/* ==========================================
   AI ENGINE HELPERS
========================================== */
const loadScripts = () => new Promise((res) => {
  if (window.faceapi) return res();
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
  s.crossOrigin = "anonymous";
  s.onload = res;
  document.head.appendChild(s);
});

let modelsLoaded = false;
async function initModels() {
  if (modelsLoaded) return;
  await loadScripts();
  const URL = "https://justadudewhohacks.github.io/face-api.js/models";
  await Promise.all([
    window.faceapi.nets.tinyFaceDetector.loadFromUri(URL),
    window.faceapi.nets.faceLandmark68Net.loadFromUri(URL),
    window.faceapi.nets.faceRecognitionNet.loadFromUri(URL)
  ]);
  modelsLoaded = true;
}

/* ==========================================
   MAIN APP
========================================== */
export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [faceDB, setFaceDB] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  
  const fileInput = useRef(null);

  // Load Data saat aplikasi dibuka
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let api = params.get("api");
    if(api && !api.startsWith("http")) try { api = atob(api); } catch(e){}
    const finalUrl = api || localStorage.getItem("gas_app_url");
    
    if(finalUrl) {
      setGasUrl(finalUrl);
      localStorage.setItem("gas_app_url", finalUrl);
      loadDriveData(finalUrl);
    }
  }, []);

  const loadDriveData = async (url) => {
    setLoading(true);
    try {
      const [fRes, dbRes] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${url}?action=getDB`).then(r => r.json())
      ]);
      setFiles(fRes.files || []);
      setFaceDB(dbRes || []);
    } catch (e) { console.error("Load Error", e); }
    setLoading(false);
  };

  // LOGIKA PENCARIAN (PERBAIKAN KRUSIAL)
  const runVectorSearch = (descriptor) => {
    if(!faceDB.length) return alert("Database belum disinkronisasi di Indexer.");
    
    setSearching(true);
    try {
      const matcher = new window.faceapi.FaceMatcher(descriptor, 0.6);
      const results = [];

      faceDB.forEach(entry => {
        // PERBAIKAN: Konversi array biasa ke Float32Array
        const isMatch = entry.faces.some(vec => {
          const vector = new Float32Array(vec); 
          return matcher.findBestMatch(vector).label !== "unknown";
        });
        if(isMatch) results.push(entry.fileId);
      });

      setMatches(results);
      if(results.length === 0) alert("Wajah tidak ditemukan di Galeri.");
    } catch(e) {
      alert("Terjadi kesalahan saat memproses data biometrik.");
    }
    setSearching(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if(!file) return;

    setSearching(true);
    try {
      await initModels();
      const img = await window.faceapi.bufferToImage(file);
      const det = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions())
                                      .withFaceLandmarks().withFaceDescriptor();
      if(det) runVectorSearch(det.descriptor);
      else alert("Wajah tidak terdeteksi pada foto referensi.");
    } catch(e) { alert("Error memproses gambar."); }
    setSearching(false);
  };

  const displayed = matches.length ? files.filter(f => matches.includes(f.id)) : files;

  if(!gasUrl) return <div className="p-20 text-center font-bold text-slate-400">Gunakan Generator Link.</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans select-none">
      <header className="sticky top-0 bg-white/80 backdrop-blur-md p-4 shadow-sm flex justify-between items-center z-50 border-b">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl text-white">
             <Database size={18} />
          </div>
          <b className="text-xs uppercase tracking-widest text-indigo-900 hidden sm:block">Biometric Gallery</b>
        </div>

        <div className="flex gap-2">
          <label className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black cursor-pointer hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg">
            <Search size={14}/> {searching ? "MENCARI..." : "CARI WAJAH"}
            <input ref={fileInput} type="file" className="hidden" onChange={handleUpload} accept="image/*" />
          </label>
          <button onClick={() => { setMatches([]); window.location.reload(); }} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-all">
            <RefreshCw size={18}/>
          </button>
        </div>
      </header>

      <main className="p-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {displayed.map(f => (
            <div key={f.id} onClick={() => window.open(f.full, "_blank")} className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all cursor-pointer group hover:scale-95 ${matches.includes(f.id) ? 'border-indigo-500 ring-4 ring-indigo-100 shadow-xl' : 'border-transparent opacity-90'}`}>
              <img src={f.thumbnail} className="w-full h-full object-cover" loading="lazy" />
              {matches.includes(f.id) && (
                <div className="absolute top-2 right-2 bg-indigo-600 text-white p-1 rounded-full shadow-lg">
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

      {(loading || searching) && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md flex flex-col items-center justify-center z-[100] animate-in fade-in">
           <Loader2 className="animate-spin text-indigo-600 mb-4" size={40}/>
           <span className="text-[10px] font-black text-indigo-900 uppercase tracking-[0.4em]">{searching ? 'Mencocokkan Wajah...' : 'Memuat Database...'}</span>
        </div>
      )}
    </div>
  );
}
