// src/components/MapComponent.jsx
// Requires VITE_GOOGLE_BROWSER_MAPS_API_KEY in frontend/.env

import React, { useRef, useState } from "react";
import { GoogleMap, useLoadScript, Marker, InfoWindow, Autocomplete } from "@react-google-maps/api";

const LIBRARIES = ["places"];
const _rawKey = import.meta.env.VITE_GOOGLE_BROWSER_MAPS_API_KEY || "";
const MAPS_KEY = _rawKey.startsWith("your_") ? "" : _rawKey;

const MAP_OPTIONS = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: [
        { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }
    ]
};

const ISRAEL_CENTER = { lat: 31.7683, lng: 35.2137 };

export function AddressInput({ placeholder, onPlaceSelected, value, onChange }) {
    const { isLoaded } = useLoadScript({
        googleMapsApiKey: MAPS_KEY,
        libraries: LIBRARIES
    });

    const autoRef = useRef(null);

    const onLoad = (auto) => { autoRef.current = auto; };

    const onPlaceChanged = () => {
        if (autoRef.current) {
            const place = autoRef.current.getPlace();
            if (place.geometry) {
                const loc = {
                    address: place.formatted_address,
                    lat: place.geometry.location.lat(),
                    lng: place.geometry.location.lng()
                };
                onPlaceSelected?.(loc);
            }
        }
    };

    if (!MAPS_KEY) {
        return (
            <input
                placeholder={placeholder}
                value={value || ""}
                onChange={e => onChange?.(e.target.value)}
            />
        );
    }

    if (!isLoaded) return <input placeholder={placeholder} value={value || ""} onChange={e => onChange?.(e.target.value)} />;

    return (
        <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged}
            options={{ componentRestrictions: { country: "il" } }}>
            <input
                placeholder={placeholder}
                value={value || ""}
                onChange={e => onChange?.(e.target.value)}
            />
        </Autocomplete>
    );
}

function MapComponent({
    center = ISRAEL_CENTER,
    zoom = 13,
    height = 320,
    markers = [],
    driverMarker = null,
    passengerMarker = null,
    onMapClick,
    style = {}
}) {
    const { isLoaded, loadError } = useLoadScript({
        googleMapsApiKey: MAPS_KEY,
        libraries: LIBRARIES
    });

    const [selected, setSelected] = useState(null);

    if (!MAPS_KEY) {
        return (
            <div style={{
                height, background: "#e8f4f8", borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px dashed #94a3b8", ...style
            }}>
                <div style={{ textAlign: "center", color: "#64748b" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
                    <div style={{ fontWeight: 600 }}>מפה</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                        הוסף VITE_GOOGLE_BROWSER_MAPS_API_KEY ל-.env להפעלת המפה
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger)" }}>שגיאה בטעינת המפה</div>;
    if (!isLoaded) return <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}><div className="spinner" /></div>;

    return (
        <div style={{ borderRadius: 12, overflow: "hidden", ...style }}>
            <GoogleMap
                mapContainerStyle={{ width: "100%", height }}
                center={center}
                zoom={zoom}
                options={MAP_OPTIONS}
                onClick={onMapClick}>

                {/* Nearby driver markers */}
                {markers.map((m, i) => (
                    <Marker key={i}
                        position={{ lat: m.lat, lng: m.lng }}
                        icon={{ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#4f46e5" stroke="white" stroke-width="2"/><text x="16" y="21" text-anchor="middle" font-size="14">🚕</text></svg>`), scaledSize: { width: 36, height: 36 } }}
                        onClick={() => setSelected(m)}
                        title={m.label}
                    />
                ))}

                {/* Driver location marker */}
                {driverMarker && (
                    <Marker
                        position={{ lat: driverMarker.lat, lng: driverMarker.lng }}
                        icon={{ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#10b981" stroke="white" stroke-width="2"/><text x="20" y="26" text-anchor="middle" font-size="18">🚗</text></svg>`), scaledSize: { width: 40, height: 40 } }}
                        title="הנהג שלך"
                    />
                )}

                {/* Passenger location marker */}
                {passengerMarker && (
                    <Marker
                        position={{ lat: passengerMarker.lat, lng: passengerMarker.lng }}
                        icon={{ url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#ef4444" stroke="white" stroke-width="2"/><text x="20" y="26" text-anchor="middle" font-size="18">📍</text></svg>`), scaledSize: { width: 40, height: 40 } }}
                        title="המיקום שלך"
                    />
                )}

                {/* InfoWindow for selected driver */}
                {selected && (
                    <InfoWindow
                        position={{ lat: selected.lat, lng: selected.lng }}
                        onCloseClick={() => setSelected(null)}>
                        <div style={{ direction: "rtl", minWidth: 140 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{selected.label || "נהג"}</div>
                            {selected.rating && <div style={{ fontSize: 13 }}>⭐ {selected.rating}</div>}
                            {selected.distanceKm != null && <div style={{ fontSize: 12, color: "#666" }}>📏 {selected.distanceKm} ק"מ ממך</div>}
                        </div>
                    </InfoWindow>
                )}
            </GoogleMap>
        </div>
    );
}

export default React.memo(MapComponent);
