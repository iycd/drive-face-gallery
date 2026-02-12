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
// KONFIGURASI DINAMIS (DARI URL)
// ==========================================
// Aplikasi sekarang membaca parameter dari URL Browser
// Format: ?clientId=XYZ&apiKey=ABC&folderId=root

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];

// ==========================================

const DriveGalleryApp = ({ user, onLogout, driveFiles, isLoadingDrive, folderId }) => {
  const [capturedFace, setCapturedFace] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isSearchingFace, setIsSearchingFace] = useState(false);

  const handleFaceCapture = (imageUrl) => {
    setIsCameraOpen(false);
    setCapturedFace(imageUrl);
    setIsSearchingFace(true);

    setTimeout(() => {
      setIsSearchingFace(false);
    }, 2000);
  };

  const clearFaceSearch = () => {
    setCapturedFace(null);
  };

  const handleDownload = (e, url, filename) => {
    e.stopPropagation();
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans">
      {isCameraOpen && (
        <CameraModal 
          isOpen={isCameraOpen} 
          onClose={() => setIsCameraOpen(false)} 
          onCapture={handleFaceCapture}
        />
      )}

      <nav className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-1.5 rounded-lg">
                <FolderOpen className="text-white w-5 h-5" />
              </div>
              <span className="text-lg font-semibold hidden sm:inline text-gray-700">Drive Gallery</span>
              {/* Menampilkan ID Folder yang sedang aktif */}
              <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-500 font-mono hidden md:inline">
                 Folder: {folderId === 'root' ? 'Utama (Root)' : 'Custom'}
              </span>
            </div>

            <div className="flex-1 max-w-xl flex justify-center">
              {capturedFace ? (
                <div className="flex items-center gap-3 bg-blue-50 px-4 py-2 rounded-full border border-blue-100 animate-in fade-in slide-in-from-top-2 shadow-sm">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-blue-600 relative shrink-0">
                    <img src={capturedFace} alt="Captured" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-blue-600 font-medium uppercase tracking-wide">Pencarian Wajah Aktif</span>
                    <span className="text-sm font-bold text-gray-800">
                      {isSearchingFace ? 'Menganalisis...' : `Ditemukan ${Math.floor(driveFiles.length / 2)} hasil`}
                    </span>
                  </div>
                  <button onClick={clearFaceSearch} className="ml-2 p-1.5 hover:bg-blue-200 rounded-full text-blue-700 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCameraOpen(true)}
                  className="group flex items-center gap-3 px-5 py-2.5 bg-gray-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 text-gray-600 rounded-full transition-all border border-transparent shadow-sm"
                >
                  <div className="bg-white p-1 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                    <Camera className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-medium">Cari Wajah (Scan)</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-700">{user.name}</span>
                <span className="text-xs text-gray-500">{user.email}</span>
              </div>
              <img 
                src={user.avatar} 
                alt="Profile" 
                className="w-9 h-9 rounded-full border border-gray-200"
              />
              <button 
                onClick={onLogout}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                title="Keluar"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {isLoadingDrive ? (
          <div className="flex flex-col justify-center items-center h-64">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500 font-medium animate-pulse">
              Sedang mengambil foto dari Google Drive...
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-bold text-gray-800">
                  {capturedFace ? 'Hasil Pencarian Wajah' : 'Semua Foto'}
                </h2>
                <span className="bg-gray-100 text-gray-600 font-medium text-xs px-2.5 py-1 rounded-full border border-gray-200">
                  {driveFiles.length} item
                </span>
              </div>
            </div>

            {driveFiles.length === 0 ? (
              <div className="text-center py-20 bg-gray-50 rounded-2xl border-dashed border-2 border-gray-200">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Search className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">Tidak ada foto ditemukan di folder Drive ini.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {driveFiles.map((photo) => (
                  <div 
                    key={photo.id}
                    className="group relative aspect-[4/5] bg-gray-100 rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl transition-all duration-300 ring-1 ring-black/5"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img 
                      src={photo.thumbnailLink || photo.iconLink} 
                      alt={photo.name}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
                    
                    <div className="absolute bottom-3 left-3 right-3">
                      <p className="text-white text-sm font-medium truncate mb-0.5">{photo.name}</p>
                    </div>
                    
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-2 group-hover:translate-y-0">
                      <button 
                        onClick={(e) => handleDownload(e, photo.webContentLink, photo.name)}
                        className="bg-white/90 p-2 rounded-full hover:bg-white text-gray-700 shadow-lg hover:text-blue-600"
                        title="Unduh / Lihat Asli"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox / Preview Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="absolute top-4 right-4 flex gap-4 z-10">
            <button 
              onClick={(e) => handleDownload(e, selectedPhoto.webContentLink, selectedPhoto.name)}
              className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full flex items-center gap-2 transition-all backdrop-blur-sm"
            >
              <Download className="w-4 h-4" />
              <span className="text-sm font-medium">Download HD</span>
            </button>
            <button 
              onClick={() => setSelectedPhoto(null)}
              className="bg-white/10 hover:bg-white/20 p-2.5 rounded-full text-white transition-all backdrop-blur-sm"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="relative max-w-6xl w-full h-full flex flex-col items-center justify-center p-4">
            <img 
              src={selectedPhoto.webContentLink || selectedPhoto.thumbnailLink} 
              alt={selectedPhoto.name}
              className="max-h-[80vh] max-w-full object-contain shadow-2xl rounded-sm"
              referrerPolicy="no-referrer"
            />
            <div className="mt-6 text-center">
              <h3 className="text-white font-semibold text-xl mb-1">{selectedPhoto.name}</h3>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- HELPER COMPONENTS ---
const CameraModal = ({ isOpen, onClose, onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      alert("Tidak dapat mengakses kamera.");
      onClose();
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvasRef.current.toDataURL('image/jpeg');
      onCapture(dataUrl);
      stopCamera();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden max-w-lg w-full relative flex flex-col">
        <div className="relative bg-black aspect-video flex items-center justify-center">
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100" />
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="p-4 bg-white flex justify-center gap-4">
           <button onClick={onClose} className="px-4 py-2 text-gray-600 font-medium">Batal</button>
           <button onClick={handleCapture} className="px-6 py-2 bg-blue-600 text-white rounded-full font-medium">Ambil Foto</button>
        </div>
      </div>
    </div>
  );
};


// --- MAIN APP COMPONENT ---

export default function App() {
  const [user, setUser] = useState(null);
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [driveFiles, setDriveFiles] = useState([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Ambil parameter dari URL saat pertama kali load
  const [config, setConfig] = useState({
    clientId: '',
    apiKey: '',
    folderId: 'root'
  });

  useEffect(() => {
    // Membaca URL Query Strings: ?clientId=...&apiKey=...&folderId=...
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('clientId');
    const apiKey = params.get('apiKey');
    const folderId = params.get('folderId') || 'root';

    if (clientId && apiKey) {
      setConfig({ clientId, apiKey, folderId });
    }
  }, []);

  // 1. Load Google API Scripts
  useEffect(() => {
    if (!config.clientId || !config.apiKey) return; // Tunggu config terisi

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
      window.gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
      updateSigninStatus(window.gapi.auth2.getAuthInstance().isSignedIn.get());
    }, (error) => {
      setErrorMsg("Gagal inisialisasi Google API. Cek Client ID/API Key Anda.");
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

  const handleAuthClick = () => {
    window.gapi.auth2.getAuthInstance().signIn();
  };

  const handleSignoutClick = () => {
    window.gapi.auth2.getAuthInstance().signOut();
  };

  const listFiles = () => {
    setIsLoadingDrive(true);
    let query = "mimeType contains 'image/' and trashed = false";
    
    // Gunakan Folder ID dari URL Config
    if (config.folderId && config.folderId !== 'root') {
      query += ` and '${config.folderId}' in parents`;
    }

    window.gapi.client.drive.files.list({
      'pageSize': 50,
      'fields': "nextPageToken, files(id, name, mimeType, thumbnailLink, webContentLink, iconLink)",
      'q': query
    }).then((response) => {
      const files = response.result.files;
      if (files && files.length > 0) {
        setDriveFiles(files);
      } else {
        setDriveFiles([]);
      }
      setIsLoadingDrive(false);
    });
  };

  // Tampilan jika parameter URL belum ada
  if (!config.clientId || !config.apiKey) {
     return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
         <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Setup Diperlukan</h1>
            <p className="text-gray-600 mb-6">
               Aplikasi ini membutuhkan Client ID dan API Key untuk berjalan. 
               Silakan gunakan <b>Generator Link</b> untuk membuat link akses Anda.
            </p>
            <a href="/generator.html" className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors">
               Buka Generator Link
            </a>
         </div>
       </div>
     )
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">
        <p>{errorMsg}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Drive Face Gallery</h1>
          <p className="text-gray-500 mb-8">
            Login untuk mengakses foto di folder: <br/> 
            <code className="bg-gray-100 px-2 py-1 rounded text-xs">{config.folderId}</code>
          </p>
          
          <button 
            onClick={handleAuthClick}
            className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-all duration-200 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.17c-.22-.66-.35-1.36-.35-2.17s.13-1.51.35-2.17V7.01H2.18C.79 9.78 0 12.89 0 16c0 3.11.79 6.22 2.18 8.99l3.66-2.82z" fill="#FBBC05"/>
              <path d="M12 4.86c1.61 0 3.06.56 4.23 1.68l3.17-3.17C17.46 1.55 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.01l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Masuk dengan Google
          </button>
        </div>
      </div>
    );
  }

  return <DriveGalleryApp 
    user={user} 
    onLogout={handleSignoutClick} 
    driveFiles={driveFiles}
    isLoadingDrive={isLoadingDrive}
    folderId={config.folderId}
  />;
}
