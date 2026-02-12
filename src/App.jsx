import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Download, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  FolderOpen,
  Camera,
  Upload, 
  Search,
  RefreshCw,
  Play,
  Pause,
  Square,
  CheckSquare,
  AlertCircle,
  ChevronLeft,
  Folder as FolderIcon,
  CheckCircle2,
  User,
  Zap,
  ScanFace,
  Terminal // Icon baru untuk Log
} from 'lucide-react';

// ==========================================
// UTILITY: LOAD FACE API
// ==========================================
const loadFaceApiScript = () => {
  return new Promise((resolve) => {
    if (window.faceapi) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => { console.error("Gagal memuat face-api.js"); resolve(); };
    document.head.appendChild(script);
  });
};

// ==========================================
// HELPER: LONG PRESS
// ==========================================
const useLongPress = (callback = () => {}, ms = 500) => {
  const [startLongPress, setStartLongPress] = useState(false);
  useEffect(() => {
    let timerId;
    if (startLongPress) timerId = setTimeout(callback, ms);
    else clearTimeout(timerId);
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
// COMPONENT: CAMERA MODAL (REAL-TIME SCANNING)
// ==========================================
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. Load Model
  useEffect(() => {
    const loadModels = async () => {
       try {
         await loadFaceApiScript();
         const MODEL_URL = 'https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights';
         await Promise.all([
           window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
         ]);
         setModelLoaded(true);
       } catch (e) { setErrorMsg("Gagal memuat AI. Cek koneksi internet."); }
    };
    if (isOpen) loadModels();
  }, [isOpen]);

  // 2. Start Camera
  useEffect(() => {
    let stream = null;
    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setCameraReady(true);
            videoRef.current.play().catch(e => console.error(e));
          };
        }
      } catch (err) { setErrorMsg("Izin kamera ditolak."); }
    };
    if (isOpen) startCamera();
    return () => { if (stream) stream.getTracks().forEach(track => track.stop()); };
  }, [isOpen]);

  // 3. Real-time Detection Loop
  useEffect(() => {
    let interval;
    
    if (cameraReady && modelLoaded && videoRef.current) {
      interval = setInterval(async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        // Opsi deteksi ringan untuk preview real-time
        const options = new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
        const result = await window.faceapi.detectSingleFace(videoRef.current, options);

        if (result) {
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      }, 500); 
    }
    return () => clearInterval(interval);
  }, [cameraReady, modelLoaded]);

  const handleCapture = async () => {
    if (!videoRef.current || !cameraReady || !modelLoaded) return;
    
    setIsProcessing(true);
    const videoEl = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);
    
    try {
      // Gunakan resolusi lebih tinggi untuk capture akhir
      const detection = await window.faceapi.detectSingleFace(canvas, new window.faceapi.TinyFaceDetectorOptions({ inputSize: 512 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
        
      if (detection) {
        onCapture(canvas.toDataURL('image/jpeg'), detection.descriptor);
      } else {
        alert("Wajah hilang saat dijepret. Coba tahan posisi wajah.");
        setIsProcessing(false);
      }
    } catch (err) { 
      alert("Error proses AI.");
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-0 sm:p-4">
      <div className="bg-black sm:bg-white w-full h-full sm:h-auto sm:max-w-lg sm:rounded-xl flex flex-col relative overflow-hidden">
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
          {errorMsg && <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white bg-black/90 p-4">{errorMsg}<button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-700 rounded-full">Tutup</button></div>}
          
          <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transform -scale-x-100 ${cameraReady ? 'opacity-100' : 'opacity-0'}`} />
          
          {cameraReady && !modelLoaded && !errorMsg && (
            <div className="absolute top-4 bg-black/60 px-4 py-2 rounded-full text-white text-xs backdrop-blur-md z-10 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin"/> Menyiapkan AI...
            </div>
          )}

          {modelLoaded && (
             <div className={`absolute top-4 px-4 py-2 rounded-full text-white text-xs backdrop-blur-md z-10 font-bold flex items-center gap-2 transition-all ${faceDetected ? 'bg-green-500/80' : 'bg-red-500/60'}`}>
                {faceDetected ? <CheckCircle2 className="w-4 h-4"/> : <ScanFace className="w-4 h-4"/>}
                {faceDetected ? "WAJAH TERDETEKSI" : "POSISIKAN WAJAH"}
             </div>
          )}

          <div className={`absolute inset-0 m-[15%] border-4 border-dashed rounded-[30px] pointer-events-none transition-colors duration-300 ${faceDetected ? 'border-green-400' : 'border-white/30'}`}></div>
          
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/40 text-white p-2 rounded-full z-30"><X className="w-6 h-6"/></button>
        </div>
        
        <div className="p-6 bg-black sm:bg-white flex justify-center border-t border-gray-800 sm:border-gray-100">
          <button 
            onClick={handleCapture} 
            disabled={!modelLoaded || isProcessing} 
            className={`w-16 h-16 rounded-full border-[5px] flex items-center justify-center transition-all ${
              faceDetected 
                ? 'border-green-500 bg-white scale-110 shadow-green-500/50 shadow-lg cursor-pointer' 
                : 'border-gray-600 bg-gray-800 opacity-70 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
               <Loader2 className="w-8 h-8 text-blue-500 animate-spin"/>
            ) : (
               <div className={`w-14 h-14 rounded-full border-2 ${faceDetected ? 'border-green-500 bg-green-50' : 'border-gray-500 bg-gray-900'}`}></div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN LOGIC
// ==========================================
const DriveGalleryApp = ({ gasUrl }) => {
  // Data State
  const [currentFiles, setCurrentFiles] = useState([]);
  const [subFolders, setSubFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [folderHistory, setFolderHistory] = useState(() => {
    try {
      const urlObj = new URL(gasUrl);
      const initialId = urlObj.searchParams.get('folderId');
      if (initialId && initialId !== 'root') return [{ id: initialId, name: 'Folder Utama' }];
    } catch(e) {}
    return [{ id: 'root', name: 'Home' }];
  });
  const currentFolder = folderHistory[folderHistory.length - 1];

  // Selection
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // AI & Scanning
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [userDescriptor, setUserDescriptor] = useState(null);
  const [capturedFaceImg, setCapturedFaceImg] = useState(null);
  const [matches, setMatches] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  
  // LOGGING SYSTEM
  const [scanLogs, setScanLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(true);
  
  const stopScanRef = useRef(false);
  const fileInputRef = useRef(null);

  // --- LOGGING HELPER ---
  const addLog = (message, type = 'info') => {
    setScanLogs(prev => {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return [`[${time}] ${message}`, ...prev].slice(0, 100); // Simpan 100 log terakhir
    });
  };

  // --- FETCH DATA ---
  const fetchData = useCallback(async (folderId) => {
    setIsLoading(true);
    addLog(`Mengambil data folder...`, 'info');
    try {
      const urlObj = new URL(gasUrl);
      urlObj.searchParams.set('folderId', folderId);
      
      const res = await fetch(urlObj.toString());
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      if (data.files) setCurrentFiles(data.files);
      if (data.folders) setSubFolders(data.folders);
      else setSubFolders([]);

      addLog(`Berhasil memuat ${data.files?.length || 0} file.`, 'success');
      resetSearch();
    } catch (e) {
      addLog(`Error Fetch: ${e.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [gasUrl]);

  useEffect(() => {
    fetchData(currentFolder.id);
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, [currentFolder, fetchData]);

  // --- TURBO SCANNING LOGIC ---
  const startScanning = async () => {
    if (!userDescriptor || currentFiles.length === 0) return;
    
    if (!window.faceapi) await loadFaceApiScript();

    setIsScanning(true);
    setScanLogs([]); // Reset log saat mulai scan baru
    addLog("Memulai pemindaian wajah...", 'info');
    stopScanRef.current = false;
    
    // Tweak Toleransi: 0.5 cukup ketat, 0.6 lebih longgar (lebih banyak hasil)
    const faceMatcher = new window.faceapi.FaceMatcher(userDescriptor, 0.55);
    const BATCH_SIZE = 3; 
    let processed = 0;

    for (let i = 0; i < currentFiles.length; i += BATCH_SIZE) {
      if (stopScanRef.current) {
        addLog("Pemindaian dihentikan pengguna.", 'warning');
        break;
      }

      const batch = currentFiles.slice(i, i + BATCH_SIZE);
      
      await Promise.all(batch.map(async (file) => {
        try {
          // SOLUSI UTAMA: Menggunakan Proxy 'wsrv.nl'
          // Ini jauh lebih stabil daripada corsproxy.io dan tidak diblokir browser
          const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(file.thumbnail)}`;
          
          const img = await window.faceapi.fetchImage(proxyUrl);
          const detections = await window.faceapi.detectAllFaces(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();

          let isMatch = false;
          for (const d of detections) {
             const match = faceMatcher.findBestMatch(d.descriptor);
             if (match.label !== 'unknown') { isMatch = true; break; }
          }

          if (isMatch) {
            setMatches(prev => [...prev, file.id]);
            addLog(`MATCH DITEMUKAN: ${file.name}`, 'success');
          }
        } catch (err) {
          addLog(`Gagal memindai ${file.name}: ${err.message || 'Error AI'}`, 'error');
        }
      }));

      processed += batch.length;
      setScanCount(processed);
      setScanProgress(Math.round((processed / currentFiles.length) * 100));
      await new Promise(r => setTimeout(r, 50));
    }
    
    setIsScanning(false);
    addLog(`Selesai. Total ${matches.length} wajah cocok ditemukan.`, 'info');
  };

  // --- HANDLERS ---
  const handleCapture = (imgUrl, descriptor) => {
    setCapturedFaceImg(imgUrl);
    setUserDescriptor(descriptor);
    setMatches([]);
    setIsCameraOpen(false);
    addLog("Wajah referensi ditangkap. Memulai scan...", 'info');
    setTimeout(startScanning, 500);
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const tempUrl = URL.createObjectURL(file);
    setCapturedFaceImg(tempUrl);
    setIsScanning(true);
    addLog("Mengupload foto referensi...", 'info');

    try {
      await loadFaceApiScript();
      const MODEL_URL = 'https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights';
      await Promise.all([
           window.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
           window.faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);

      const img = await window.faceapi.bufferToImage(file);
      const detection = await window.faceapi.detectSingleFace(img, new window.faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
      
      if (detection) {
        setUserDescriptor(detection.descriptor);
        setMatches([]);
        addLog("Wajah referensi valid. Memulai scan...", 'success');
        setTimeout(startScanning, 500);
      } else {
        alert("Wajah tidak ditemukan di foto upload.");
        addLog("Gagal: Wajah tidak terdeteksi di foto upload.", 'error');
        resetSearch();
      }
    } catch (err) {
      addLog(`Gagal memproses foto: ${err.message}`, 'error');
      resetSearch();
    }
  };

  const resetSearch = () => {
    stopScanRef.current = true;
    setIsScanning(false);
    setCapturedFaceImg(null);
    setUserDescriptor(null);
    setMatches([]);
    setScanProgress(0);
    setScanCount(0);
  };

  // --- NAVIGATION ---
  const handleNavigate = (folderId, folderName) => setFolderHistory(prev => [...prev, { id: folderId, name: folderName }]);
  const handleBack = () => folderHistory.length > 1 && setFolderHistory(prev => prev.slice(0, -1));
  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const handleLongPress = (id) => { if (!isSelectionMode) { setIsSelectionMode(true); setSelectedIds([id]); if (navigator.vibrate) navigator.vibrate(50); }};
  const handleItemClick = (file) => isSelectionMode ? toggleSelect(file.id) : window.open(file.full, '_blank');
  
  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    alert(`Mendownload ${selectedIds.length} item...`);
    selectedIds.forEach((id, index) => {
      const file = currentFiles.find(f => f.id === id);
      if (file) setTimeout(() => window.open(file.downloadUrl, '_blank'), index * 500);
    });
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const displayedFiles = userDescriptor ? currentFiles.filter(f => matches.includes(f.id)) : currentFiles;

  return (
    <div className="min-h-screen bg-gray-50 pb-40 font-sans select-none relative">
      {isCameraOpen && <CameraModal isOpen={true} onClose={() => setIsCameraOpen(false)} onCapture={handleCapture} />}
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleUploadPhoto} />

      {/* HEADER & CONTROLS */}
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
                  <button onClick={() => fileInputRef.current.click()} className="p-2 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200" title="Upload Foto"><Upload className="w-5 h-5" /></button>
                  <button onClick={() => setIsCameraOpen(true)} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200" title="Kamera"><Camera className="w-5 h-5" /></button>
                  <button onClick={() => setIsSelectionMode(!isSelectionMode)} className={`p-2 rounded-full ${isSelectionMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}</button>
                </>
             )}
             <button onClick={() => fetchData(currentFolder.id)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {capturedFaceImg && (
           <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-3">
              <div className="relative">
                <img src={capturedFaceImg} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm" />
                {isScanning && <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-1 border border-white"><Zap className="w-3 h-3 text-white fill-white"/></div>}
              </div>
              <div className="flex-1">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-blue-700 uppercase">{isScanning ? 'Memindai...' : `Selesai (${matches.length})`}</span>
                    <span className="text-xs text-blue-600">{scanCount} / {currentFiles.length}</span>
                 </div>
                 <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${isScanning ? 'bg-blue-600' : 'bg-green-500'}`} style={{width: `${scanProgress}%`}}></div>
                 </div>
              </div>
              <div className="flex gap-1">
                 {isScanning ? (
                    <button onClick={() => { stopScanRef.current = true; setIsScanning(false); }} className="p-2 bg-red-100 text-red-600 rounded-full"><Pause className="w-4 h-4"/></button>
                 ) : (
                    scanCount < currentFiles.length && scanCount > 0 && 
                    <button onClick={startScanning} className="p-2 bg-blue-100 text-blue-600 rounded-full"><Play className="w-4 h-4"/></button>
                 )}
                 <button onClick={resetSearch} className="p-2 bg-gray-200 text-gray-600 rounded-full"><X className="w-4 h-4"/></button>
              </div>
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
          <span>{selectedIds.length} foto dipilih</span>
          <button onClick={() => {setIsSelectionMode(false); setSelectedIds([]);}} className="text-blue-100 underline">Batal</button>
        </div>
      )}

      {/* GRID FILES */}
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
                onClick={() => handleItemClick(file)}
                isMatch={userDescriptor && matches.includes(file.id)}
              />
            ))}
          </div>
        )}
        {!isLoading && displayedFiles.length === 0 && (
          <div className="text-center py-20 text-gray-400 flex flex-col items-center">
             <User className="w-12 h-12 text-gray-300 mb-2"/>
             <p>{userDescriptor ? "Wajah tidak ditemukan di folder ini." : "Folder ini kosong."}</p>
          </div>
        )}
      </main>

      {/* FLOATING ACTION BUTTONS */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
         {/* Toggle Log Button */}
         <button 
            onClick={() => setShowLogs(!showLogs)} 
            className="w-12 h-12 bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-700 transition-all"
            title="Toggle Log"
         >
            <Terminal className="w-5 h-5"/>
         </button>

         {/* Batch Download Button */}
         {isSelectionMode && selectedIds.length > 0 && (
          <button onClick={handleBatchDownload} className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95">
            <Download className="w-7 h-7" />
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">{selectedIds.length}</span>
          </button>
        )}
      </div>

      {/* SCAN LOG PANEL */}
      {showLogs && (scanLogs.length > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 text-gray-300 p-0 h-40 z-40 border-t border-gray-700 backdrop-blur-sm transition-transform duration-300 ease-in-out font-mono text-xs flex flex-col shadow-2xl">
           <div className="flex justify-between items-center px-4 py-2 bg-black/40 border-b border-gray-700">
              <span className="font-bold text-gray-400 flex items-center gap-2">
                 <Terminal className="w-3 h-3"/> Log Aktivitas ({scanLogs.length})
              </span>
              <button onClick={() => setScanLogs([])} className="text-xs hover:text-white px-2 py-1 bg-gray-800 rounded">Bersihkan</button>
           </div>
           <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {scanLogs.length === 0 && <p className="text-gray-600 italic">Belum ada aktivitas.</p>}
              {scanLogs.map((log, idx) => (
                 <div key={idx} className={`break-words ${log.includes('MATCH') ? 'text-green-400 font-bold bg-green-900/20 p-1 rounded' : log.includes('Error') ? 'text-red-400 bg-red-900/20 p-1 rounded' : ''}`}>
                    {log}
                 </div>
              ))}
           </div>
        </div>
      )}

    </div>
  );
};

const GridItem = ({ file, isSelectionMode, isSelected, onLongPress, onClick, isMatch }) => {
  const longPressProps = useLongPress(onLongPress, 500);
  return (
    <div className={`relative aspect-square bg-gray-200 overflow-hidden cursor-pointer transition-all duration-200 ${isSelected ? 'p-2' : ''}`} {...longPressProps} onClick={onClick}>
      <div className={`w-full h-full relative rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-blue-500' : ''} ${isMatch ? 'ring-4 ring-green-500' : ''}`}>
        <img src={file.thumbnail} alt={file.name} className="w-full h-full object-cover" loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" />
        {isSelectionMode && (
          <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-black/20' : 'bg-transparent'}`}>
            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-white bg-black/20'}`}>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
        {isMatch && <div className="absolute bottom-0 inset-x-0 bg-green-500/90 text-white text-[10px] py-1 text-center font-bold">MATCH</div>}
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
