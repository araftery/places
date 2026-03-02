"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
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
import { Place, PLACE_TYPE_CATEGORY, CATEGORY_COLORS, CATEGORY_STROKE_COLORS } from "@/lib/types";
import type { PlaceTypeCategory } from "@/lib/types";
import type { TravelTimeBand } from "@/lib/geo";
import type { LayerProps, MapMouseEvent } from "react-map-gl/mapbox";

function getCategoryColor(placeType: string | null): string {
  const category: PlaceTypeCategory =
    PLACE_TYPE_CATEGORY[placeType || "other"] || "other";
  return CATEGORY_COLORS[category];
}

function getCategoryStrokeColor(placeType: string | null): string {
  const category: PlaceTypeCategory =
    PLACE_TYPE_CATEGORY[placeType || "other"] || "other";
  return CATEGORY_STROKE_COLORS[category];
}

export interface DiscoverPin {
  lat: number;
  lng: number;
  name: string;
  rating: number | null;
  alreadyInList: boolean;
  matchedPlaceId: number | null;
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
  buildingListId?: number | null;
  onTogglePlaceInList?: (placeId: number, listId: number) => Promise<void>;
}

const INTERACTIVE_LAYER_IDS = ["place-dots"];

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
  buildingListId,
  onTogglePlaceInList,
}: MapProps) {
  const mapRef = useRef<MapRef>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [cursor, setCursor] = useState("");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (flyTo && mapRef.current) {
      let bottomPad = 0;
      if (isMobile) {
        if (showDetail) {
          bottomPad = Math.round(window.innerHeight * 0.5);
        } else if (discoverPins?.length) {
          bottomPad = Math.round(window.innerHeight * 0.8);
        } else {
          bottomPad = Math.round(window.innerHeight * 0.25);
        }
      }
      mapRef.current.flyTo({
        center: [flyTo.lng, flyTo.lat],
        zoom: flyTo.zoom ?? 14,
        duration: 1500,
        ...(bottomPad > 0 && {
          padding: { top: 0, bottom: bottomPad, left: 0, right: 0 },
        }),
      });
    }
  }, [flyTo, isMobile, discoverPins?.length, showDetail]);

  useEffect(() => {
    if (!showDetail && mapRef.current && isMobile) {
      mapRef.current.easeTo({
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 300,
      });
    }
  }, [showDetail, isMobile]);

  // Build GeoJSON FeatureCollection from places
  const isBuildMode = !!buildingListId;
  const placesGeoJson = useMemo((): GeoJSON.FeatureCollection => {
    return {
      type: "FeatureCollection",
      features: places.map((place) => {
        const catColor = getCategoryColor(place.placeType);
        const catStroke = getCategoryStrokeColor(place.placeType);
        const isInBuildList =
          isBuildMode && place.listIds?.includes(buildingListId!);
        const isSelected = selectedPlace?.id === place.id;
        return {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [place.lng, place.lat],
          },
          properties: {
            id: place.id,
            categoryColor: catColor,
            categoryStrokeColor: catStroke,
            beenThere: place.beenThere ? 1 : 0,
            isSelected: isSelected ? 1 : 0,
            isBuildMode: isBuildMode ? 1 : 0,
            isInBuildList: isInBuildList ? 1 : 0,
          },
        };
      }),
    };
  }, [places, selectedPlace?.id, isBuildMode, buildingListId]);

  // Find place by id for click handling
  const placesById = useMemo(() => {
    const lookup: Record<number, Place> = {};
    for (const p of places) lookup[p.id] = p;
    return lookup;
  }, [places]);

  const handleClick = useCallback(
    (e: MapMouseEvent) => {
      // Check if we clicked a native layer feature
      const features = e.features;
      if (features && features.length > 0) {
        const feature = features[0];

        if (feature.layer?.id === "place-dots") {
          const placeId = feature.properties?.id;
          if (placeId != null) {
            const place = placesById[placeId];
            if (place) {
              if (isBuildMode && onTogglePlaceInList) {
                onTogglePlaceInList(place.id, buildingListId!);
              } else {
                onSelectPlace(place);
              }
              return;
            }
          }
        }
      }

      // Clicked on empty map
      if (onMapClick) {
        onMapClick(e.lngLat.lat, e.lngLat.lng);
      }
    },
    [
      onMapClick,
      placesById,
      onSelectPlace,
      isBuildMode,
      buildingListId,
      onTogglePlaceInList,
    ]
  );

  const onMouseEnter = useCallback(() => setCursor("pointer"), []);
  const onMouseLeave = useCallback(() => setCursor(""), []);

  // Hide places source when discover is active
  const showPlaces = !discoverPins?.length;

  // Layer paint/layout definitions
  const dotLayer: LayerProps = {
    id: "place-dots",
    type: "circle",
    source: "places-source",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        10, ["case", ["==", ["get", "isSelected"], 1], 5, 3],
        13, ["case", ["==", ["get", "isSelected"], 1], 8, 6],
        16, ["case", ["==", ["get", "isSelected"], 1], 12, 9],
      ],
      // Always filled with category color (build mode: amber or muted)
      "circle-color": [
        "case",
        ["==", ["get", "isBuildMode"], 1],
        [
          "case",
          ["==", ["get", "isInBuildList"], 1],
          "#c47d2e",
          "#6b6560",
        ],
        ["get", "categoryColor"],
      ],
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": [
        "case",
        ["==", ["get", "isSelected"], 1],
        3,
        1.5,
      ],
      "circle-opacity": [
        "case",
        [
          "all",
          ["==", ["get", "isBuildMode"], 1],
          ["==", ["get", "isInBuildList"], 0],
        ],
        0.4,
        1,
      ],
      "circle-stroke-opacity": [
        "case",
        [
          "all",
          ["==", ["get", "isBuildMode"], 1],
          ["==", ["get", "isInBuildList"], 0],
        ],
        0.4,
        1,
      ],
    },
  };

  // Shadow layer rendered behind dots
  const shadowLayer: LayerProps = {
    id: "place-shadows",
    type: "circle",
    source: "places-source",
    paint: {
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        10, ["case", ["==", ["get", "isSelected"], 1], 7, 5],
        13, ["case", ["==", ["get", "isSelected"], 1], 10, 8],
        16, ["case", ["==", ["get", "isSelected"], 1], 14, 11],
      ],
      "circle-color": "rgba(0, 0, 0, 0.4)",
      "circle-blur": 0.4,
      "circle-translate": [0, 1],
      "circle-opacity": [
        "case",
        [
          "all",
          ["==", ["get", "isBuildMode"], 1],
          ["==", ["get", "isInBuildList"], 0],
        ],
        0.3,
        1,
      ],
    },
  };

  // Selected place amber ring layer (rendered on top)
  const selectedRingLayer: LayerProps = {
    id: "place-selected-ring",
    type: "circle",
    source: "places-source",
    filter: ["==", ["get", "isSelected"], 1],
    paint: {
      "circle-radius": 10,
      "circle-color": "transparent",
      "circle-stroke-color": "#c47d2e",
      "circle-stroke-width": 2,
      "circle-opacity": 0,
    },
  };

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
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      cursor={cursor}
      interactiveLayerIds={showPlaces ? INTERACTIVE_LAYER_IDS : []}
      onMoveEnd={(e) => {
        if (onMoveEnd) {
          const center = e.target.getCenter();
          onMoveEnd({ lat: center.lat, lng: center.lng });
        }
      }}
    >
      <NavigationControl position="top-right" />
      <GeolocateControl position="top-right" />

      {/* My Places — native Mapbox circle layers (rendered first so isochrone can insert before) */}
      {showPlaces && (
        <Source
          id="places-source"
          type="geojson"
          data={placesGeoJson}
        >
          <Layer {...shadowLayer} />
          <Layer {...dotLayer} />
          <Layer {...selectedRingLayer} />
        </Source>
      )}

      {/* Isochrone polygons — inserted below place dots */}
      {isochroneGeoJson && (
        <Source id="isochrone" type="geojson" data={isochroneGeoJson}>
          <Layer
            id="isochrone-fill"
            type="fill"
            beforeId="place-shadows"
            paint={{
              "fill-color": ["get", "color"],
              "fill-opacity": 0.15,
            }}
          />
          <Layer
            id="isochrone-outline"
            type="line"
            beforeId="place-shadows"
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
              boxShadow:
                "0 0 0 2px #c47d2e, 0 2px 8px rgba(196,125,46,0.4)",
            }}
          />
        </Marker>
      )}

      {/* Popup for selected place — desktop only */}
      {!isMobile && !discoverPins?.length && selectedPlace && (
        <Popup
          longitude={selectedPlace.lng}
          latitude={selectedPlace.lat}
          anchor="bottom"
          offset={12}
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
                style={{
                  color: travelTimes.get(selectedPlace.id)!.color,
                }}
              >
                &lt; {travelTimes.get(selectedPlace.id)!.minutes} min
                {travelTimes.get(selectedPlace.id)!.label
                  ? ` ${travelTimes.get(selectedPlace.id)!.label}`
                  : ""}
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
          anchor="center"
        >
          <div
            className="animate-bounce-in rounded-full"
            style={{
              width: 14,
              height: 14,
              backgroundColor: "#c47d2e",
              border: "2.5px dashed #ffffff",
              boxShadow: "0 0 0 2px #c47d2e, 0 1px 4px rgba(0,0,0,0.2)",
            }}
          />
        </Marker>
      )}

      {/* Discover pins from Infatuation guides */}
      {discoverPins?.map((pin, i) => {
        const isDiscoverSelected = selectedDiscoverIndex === i;
        const pinColor = pin.alreadyInList ? "#5b7b9a" : "#c47d2e";
        const size = isDiscoverSelected ? 14 : 10;
        return (
          <Marker
            key={`discover-${i}-${pin.lat}-${pin.lng}`}
            longitude={pin.lng}
            latitude={pin.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectDiscoverPin?.(isDiscoverSelected ? null : i);
            }}
          >
            <div
              className="cursor-pointer rounded-full transition-transform duration-150 hover:scale-125"
              style={{
                width: size,
                height: size,
                backgroundColor: pinColor,
                border: "1.5px solid #ffffff",
                boxShadow: isDiscoverSelected
                  ? `0 0 0 2px ${pinColor}, 0 1px 4px rgba(0,0,0,0.2)`
                  : "0 1px 4px rgba(0,0,0,0.2)",
              }}
            />
          </Marker>
        );
      })}

      {/* Popup for selected discover pin — desktop only */}
      {!isMobile &&
        selectedDiscoverIndex != null &&
        discoverPins?.[selectedDiscoverIndex] && (
          <Popup
            longitude={discoverPins[selectedDiscoverIndex].lng}
            latitude={discoverPins[selectedDiscoverIndex].lat}
            anchor="bottom"
            offset={12}
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
