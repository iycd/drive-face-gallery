import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  FolderOpen,
  Camera,
  Search,
  AlertCircle,
  CheckCircle2,
  Square,
  CheckSquare,
  RefreshCw,
  Link as IconLink
} from 'lucide-react';

// ==========================================
// ARSITEKTUR BARU: GAS JSON BRIDGE
// ==========================================
// Aplikasi ini tidak lagi menggunakan Google Sign-In.
// Melainkan membaca data JSON dari Google Apps Script Web App.

// --- HELPER COMPONENTS ---

// 1. MODAL KAMERA (UI Scan Wajah)
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    let stream = null;
    if (isOpen) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(err => {
          alert("Gagal akses kamera: " + err.message);
          onClose();
        });
    }
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
    };
  }, [isOpen]);

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvasRef.current.toDataURL('image/jpeg');
      onCapture(dataUrl);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl overflow-hidden max-w-lg w-full flex flex-col shadow-2xl">
        <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute inset-0 m-12 border-2 border-dashed border-white/50 rounded-full pointer-events-none"></div>
          <div className="absolute bottom-4 text-white/80 text-xs text-center w-full">Posisikan wajah di tengah</div>
          <button onClick={onClose} className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-4 flex justify-center bg-white border-t">
          <button 
            onClick={handleCapture}
            className="w-16 h-16 bg-white border-4 border-blue-600 rounded-full flex items-center justify-center hover:bg-blue-50 transition-all active:scale-95 shadow-lg"
          >
            <div className="w-12 h-12 bg-blue-600 rounded-full"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. KOMPONEN UTAMA APLIKASI (GALLERY)
const DriveGalleryApp = ({ driveFiles, isLoading, onRefresh }) => {
  const [capturedFace, setCapturedFace] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSearchingFace, setIsSearchingFace] = useState(false);
  
  // STATE BARU UNTUK BATCH DOWNLOAD
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const handleFaceCapture = (imageUrl) => {
    setIsCameraOpen(false);
    setCapturedFace(imageUrl);
    setIsSearchingFace(true);
    // Matikan mode seleksi saat scan wajah
    setIsSelectionMode(false);
    setSelectedIds([]);

    setTimeout(() => {
      setIsSearchingFace(false);
    }, 2000);
  };

  const clearFaceSearch = () => {
    setCapturedFace(null);
  };

  const handleDownload = (e, url) => {
    if(e) e.stopPropagation();
    if (url) window.open(url, '_blank');
  };

  // --- LOGIC BATCH DOWNLOAD ---
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]); // Reset saat mode berubah
  };

  const toggleSelectPhoto = (e, photoId) => {
    e.stopPropagation();
    if (selectedIds.includes(photoId)) {
      setSelectedIds(prev => prev.filter(id => id !== photoId));
    } else {
      setSelectedIds(prev => [...prev, photoId]);
    }
  };

  const handleBatchDownload = () => {
    if (selectedIds.length === 0) return;
    
    alert(`Akan mendownload ${selectedIds.length} foto. Izinkan pop-up jika browser memblokir.`);

    // Loop download dengan delay
    selectedIds.forEach((id, index) => {
      const file = driveFiles.find(f => f.id === id);
      if (file && file.downloadUrl) {
        setTimeout(() => {
          window.open(file.downloadUrl, '_blank');
        }, index * 800); // Jeda 800ms per file
      }
    });
    
    setTimeout(() => {
      setIsSelectionMode(false);
      setSelectedIds([]);
    }, 1000);
  };

  const displayedFiles = capturedFace && !isSearchingFace 
    ? driveFiles.filter((_, i) => i % 2 === 0)
    : driveFiles;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans pb-24">
      {isCameraOpen && (
        <CameraModal 
          isOpen={isCameraOpen} 
          onClose={() => setIsCameraOpen(false)} 
          onCapture={handleFaceCapture}
        />
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <FolderOpen className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-gray-700 hidden sm:inline">Drive Gallery</span>
          </div>

          <div className="flex-1 max-w-xl flex justify-center gap-2">
            {capturedFace ? (
              <div className="flex items-center gap-3 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200 animate-in fade-in slide-in-from-top-2 shadow-sm">
                <img src={capturedFace} alt="Captured" className="w-8 h-8 rounded-full object-cover border border-blue-500" />
                <div className="flex flex-col leading-none">
                  <span className="text-[10px] text-blue-600 font-bold uppercase">Pencarian AI</span>
                  <span className="text-xs text-gray-700 font-medium">
                    {isSearchingFace ? 'Menganalisis...' : `Wajah Ditemukan`}
                  </span>
                </div>
                <button onClick={clearFaceSearch} className="ml-2 p-1 hover:bg-blue-200 rounded-full text-blue-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                 {/* Tombol Kamera */}
                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-white hover:shadow-md text-gray-600 rounded-full transition-all border border-transparent hover:border-gray-200"
                >
                  <Camera className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium hidden sm:inline">Scan Wajah</span>
                </button>

                {/* Tombol Toggle Select */}
                <button
                  onClick={toggleSelectionMode}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${
                    isSelectionMode 
                      ? 'bg-blue-100 border-blue-300 text-blue-700' 
                      : 'bg-gray-100 border-transparent text-gray-600 hover:bg-white hover:shadow-md'
                  }`}
                >
                  {isSelectionMode ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                  <span className="text-sm font-medium hidden sm:inline">{isSelectionMode ? 'Batal Pilih' : 'Pilih Foto'}</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
             {/* Refresh Button instead of Logout */}
             <button onClick={onRefresh} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Refresh Data">
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500 animate-pulse">Mengambil data dari Google Apps Script...</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-700 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-gray-500" />
                {capturedFace ? 'Hasil Pencarian' : 'Semua Foto'}
                <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full text-gray-600 font-normal">
                  {displayedFiles.length}
                </span>
              </h2>
            </div>

            {displayedFiles.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500">Tidak ada foto ditemukan.</p>
                <p className="text-xs text-gray-400 mt-2">Pastikan script GAS Anda sudah benar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedFiles.map((photo) => {
                  const isSelected = selectedIds.includes(photo.id);
                  return (
                    <div 
                      key={photo.id}
                      className={`group relative aspect-[4/5] bg-gray-200 rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all ${
                        isSelected ? 'ring-4 ring-blue-500' : ''
                      }`}
                      onClick={(e) => {
                        if (isSelectionMode) toggleSelectPhoto(e, photo.id);
                        else setSelectedPhoto(photo);
                      }}
                    >
                      <img 
                        src={photo.thumbnail} 
                        alt={photo.name}
                        loading="lazy"
                        className={`w-full h-full object-cover transition-transform duration-500 ${!isSelectionMode && 'group-hover:scale-110'}`}
                        referrerPolicy="no-referrer"
                      />
                      
                      {/* Overlay Gelap */}
                      <div className={`absolute inset-0 bg-black/0 transition-all ${isSelectionMode ? 'hover:bg-black/10' : 'group-hover:bg-black/20'}`} />
                      
                      {/* CHECKBOX SELECTION MODE */}
                      {isSelectionMode && (
                        <div className="absolute top-2 left-2 z-20">
                          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'bg-white/50 border-white hover:bg-white'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>
                        </div>
                      )}

                      {/* Info Text */}
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all">
                        <p className="text-white text-xs truncate">{photo.name}</p>
                      </div>
                      
                      {/* Single Download Button */}
                      {!isSelectionMode && (
                        <button 
                          onClick={(e) => handleDownload(e, photo.downloadUrl)}
                          className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white shadow-sm"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* FLOATING ACTION BAR UNTUK DOWNLOAD MASAL */}
      {isSelectionMode && selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 animate-in slide-in-from-bottom-4">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-4">
             <span className="text-sm font-medium">{selectedIds.length} foto dipilih</span>
             <div className="h-4 w-px bg-gray-700"></div>
             <button 
                onClick={handleBatchDownload}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 font-bold transition-colors"
             >
                <Download className="w-5 h-5" /> Download Masal
             </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 backdrop-blur-md">
          <button 
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-5xl w-full flex flex-col items-center">
            <img 
              src={selectedPhoto.full || selectedPhoto.thumbnail} 
              alt={selectedPhoto.name}
              className="max-h-[80vh] object-contain rounded shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="mt-4 flex gap-3">
               <button 
                 onClick={(e) => handleDownload(e, selectedPhoto.downloadUrl)}
                 className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-medium flex items-center gap-2 transition-colors"
               >
                 <Download className="w-4 h-4" /> Download Asli
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- MAIN ENTRY POINT (SETUP & DATA FETCHING) ---
export default function App() {
  const [driveFiles, setDriveFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [gasUrl, setGasUrl] = useState('');

  // 1. Cek URL Parameter saat load untuk mendapatkan GAS URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Kita cari parameter ?api=...
    const urlFromParam = params.get('api');
    
    // Atau ambil dari localStorage jika pernah disimpan
    const savedUrl = localStorage.getItem('gas_app_url');

    if (urlFromParam) {
      setGasUrl(urlFromParam);
      // Simpan untuk kunjungan berikutnya
      localStorage.setItem('gas_app_url', urlFromParam);
    } else if (savedUrl) {
      setGasUrl(savedUrl);
    }
  }, []);

  // 2. Fetch Data jika URL tersedia
  useEffect(() => {
    if (gasUrl) {
      fetchData(gasUrl);
    }
  }, [gasUrl]);

  const fetchData = async (url) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Data dari GAS biasanya array. Langsung set.
      // Pastikan format data dari GAS: { id, name, thumbnail, full, downloadUrl }
      setDriveFiles(data);
    } catch (err) {
      console.error("Fetch Error:", err);
      setErrorMsg("Gagal mengambil data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const inputUrl = e.target.elements.url.value;
    if (inputUrl) {
      setGasUrl(inputUrl);
      localStorage.setItem('gas_app_url', inputUrl);
    }
  };

  // TAMPILAN: JIKA BELUM ADA URL SCRIPT
  if (!gasUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100">
           <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
               <IconLink className="w-8 h-8 text-blue-600" />
           </div>
           <h1 className="text-xl font-bold text-gray-800 mb-2">Setup Koneksi</h1>
           <p className="text-gray-600 mb-6 text-sm">
              Masukkan URL Web App dari <b>Google Apps Script</b> Anda.
           </p>
           
           <form onSubmit={handleManualSubmit} className="space-y-4">
             <input 
               name="url"
               type="url" 
               placeholder="https://script.google.com/macros/s/..." 
               className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
               required
             />
             <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
               Mulai Galeri
             </button>
           </form>
           
           <p className="text-xs text-gray-400 mt-4">
             Atau gunakan link: <code>domain-anda.com/?api=URL_SCRIPT</code>
           </p>
        </div>
      </div>
    );
  }

  // TAMPILAN: JIKA ERROR
  if (errorMsg) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-4 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-bold text-red-700">Terjadi Kesalahan</h3>
        <p className="text-red-600 mb-6">{errorMsg}</p>
        <button 
          onClick={() => fetchData(gasUrl)} 
          className="px-6 py-2 bg-white border border-red-200 text-red-600 rounded-full hover:bg-red-50"
        >
          Coba Lagi
        </button>
        <button 
          onClick={() => { setGasUrl(''); localStorage.removeItem('gas_app_url'); }}
          className="mt-4 text-sm text-gray-500 underline"
        >
          Ganti URL Script
        </button>
      </div>
    );
  }

  // TAMPILAN: UTAMA
  return (
    <DriveGalleryApp 
      driveFiles={driveFiles} 
      isLoading={loading} 
      onRefresh={() => fetchData(gasUrl)}
    />
  );
}
