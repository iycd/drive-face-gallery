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
  ChevronLeft
} from 'lucide-react';

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

// --- HELPER COMPONENTS ---

const CameraModal = ({ isOpen, onClose, onCapture }) => {
  // ... (Kode kamera sama seperti sebelumnya, disederhanakan untuk hemat tempat)
  // ... Pastikan logika kamera tetap ada di sini ...
  return null; // Placeholder, gunakan kode kamera sebelumnya jika butuh fitur ini
};

// --- MAIN GALLERY COMPONENT ---
const DriveGalleryApp = ({ gasUrl }) => {
  const [currentFiles, setCurrentFiles] = useState([]);
  const [subFolders, setSubFolders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Navigasi Folder (History Stack)
  const [folderHistory, setFolderHistory] = useState([{ id: 'root', name: 'Home' }]);
  const currentFolder = folderHistory[folderHistory.length - 1];

  // Selection Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Fetch Data
  const fetchData = useCallback(async (folderId) => {
    setIsLoading(true);
    try {
      // Tambahkan folderId ke URL
      const separator = gasUrl.includes('?') ? '&' : '?';
      const fetchUrl = `${gasUrl}${separator}folderId=${folderId}`;
      
      const res = await fetch(fetchUrl);
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      // Backend baru mengembalikan { files: [], folders: [] }
      if (data.files) setCurrentFiles(data.files);
      if (data.folders) setSubFolders(data.folders);
      else setSubFolders([]); // Reset jika tidak ada folder

    } catch (e) {
      console.error(e);
      alert("Gagal memuat data.");
    } finally {
      setIsLoading(false);
    }
  }, [gasUrl]);

  // Load awal / saat folder berubah
  useEffect(() => {
    fetchData(currentFolder.id);
    // Reset seleksi saat pindah folder
    setIsSelectionMode(false);
    setSelectedIds([]);
  }, [currentFolder, fetchData]);

  // --- ACTIONS ---

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
      // Getar sedikit jika di HP (Haptic Feedback)
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
      window.open(file.full, '_blank'); // Preview Full
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

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans select-none">
      
      {/* NAVBAR & TABS */}
      <div className="sticky top-0 z-40 bg-white shadow-sm">
        {/* Header Utama */}
        <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-3 overflow-hidden">
            {folderHistory.length > 1 && (
              <button onClick={handleBack} className="p-1 rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-6 h-6 text-gray-600" />
              </button>
            )}
            <h1 className="text-lg font-bold text-gray-800 truncate">
              {currentFolder.name}
            </h1>
          </div>
          
          <div className="flex gap-2">
             <button onClick={() => fetchData(currentFolder.id)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full">
               <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>

        {/* Folder Tabs (Scrollable) */}
        {subFolders.length > 0 && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide bg-gray-50 border-b border-gray-200">
            {subFolders.map(folder => (
              <button
                key={folder.id}
                onClick={() => handleNavigate(folder.id, folder.name)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:text-blue-600 hover:border-blue-300 shadow-sm whitespace-nowrap transition-all"
              >
                <FolderIcon className="w-4 h-4 fill-yellow-400 text-yellow-500" />
                {folder.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* SELECTION BAR (Muncul saat mode seleksi) */}
      {isSelectionMode && (
        <div className="sticky top-[110px] z-30 bg-blue-50 px-4 py-2 flex justify-between items-center text-sm text-blue-700 font-medium animate-in slide-in-from-top-2">
          <span>{selectedIds.length} terpilih</span>
          <button onClick={() => setIsSelectionMode(false)} className="text-blue-600 underline">Batal</button>
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
            {currentFiles.map((file) => (
              <GridItem 
                key={file.id} 
                file={file} 
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.includes(file.id)}
                onLongPress={() => handleLongPress(file.id)}
                onClick={() => handleItemClick(file)}
              />
            ))}
          </div>
        )}
        
        {!isLoading && currentFiles.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            Folder ini kosong (tidak ada gambar).
          </div>
        )}
      </main>

      {/* FLOATING DOWNLOAD BUTTON (Hanya Logo) */}
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

// --- SUB COMPONENT: GRID ITEM (Untuk menangani Long Press) ---
const GridItem = ({ file, isSelectionMode, isSelected, onLongPress, onClick }) => {
  // Bind hook long press
  const longPressProps = useLongPress(onLongPress, 500); // 500ms tahan

  return (
    <div 
      className={`relative aspect-square bg-gray-200 overflow-hidden cursor-pointer transition-all duration-200 ${
        isSelected ? 'p-2' : '' // Efek mengecil saat dipilih (seperti Google Photos)
      }`}
      {...longPressProps} // Pasang listener mouse/touch
      onClick={onClick}
    >
      <div className={`w-full h-full relative rounded-lg overflow-hidden ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
        <img 
          src={file.thumbnail} 
          alt={file.name}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        
        {/* Overlay saat mode seleksi */}
        {isSelectionMode && (
          <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-black/20' : 'bg-transparent'}`}>
            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
              isSelected ? 'bg-blue-500 border-blue-500' : 'border-white bg-black/20'
            }`}>
              {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// --- APP ENTRY ---
export default function App() {
  // ... (Bagian ini sama: membaca URL parameter untuk setup awal)
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
