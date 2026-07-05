import { useState, useEffect } from "react";
import { useGeocodeAddress, getGeocodeAddressQueryKey, type GeocodeSuggestion } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useUserLocation } from "@/hooks/use-user-location";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, shadowUrl, iconRetinaUrl: iconUrl });

interface LocationPickerProps {
  placeholder: string;
  value: GeocodeSuggestion | null;
  onChange: (suggestion: GeocodeSuggestion | null) => void;
  className?: string;
}

function MapEvents({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 14);
  }, [center, map]);
  return null;
}

export function LocationPicker({ placeholder, value, onChange, className }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value?.displayName || "");
  const debouncedValue = useDebounce(inputValue, 400);
  const { coords } = useUserLocation();
  const [mapCenter, setMapCenter] = useState<[number, number]>([26.8, 30.8]);
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);

  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  useEffect(() => {
    if (coords && !value && !markerPos) {
      setMapCenter([coords.latitude, coords.longitude]);
    }
  }, [coords, value, markerPos]);

  useEffect(() => {
    if (value) {
      setMapCenter([value.lat, value.lon]);
      setMarkerPos([value.lat, value.lon]);
      setInputValue(value.displayName);
    } else {
      setMarkerPos(null);
      setInputValue("");
    }
  }, [value]);

  // Always provide a reference point for proximity sorting:
  // geolocation → current map center → (server defaults to Cairo)
  const refLat = coords?.latitude ?? mapCenter[0];
  const refLon = coords?.longitude ?? mapCenter[1];

  const geocodeParams = {
    q: debouncedValue,
    limit: 5,
    userLat: refLat,
    userLon: refLon,
  };

  const { data: suggestions, isLoading } = useGeocodeAddress(geocodeParams, {
    query: {
      enabled: debouncedValue.length >= 3 && open,
      queryKey: getGeocodeAddressQueryKey(geocodeParams),
    },
  });

  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`
      );
      const data = await res.json();
      const displayName = data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      const newSuggestion: GeocodeSuggestion = {
        lat,
        lon,
        displayName,
        placeId: data.place_id ? String(data.place_id) : `custom-${lat}-${lon}`,
      };
      onChange(newSuggestion);
      setInputValue(displayName);
      setOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLocationSelect = (lat: number, lon: number) => {
    setMarkerPos([lat, lon]);
    setMapCenter([lat, lon]);
    reverseGeocode(lat, lon);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocateError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        handleLocationSelect(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocateError("Location access denied — please search or tap the map instead.");
        } else {
          setLocateError("Couldn't get your location — please search or tap the map instead.");
        }
      },
      { timeout: 8000 }
    );
  };

  return (
    <div className={`relative w-full flex flex-col gap-2 ${className || ""}`}>
      {/* Search row + locate button */}
      <div className="flex gap-2 items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={placeholder}
                className="pl-9 bg-white"
                dir="auto"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setOpen(true);
                  if (e.target.value === "") onChange(null);
                }}
                onFocus={() => setOpen(true)}
              />
              {isLoading && inputValue.length >= 3 && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0 border-border bg-white shadow-lg z-50"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="max-h-60 overflow-y-auto overflow-x-hidden p-1">
              {(!suggestions || suggestions.length === 0) && debouncedValue.length >= 3 && !isLoading ? (
                <div className="p-4 text-sm text-center text-muted-foreground">No places found.</div>
              ) : null}
              {suggestions?.map((suggestion) => (
                <button
                  key={suggestion.placeId}
                  className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-start gap-2"
                  onClick={() => {
                    setInputValue(suggestion.displayName);
                    onChange(suggestion);
                    setOpen(false);
                  }}
                >
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 line-clamp-2 leading-tight" dir="auto">{suggestion.displayName}</span>
                  {suggestion.distanceKm != null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/70 bg-muted rounded px-1 py-0.5 mt-0.5 whitespace-nowrap">
                      {suggestion.distanceKm < 1
                        ? `${Math.round(suggestion.distanceKm * 1000)} m`
                        : `${suggestion.distanceKm.toFixed(1)} km`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Current location button */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0 h-10 w-10 border-dashed text-muted-foreground hover:text-primary hover:border-primary"
          title="Use my current location"
          disabled={locating}
          onClick={handleUseCurrentLocation}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Location error */}
      {locateError && (
        <p className="text-xs text-destructive px-1">{locateError}</p>
      )}

      {/* Map */}
      <div className="rounded-md overflow-hidden border">
        <MapContainer
          center={mapCenter}
          zoom={value ? 14 : coords ? 12 : 6}
          style={{ height: 220, width: "100%", zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onLocationSelect={handleLocationSelect} />
          <MapUpdater center={value ? [value.lat, value.lon] : null} />
          {markerPos && (
            <Marker
              position={markerPos}
              draggable={true}
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng();
                  handleLocationSelect(pos.lat, pos.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      {!value && (
        <p className="text-xs text-muted-foreground text-center">
          Tap the map, drag the pin, or use{" "}
          <LocateFixed className="inline h-3 w-3 -mt-0.5" /> to use your location
        </p>
      )}
    </div>
  );
}
