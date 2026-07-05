import { useState, useEffect, useRef } from "react";
import { useGeocodeAddress, getGeocodeAddressQueryKey } from "@workspace/api-client-react";
import type { GeocodeSuggestion } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, MapPin } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { useUserLocation } from "@/hooks/use-user-location";

interface AddressAutocompleteProps {
  placeholder?: string;
  value?: GeocodeSuggestion | null;
  onChange: (suggestion: GeocodeSuggestion | null) => void;
  className?: string;
}

export function AddressAutocomplete({ placeholder, value, onChange, className }: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value?.displayName || "");
  const debouncedValue = useDebounce(inputValue, 400);
  const { coords } = useUserLocation();

  const geocodeParams = {
    q: debouncedValue,
    limit: 5,
    ...(coords ? { userLat: coords.latitude, userLon: coords.longitude } : {}),
  };

  const { data: suggestions, isLoading } = useGeocodeAddress(
    geocodeParams,
    {
      query: {
        enabled: debouncedValue.length >= 3,
        queryKey: getGeocodeAddressQueryKey(geocodeParams),
      },
    }
  );

  useEffect(() => {
    if (value && value.displayName !== inputValue && !open) {
      setInputValue(value.displayName);
    } else if (!value && !open) {
      setInputValue("");
    }
  }, [value, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={`relative w-full ${className}`}>
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            className="pl-9 bg-white"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setOpen(true);
              if (e.target.value === "") {
                onChange(null);
              }
            }}
            onFocus={() => {
              if (inputValue.length >= 3) setOpen(true);
            }}
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
            <div className="p-4 text-sm text-center text-muted-foreground">
              No places found.
            </div>
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
              <span className="line-clamp-2 leading-tight">{suggestion.displayName}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
