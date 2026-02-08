import { useEffect, useRef, useState } from "react";

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

/**
 * Load the Google Maps JS API with loading=async and then import the "places"
 * library which registers the PlaceAutocompleteElement web component.
 */
function loadGoogleMapsScript(): Promise<void> {
  if (window.google?.maps?.importLibrary != null) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    if (!GOOGLE_MAPS_API_KEY) {
      reject(new Error("Google Maps API key is not configured"));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async`;
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

function parsePlace(place: google.maps.places.Place): AddressResult | null {
  const components = place.addressComponents;
  if (!components) return null;

  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  let zip = "";

  for (const c of components) {
    const type = c.types[0];
    if (type === "street_number") streetNumber = c.longText ?? "";
    else if (type === "route") route = c.longText ?? "";
    else if (type === "locality") city = c.longText ?? "";
    else if (type === "sublocality_level_1" && !city) city = c.longText ?? "";
    else if (type === "administrative_area_level_1")
      state = c.shortText ?? "";
    else if (type === "postal_code") zip = c.longText ?? "";
  }

  const address = streetNumber ? `${streetNumber} ${route}` : route;

  return {
    address,
    city,
    state,
    zip,
    fullAddress: place.formattedAddress ?? "",
    lat: place.location?.lat(),
    lng: place.location?.lng(),
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
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef =
    useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const [loadError, setLoadError] = useState(false);
  const onAddressSelectRef = useRef(onAddressSelect);
  onAddressSelectRef.current = onAddressSelect;

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setLoadError(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadGoogleMapsScript();
        // Import the places library to register the web component
        await google.maps.importLibrary("places");

        if (cancelled || !containerRef.current) return;

        const el = new google.maps.places.PlaceAutocompleteElement({
          types: ["address"],
          componentRestrictions: { country: "us" },
        });

        // Style the inner input via the ::part(input) pseudo-element.
        // We inject a <style> scoped to our container to target the web
        // component's shadow DOM parts.
        const style = document.createElement("style");
        const appliedClass = className || inputCls;
        // Convert the Tailwind class list into CSS applied via ::part.
        // Since ::part cannot use utility classes directly, we apply baseline
        // styles that match the form inputs and let the wrapper div handle
        // width.
        style.textContent = `
          gmp-placeautocomplete {
            display: block;
            width: 100%;
          }
          gmp-placeautocomplete::part(input) {
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid #d1d5db;
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            line-height: 1.25rem;
            outline: none;
            box-sizing: border-box;
          }
          gmp-placeautocomplete::part(input):focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px #bfdbfe;
          }
        `;
        containerRef.current.appendChild(style);

        // If a className was provided, add it to the element itself so the
        // caller can control wrapper-level layout (e.g. width).
        if (className) {
          el.className = appliedClass;
        }

        el.addEventListener("gmp-placeselect", ((
          e: google.maps.places.PlaceAutocompletePlaceSelectEvent,
        ) => {
          const place = e.place;
          void (async () => {
            try {
              await place.fetchFields({
                fields: [
                  "addressComponents",
                  "formattedAddress",
                  "location",
                ],
              });
            } catch {
              // If fetchFields fails, we still try to parse what we have
            }
            const result = parsePlace(place);
            if (result) onAddressSelectRef.current(result);
          })();
        }) as EventListener);

        containerRef.current.appendChild(el);
        elementRef.current = el;

        // Set placeholder via the underlying input
        const inner = el.querySelector("input");
        if (inner) {
          inner.placeholder = placeholder;
          if (defaultValue) inner.value = defaultValue;
        } else {
          // The shadow DOM input may not be immediately queryable — wait for
          // the custom element to upgrade.
          requestAnimationFrame(() => {
            const inp = el.querySelector("input");
            if (inp) {
              inp.placeholder = placeholder;
              if (defaultValue) inp.value = defaultValue;
            }
          });
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (elementRef.current && containerRef.current) {
        containerRef.current
          .querySelectorAll("style, gmp-placeautocomplete")
          .forEach((n) => n.remove());
        elementRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedClass = className || inputCls;

  if (loadError) {
    return (
      <div>
        <input
          type="text"
          defaultValue={defaultValue}
          placeholder="Enter address manually"
          className={appliedClass}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
