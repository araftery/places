"use client";

import { useRef, useCallback } from "react";
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

const STATUS_COLORS: Record<string, string> = {
  want_to_try: "#5b7b9a",
  been_there: "#5a7a5e",
  archived: "#8a7e72",
};

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

interface MapProps {
  places: Place[];
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
  onMapClick?: (lat: number, lng: number) => void;
  isochroneGeoJson?: GeoJSON.FeatureCollection | null;
  isochroneOrigin?: { lat: number; lng: number } | null;
}

export default function Map({
  places,
  selectedPlace,
  onSelectPlace,
  onMapClick,
  isochroneGeoJson,
  isochroneOrigin,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);

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
    >
      <NavigationControl position="top-right" />
      <GeolocateControl position="top-right" />

      {/* Isochrone polygon */}
      {isochroneGeoJson && (
        <Source id="isochrone" type="geojson" data={isochroneGeoJson}>
          <Layer
            id="isochrone-fill"
            type="fill"
            paint={{
              "fill-color": "#c47d2e",
              "fill-opacity": 0.1,
            }}
          />
          <Layer
            id="isochrone-outline"
            type="line"
            paint={{
              "line-color": "#c47d2e",
              "line-width": 2,
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

      {places.map((place) => {
        const color = STATUS_COLORS[place.status] || "#5b7b9a";
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
                  backgroundColor:
                    place.status === "want_to_try" ? "#faf6f1" : color,
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

      {selectedPlace && (
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
          </div>
        </Popup>
      )}
    </MapGL>
  );
}
