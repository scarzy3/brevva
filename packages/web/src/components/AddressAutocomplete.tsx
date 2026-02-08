import { useEffect, useRef, useState, useCallback } from "react";

export interface AddressResult {
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
}

export interface AddressAutocompleteProps {
  onAddressSelect: (address: AddressResult) => void;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  error?: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as
  | string
  | undefined;

let loadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (window.google?.maps?.places) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("Google Maps API key is not configured"));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

function parsePlace(
  place: google.maps.places.PlaceResult,
): AddressResult | null {
  const components = place.address_components;
  if (!components) return null;

  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  let zip = "";

  for (const c of components) {
    const type = c.types[0];
    if (type === "street_number") streetNumber = c.long_name;
    else if (type === "route") route = c.long_name;
    else if (type === "locality") city = c.long_name;
    else if (type === "sublocality_level_1" && !city) city = c.long_name;
    else if (type === "administrative_area_level_1") state = c.short_name;
    else if (type === "postal_code") zip = c.long_name;
  }

  const address = streetNumber ? `${streetNumber} ${route}` : route;

  return {
    address,
    city,
    state,
    zip,
    fullAddress: place.formatted_address || "",
    lat: place.geometry?.location?.lat(),
    lng: place.geometry?.location?.lng(),
  };
}

const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200";

export default function AddressAutocomplete({
  onAddressSelect,
  defaultValue = "",
  placeholder = "Start typing an address...",
  className,
  error,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const onAddressSelectRef = useRef(onAddressSelect);
  onAddressSelectRef.current = onAddressSelect;

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setLoadError(true);
      return;
    }
    loadGoogleMapsScript()
      .then(() => setApiReady(true))
      .catch(() => setLoadError(true));
  }, []);

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || !apiReady || autocompleteRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      componentRestrictions: { country: "us" },
      fields: ["address_components", "formatted_address", "geometry"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.address_components) return;
      const result = parsePlace(place);
      if (result) onAddressSelectRef.current(result);
    });

    autocompleteRef.current = ac;
  }, [apiReady]);

  useEffect(() => {
    initAutocomplete();
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [initAutocomplete]);

  const appliedClass = className || inputCls;

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder={loadError ? "Enter address manually" : placeholder}
        className={appliedClass}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
