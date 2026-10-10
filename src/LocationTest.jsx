import useUserLocation from "./useUserLocation.js";
import { Link } from "react-router-dom";
import "./InformationalPages.css";
import mapIcon from "./assets/mapIcon.png";

function LocationTest() {
  const { location, error } = useUserLocation();

  return (
    <main className="info-page">
      <header className="info-header">
        <Link className="info-brand" to="/" aria-label="Sivupolku etusivu">
          <img className="info-brand-icon" src={mapIcon} alt="" />
          <span>Sivupolku</span>
        </Link>
        <nav className="site-nav" aria-label="Päänavigaatio">
          <Link to="/about">Ohjeet</Link>
        </nav>
      </header>

      <section className="info-card">
        <p className="info-kicker">PAIKANNUS</p>
        <h1>📍 Sijaintitesti</h1>

        {!location && !error && <p>Haetaan sijaintia...</p>}

        {error && <p className="location-error" role="alert">❌ {error}</p>}

        {location && (
          <div className="location-result">
            <p>✅ Sijainti löytyi!</p>
            <p><strong>Latitude:</strong> {location.latitude}</p>
            <p><strong>Longitude:</strong> {location.longitude}</p>
            <p><strong>Tarkkuus:</strong> noin {Math.round(location.accuracy)} m</p>
          </div>
        )}

        <Link className="info-primary-link" to="/">Takaisin seikkailuun</Link>
      </section>
    </main>
  );
}

export default LocationTest;
