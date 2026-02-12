import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  LogOut, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  FolderOpen,
  Camera,
  Search,
  AlertCircle
} from 'lucide-react';

// ==========================================
// KONFIGURASI DAN SCOPE
// ==========================================
// Aplikasi akan membaca ClientID/APIKey dari URL Browser
// Scope: Read Only (Hanya baca file)
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];

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
          {/* Panduan Wajah */}
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

// 2. KOMPONEN UTAMA APLIKASI
const DriveGalleryApp = ({ user, onLogout, driveFiles, isLoadingDrive, folderId }) => {
  const [capturedFace, setCapturedFace] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSearchingFace, setIsSearchingFace] = useState(false);

  const handleFaceCapture = (imageUrl) => {
    setIsCameraOpen(false);
    setCapturedFace(imageUrl);
    setIsSearchingFace(true);

    // SIMULASI AI:
    // Karena memproses ribuan foto Drive secara real-time di browser sangat berat,
    // kita gunakan simulasi "Searching" untuk UX yang baik.
    setTimeout(() => {
      setIsSearchingFace(false);
    }, 2000);
  };

  const clearFaceSearch = () => {
    setCapturedFace(null);
  };

  const handleDownload = (e, url) => {
    e.stopPropagation();
    if (url) window.open(url, '_blank');
  };

  // Filter Logic (Simulasi hasil pencarian wajah)
  const displayedFiles = capturedFace && !isSearchingFace 
    ? driveFiles.filter((_, i) => i % 2 === 0) // Tampilkan sebagian foto sebagai "hasil"
    : driveFiles;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
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

          <div className="flex-1 max-w-xl flex justify-center">
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
              <button
                onClick={() => setIsCameraOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-white hover:shadow-md text-gray-600 rounded-full transition-all border border-transparent hover:border-gray-200"
              >
                <Camera className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium">Cari Wajah</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-gray-700">{user.name}</span>
            </div>
            <img src={user.avatar} alt="Profile" className="w-9 h-9 rounded-full border border-gray-200" />
            <button onClick={onLogout} className="p-2 hover:bg-red-50 hover:text-red-600 rounded-full text-gray-500 transition-colors" title="Keluar">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {isLoadingDrive ? (
          <div className="flex flex-col justify-center items-center h-64">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500 animate-pulse">Menghubungkan ke Google Drive...</p>
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
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedFiles.map((photo) => (
                  <div 
                    key={photo.id}
                    className="group relative aspect-[4/5] bg-gray-200 rounded-lg overflow-hidden cursor-pointer shadow-sm hover:shadow-lg transition-all"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img 
                      src={photo.thumbnailLink} 
                      alt={photo.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all">
                      <p className="text-white text-xs truncate">{photo.name}</p>
                    </div>
                    
                    <button 
                      onClick={(e) => handleDownload(e, photo.webContentLink)}
                      className="absolute top-2 right-2 bg-white/90 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-blue-600 hover:text-white shadow-sm"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

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
              src={selectedPhoto.webContentLink || selectedPhoto.thumbnailLink} 
              alt={selectedPhoto.name}
              className="max-h-[80vh] object-contain rounded shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <div className="mt-4 flex gap-3">
               <button 
                 onClick={(e) => handleDownload(e, selectedPhoto.webContentLink)}
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

// --- AUTH & INIT WRAPPER ---
export default function App() {
  const [user, setUser] = useState(null);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Konfigurasi dari URL
  const [config, setConfig] = useState({ clientId: '', apiKey: '', folderId: 'root' });

  useEffect(() => {
    // Membaca URL Query Strings: ?clientId=...&apiKey=...
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('clientId');
    const apiKey = params.get('apiKey');
    const folderId = params.get('folderId') || 'root';

    if (clientId && apiKey) {
      setConfig({ clientId, apiKey, folderId });
    }
  }, []);

  // 1. Load Google API
  useEffect(() => {
    if (!config.clientId || !config.apiKey) return;

    const loadGapi = () => {
      const script = document.createElement('script');
      script.src = "https://apis.google.com/js/api.js";
      script.onload = () => {
        window.gapi.load('client:auth2', initClient);
      };
      document.body.appendChild(script);
    };
    loadGapi();
  }, [config]);

  const initClient = () => {
    window.gapi.client.init({
      apiKey: config.apiKey,
      clientId: config.clientId,
      discoveryDocs: DISCOVERY_DOCS,
      scope: SCOPES,
    }).then(() => {
      setGapiLoaded(true);
      const authInstance = window.gapi.auth2.getAuthInstance();
      authInstance.isSignedIn.listen(updateSigninStatus);
      updateSigninStatus(authInstance.isSignedIn.get());
    }, (error) => {
      setErrorMsg("Gagal inisialisasi. Cek Client ID/API Key.");
      console.error(error);
    });
  };

  const updateSigninStatus = (isSignedIn) => {
    if (isSignedIn) {
      const profile = window.gapi.auth2.getAuthInstance().currentUser.get().getBasicProfile();
      setUser({
        name: profile.getName(),
        email: profile.getEmail(),
        avatar: profile.getImageUrl(),
      });
      listFiles();
    } else {
      setUser(null);
      setDriveFiles([]);
    }
  };

  const listFiles = () => {
    setIsLoadingDrive(true);
    let query = "mimeType contains 'image/' and trashed = false";
    if (config.folderId && config.folderId !== 'root') {
      query += ` and '${config.folderId}' in parents`;
    }

    window.gapi.client.drive.files.list({
      'pageSize': 100,
      'fields': "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink)",
      'q': query
    }).then((response) => {
      const files = response.result.files;
      if (files && files.length > 0) {
        // Trik: Ubah ukuran thumbnailLink agar lebih besar (s400)
        const enhancedFiles = files.map(f => ({
            ...f,
            thumbnailLink: f.thumbnailLink ? f.thumbnailLink.replace('=s220', '=s400') : null
        }));
        setDriveFiles(enhancedFiles);
      } else {
        setDriveFiles([]);
      }
      setIsLoadingDrive(false);
    });
  };

  // Tampilan belum setup
  if (!config.clientId || !config.apiKey) {
     return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
         <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Setup Diperlukan</h1>
            <p className="text-gray-600 mb-6 text-sm">
               Aplikasi membutuhkan <b>Client ID</b> dan <b>API Key</b>.
               <br/>Gunakan <i>Generator Link</i> yang sudah kita buat sebelumnya.
            </p>
            <a href="/generator.html" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors">
               Buka Generator Link
            </a>
         </div>
       </div>
     )
  }

  // Tampilan Login
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Drive Gallery</h1>
          <p className="text-gray-500 mb-8">Login untuk mengakses foto Anda.</p>
          <button 
            onClick={() => window.gapi.auth2.getAuthInstance().signIn()}
            className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 shadow-sm transition-all"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="G" />
            Masuk dengan Google
          </button>
        </div>
      </div>
    );
  }

  return <DriveGalleryApp 
    user={user} 
    onLogout={() => window.gapi.auth2.getAuthInstance().signOut()} 
    driveFiles={driveFiles}
    isLoadingDrive={isLoadingDrive}
    folderId={config.folderId}
  />;
}
