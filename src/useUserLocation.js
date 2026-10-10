import { useEffect, useState } from "react";

const unsupportedMessage = "Selaimesi ei tue sijaintipalvelua.";

function getLocationErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "Sijaintilupaa ei annettu. Salli sijaintipalvelun käyttö selaimen asetuksista.";
    case error.POSITION_UNAVAILABLE:
      return "Sijaintia ei juuri nyt löydy. Tarkista laitteen sijaintipalvelut.";
    case error.TIMEOUT:
      return "Sijainnin haku kesti liian kauan. Yritetään uudelleen.";
    default:
      return "Sijainnin hakeminen epäonnistui.";
  }
}

function useUserLocation(onLocationUpdate, initialLocation = null) {
  const [location, setLocation] = useState(initialLocation);
  const [error, setError] = useState(() =>
    typeof navigator !== "undefined" && !navigator.geolocation
      ? unsupportedMessage
      : null
  );

  useEffect(() => {
    if (!navigator.geolocation) {
      return undefined;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setLocation(nextLocation);
        onLocationUpdate?.(nextLocation);
        setError(null);
      },
      (positionError) => {
        setError(getLocationErrorMessage(positionError));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [onLocationUpdate]);

  return { location, error };
}

export default useUserLocation;
