import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { FontProvider } from './context/FontContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DataProvider>
      <ThemeProvider>
        <FontProvider>
          <App />
        </FontProvider>
      </ThemeProvider>
    </DataProvider>
  </React.StrictMode>
);
