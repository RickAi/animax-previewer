import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { AnimaXProvider } from './pages/studio/animax/components/AnimaXContext';
import AnimaX from './pages/studio/animax';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AnimaXProvider>
      <AnimaX />
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#333',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '0.9rem',
          },
        }}
      />
    </AnimaXProvider>
  </React.StrictMode>,
);
