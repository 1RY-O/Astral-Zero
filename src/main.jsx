import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

// React 18 UI chrome only. Canvas mounted once in a ref, rAF loop
// driven outside React's render cycle. No per-frame setState.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
