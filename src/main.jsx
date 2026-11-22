import React from 'react';
import ReactDOM from 'react-dom/client';

// Bundle Tailwind CSS v4 + FontAwesome + Leaflet CSS + BMA Theme
import './styles/index.css';

// Initialize lightweight SweetAlert2 bridge (Leaflet, XLSX, ExcelJS load lazily on demand)
import './utils/vendorBridge.js';

import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
