import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";
import { PLAYER_MARKERS } from "./playerMarkers.js";

const DEFAULT_CENTER = [60.1699, 24.9384];
const FOG_CLEAR_RADIUS_METERS = 300;
const FOG_FADE_RADIUS_METERS = 400;

function MysteryIcon({ found }) {
  return L.divIcon({
    className: "mystery-marker-wrapper",
    html: `<span class="mystery-marker${found ? " mystery-marker-found" : ""}"><span>${found ? "✨" : "❔"}</span></span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 42],
  });
}

function createPlayerIcon(markerId) {
  const marker = PLAYER_MARKERS.find(({ id }) => id === markerId) ?? PLAYER_MARKERS[0];

  return L.divIcon({
    className: "player-marker-wrapper",
    html: marker.icon
      ? `<span class="player-marker-glyph player-marker-emoji" role="img" aria-label="${marker.label}">${marker.icon}</span>`
      : `<span class="player-marker-glyph player-marker-blue" role="img" aria-label="${marker.label}"></span>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function MapViewport({ location, target, targetId }) {
  const map = useMap();
  const initialLocationCentered = useRef(false);
  const fittedTargetId = useRef(null);

  useEffect(() => {
    if (target && targetId && fittedTargetId.current !== targetId) {
      const points = [
        [target.latitude, target.longitude],
        ...(location ? [[location.latitude, location.longitude]] : []),
      ];
      map.fitBounds(points, { padding: [48, 48], maxZoom: 16 });
      fittedTargetId.current = targetId;
    } else if (location && !initialLocationCentered.current && !target) {
      map.setView([location.latitude, location.longitude], 15);
      initialLocationCentered.current = true;
    }
  }, [location, map, target, targetId]);

  return null;
}

function RecenterButton({ location }) {
  const map = useMap();

  function recenter() {
    if (!location) return;

    map.flyTo(
      [location.latitude, location.longitude],
      Math.max(map.getZoom(), 15),
      { duration: 0.6 }
    );
  }

  return (
    <button
      className="map-recenter-button"
      type="button"
      disabled={!location}
      onClick={recenter}
      aria-label="Kohdista kartta omaan sijaintiisi"
      title={location ? "Kohdista minuun" : "Odotetaan sijaintia"}
    >
      <span aria-hidden="true">⌖</span>
      Kohdista minuun
    </button>
  );
}

function ExplorationFog({ location, hasTarget, isRevealed, onReady }) {
  const map = useMap();
  const locationRef = useRef(location);
  const hasTargetRef = useRef(hasTarget);
  const isRevealedRef = useRef(isRevealed);
  const updateFogRef = useRef(() => {});

  useEffect(() => {
    const paneName = "explorationFogPane";
    const pane = map.getPane(paneName) ?? map.createPane(paneName);
    pane.style.zIndex = "450";
    pane.style.pointerEvents = "none";

    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    const definitions = document.createElementNS(svgNamespace, "defs");
    const mask = document.createElementNS(svgNamespace, "mask");
    const gradient = document.createElementNS(svgNamespace, "radialGradient");
    const maskBackground = document.createElementNS(svgNamespace, "rect");
    const lightRadius = document.createElementNS(svgNamespace, "circle");
    const spotlight = document.createElementNS(svgNamespace, "g");
    const fog = document.createElementNS(svgNamespace, "rect");

    svg.classList.add("exploration-fog");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";

    mask.id = "exploration-fog-mask";
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    maskBackground.setAttribute("fill", "white");
    gradient.id = "exploration-fog-gradient";
    gradient.setAttribute("gradientUnits", "userSpaceOnUse");
    gradient.setAttribute("cx", "0");
    gradient.setAttribute("cy", "0");
    gradient.setAttribute("r", "1");
    const fadeStart = `${(FOG_CLEAR_RADIUS_METERS / (FOG_CLEAR_RADIUS_METERS + FOG_FADE_RADIUS_METERS)) * 100}%`;
    for (const [offset, color] of [["0%", "black"], [fadeStart, "black"], ["100%", "white"]]) {
      const stop = document.createElementNS(svgNamespace, "stop");
      stop.setAttribute("offset", offset);
      stop.setAttribute("stop-color", color);
      gradient.appendChild(stop);
    }
    lightRadius.setAttribute("cx", "0");
    lightRadius.setAttribute("cy", "0");
    lightRadius.setAttribute("r", "1");
    lightRadius.setAttribute("fill", "url(#exploration-fog-gradient)");
    spotlight.classList.add("exploration-fog-spotlight");
    spotlight.style.transformOrigin = "0 0";
    spotlight.appendChild(lightRadius);
    mask.append(maskBackground, spotlight);
    definitions.append(gradient, mask);

    fog.setAttribute("fill", "#858585");
    fog.setAttribute("fill-opacity", "1");
    fog.setAttribute("mask", "url(#exploration-fog-mask)");
    svg.append(definitions, fog);
    pane.appendChild(svg);

    const getRadiusAtZoom = (currentLocation, zoom) => {
      const center = map.project([currentLocation.latitude, currentLocation.longitude], zoom);
      const edge = map.project([
        currentLocation.latitude + (FOG_CLEAR_RADIUS_METERS + FOG_FADE_RADIUS_METERS) / 111320,
        currentLocation.longitude,
      ], zoom);
      return Math.max(Math.hypot(edge.x - center.x, edge.y - center.y), 1);
    };

    const updateFog = (smooth = false) => {
      const size = map.getSize();
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      svg.style.left = `${topLeft.x}px`;
      svg.style.top = `${topLeft.y}px`;
      svg.setAttribute("width", size.x);
      svg.setAttribute("height", size.y);
      svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
      mask.setAttribute("x", "0");
      mask.setAttribute("y", "0");
      mask.setAttribute("width", size.x);
      mask.setAttribute("height", size.y);
      maskBackground.setAttribute("width", size.x);
      maskBackground.setAttribute("height", size.y);
      fog.setAttribute("width", size.x);
      fog.setAttribute("height", size.y);

      if (isRevealedRef.current) {
        svg.style.display = "none";
        return;
      }

      const currentLocation = locationRef.current;
      if (!currentLocation) {
        svg.style.display = hasTargetRef.current ? "block" : "none";
        return;
      }

      svg.style.display = "block";
      const center = map.latLngToContainerPoint([
        currentLocation.latitude,
        currentLocation.longitude,
      ]);
      const radius = getRadiusAtZoom(currentLocation, map.getZoom());
      spotlight.style.transition = smooth ? "transform 280ms ease-out" : "none";
      spotlight.style.transform = `translate(${center.x}px, ${center.y}px) scale(${radius})`;
    };

    updateFogRef.current = updateFog;
    const onZoomAnim = (event) => {
      if (isRevealedRef.current) return;
      const currentLocation = locationRef.current;
      if (!currentLocation) return;

      const size = map.getSize();
      const projectedCenter = map.project(
        [currentLocation.latitude, currentLocation.longitude],
        event.zoom
      );
      const projectedMapCenter = map.project(event.center, event.zoom);
      const center = projectedCenter
        .subtract(projectedMapCenter)
        .add(size.divideBy(2));
      const radius = getRadiusAtZoom(currentLocation, event.zoom);
      spotlight.style.transition = "transform 280ms ease-out";
      spotlight.style.transform = `translate(${center.x}px, ${center.y}px) scale(${radius})`;
    };
    const onMove = () => updateFog();
    const onZoomEnd = () => updateFog();
    map.on("move resize viewreset", onMove);
    map.on("zoomend", onZoomEnd);
    map.on("zoomanim", onZoomAnim);
    updateFog();

    return () => {
      map.off("move resize viewreset", onMove);
      map.off("zoomend", onZoomEnd);
      map.off("zoomanim", onZoomAnim);
      svg.remove();
      updateFogRef.current = () => {};
    };
  }, [map, onReady]);

  useEffect(() => {
    locationRef.current = location;
    hasTargetRef.current = hasTarget;
    isRevealedRef.current = isRevealed;
    updateFogRef.current(true);
    onReady();
  }, [hasTarget, isRevealed, location, onReady]);

  return null;
}

function MapOverlay({ location, target, found, progress }) {
  return (
    <>
      <div className="map-compass" aria-label="Pohjoinen">
        <span className="compass-n">N</span>
        <span className="compass-arrow" aria-hidden="true">▲</span>
      </div>
      <div className="map-legend" aria-label="Kartan merkkien selite">
        {location && <span><i className="legend-user" /> Sinä</span>}
        {target && <span><i className="legend-target">?</i> Mysteerikohde</span>}
        {target && <span className="legend-line"><i /> Suunta, ei reitti</span>}
      </div>
      {target && (
        <div className={`map-progress${found ? " map-progress-found" : ""}`}>
          <div className="map-progress-label">
            <span>Matkan eteneminen</span>
            <span>{progress}%</span>
          </div>
          <div
            className="tracker-progress-track"
            role="progressbar"
            aria-label="Etenemä kohteeseen linnuntiesuunnassa"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progress}
          >
            <span className="tracker-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

function PlayerMarkerPicker({ playerMarker, isLoading, onChangePlayerMarker }) {
  return (
    <div className="player-marker-picker" role="group" aria-label="Valitse pelaajan karttamerkki">
      <span className="player-marker-picker-label">Oma merkki</span>
      {PLAYER_MARKERS.map((marker) => (
        <button
          key={marker.id}
          type="button"
          className={`player-marker-option${playerMarker === marker.id ? " player-marker-option-selected" : ""}`}
          aria-label={marker.label}
          aria-pressed={playerMarker === marker.id}
          title={marker.label}
          disabled={isLoading}
          onClick={() => onChangePlayerMarker(marker.id)}
        >
          {marker.icon || <span className="player-marker-blue-preview" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export default function AdventureMap({
  location,
  target,
  targetId,
  found,
  surrendered,
  distance,
  closestDistance,
  progress,
  journeyStage,
  fogReady,
  playerMarker,
  isLoading,
  onChangePlayerMarker,
  onFogReady,
  formatDistance,
  getPlaceName,
}) {
  const playerIcon = useMemo(() => createPlayerIcon(playerMarker), [playerMarker]);

  return (
    <section className="map-section" aria-label="Seikkailun kartta">
      <div className="map-section-heading">
        <div>
          <h2>Sinun lähialueesi</h2>
          <p>
            {target
              ? "Lähde kulkemaan viivan osoittamaan suuntaan. Reitti on vapaa"
              : "Kartta herää eloon, kun lähdet retkelle."}
          </p>
        </div>
        {target && !found && !surrendered && distance !== null && (
          <p className="distance-pill">{formatDistance(distance)} linnuntietä</p>
        )}
      </div>

      {target && (
        <div className="journey-summary" aria-label="Matkan seuranta">
          <p className="journey-summary-stage">{journeyStage}</p>
          <div className="journey-summary-stats">
            <p>
              <span>Etäisyys nyt</span>
              <strong>{distance === null ? "—" : formatDistance(distance)}</strong>
            </p>
            <p>
              <span>Lähin etäisyys</span>
              <strong>{closestDistance === null ? "—" : formatDistance(closestDistance)}</strong>
            </p>
            <p>
              <span>Etenemä</span>
              <strong>{progress}%</strong>
            </p>
          </div>
        </div>
      )}

      <div className={`map-panel${target && !fogReady ? " map-panel-fog-pending" : ""}`}>
        <MapContainer
          center={location ? [location.latitude, location.longitude] : DEFAULT_CENTER}
          zoom={14}
          scrollWheelZoom
          className="user-map"
        >
          <TileLayer
            attribution='Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Sources: Esri, Garmin, USGS, OpenStreetMap contributors'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
          />
          <MapViewport location={location} target={target} targetId={targetId} />
          <RecenterButton location={location} />
          <ExplorationFog
            location={location}
            hasTarget={Boolean(target)}
            isRevealed={surrendered}
            onReady={onFogReady}
          />
          {location && (
            <Marker
              position={[location.latitude, location.longitude]}
              icon={playerIcon}
              title="Sinä"
            />
          )}
          {target && (
            <>
              <Marker
                position={[target.latitude, target.longitude]}
                icon={MysteryIcon({ found: found || surrendered })}
                title={found || surrendered ? getPlaceName(target.tags) : "Mysteerikohde"}
              />
              {location && (
                <Polyline
                  positions={[
                    [location.latitude, location.longitude],
                    [target.latitude, target.longitude],
                  ]}
                  pathOptions={{ color: "#7555d9", weight: 3, dashArray: "8 9", opacity: 0.9 }}
                />
              )}
            </>
          )}
        </MapContainer>
        <MapOverlay
          location={location}
          target={target}
          found={found}
          progress={progress}
        />
      </div>
      <PlayerMarkerPicker
        playerMarker={playerMarker}
        isLoading={isLoading}
        onChangePlayerMarker={onChangePlayerMarker}
      />
      <p className="map-footnote">
        {target
          ? "Kartta paljastaa ympäristöä sitä mukaan kun liikut. Suora viiva näyttää suunnan, ei reittiä."
          : location
            ? "Kartta paljastaa ympäristöä sitä mukaan kun liikut. Valitse teema ja aloita retki."
            : "Salli sijainti nähdäksesi itsesi kartalla. Ympäristö paljastuu noin 300 m säteellä."}
      </p>
    </section>
  );
}
