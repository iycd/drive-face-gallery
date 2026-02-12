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
  Link as IconLink,
  CheckCircle2,
  Folder as FolderIcon,
  ChevronLeft,
  Play,
  Pause,
  StopCircle,
  Square,
  CheckSquare
} from 'lucide-react';

// ==========================================
// PENTING: Pastikan index.html memuat script face-api.js
// <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
// ==========================================

// --- CUSTOM HOOK: LONG PRESS ---
const useLongPress = (callback = () => {}, ms = 500) => {
  const [startLongPress, setStartLongPress] = useState(false);

  useEffect(() => {
    let timerId;
    if (startLongPress) {
      timerId = setTimeout(callback, ms);
    } else {
      clearTimeout(timerId);
    }

    return () => {
      clearTimeout(timerId);
    };
  }, [callback, ms, startLongPress]);

  return {
    onMouseDown: () => setStartLongPress(true),
    onMouseUp: () => setStartLongPress(false),
    onMouseLeave: () => setStartLongPress(false),
    onTouchStart: () => setStartLongPress(true),
    onTouchEnd: () => setStartLongPress(false),
  };
};

// --- HELPER COMPONENT: CAMERA MODAL (DIPULIHKAN) ---
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    const loadModels = async () => {
       try {
         const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
         await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
         await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
         await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
         setModelLoaded(true);
       } catch (e) {
         console.error("Gagal load model AI", e);
       }
    };
    loadModels();
  }, []);

  useEffect(() => {
    let stream = null;
    if (isOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = stream;
        });
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isOpen]);

  const handleCapture = async () => {
    if (videoRef.current && modelLoaded) {
      const videoEl = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0);
      
      try {
        const detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
                                       .withFaceLandmarks()
                                       .withFaceDescriptor();

        if (detection) {
          const dataUrl = canvas.toDataURL('image/jpeg');
          onCapture(dataUrl, detection.descriptor);
        } else {
          alert("Wajah tidak terdeteksi. Pastikan pencahayaan cukup.");
        }
      } catch (err) {
        console.error(err);
        alert("Error deteksi wajah. Pastikan library face-api dimuat.");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl overflow-hidden max-w-lg w-full flex flex-col shadow-2xl">
        <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
          {!modelLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white gap-2">
               <Loader2 className="animate-spin"/> Menyiapkan AI...
            </div>
          )}
          <div className="absolute inset-0 m-12 border-2 border-dashed border-white/50 rounded-full pointer-events-none"></div>
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-4 flex justify-center bg-white border-t">
          <button 
            onClick={handleCapture}
            disabled={!modelLoaded}
            className={`w-16 h-16 border-4 rounded-full flex items-center justify-center transition-all shadow-lg ${modelLoaded ? 'bg-white border-blue-600 hover:bg-blue-50 active:scale-95' : 'bg-gray-200 border-gray-300 cursor-not-allowed'}`}
          >
            <div className={`w-12 h-12 rounded-full ${modelLoaded ? 'bg-blue-600' : 'bg-gray-400'}`}></div>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN GALLERY COMPONENT ---
const DriveGalleryApp = ({ gasUrl }) => {
  const [currentFiles, setCurrentFiles] = useState([]);
  const [subFolders, setSubFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Folder Navigation State
  const [folderHistory, setFolderHistory] = useState([{ id: 'root', name: 'Home' }]);
  const currentFolder = folderHistory[folderHistory.length - 1];

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Face Search State (DIPULIHKAN)
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [userDescriptor, setUserDescriptor] = useState(null);
  const [capturedFaceImg, setCapturedFaceImg] = useState(null);
  const [matches, setMatches] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanIndex, setScanIndex] = useState(0);
  
  const stopScanRef = useRef(false);

  // --- LOGIC FETCH DATA (PERBAIKAN URL) ---
  const fetchData = useCallback(async (folderId) => {
    setIsLoading(true);
    try {
      // PERBAIKAN: Gunakan URL Object agar parameter folderId tertimpa dengan benar
      // Jika gasUrl sudah mengandung ?folderId=root, kita harus menggantinya, bukan menambah di belakang
      const urlObj = new URL(gasUrl);
      urlObj.searchParams.set('folderId', folderId);
      
      const res = await fetch(urlObj.toString());
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      if (data.files) setCurrentFiles(data.files);
      if (data.folders) setSubFolders(data.folders);
      else setSubFolders([]);

      // Reset Search saat pindah folder
      resetSearch();

    } catch (e) {
      console.error(e);
      alert("Gagal memuat data. Pastikan URL Script benar.");
    } finally {
      setIsLoading(false);
    }
  }, [gasUrl]);

  useEffect(() => {
    fetchData(currentFolder.id);
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, [currentFolder, fetchData]);

  // --- LOGIC FACE SCANNING ---
  const startScanning = async (startIdx = 0) => {
    if (!userDescriptor || startIdx >= currentFiles.length) {
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    stopScanRef.current = false;
    const faceMatcher = new faceapi.FaceMatcher(userDescriptor, 0.5);

    for (let i = startIdx; i < currentFiles.length; i++) {
      if (stopScanRef.current) break;

      setScanIndex(i);
      setScanProgress(Math.round(((i + 1) / currentFiles.length) * 100));
      const file = currentFiles[i];
      
      try {
        const img = await faceapi.fetchImage(file.thumbnail, { mode: 'cors' });
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks()
                                        .withFaceDescriptors();

        let isMatch = false;
        for (const d of detections) {
           const match = faceMatcher.findBestMatch(d.descriptor);
           if (match.label !== 'unknown') {
             isMatch = true;
             break;
           }
        }
        if (isMatch) setMatches(prev => [...prev, file.id]);
      } catch (err) {
        // Ignore error
      }
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

  const handleStopScan = () => {
    stopScanRef.current = true;
    setIsScanning(false);
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

  // --- LOGIC UI & INTERAKSI ---

  const handleNavigate = (folderId, folderName) => {
    setFolderHistory(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const handleBack = () => {
    if (folderHistory.length > 1) {
      setFolderHistory(prev => prev.slice(0, -1));
    }
  };

  const handleLongPress = (id) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedIds([id]);
      if (navigator.vibrate) navigator.vibrate(50); 
    }
  };

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      const newIds = selectedIds.filter(itemId => itemId !== id);
      setSelectedIds(newIds);
      if (newIds.length === 0) setIsSelectionMode(false);
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const handleItemClick = (file) => {
    if (isSelectionMode) {
      toggleSelect(file.id);
    } else {
      window.open(file.full, '_blank');
    }
  };

  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    alert(`Mendownload ${selectedIds.length} item...`);
    selectedIds.forEach((id, index) => {
      const file = currentFiles.find(f => f.id === id);
      if (file) {
        setTimeout(() => window.open(file.downloadUrl, '_blank'), index * 800);
      }
    });
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  // Filter tampilan berdasarkan hasil search (jika ada)
  const displayedFiles = userDescriptor 
    ? currentFiles.filter(f => matches.includes(f.id))
    : currentFiles;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans select-none">
      
      {isCameraOpen && (
        <CameraModal 
          isOpen={isCameraOpen} 
          onClose={() => setIsCameraOpen(false)} 
          onCapture={handleCapture} 
        />
      )}

      {/* NAVBAR */}
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2 overflow-hidden flex-1">
            {folderHistory.length > 1 && (
              <button onClick={handleBack} className="p-1 rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-800 truncate mr-2">
              {currentFolder.name}
            </h1>
          </div>
          
          {/* Action Buttons di Navbar */}
          <div className="flex gap-2 items-center">
             {!capturedFaceImg && (
                <>
                  <button 
                    onClick={() => setIsCameraOpen(true)}
                    className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200"
                    title="Cari Wajah"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                    className={`p-2 rounded-full ${isSelectionMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                    title="Mode Pilih"
                  >
                    {isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  </button>
                </>
             )}
             <button onClick={() => fetchData(currentFolder.id)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
               <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>

        {/* STATUS BAR PENCARIAN (Muncul saat ada hasil scan) */}
        {capturedFaceImg && (
           <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 flex items-center gap-3">
              <img src={capturedFaceImg} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
              <div className="flex-1">
                 <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-blue-700 uppercase">
                      {isScanning ? 'Memindai...' : `Selesai (${matches.length} hasil)`}
                    </span>
                    <span className="text-xs text-blue-600">{scanIndex} / {currentFiles.length}</span>
                 </div>
                 <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${isScanning ? 'bg-blue-600 animate-pulse' : 'bg-green-500'}`} 
                      style={{width: `${scanProgress}%`}}
                    ></div>
                 </div>
              </div>
              <div className="flex gap-1">
                 {isScanning ? (
                    <button onClick={handleStopScan} className="p-1.5 bg-red-100 text-red-600 rounded-full"><Pause className="w-4 h-4"/></button>
                 ) : (
                    scanIndex < currentFiles.length && scanIndex > 0 && 
                    <button onClick={() => startScanning(scanIndex)} className="p-1.5 bg-blue-100 text-blue-600 rounded-full"><Play className="w-4 h-4"/></button>
                 )}
                 <button onClick={resetSearch} className="p-1.5 bg-gray-200 text-gray-600 rounded-full"><X className="w-4 h-4"/></button>
              </div>
           </div>
        )}

        {/* TAB SUB-FOLDER */}
        {subFolders.length > 0 && !capturedFaceImg && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide bg-gray-50 border-b border-gray-200">
            {subFolders.map(folder => (
              <button
                key={folder.id}
                onClick={() => handleNavigate(folder.id, folder.name)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:text-blue-600 hover:border-blue-300 shadow-sm whitespace-nowrap transition-all"
              >
                <FolderIcon className="w-3.5 h-3.5 fill-yellow-400 text-yellow-500" />
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SELECTION BAR INFO */}
      {isSelectionMode && !capturedFaceImg && (
        <div className="sticky top-[110px] z-30 bg-blue-600 text-white px-4 py-2 flex justify-between items-center text-sm font-medium shadow-md animate-in slide-in-from-top-2">
          <span>{selectedIds.length} foto dipilih</span>
          <button onClick={() => setIsSelectionMode(false)} className="text-blue-100 hover:text-white underline">Batal</button>
        </div>
      )}

      {/* MAIN GRID */}
      <main className="p-2 sm:p-4">
        {isLoading && currentFiles.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p>Memuat galeri...</p>
          </div>
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
          <div className="text-center py-20 text-gray-400">
            {userDescriptor ? "Wajah tidak ditemukan di folder ini." : "Folder ini kosong."}
          </div>
        )}
      </main>

      {/* FLOATING DOWNLOAD BUTTON */}
      {isSelectionMode && selectedIds.length > 0 && (
        <button
          onClick={handleBatchDownload}
          className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl flex items-center justify-center transition-all transform hover:scale-110 active:scale-95 z-50"
          title="Download Terpilih"
        >
          <Download className="w-7 h-7" />
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-white">
            {selectedIds.length}
          </span>
        </button>
      )}
    </div>
  );
};

// --- GRID ITEM ---
const GridItem = ({ file, isSelectionMode, isSelected, onLongPress, onClick, isMatch }) => {
  const longPressProps = useLongPress(onLongPress, 500);

  return (
    <div 
      className={`relative aspect-square bg-gray-200 overflow-hidden cursor-pointer transition-all duration-200 ${
        isSelected ? 'p-2' : '' 
      }`}
      {...longPressProps}
      onClick={onClick}
    >
      <div className={`w-full h-full relative rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
        <img 
          src={file.thumbnail} 
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
          crossOrigin="anonymous" // PENTING UNTUK FACE API
          referrerPolicy="no-referrer"
        />
        
        {/* Overlay Selection */}
        {isSelectionMode && (
          <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-black/20' : 'bg-transparent'}`}>
            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
              isSelected ? 'bg-blue-500 border-blue-500' : 'border-white bg-black/20'
            }`}>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}

        {/* Indikator Match AI */}
        {isMatch && (
           <div className="absolute bottom-2 right-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm font-bold animate-pulse">
              MATCH
           </div>
        )}
      </div>
    </div>
  );
};

// --- APP ENTRY ---
export default function App() {
  const [gasUrl, setGasUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let url = params.get('api');
    if(url && !url.startsWith('http')) {
       try { url = atob(url); } catch(e){}
    }
    const saved = localStorage.getItem('gas_app_url');
    if(url || saved) setGasUrl(url || saved);
  }, []);

  if(!gasUrl) return <div className="p-10 text-center">Gunakan Generator Link.</div>;

  return <DriveGalleryApp gasUrl={gasUrl} />;
}
