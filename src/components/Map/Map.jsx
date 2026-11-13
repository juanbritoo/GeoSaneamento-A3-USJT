
import { useCallback, useEffect, useRef, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { buscarGeoJSONDistritos } from "../../services/api";

// ==========================================
// ESTILOS DOS DISTRITOS
// ==========================================

const estiloNormal = {
  color: "var(--color-primary)",
  weight: 1.5,
  fillColor: "var(--color-background)",
  fillOpacity: 0.15
};

const estiloHover = {
  color: "var(--map-district-hover)",
  weight: 3,
  fillColor: "var(--color-primary-light)",
  fillOpacity: 0.5
};

const estiloSelecionado = {
  color: "var(--color-primary)",
  weight: 3,
  fillColor: "var(--color-primary)",
  fillOpacity: 0.25
};

// ==========================================
// CAMADA DOS DISTRITOS
// ==========================================

function CamadaDistritos({
  distritos,
  idSelecionado,
  onSelecionarDistrito
}) {
  const camadaRef = useRef(null);
  const selecaoRef = useRef(null);

  useEffect(() => {
    selecaoRef.current = idSelecionado;

    camadaRef.current?.eachLayer((camada) => {
      const selecionado =
        camada.feature.properties.id_territorial === idSelecionado;

      camada.setStyle(
        selecionado ? estiloSelecionado : estiloNormal
      );
    });
  }, [idSelecionado, distritos]);

  const configurarDistrito = useCallback((feature, camada) => {
    const { id_territorial, nome } = feature.properties;

    const nomeTooltip = document.createElement("span");
    nomeTooltip.textContent = nome;

    camada.bindTooltip(nomeTooltip, {
      sticky: true,
      direction: "auto",
      opacity: 0.95
    });

    camada.on({
      mouseover: () => {
        if (selecaoRef.current !== id_territorial) {
          camada.setStyle(estiloHover);
        }
      },

      mouseout: () => {
        camada.setStyle(
          selecaoRef.current === id_territorial
            ? estiloSelecionado
            : estiloNormal
        );
      },

      click: () => {
        onSelecionarDistrito({ id_territorial, nome });
      }
    });
  }, [onSelecionarDistrito]);

  return (
    <GeoJSON
      className="district-polygon"
      ref={camadaRef}
      data={distritos}
      style={estiloNormal}
      onEachFeature={configurarDistrito}
    />
  );
}

// ==========================================
// MOVIMENTAÇÃO LIMITADA DO MAPA
// ==========================================

function LimitarArraste({ limites }) {
  const map = useMap();

  useEffect(() => {
    if (!limites?.isValid()) return;

    let ajustando = false;

    const limitarMovimentacao = () => {
      if (ajustando) return;

      const centro = map.getCenter();

      // Mantém o centro dentro da extensão geográfica
      // dos distritos, sem utilizar setMaxBounds.
      const latitude = Math.max(
        limites.getSouth(),
        Math.min(limites.getNorth(), centro.lat)
      );

      const longitude = Math.max(
        limites.getWest(),
        Math.min(limites.getEast(), centro.lng)
      );

      // Só corrige quando o centro ultrapassa os limites.
      if (
        latitude !== centro.lat ||
        longitude !== centro.lng
      ) {
        ajustando = true;

        map.panTo(
          [latitude, longitude],
          { animate: false }
        );

        ajustando = false;
      }
    };

    // Limita durante o arraste, não depois que o usuário solta.
    map.on("drag", limitarMovimentacao);

    return () => {
      map.off("drag", limitarMovimentacao);
    };
  }, [map, limites]);

  return null;
}

// ==========================================
// AJUSTE INICIAL DO MAPA
// ==========================================

function AjustarMapa({ geojson }) {
  const map = useMap();
  const inicializado = useRef(false);

  useEffect(() => {
    if (!geojson || inicializado.current) return;

    const camada = L.geoJSON(geojson);
    const limites = camada.getBounds();

    if (!limites.isValid()) return;

    const container = map.getContainer();

    let quadro;

    const enquadrarInicialmente = () => {
      if (
        container.clientWidth <= 32 ||
        container.clientHeight <= 32
      ) {
        return;
      }

      map.invalidateSize({
        pan: false,
        animate: false
      });

      const zoomInicial = map.getBoundsZoom(
        limites,
        false,
        L.point(32, 32)
      );

      // Enquadramento inicial da malha territorial.
      map.setMinZoom(zoomInicial);

      map.setView(
        limites.getCenter(),
        Math.min(zoomInicial, 18),
        { animate: false }
      );

      inicializado.current = true;
    };

    quadro = requestAnimationFrame(enquadrarInicialmente);

    return () => {
      cancelAnimationFrame(quadro);
    };
  }, [geojson, map]);

  // Redimensiona sem reposicionar o mapa.
  useEffect(() => {
    const container = map.getContainer();

    const observador = new ResizeObserver(() => {
      map.invalidateSize({
        pan: false,
        animate: false
      });
    });

    observador.observe(container);

    return () => {
      observador.disconnect();
    };
  }, [map]);

  return null;
}

// ==========================================
// COMPONENTE PRINCIPAL DO MAPA
// ==========================================

function Map({
  distritoSelecionado,
  onSelecionarDistrito
}) {
  const [distritos, setDistritos] = useState(null);
  const [erroMapa, setErroMapa] = useState("");

  const [limites, setLimites] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function carregarDistritos() {
      try {
        const geojson = await buscarGeoJSONDistritos();

        if (ativo) {
          const camada = L.geoJSON(geojson);
          const bounds = camada.getBounds();

          if (!bounds.isValid()) {
            throw new Error("GeoJSON sem limites geográficos válidos.");
          }

          setDistritos(geojson);
          setLimites(bounds);
          setErroMapa("");
        }
      } catch (error) {
        console.error(
          "Erro ao carregar o GeoJSON dos distritos:",
          error
        );

        if (ativo) {
          setErroMapa(
            "Falha ao carregar o mapa dos distritos de São Paulo. Verifique a API e a malha distrital."
          );
        }
      }
    }

    carregarDistritos();

    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="map-view">

      {erroMapa && (
        <div role="alert" className="map-error">
          {erroMapa}
        </div>
      )}

      <MapContainer
        center={[-23.55, -46.63]}
        zoom={10}
        zoomSnap={0.25}
        minZoom={5}
        maxZoom={18}

        // Arraste habilitado.
        dragging={true}

        // Mantém os controles originais.
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={true}
        trackResize={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {distritos && limites && (
          <>
            <CamadaDistritos
              distritos={distritos}
              idSelecionado={
                distritoSelecionado?.id_territorial ?? null
              }
              onSelecionarDistrito={onSelecionarDistrito}
            />

            <AjustarMapa geojson={distritos} />

            <LimitarArraste limites={limites} />
          </>
        )}
      </MapContainer>

    </div>
  );
}

export default Map;
