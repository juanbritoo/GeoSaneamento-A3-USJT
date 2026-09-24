import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function Map() {
    return (
        <MapContainer
            center={[-23.5505, -46.6333]}
            zoom={12}
            style={{
                height: "100%",
                width: "100%"
            }}
        >
            <TileLayer
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="&copy; OpenStreetMap contributors"
            />
        </MapContainer>
    );
}

export default Map;