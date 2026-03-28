import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import CameraPage from './pages/CameraPage';
import ScanPage from './pages/ScanPage';
import ResultPage from './pages/ResultPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/camera" element={<CameraPage />} />
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/result" element={<ResultPage />} />
    </Routes>
  );
}
