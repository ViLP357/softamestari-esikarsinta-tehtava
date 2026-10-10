import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AboutPage from "./AboutPage.jsx";
import LocationTest from "./LocationTest.jsx";
import MapPage from "./MapPage.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/locationtest" element={<LocationTest />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;