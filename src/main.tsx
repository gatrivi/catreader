import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import ReaderOpenProbe from './ReaderOpenProbe.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReaderOpenProbe />
  </StrictMode>,
);
