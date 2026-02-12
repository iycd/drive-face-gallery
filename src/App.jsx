import React, { useState, useEffect, useRef } from 'react';
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
  StopCircle
} from 'lucide-react';

// ==========================================
// PENTING: LIBRARY WAJAH
// Pastikan index.html Anda memuat script face-api.js
// <script src="https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js"></script>
// ==========================================

// --- HELPER COMPONENTS ---

const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    // Load model saat kamera dibuka
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
      // 1. Ambil gambar dari video
      const videoEl = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0);
      
      // 2. Deteksi wajah user (Descriptor)
      // Menggunakan TinyFaceDetector agar cepat
      const detection = await faceapi.detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks()
                                     .withFaceDescriptor();

      if (detection) {
        const dataUrl = canvas.toDataURL('image/jpeg');
        onCapture(dataUrl, detection.descriptor);
      } else {
        alert("Wajah tidak terdeteksi dengan jelas. Coba lagi.");
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

// --- MAIN GALLERY ---
const DriveGalleryApp = ({ driveFiles, isLoading, onRefresh }) => {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  
  // AI STATE
  const [userDescriptor, setUserDescriptor] = useState(null);
  const [capturedFaceImg, setCapturedFaceImg] = useState(null);
  const [matches, setMatches] = useState([]);
  
  // SCANNING STATE
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanIndex, setScanIndex] = useState(0);
  
  // Referensi agar bisa stop loop
  const stopScanRef = useRef(false);

  // --- LOGIC PEMINDAIAN PROGRESIF (THE MAGIC) ---
  const startScanning = async (startIdx = 0) => {
    if (!userDescriptor || startIdx >= driveFiles.length) {
      setIsScanning(false);
      return;
    }

    setIsScanning(true);
    stopScanRef.current = false;

    // Kita gunakan FaceMatcher dengan toleransi 0.5 (makin kecil makin ketat)
    const faceMatcher = new faceapi.FaceMatcher(userDescriptor, 0.5);

    // Loop satu per satu (atau batch kecil)
    for (let i = startIdx; i < driveFiles.length; i++) {
      if (stopScanRef.current) break;

      setScanIndex(i);
      setScanProgress(Math.round(((i + 1) / driveFiles.length) * 100));

      const file = driveFiles[i];
      
      try {
        // 1. Load gambar thumbnail (kecil saja agar cepat)
        // Kita butuh CORS 'anonymous' agar canvas tidak tainted
        const img = await faceapi.fetchImage(file.thumbnail, { mode: 'cors' });
        
        // 2. Deteksi wajah di foto tersebut
        const detections = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
                                        .withFaceLandmarks()
                                        .withFaceDescriptors();

        // 3. Bandingkan dengan wajah user
        let isMatch = false;
        for (const d of detections) {
           const match = faceMatcher.findBestMatch(d.descriptor);
           if (match.label !== 'unknown') {
             isMatch = true;
             break;
           }
        }

        if (isMatch) {
          setMatches(prev => [...prev, file.id]);
        }

      } catch (err) {
        console.warn(`Gagal scan foto ${file.name}`, err);
        // Lanjut ke foto berikutnya meski error
      }
      
      // Jeda sangat singkat agar UI tidak freeze (penting!)
      await new Promise(r => setTimeout(r, 10));
    }

    setIsScanning(false);
  };

  const handleStopScan = () => {
    stopScanRef.current = true;
    setIsScanning(false);
  };

  const handleCapture = (imgUrl, descriptor) => {
    setCapturedFaceImg(imgUrl);
    setUserDescriptor(descriptor);
    setMatches([]); // Reset hasil sebelumnya
    setIsCameraOpen(false);
    
    // Mulai scan otomatis dari awal
    setTimeout(() => {
      startScanning(0);
    }, 500);
  };

  const resetSearch = () => {
    handleStopScan();
    setCapturedFaceImg(null);
    setUserDescriptor(null);
    setMatches([]);
    setScanProgress(0);
    setScanIndex(0);
  };

  // Tentukan foto mana yang ditampilkan
  // Jika ada descriptor (sedang/sudah search), tampilkan matches.
  // Jika tidak, tampilkan semua.
  const displayedFiles = userDescriptor 
    ? driveFiles.filter(f => matches.includes(f.id))
    : driveFiles;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-24">
      {isCameraOpen && (
        <CameraModal 
          isOpen={isCameraOpen} 
          onClose={() => setIsCameraOpen(false)} 
          onCapture={handleCapture}
        />
      )}

      {/* Navbar & Control Panel */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 py-3 max-w-7xl mx-auto flex items-center justify-between">
           <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <FolderOpen className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-gray-700 hidden sm:inline">Drive Gallery</span>
          </div>
          
          <div className="flex-1 flex justify-center px-4">
             {capturedFaceImg ? (
               <div className="flex items-center bg-gray-100 rounded-full p-1 pr-4 border border-gray-300 shadow-sm w-full max-w-md">
                  <img src={capturedFaceImg} className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm" />
                  
                  <div className="flex-1 ml-3">
                     <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-bold text-gray-600 uppercase">
                          {isScanning ? 'Memindai...' : 'Selesai'}
                        </span>
                        <span className="text-xs text-gray-500">{scanIndex} / {driveFiles.length}</span>
                     </div>
                     {/* Progress Bar */}
                     <div className="w-full bg-gray-300 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-300 ${isScanning ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} 
                          style={{width: `${scanProgress}%`}}
                        ></div>
                     </div>
                  </div>

                  <div className="ml-3 flex gap-1">
                    {isScanning ? (
                      <button onClick={handleStopScan} className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200"><Pause className="w-4 h-4"/></button>
                    ) : (
                       scanIndex < driveFiles.length && scanIndex > 0 ? (
                         <button onClick={() => startScanning(scanIndex)} className="p-2 bg-blue-100 text-blue-600 rounded-full hover:bg-blue-200"><Play className="w-4 h-4"/></button>
                       ) : null
                    )}
                    <button onClick={resetSearch} className="p-2 bg-gray-200 text-gray-600 rounded-full hover:bg-gray-300"><X className="w-4 h-4"/></button>
                  </div>
               </div>
             ) : (
                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-all shadow-md active:scale-95"
                >
                  <Camera className="w-5 h-5" />
                  <span className="font-medium">Cari Wajah</span>
                </button>
             )}
          </div>

          <button onClick={onRefresh} className="p-2 hover:bg-gray-100 rounded-full text-gray-500" title="Refresh">
             <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Main Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64">
             <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
             <p className="text-gray-500">Memuat {driveFiles.length > 0 ? 'lagi...' : 'ribuan foto...'}</p>
          </div>
        ) : (
          <>
             <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="font-semibold text-gray-700 flex items-center gap-2">
                   {userDescriptor ? <Search className="w-4 h-4"/> : <ImageIcon className="w-4 h-4"/>}
                   {userDescriptor ? `Ditemukan: ${displayedFiles.length}` : `Galeri (${driveFiles.length} foto)`}
                </h2>
             </div>

             {displayedFiles.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                   <p className="text-gray-500">
                     {userDescriptor 
                        ? (isScanning ? "Sedang mencari..." : "Wajah tidak ditemukan di foto yang sudah dipindai.") 
                        : "Tidak ada foto."}
                   </p>
                </div>
             ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                   {displayedFiles.map(file => (
                      <div 
                        key={file.id} 
                        onClick={() => setSelectedPhoto(file)}
                        className="group relative aspect-square bg-gray-200 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      >
                         <img 
                           src={file.thumbnail} 
                           alt={file.name} 
                           className="w-full h-full object-cover"
                           loading="lazy"
                           // CrossOrigin penting untuk FaceAPI
                           crossOrigin="anonymous" 
                         />
                         {/* Indikator Match */}
                         {userDescriptor && (
                            <div className="absolute top-1 right-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-sm font-bold">
                               MATCH
                            </div>
                         )}
                      </div>
                   ))}
                </div>
             )}
          </>
        )}
      </main>

       {/* Lightbox */}
       {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
          <button 
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <img 
             src={selectedPhoto.full} 
             alt={selectedPhoto.name}
             className="max-h-[85vh] object-contain rounded shadow-lg"
          />
          <a 
             href={selectedPhoto.downloadUrl}
             target="_blank"
             className="absolute bottom-8 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-medium flex items-center gap-2 shadow-xl"
          >
             <Download className="w-5 h-5" /> Download HD
          </a>
        </div>
      )}
    </div>
  );
};

// --- ENTRY POINT ---
export default function App() {
  const [driveFiles, setDriveFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gasUrl, setGasUrl] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let url = params.get('api');
    if(url && !url.startsWith('http')) {
       try { url = atob(url); } catch(e){}
    }
    const saved = localStorage.getItem('gas_app_url');
    const finalUrl = url || saved;
    
    if(finalUrl) {
       setGasUrl(finalUrl);
       localStorage.setItem('gas_app_url', finalUrl);
    }
  }, []);

  useEffect(() => {
    if(gasUrl) fetchData(gasUrl);
  }, [gasUrl]);

  const fetchData = async (url) => {
    setLoading(true);
    try {
      const res = await fetch(url);
      const data = await res.json();
      if(Array.isArray(data)) setDriveFiles(data);
    } catch(e) {
      console.error(e);
      alert("Gagal mengambil data foto. Cek link script.");
    } finally {
      setLoading(false);
    }
  };

  if(!gasUrl) return <div className="p-10 text-center">Silakan gunakan Link Generator untuk memasukkan URL Script.</div>;

  return <DriveGalleryApp driveFiles={driveFiles} isLoading={loading} onRefresh={() => fetchData(gasUrl)}/>;
}
