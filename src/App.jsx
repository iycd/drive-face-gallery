import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Download, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  FolderOpen,
  Camera,
  Search,
  RefreshCw,
  Play,
  Pause,
  Square,
  CheckSquare,
  AlertCircle,
  ChevronLeft,
  Folder as FolderIcon,
  CheckCircle2
} from 'lucide-react';

// ==========================================
// UTILITY: LOAD FACE API SCRIPT AUTOMATICALLY
// ==========================================
const loadFaceApiScript = () => {
  return new Promise((resolve) => {
    if (window.faceapi || document.getElementById('face-api-script')) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = 'face-api-script';
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => {
      console.error("Gagal memuat face-api.js otomatis");
      resolve(); 
    };
    document.head.appendChild(script);
  });
};

// ==========================================
// CUSTOM HOOK: LONG PRESS
// ==========================================
const useLongPress = (callback = () => {}, ms = 500) => {
  const [startLongPress, setStartLongPress] = useState(false);

  useEffect(() => {
    let timerId;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    } else {
      clearTimeout(timerId);
    }
    return () => clearTimeout(timerId);
  }, [callback, ms, startLongPress]);

  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

// ==========================================
// CAMERA MODAL (DIPERBAIKI DENGAN TIMEOUT)
// ==========================================
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isTimeOut, setIsTimeOut] = useState(false);

  // 1. Load Model AI
  useEffect(() => {
    let isMounted = true;
    const loadModels = async () => {
       try {
         await loadFaceApiScript();

         if (!window.faceapi) {
            if(isMounted) setErrorMsg("Gagal memuat library AI.");
            return;
         }

         const MODEL_URL = 'https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights';
         
         await Promise.all([
           window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
         ]);
         
         if(isMounted) setModelLoaded(true);
       } catch (e) {
         console.error("Gagal load model AI", e);
         if(isMounted) setErrorMsg("Koneksi lambat, AI gagal dimuat.");
       }
    };
    
    if (isOpen) {
      loadModels();
      // Set timeout 15 detik jika AI macet
      const timeoutId = setTimeout(() => {
        if(isMounted && !modelLoaded) setIsTimeOut(true);
      }, 15000);
      return () => clearTimeout(timeoutId);
    }
    
    return () => { isMounted = false; };
  }, [isOpen]);

  // 2. Start Camera
  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setCameraReady(true);
            videoRef.current.play().catch(e => console.error("Play error:", e));
          };
        }
      } catch (err) {
        setErrorMsg("Izin kamera ditolak.");
      }
    };

    if (isOpen) startCamera();

    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isOpen]);

  const handleCapture = async () => {
    if (!videoRef.current || !cameraReady) return;

    const videoEl = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    
    if (modelLoaded && window.faceapi) {
      try {
        const detection = await window.faceapi.detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions())
                                       .withFaceLandmarks()
                                       .withFaceDescriptor();

        if (detection) {
          const dataUrl = canvas.toDataURL('image/jpeg');
          onCapture(dataUrl, detection.descriptor);
        } else {
          alert("Wajah tidak terdeteksi. Posisikan wajah di tengah.");
        }
      } catch (err) {
        alert("Terjadi kesalahan deteksi.");
      }
    } else {
      alert("AI belum siap.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-0 sm:p-4">
      <div className="bg-black sm:bg-white w-full h-full sm:h-auto sm:max-w-lg sm:rounded-xl flex flex-col relative overflow-hidden">
        
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          
          {errorMsg && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white p-6 text-center bg-black/90">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4"/>
              <p className="mb-6">{errorMsg}</p>
              <button onClick={onClose} className="px-6 py-2 bg-gray-700 rounded-full hover:bg-gray-600">Tutup</button>
            </div>
          )}

          {/* Video Feed */}
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-500 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Loading Overlay */}
          {cameraReady && !modelLoaded && !errorMsg && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-black/60 px-4 py-2 rounded-full text-white text-xs flex items-center gap-2 backdrop-blur-md border border-white/10 shadow-lg z-10">
               <Loader2 className="w-3 h-3 animate-spin"/> 
               {isTimeOut ? "Koneksi lambat..." : "Menyiapkan AI..."}
            </div>
          )}

          <div className="absolute inset-0 m-[15%] border-2 border-dashed border-white/40 rounded-full pointer-events-none"></div>
          
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/40 text-white p-2 rounded-full hover:bg-black/60 backdrop-blur-md z-30">
            <X className="w-6 h-6"/>
          </button>
        </div>

        <div className="p-6 bg-black sm:bg-white flex justify-center border-t border-gray-800 sm:border-gray-100">
          <button 
            onClick={handleCapture}
            className={`w-16 h-16 rounded-full border-[5px] flex items-center justify-center transition-all ${
              modelLoaded 
                ? 'border-blue-500 bg-white hover:bg-gray-100 active:scale-95' 
                : 'border-gray-500 bg-gray-800 cursor-not-allowed opacity-50'
            }`}
            disabled={!modelLoaded}
          >
            <div className={`w-14 h-14 rounded-full border-2 border-black/10 ${modelLoaded ? 'bg-transparent' : ''}`}></div>
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN APP LOGIC
// ==========================================
const DriveGalleryApp = ({ gasUrl }) => {
  const [currentFiles, setCurrentFiles] = useState([]);
  const [subFolders, setSubFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // FIX: INISIALISASI FOLDER DARI URL
  // Jika gasUrl mengandung folderId, gunakan itu sebagai 'Home'
  const [folderHistory, setFolderHistory] = useState(() => {
    try {
      const urlObj = new URL(gasUrl);
      const initialId = urlObj.searchParams.get('folderId');
      // Jika ada folderId spesifik dan bukan 'root', jadikan folder awal
      if (initialId && initialId !== 'root') {
        return [{ id: initialId, name: 'Folder Utama' }];
      }
    } catch(e) {}
    return [{ id: 'root', name: 'Home' }];
  });

  const currentFolder = folderHistory[folderHistory.length - 1];

  // Selection
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // AI & Search
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [userDescriptor, setUserDescriptor] = useState(null);
  const [capturedFaceImg, setCapturedFaceImg] = useState(null);
  const [matches, setMatches] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanIndex, setScanIndex] = useState(0);
  const stopScanRef = useRef(false);

  // FETCH DATA
  const fetchData = useCallback(async (folderId) => {
    setIsLoading(true);
    try {
      const urlObj = new URL(gasUrl);
      // Selalu update parameter folderId dengan yang sedang aktif
      urlObj.searchParams.set('folderId', folderId);
      
      const res = await fetch(urlObj.toString());
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Respon server salah (HTML). Cek deployment GAS.");
      }

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      if (data.files) setCurrentFiles(data.files);
      if (data.folders) setSubFolders(data.folders);
      else setSubFolders([]);

      resetSearch();
    } catch (e) {
      console.error(e);
      alert("Gagal memuat: " + e.message);
    } finally {
      setIsLoading(false);
    }
  }, [gasUrl]);

  useEffect(() => {
    fetchData(currentFolder.id);
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, [currentFolder, fetchData]);

  // SCANNING LOGIC
  const startScanning = async (startIdx = 0) => {
    if (!userDescriptor || startIdx >= currentFiles.length) {
      setIsScanning(false);
      return;
    }
    if (!window.faceapi) await loadFaceApiScript();

    setIsScanning(true);
    stopScanRef.current = false;
    const faceMatcher = new window.faceapi.FaceMatcher(userDescriptor, 0.5);

    for (let i = startIdx; i < currentFiles.length; i++) {
      if (stopScanRef.current) break;
      setScanIndex(i);
      setScanProgress(Math.round(((i + 1) / currentFiles.length) * 100));
      const file = currentFiles[i];
      try {
        const img = await window.faceapi.fetchImage(file.thumbnail, { mode: 'cors' });
        const detections = await window.faceapi.detectAllFaces(img, new window.faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks().withFaceDescriptors();
        let isMatch = false;
        for (const d of detections) {
           const match = faceMatcher.findBestMatch(d.descriptor);
           if (match.label !== 'unknown') { isMatch = true; break; }
        }
        if (isMatch) setMatches(prev => [...prev, file.id]);
      } catch (err) { /* ignore */ }
      await new Promise(r => setTimeout(r, 10));
    }
    setIsScanning(false);
  };

  const handleCapture = (imgUrl, descriptor) => {
    setCapturedFaceImg(imgUrl);
    setUserDescriptor(descriptor);
    setMatches([]);
    setIsCameraOpen(false);
    setTimeout(() => startScanning(0), 500);
  };

  const resetSearch = () => {
    stopScanRef.current = true;
    setIsScanning(false);
    setCapturedFaceImg(null);
    setUserDescriptor(null);
    setMatches([]);
    setScanProgress(0);
    setScanIndex(0);
  };

  // ACTIONS
  const handleNavigate = (folderId, folderName) => {
    setFolderHistory(prev => [...prev, { id: folderId, name: folderName }]);
  };
  const handleBack = () => {
    if (folderHistory.length > 1) setFolderHistory(prev => prev.slice(0, -1));
  };
  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const handleLongPress = (id) => {
    if (!isSelectionMode) { setIsSelectionMode(true); setSelectedIds([id]); if (navigator.vibrate) navigator.vibrate(50); }
  };
  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    alert(`Mendownload ${selectedIds.length} item...`);
    selectedIds.forEach((id, index) => {
      const file = currentFiles.find(f => f.id === id);
      if (file) setTimeout(() => window.open(file.downloadUrl, '_blank'), index * 800);
    });
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const displayedFiles = userDescriptor ? currentFiles.filter(f => matches.includes(f.id)) : currentFiles;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans select-none">
      {isCameraOpen && <CameraModal isOpen={true} onClose={() => setIsCameraOpen(false)} onCapture={handleCapture} />}

      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            {folderHistory.length > 1 && (
              <button onClick={handleBack} className="p-1 rounded-full hover:bg-gray-100"><ChevronLeft className="w-6 h-6 text-gray-600" /></button>
            )}
            <h1 className="text-lg font-bold text-gray-800 truncate mr-2">{currentFolder.name}</h1>
          </div>
          <div className="flex gap-2 items-center">
             {!capturedFaceImg && (
                <>
                  <button onClick={() => setIsCameraOpen(true)} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200"><Camera className="w-5 h-5" /></button>
                  <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`p-2 rounded-full ${isSelectionMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                </>
             )}
             <button onClick={() => fetchData(currentFolder.id)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {capturedFaceImg && (
           <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex items-center gap-3">
              <img src={capturedFaceImg} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
              <div className="flex-1">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-blue-700 uppercase">{isScanning ? 'Memindai...' : `Selesai (${matches.length})`}</span>
                    <span className="text-xs text-blue-600">{scanIndex}/{currentFiles.length}</span>
                 </div>
                 <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${isScanning ? 'bg-blue-600 animate-pulse' : 'bg-green-500'}`} style={{width: `${scanProgress}%`}}></div>
                 </div>
              </div>
              <button onClick={() => { stopScanRef.current = true; setIsScanning(false); }} className="p-1.5 bg-red-100 text-red-600 rounded-full"><Pause className="w-4 h-4"/></button>
              <button onClick={resetSearch} className="p-1.5 bg-gray-200 text-gray-600 rounded-full"><X className="w-4 h-4"/></button>
           </div>
        )}

        {subFolders.length > 0 && !capturedFaceImg && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide bg-gray-50 border-b border-gray-200">
            {subFolders.map(folder => (
              <button key={folder.id} onClick={() => handleNavigate(folder.id, folder.name)} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:text-blue-600 hover:border-blue-300 shadow-sm whitespace-nowrap transition-all">
                <FolderIcon className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" /> {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isSelectionMode && !capturedFaceImg && (
        <div className="sticky top-[110px] z-30 bg-blue-600 text-white px-4 py-2 flex justify-between items-center text-sm font-medium shadow-md">
          <span>{selectedIds.length} foto</span>
          <button onClick={() => {setIsSelectionMode(false); setSelectedIds([]);}} className="text-blue-100 underline">Batal</button>
        </div>
      )}

      <main className="p-2 sm:p-4">
        {isLoading && currentFiles.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mb-2" /><p>Memuat...</p></div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1 sm:gap-3">
            {displayedFiles.map((file) => (
              <GridItem 
                key={file.id} 
                file={file} 
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.includes(file.id)}
                onLongPress={() => handleLongPress(file.id)}
                onClick={() => { if(isSelectionMode) toggleSelect(file.id); else window.open(file.full, '_blank'); }}
                isMatch={userDescriptor && matches.includes(file.id)}
              />
            ))}
          </div>
        )}
        {!isLoading && displayedFiles.length === 0 && <div className="text-center py-20 text-gray-400">Kosong.</div>}
      </main>

      {isSelectionMode && selectedIds.length > 0 && (
        <button onClick={handleBatchDownload} className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 z-50">
          <Download className="w-7 h-7" />
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">{selectedIds.length}</span>
        </button>
      )}
    </div>
  );
};

const GridItem = ({ file, isSelectionMode, isSelected, onLongPress, onClick, isMatch }) => {
  const longPressProps = useLongPress(onLongPress, 500);
  return (
    <div className={`relative aspect-square bg-gray-200 overflow-hidden cursor-pointer transition-all duration-200 ${isSelected ? 'p-2' : ''}`} {...longPressProps} onClick={onClick}>
      <div className={`w-full h-full relative rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
        <img src={file.thumbnail} alt={file.name} className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" />
        {isSelectionMode && (
          <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-black/20' : 'bg-transparent'}`}>
            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-white bg-black/20'}`}>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
        {isMatch && <div className="absolute bottom-2 right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm font-bold animate-pulse">MATCH</div>}
      </div>
    </div>
  );
};

export default function App() {
  const [gasUrl, setGasUrl] = useState('');
  useEffect(() => {
    loadFaceApiScript();
    const params = new URLSearchParams(window.location.search);
    let url = params.get('api');
    if(url && !url.startsWith('http')) { try { url = atob(url); } catch(e){} }
    const saved = localStorage.getItem('gas_app_url');
    if(url || saved) setGasUrl(url || saved);
  }, []);
  if(!gasUrl) return <div className="p-10 text-center">Gunakan Generator Link.</div>;
  return <DriveGalleryApp gasUrl={gasUrl} />;
}
