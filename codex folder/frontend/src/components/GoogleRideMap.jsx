import { useEffect, useMemo, useRef, useState } from "react";
import { getGoogleMapsApiKey, loadGoogleMaps } from "../utils/googleMaps";

const fallbackStyle = {
    position: "relative",
    minHeight: 320,
    borderRadius: 18,
    overflow: "hidden",
    background:
        "linear-gradient(135deg, rgba(14,116,144,0.16), rgba(21,128,61,0.16)), repeating-linear-gradient(45deg, rgba(15,23,42,0.08) 0 2px, transparent 2px 32px)",
    border: "1px solid #dbeafe"
};

const pinStyle = (top, left, color) => ({
    position: "absolute",
    top,
    left,
    transform: "translate(-50%, -50%)",
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: color,
    border: "4px solid white",
    boxShadow: "0 10px 24px rgba(15,23,42,0.22)"
});

export default function GoogleRideMap({
    pickup,
    destination,
    drivers,
    selectedDriverId,
    onDriverSelect,
    requests = [],
    mode = "passenger"
}) {
    const mapRef = useRef(null);
    const googleMap = useRef(null);
    const markers = useRef([]);
    const [hasGoogleMap, setHasGoogleMap] = useState(false);
    const hasKey = Boolean(getGoogleMapsApiKey());

    const center = useMemo(() => pickup || { lat: 32.0809, lng: 34.7806 }, [pickup]);

    useEffect(() => {
        if (!hasKey || !mapRef.current) return;

        loadGoogleMaps()
            .then((maps) => {
                if (!googleMap.current) {
                    googleMap.current = new maps.Map(mapRef.current, {
                        center,
                        zoom: 13,
                        disableDefaultUI: true,
                        zoomControl: true,
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false
                    });
                }
                setHasGoogleMap(true);
            })
            .catch(() => setHasGoogleMap(false));
    }, [center, hasKey]);

    useEffect(() => {
        if (!hasGoogleMap || !window.google?.maps || !googleMap.current) return;
        const maps = window.google.maps;
        markers.current.forEach(marker => marker.setMap(null));
        markers.current = [];

        googleMap.current.setCenter(center);

        const addMarker = ({ position, title, color, onClick }) => {
            const marker = new maps.Marker({
                position,
                title,
                map: googleMap.current,
                icon: {
                    path: maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 1,
                    strokeColor: "#ffffff",
                    strokeWeight: 3,
                    scale: 9
                }
            });
            if (onClick) marker.addListener("click", onClick);
            markers.current.push(marker);
        };

        addMarker({ position: pickup, title: "Pickup", color: "#2563eb" });
        addMarker({ position: destination, title: "Destination", color: "#16a34a" });

        drivers.forEach((driver) => {
            addMarker({
                position: driver.location,
                title: driver.name,
                color: driver.id === selectedDriverId ? "#dc2626" : "#f59e0b",
                onClick: () => onDriverSelect?.(driver.id)
            });
        });

        requests.forEach((request) => {
            addMarker({
                position: request.location,
                title: request.title,
                color: "#7c3aed"
            });
        });
    }, [center, destination, drivers, hasGoogleMap, onDriverSelect, pickup, requests, selectedDriverId]);

    if (hasKey) {
        return (
            <div
                ref={mapRef}
                className="map-panel"
                aria-label="מפת Google Maps עם נהגים ובקשות נסיעה סמוכות"
            />
        );
    }

    return (
        <div style={fallbackStyle} className="map-panel fallback-map" aria-label="מפת דמו מקומית">
            <div style={pinStyle("52%", "44%", "#2563eb")} title="נקודת איסוף" />
            <div style={pinStyle("28%", "72%", "#16a34a")} title="יעד" />
            {drivers.map((driver, index) => (
                <button
                    key={driver.id}
                    type="button"
                    className={`fallback-driver-pin ${driver.id === selectedDriverId ? "selected" : ""}`}
                    style={{
                        top: `${24 + index * 14}%`,
                        left: `${24 + index * 12}%`
                    }}
                    onClick={() => onDriverSelect?.(driver.id)}
                    aria-label={`בחר נהג ${driver.name}`}
                >
                    {mode === "driver" ? "בקשה" : "נהג"}
                </button>
            ))}
            <div className="map-note">
                כדי להציג Google Maps אמיתי יש להגדיר REACT_APP_GOOGLE_MAPS_API_KEY.
            </div>
        </div>
    );
}
