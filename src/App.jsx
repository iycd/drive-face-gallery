import React, { useState, useEffect, useCallback } from "react";
import { Search, Loader2, User, RefreshCw, Database } from "lucide-react";

export default function App() {
  const [gasUrl, setGasUrl] = useState("");
  const [files, setFiles] = useState([]);
  const [faceDB, setFaceDB] = useState([]); // Database Biometrik Pre-built
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // 1. Ambil URL dan Database Biometrik
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
      // Load Foto & Database Biometrik secara paralel
      const [resFiles, resDB] = await Promise.all([
        fetch(url).then(r => r.json()),
        fetch(`${url}?action=getDB`).then(r => r.json())
      ]);
      setFiles(resFiles.files || []);
      setFaceDB(resDB || []);
    } catch (e) { console.error("Init Error", e); }
    setLoading(false);
  };

  // 2. Pencarian Instan (O(n) Matematika Murni)
  const searchFace = async (e) => {
    const file = e.target.files[0];
    if (!file || faceDB.length === 0) return;

    setIsSearching(true);
    try {
      // Load AI hanya saat user mau mencari wajah pertama kali
      if (!window.faceapi) {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js";
        document.head.appendChild(s);
        await new Promise(r => s.onload = r);
        const MODEL_URL = "https://justadudewhohacks.github.io/face-api.js/models";
        await Promise.all([
          window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
      }

      const img = await window.faceapi.bufferToImage(file);
      const detection = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

      if (!detection) return alert("Wajah tidak jelas.");

      const matcher = new window.faceapi.FaceMatcher(detection.descriptor, 0.6);
      const results = [];

      // PROSES MATEMATIKA INSTAN
      faceDB.forEach(entry => {
        const isMatch = entry.faces.some(faceVec => 
          matcher.findBestMatch(new Float32Array(faceVec)).label !== "unknown"
        );
        if (isMatch) results.push(entry.fileId);
      });

      setMatches(results);
    } catch (e) { alert("Error AI"); }
    setIsSearching(false);
  };

  const displayed = matches.length > 0 ? files.filter(f => matches.includes(f.id)) : files;

  if (!gasUrl) return <div className="p-10 text-center">Gunakan Generator Link.</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="sticky top-0 bg-white p-4 shadow-sm flex justify-between items-center z-50">
        <div className="flex items-center gap-2">
           <Database className="text-indigo-600" size={20}/>
           <b className="text-sm">AI BIOMETRIC GALLERY</b>
        </div>
        <div className="flex gap-2">
          <label className="bg-indigo-600 text-white px-4 py-2 rounded-full text-xs font-black cursor-pointer hover:bg-indigo-700 transition-all flex items-center gap-2">
            <Search size={14}/> {isSearching ? "MENCARI..." : "CARI WAJAH"}
            <input type="file" className="hidden" onChange={searchFace} accept="image/*" />
          </label>
          <button onClick={() => setMatches([])} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-red-500">
            <RefreshCw size={16}/>
          </button>
        </div>
      </header>

      <main className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {displayed.map(f => (
          <div key={f.id} className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${matches.includes(f.id) ? 'border-green-500 scale-105 shadow-xl' : 'border-transparent'}`}>
            <img src={f.thumbnail} className="w-full h-full object-cover" />
          </div>
        ))}
      </main>

      {loading && (
        <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-[60]">
          <Loader2 className="animate-spin text-indigo-600" size={32}/>
        </div>
      )}
    </div>
  );
}
