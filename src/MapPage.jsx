import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import "./MapPage.css";
import useUserLocation from "./useUserLocation.js";
import mapIcon from "./assets/mapIcon.png";
import AdventureMap from "./AdventureMap.jsx";
import { PLAYER_MARKERS } from "./playerMarkers.js";

const MIN_SEARCH_RADIUS_METERS = 500;
const MAX_SEARCH_RADIUS_METERS = 10000;
const FOUND_RADIUS_METERS = 50;
const OVERPASS_TIMEOUT_MS = 12000;
const SAVED_ADVENTURE_KEY = "loytoretki.activeAdventure";
const PLAYER_MARKER_KEY = "seikkailu.playerMarker";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const CATEGORIES = [
  {
    id: "history",
    label: "Historia",
    emoji: "🏛️",
    tags: [
      ["historic", "memorial"],
      ["historic", "monument"],
      ["historic", "ruins"],
      ["historic", "castle"],
      ["historic", "building"],
      ["tourism", "museum"],
      ["tourism", "attraction"],
    ],
  },
  {
    id: "nature",
    label: "Luonto",
    emoji: "🌲",
    tags: [
      ["natural", "peak"],
      ["natural", "water"],
      ["natural", "beach"],
      ["natural", "cliff"],
      ["natural", "spring"],
      ["natural", "tree"],
      ["natural", "stone"],
      ["leisure", "park"],
      ["leisure", "nature_reserve"],
    ],
  },
  {
    id: "art",
    label: "Taide",
    emoji: "🎨",
    tags: [
      ["tourism", "artwork"],
      ["artwork_type", "statue"],
      ["artwork_type", "sculpture"],
      ["artwork_type", "mural"],
      ["artwork_type", "installation"],
    ],
  },
  {
    id: "odd",
    label: "Outo",
    emoji: "🤨",
    tags: [
      ["man_made", "tower"],
      ["man_made", "water_tower"],
      ["man_made", "windmill"],
      ["man_made", "lighthouse"],
      ["historic", "wayside_cross"],
      ["historic", "boundary_stone"],
      ["historic", "milestone"],
      ["historic", "ruins"],
      ["natural", "stone"],
      ["natural", "tree"],
      ["waterway", "waterfall"],
    ],
  },
];

CATEGORIES.push({
  id: "surprise",
  label: "Yllätys",
  emoji: "🎲",
  tags: [...new Map(CATEGORIES.flatMap(({ tags }) => tags).map((tag) => [tag.join("="), tag])).values()],
});

function readSavedPlayerMarker() {
  try {
    const savedMarker = localStorage.getItem(PLAYER_MARKER_KEY);
    return PLAYER_MARKERS.some(({ id }) => id === savedMarker) ? savedMarker : "blue";
  } catch {
    return "blue";
  }
}

function readSavedAdventure() {
  try {
    const savedValue = localStorage.getItem(SAVED_ADVENTURE_KEY);
    if (!savedValue) return { adventure: null, error: null };

    const saved = JSON.parse(savedValue);
    const validTarget =
      saved?.target &&
      Number.isFinite(saved.target.latitude) &&
      Number.isFinite(saved.target.longitude) &&
      saved.target.latitude >= -90 &&
      saved.target.latitude <= 90 &&
      saved.target.longitude >= -180 &&
      saved.target.longitude <= 180 &&
      typeof saved.target.id === "string" &&
      saved.target.tags &&
      typeof saved.target.tags === "object";
    const validDistances =
      Number.isFinite(saved.startDistance) &&
      saved.startDistance >= 0 &&
      Number.isFinite(saved.closestDistance) &&
      saved.closestDistance >= 0;
    const validSettings =
      CATEGORIES.some(({ id }) => id === saved.categoryId) &&
      Number.isFinite(saved.searchRadius) &&
      saved.searchRadius >= MIN_SEARCH_RADIUS_METERS &&
      saved.searchRadius <= MAX_SEARCH_RADIUS_METERS &&
      saved.searchRadius % 500 === 0;
    const validLocation =
      !saved.location ||
      (Number.isFinite(saved.location.latitude) &&
        Number.isFinite(saved.location.longitude) &&
        saved.location.latitude >= -90 &&
        saved.location.latitude <= 90 &&
        saved.location.longitude >= -180 &&
        saved.location.longitude <= 180);

    if (
      !validTarget ||
      !validDistances ||
      !validSettings ||
      typeof saved.found !== "boolean" ||
      (saved.surrendered !== undefined && typeof saved.surrendered !== "boolean")
    ) {
      localStorage.removeItem(SAVED_ADVENTURE_KEY);
      return {
        adventure: null,
        error: "Aiemman retken tallennus oli virheellinen, joten se aloitettiin alusta.",
      };
    }

    if (!validLocation) {
      saved.location = null;
    }
    if (saved.surrendered === undefined) {
      saved.surrendered = false;
    } else if (typeof saved.surrendered !== "boolean") {
      saved.surrendered = false;
    }

    return { adventure: saved, error: null };
  } catch {
    return {
      adventure: null,
      error: "Aiemman retken tietoja ei voitu lukea selaimesta.",
    };
  }
}

function distanceBetween(first, second) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const latitude1 = toRadians(first.latitude);
  const latitude2 = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;

  return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function formatDistance(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toLocaleString("fi-FI", { maximumFractionDigits: 1 })} km`
    : `${Math.round(meters)} m`;
}

function elementCoordinates(element) {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}

async function fetchOverpassData(query, signal) {
  let serviceUnavailable = false;
  let networkUnavailable = false;

  for (const endpoint of OVERPASS_URLS) {
    if (signal.aborted) {
      throw new DOMException("Kohdehaku peruutettiin.", "AbortError");
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortForCaller = () => controller.abort();
    signal.addEventListener("abort", abortForCaller, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, OVERPASS_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
        signal: controller.signal,
      });

      if (!response.ok) {
        if ([429, 502, 503, 504].includes(response.status) || response.status >= 500) {
          serviceUnavailable = true;
          continue;
        }

        throw new Error(`Kohdehaku epäonnistui (HTTP ${response.status}).`);
      }

      return await response.json();
    } catch (error) {
      if (signal.aborted) {
        throw new DOMException("Kohdehaku peruutettiin.", "AbortError");
      }

      if (timedOut || error instanceof TypeError || error.name === "AbortError") {
        serviceUnavailable = serviceUnavailable || timedOut;
        networkUnavailable = networkUnavailable || !timedOut;
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortForCaller);
    }
  }

  if (serviceUnavailable) {
    throw new Error(
      "Kohdepalvelut ovat ruuhkautuneet tai eivät vastaa juuri nyt. Odota hetki ja yritä uudelleen."
    );
  }

  if (networkUnavailable) {
    throw new TypeError(
      "Yhteyttä kohdepalveluun ei saatu. Tarkista verkkoyhteys ja yritä uudelleen."
    );
  }

  throw new Error("Kohteiden haku ei onnistunut. Yritä hetken kuluttua uudelleen.");
}

async function fetchPlaces(category, location, searchRadius, signal) {
  const filters = category.tags
    .map(
      ([key, value]) =>
        `nwr["${key}"="${value}"](around:${searchRadius},${location.latitude},${location.longitude});`
    )
    .join("");
  const query = `[out:json][timeout:10];(${filters});out center tags 200;`;
  const data = await fetchOverpassData(query, signal);
  const uniquePlaces = new Map();

  for (const element of data.elements ?? []) {
    const coordinates = elementCoordinates(element);
    if (!coordinates) continue;

    const distance = distanceBetween(location, coordinates);
    if (distance > searchRadius) continue;

    const tags = element.tags ?? {};
    if (!getPlaceName(tags)) continue;

    uniquePlaces.set(`${element.type}/${element.id}`, {
      id: `${element.type}/${element.id}`,
      ...coordinates,
      distance,
      tags,
    });
  }

  return [...uniquePlaces.values()];
}

function getPlaceName(tags) {
  return tags.name?.trim() || tags["name:fi"]?.trim() || tags.description?.trim() || null;
}

function getPlaceDetails(tags) {
  return [
    tags.historic && `Historia: ${tags.historic}`,
    tags.tourism && `Matkailukohde: ${tags.tourism}`,
    tags.natural && `Luontokohde: ${tags.natural}`,
    tags.artwork_type && `Taide: ${tags.artwork_type}`,
    tags.man_made && `Rakennelma: ${tags.man_made}`,
    tags.leisure && `Virkistysalue: ${tags.leisure}`,
    tags.description,
  ].filter(Boolean);
}

function MapPage() {
  const [savedAdventure] = useState(readSavedAdventure);
  const [categoryId, setCategoryId] = useState(savedAdventure.adventure?.categoryId ?? "surprise");
  const [playerMarker, setPlayerMarker] = useState(readSavedPlayerMarker);
  const [searchRadius, setSearchRadius] = useState(savedAdventure.adventure?.searchRadius ?? 2500);
  const [target, setTarget] = useState(savedAdventure.adventure?.target ?? null);
  const [targetId, setTargetId] = useState(savedAdventure.adventure ? 1 : 0);
  const [startDistance, setStartDistance] = useState(savedAdventure.adventure?.startDistance ?? null);
  const [closestDistance, setClosestDistance] = useState(savedAdventure.adventure?.closestDistance ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [storageMessage, setStorageMessage] = useState(savedAdventure.error);
  const [found, setFound] = useState(savedAdventure.adventure?.found ?? false);
  const [surrendered, setSurrendered] = useState(savedAdventure.adventure?.surrendered ?? false);
  const [fogReady, setFogReady] = useState(
    !savedAdventure.adventure?.target || savedAdventure.adventure?.surrendered
  );
  const requestId = useRef(0);
  const targetRef = useRef(savedAdventure.adventure?.target ?? null);
  const foundRef = useRef(savedAdventure.adventure?.found ?? false);

  const handleLocationUpdate = useCallback((nextLocation) => {
    if (targetRef.current) {
      const nextDistance = distanceBetween(nextLocation, targetRef.current);
      setClosestDistance((previous) =>
        previous === null ? nextDistance : Math.min(previous, nextDistance)
      );

      if (!foundRef.current && nextDistance <= FOUND_RADIUS_METERS) {
        foundRef.current = true;
        setFound(true);
      }
    }
  }, []);
  const { location, error: locationError } = useUserLocation(
    handleLocationUpdate,
    savedAdventure.adventure?.location ?? null
  );
  const handleFogReady = useCallback(() => setFogReady(true), []);

  useEffect(() => {
    try {
      if (!target) {
        localStorage.removeItem(SAVED_ADVENTURE_KEY);
        return;
      }

      localStorage.setItem(
        SAVED_ADVENTURE_KEY,
        JSON.stringify({
          target,
          categoryId,
          searchRadius,
          startDistance,
          closestDistance,
          found,
          surrendered,
          location,
        })
      );
      // Storage errors should clear once a later save succeeds.
      // oxlint-disable-next-line react/set-state-in-effect
      setStorageMessage(null);
    } catch {
      setStorageMessage("Retkeä ei voitu tallentaa selaimeen. Se voi kadota sivun päivityksessä.");
    }
  }, [categoryId, closestDistance, found, location, searchRadius, startDistance, surrendered, target]);

  function changePlayerMarker(markerId) {
    setPlayerMarker(markerId);
    try {
      localStorage.setItem(PLAYER_MARKER_KEY, markerId);
      setStorageMessage(null);
    } catch {
      setStorageMessage("Pelaajan kuvakevalintaa ei voitu tallentaa selaimeen.");
    }
  }

  const category = CATEGORIES.find(({ id }) => id === categoryId);
  const distance = location && target ? distanceBetween(location, target) : null;
  const progress = startDistance === null || distance === null
    ? 0
    : startDistance <= FOUND_RADIUS_METERS
      ? 100
      : Math.round(
          Math.max(
            0,
            Math.min(100, ((startDistance - distance) / (startDistance - FOUND_RADIUS_METERS)) * 100)
          )
        );
  const journeyStage = found
    ? "Löydetty!"
    : progress >= 60
      ? "Loppusuora"
      : progress >= 25
        ? "Hyvä eteneminen"
        : "Matkan eteneminen";
  const placeDetails = target ? getPlaceDetails(target.tags) : [];

  async function startAdventure() {
    if (!location) {
      setMessage(
        locationError
          ? `Sijaintia ei saatu: ${locationError}`
          : "Odotetaan sijaintiasi. Varmista, että selaimen sijaintilupa on sallittu."
      );
      return;
    }

    const currentRequestId = requestId.current + 1;
    requestId.current = currentRequestId;
    setIsLoading(true);
    setMessage("");
    setTarget(null);
    targetRef.current = null;
    foundRef.current = false;
    setSurrendered(false);
    setFogReady(true);
    setStartDistance(null);
    setClosestDistance(null);
    setFound(false);

    const controller = new AbortController();
    try {
      const places = await fetchPlaces(category, location, searchRadius, controller.signal);
      if (requestId.current !== currentRequestId) return;
      if (places.length === 0) {
        setMessage(
          `Valitulta ${formatDistance(searchRadius)} alueelta ei löytynyt sopivaa kohdetta. ` +
          "Suurenna etäisyyttä liukusäätimellä ja yritä uudelleen."
        );
        return;
      }

      const selectedPlace = places[Math.floor(Math.random() * places.length)];
      const initialDistance = distanceBetween(location, selectedPlace);
      setTarget(selectedPlace);
      setFogReady(false);
      targetRef.current = selectedPlace;
      setTargetId(currentRequestId);
      setStartDistance(initialDistance);
      setClosestDistance(initialDistance);
      if (initialDistance <= FOUND_RADIUS_METERS) {
        foundRef.current = true;
        setFound(true);
      }
    } catch (fetchError) {
      if (fetchError.name !== "AbortError" && requestId.current === currentRequestId) {
        setMessage(
          fetchError instanceof TypeError
            ? "Yhteys kohdehakuun ei onnistunut. Tarkista verkkoyhteys ja yritä uudelleen."
            : fetchError.message
        );
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }

  function startNewAdventure() {
    requestId.current += 1;
    setTarget(null);
    targetRef.current = null;
    foundRef.current = false;
    setSurrendered(false);
    setFogReady(true);
    setStartDistance(null);
    setClosestDistance(null);
    setFound(false);
    setMessage("");
    setIsLoading(false);
  }

  function surrender() {
    setSurrendered(true);
  }

  return (
    <main className="adventure-page">
      <header className="adventure-header">
        <Link className="brand" to="/" aria-label="Sivupolku etusivu">
          <img className="brand-icon" src={mapIcon} alt="" />
          <span>Sivupolku</span>
        </Link>
        <nav className="site-nav" aria-label="Päänavigaatio">
          <Link to="/locationtest">Sijaintitesti</Link>
          <Link to="/about">Ohjeet</Link>
        </nav>
        <p className={`gps-status${locationError ? " gps-status-error" : ""}`}>
          <span className="gps-dot" aria-hidden="true" />
          {locationError
            ? "Sijaintilupa tarvitaan"
            : location
              ? "Sijainti paikannettu"
              : "Etsitään sijaintiasi..."}
        </p>
      </header>

      <section className="adventure-intro">
        <p className="adventure-kicker">PIENI SEIKKAILU LÄHELLÄSI</p>
        <h1>Minne lähdet seikkailulle tänään?</h1>
        <p className="adventure-description">
          Valitse teema, niin etsimme lähistöltä salaisen kohteen. Sinä päätät,
          miten sinne kuljet.
        </p>
      </section>

      <section className="adventure-controls" aria-label="Retken asetukset">
        <div className="category-picker">
          <h2>Valitse retken teema</h2>
          <div className="category-options">
            {CATEGORIES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`category-button${categoryId === option.id ? " category-button-selected" : ""}`}
                aria-pressed={categoryId === option.id}
                disabled={isLoading}
                onClick={() => {
                  setCategoryId(option.id);
                  setMessage("");
                }}
              >
                <span aria-hidden="true">{option.emoji}</span>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="radius-picker">
          <label htmlFor="search-radius">
            <span>Kohteen enimmäisetäisyys</span>
            <strong>{formatDistance(searchRadius)}</strong>
          </label>
          <input
            id="search-radius"
            type="range"
            min={MIN_SEARCH_RADIUS_METERS}
            max={MAX_SEARCH_RADIUS_METERS}
            step="500"
            value={searchRadius}
            disabled={isLoading}
            aria-describedby="search-radius-help"
            onChange={(event) => {
              setSearchRadius(Number(event.target.value));
              setMessage("");
            }}
          />
          <div className="radius-range-labels" aria-hidden="true">
            <span>500 m</span>
            <span>10 km</span>
          </div>
          <p id="search-radius-help">Linnuntietä käyttäjän sijainnista</p>
        </div>
        <button
          className="start-button"
          type="button"
          onClick={startAdventure}
          disabled={isLoading}
        >
          {isLoading ? "Etsitään mysteerikohdetta..." : "Aloita seikkailu"}
          {!isLoading && <span aria-hidden="true"> →</span>}
        </button>
      </section>

      {(message || locationError || storageMessage) && (
        <p className="adventure-message" role="status">
          {message || storageMessage || `Sijaintivirhe: ${locationError}`}
        </p>
      )}

      {target && (
        <section className={`mystery-card${found || surrendered ? " mystery-card-found" : ""}`} aria-live="polite">
          <span className="mystery-card-icon" aria-hidden="true">
            {found ? "✨" : surrendered ? "📍" : "🔮"}
          </span>
          <div>
            <p className="mystery-label">
              {found ? "LÖYTÖ!" : surrendered ? "KOHDE PALJASTETTU" : "MYSTEERIKOHDE"}
            </p>
            <h2>{found || surrendered ? getPlaceName(target.tags) : "Jotain kiinnostavaa odottaa"}</h2>
            <p className="mystery-distance">
              {found
                ? `Löysit kohteen noin ${formatDistance(distance)} päästä.`
                : surrendered
                  ? "Seikkailu päätettiin tähän. Voit nyt nähdä kohteen tarkan sijainnin kartalla."
                  : `Kohde on noin ${formatDistance(distance)} päässä linnuntietä.`}
            </p>
            {(found || surrendered) && placeDetails.length > 0 && (
              <ul className="place-details">
                {placeDetails.map((detail) => <li key={detail}>{detail}</li>)}
              </ul>
            )}
          </div>
          {found || surrendered ? (
            <button type="button" className="new-adventure-button" onClick={startNewAdventure}>
              Uusi seikkailu
            </button>
          ) : (
            <button type="button" className="surrender-button" onClick={surrender}>
              Luovuta
            </button>
          )}
        </section>
      )}

      <AdventureMap
        location={location}
        target={target}
        targetId={targetId}
        found={found}
        surrendered={surrendered}
        distance={distance}
        closestDistance={closestDistance}
        progress={progress}
        journeyStage={journeyStage}
        fogReady={fogReady}
        playerMarker={playerMarker}
        isLoading={isLoading}
        onChangePlayerMarker={changePlayerMarker}
        onFogReady={handleFogReady}
        formatDistance={formatDistance}
        getPlaceName={getPlaceName}
      />
    </main>
  );
}

export default MapPage;
