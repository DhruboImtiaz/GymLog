import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { FontProvider } from './context/FontContext';
import { AuthProvider } from './context/AuthContext';

import { MigrationProvider } from './context/MigrationContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MigrationProvider>
          <DataProvider>
            <ThemeProvider>
              <FontProvider>
                <App />
              </FontProvider>
            </ThemeProvider>
          </DataProvider>
        </MigrationProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('ServiceWorker registration failed:', error);
    });
  });
}
