import { useState, useEffect } from "react";

interface Coords {
  latitude: number;
  longitude: number;
}

interface UserLocationState {
  coords: Coords | null;
  error: string | null;
  loading: boolean;
}

export function useUserLocation(): UserLocationState {
  const [state, setState] = useState<UserLocationState>({
    coords: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ coords: null, error: "Geolocation not supported", loading: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          error: null,
          loading: false,
        });
      },
      () => {
        setState({ coords: null, error: "Location permission denied", loading: false });
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  return state;
}
