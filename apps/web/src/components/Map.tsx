"use client";

import { useRef, useCallback, useEffect } from "react";
import MapGL, {
  Marker,
  Popup,
  NavigationControl,
  GeolocateControl,
  Source,
  Layer,
  MapRef,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Place } from "@/lib/types";
import type { TravelTimeBand } from "@/lib/geo";

const TYPE_ICONS: Record<string, string> = {
  restaurant: "\u{1F374}",
  bar: "\u{1F378}",
  cafe: "\u2615",
  tourist_site: "\u{1F4F8}",
  retail: "\u{1F6CD}\uFE0F",
  night_club: "\u{1F3B5}",
  bakery: "\u{1F950}",
  other: "\u{1F4CD}",
};

export interface DiscoverPin {
  lat: number;
  lng: number;
  name: string;
  rating: number | null;
  alreadyInList: boolean;
}

interface MapProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
  onMapClick?: (lat: number, lng: number) => void;
  onMoveEnd?: (center: { lat: number; lng: number }) => void;
  isochroneGeoJson?: GeoJSON.FeatureCollection | null;
  isochroneOrigin?: { lat: number; lng: number } | null;
  travelTimes?: Map<number, TravelTimeBand>;
  flyTo?: { lat: number; lng: number; zoom?: number } | null;
  previewPin?: { lat: number; lng: number; name: string } | null;
  showDetail?: boolean;
  discoverPins?: DiscoverPin[];
  selectedDiscoverIndex?: number | null;
  onSelectDiscoverPin?: (index: number | null) => void;
}

export default function Map({
  places,
  selectedPlace,
  onSelectPlace,
  onMapClick,
  isochroneGeoJson,
  isochroneOrigin,
  travelTimes,
  flyTo,
  previewPin,
  showDetail,
  onMoveEnd,
  discoverPins,
  selectedDiscoverIndex,
  onSelectDiscoverPin,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (flyTo && mapRef.current) {
      const isMobile = window.innerWidth < 768;
      mapRef.current.flyTo({
        center: [flyTo.lng, flyTo.lat],
        zoom: flyTo.zoom ?? 14,
        duration: 1500,
        // On mobile, pad the bottom so the pin lands above the detail sheet
        ...(isMobile && { padding: { top: 0, bottom: Math.round(window.innerHeight * 0.5), left: 0, right: 0 } }),
      });
    }
  }, [flyTo]);

  // Reset map padding when detail sheet closes on mobile
  useEffect(() => {
    if (!showDetail && mapRef.current && window.innerWidth < 768) {
      mapRef.current.easeTo({
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 300,
      });
    }
  }, [showDetail]);

  const handleClick = useCallback(
    (e: mapboxgl.MapLayerMouseEvent) => {
      if (onMapClick) {
        onMapClick(e.lngLat.lat, e.lngLat.lng);
      }
    },
    [onMapClick]
  );

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: -73.99,
        latitude: 40.735,
        zoom: 12,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      onClick={handleClick}
      onMoveEnd={(e) => {
        if (onMoveEnd) {
          const center = e.target.getCenter();
          onMoveEnd({ lat: center.lat, lng: center.lng });
        }
      }}
    >
      <NavigationControl position="top-right" />
      <GeolocateControl position="top-right" />

      {/* Isochrone polygons — multi-step with data-driven colors */}
      {isochroneGeoJson && (
        <Source id="isochrone" type="geojson" data={isochroneGeoJson}>
          <Layer
            id="isochrone-fill"
            type="fill"
            paint={{
              "fill-color": ["get", "color"],
              "fill-opacity": 0.15,
            }}
          />
          <Layer
            id="isochrone-outline"
            type="line"
            paint={{
              "line-color": ["get", "color"],
              "line-width": 1.5,
              "line-opacity": 0.5,
              "line-dasharray": [3, 2],
            }}
          />
        </Source>
      )}

      {/* Isochrone origin marker */}
      {isochroneOrigin && (
        <Marker
          longitude={isochroneOrigin.lng}
          latitude={isochroneOrigin.lat}
          anchor="center"
        >
          <div
            className="flex h-4 w-4 items-center justify-center rounded-full shadow-md"
            style={{
              backgroundColor: "#c47d2e",
              border: "2px solid #faf6f1",
              boxShadow: "0 0 0 2px #c47d2e, 0 2px 8px rgba(196,125,46,0.4)",
            }}
          />
        </Marker>
      )}

      {/* My Places pins — hidden when discover mode is active */}
      {!discoverPins?.length && places.map((place) => {
        const color = place.beenThere ? "#5a7a5e" : "#5b7b9a";
        const icon = TYPE_ICONS[place.placeType || "other"] || "\u{1F4CD}";
        const isSelected = selectedPlace?.id === place.id;

        return (
          <Marker
            key={place.id}
            longitude={place.lng}
            latitude={place.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectPlace(place);
            }}
          >
            <div
              className={`flex cursor-pointer flex-col items-center transition-transform duration-150 ${
                isSelected ? "scale-125" : "hover:scale-110"
              }`}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                style={{
                  backgroundColor: !place.beenThere ? "#faf6f1" : color,
                  border: `2.5px solid ${color}`,
                  boxShadow: isSelected
                    ? `0 0 0 2px #c47d2e, 0 2px 8px rgba(0,0,0,0.2)`
                    : "0 1px 4px rgba(0,0,0,0.15)",
                }}
              >
                {icon}
              </div>
              {/* Drop shadow / pin point */}
              <div
                className="h-0 w-0"
                style={{
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: `5px solid ${color}`,
                  marginTop: "-1px",
                }}
              />
            </div>
          </Marker>
        );
      })}

      {!discoverPins?.length && selectedPlace && (
        <Popup
          longitude={selectedPlace.lng}
          latitude={selectedPlace.lat}
          anchor="bottom"
          offset={40}
          onClose={() => onSelectPlace(null)}
          closeOnClick={false}
        >
          <div className="max-w-[200px]">
            <p
              className="font-semibold text-[var(--color-ink)]"
              style={{
                fontFamily: "var(--font-libre-baskerville)",
                fontSize: "13px",
              }}
            >
              {selectedPlace.name}
            </p>
            {selectedPlace.neighborhood && (
              <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">
                {selectedPlace.neighborhood}
              </p>
            )}
            {travelTimes?.get(selectedPlace.id) && (
              <p
                className="mt-1 text-[11px] font-semibold"
                style={{ color: travelTimes.get(selectedPlace.id)!.color }}
              >
                &lt; {travelTimes.get(selectedPlace.id)!.minutes} min
              </p>
            )}
          </div>
        </Popup>
      )}
      {/* Preview pin for unsaved place from AddPlaceModal */}
      {previewPin && (
        <Marker
          longitude={previewPin.lng}
          latitude={previewPin.lat}
          anchor="bottom"
        >
          <div className="flex flex-col items-center animate-bounce-in">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
              style={{
                backgroundColor: "#faf6f1",
                border: "2.5px dashed #c47d2e",
                boxShadow: "0 0 0 2px #c47d2e, 0 2px 8px rgba(196,125,46,0.3)",
              }}
            >
              {"\u{1F4CD}"}
            </div>
            <div
              className="h-0 w-0"
              style={{
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "5px solid #c47d2e",
                marginTop: "-1px",
              }}
            />
          </div>
        </Marker>
      )}

      {/* Discover pins from Infatuation guides */}
      {discoverPins?.map((pin, i) => {
        const isDiscoverSelected = selectedDiscoverIndex === i;
        const pinColor = pin.alreadyInList ? "#5b7b9a" : "#c47d2e";
        return (
          <Marker
            key={`discover-${i}-${pin.lat}-${pin.lng}`}
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectDiscoverPin?.(isDiscoverSelected ? null : i);
            }}
          >
            <div
              className={`flex cursor-pointer flex-col items-center transition-transform duration-150 ${
                isDiscoverSelected ? "scale-125" : "hover:scale-110"
              }`}
            >
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: isDiscoverSelected ? 30 : 26,
                  height: isDiscoverSelected ? 30 : 26,
                  backgroundColor: "#faf6f1",
                  border: `2px solid ${pinColor}`,
                  boxShadow: isDiscoverSelected
                    ? `0 0 0 2px ${pinColor}, 0 2px 8px rgba(0,0,0,0.25)`
                    : "0 1px 3px rgba(0,0,0,0.12)",
                  fontSize: pin.rating != null ? "9px" : "12px",
                  fontWeight: 700,
                  color: pin.alreadyInList ? "#5b7b9a" : "#c47d2e",
                  fontFamily: "var(--font-dm-sans)",
                }}
              >
                {pin.rating != null ? pin.rating.toFixed(1) : "\u{1F374}"}
              </div>
              <div
                className="h-0 w-0"
                style={{
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `4px solid ${pinColor}`,
                  marginTop: "-1px",
                }}
              />
            </div>
          </Marker>
        );
      })}

      {/* Popup for selected discover pin */}
      {selectedDiscoverIndex != null && discoverPins?.[selectedDiscoverIndex] && (
        <Popup
          longitude={discoverPins[selectedDiscoverIndex].lng}
          latitude={discoverPins[selectedDiscoverIndex].lat}
          anchor="bottom"
          offset={35}
          onClose={() => onSelectDiscoverPin?.(null)}
          closeOnClick={false}
        >
          <div className="max-w-[200px]">
            <p
              className="font-semibold text-[var(--color-ink)]"
              style={{
                fontFamily: "var(--font-libre-baskerville)",
                fontSize: "13px",
              }}
            >
              {discoverPins[selectedDiscoverIndex].name}
            </p>
          </div>
        </Popup>
      )}
    </MapGL>
  );
}
