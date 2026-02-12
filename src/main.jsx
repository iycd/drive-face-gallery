import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Kode ini mencari elemen dengan ID 'root' di index.html
// Lalu merender komponen <App /> di dalamnya.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
