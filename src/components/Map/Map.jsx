
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

function CamadaDistritos({ distritos, idSelecionado, onSelecionarDistrito }) {
  const camadaRef = useRef(null);
  const selecaoRef = useRef(null);

  useEffect(() => {
    selecaoRef.current = idSelecionado;
    camadaRef.current?.eachLayer((camada) => {
      const selecionado = camada.feature.properties.id_territorial === idSelecionado;
      camada.setStyle(selecionado ? estiloSelecionado : estiloNormal);
    });
  }, [idSelecionado, distritos]);

  const configurarDistrito = useCallback((feature, camada) => {
    const { id_territorial, nome } = feature.properties;
    // Conteudo textual evita interpretar nomes territoriais como HTML.
    const nomeTooltip = document.createElement("span");
    nomeTooltip.textContent = nome;
    camada.bindTooltip(nomeTooltip, {
      sticky: true,
      direction: "auto",
      opacity: 0.95
    });
    camada.on({
      mouseover: () => {
        if (selecaoRef.current !== id_territorial) camada.setStyle(estiloHover);
      },
      mouseout: () => {
        camada.setStyle(
          selecaoRef.current === id_territorial ? estiloSelecionado : estiloNormal
        );
      },
      click: () => onSelecionarDistrito({ id_territorial, nome })
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
// AJUSTE AUTOMÁTICO DO MAPA
// ==========================================

function AjustarMapa({ geojson }) {
  const map = useMap();

  useEffect(() => {
    if (!geojson) return;

    const camada = L.geoJSON(geojson);
    const limites = camada.getBounds();

    if (!limites.isValid()) return;

    const container = map.getContainer();
    let quadro;
    let larguraAnterior = 0;
    let alturaAnterior = 0;

    const enquadrar = () => {
      const largura = container.clientWidth;
      const altura = container.clientHeight;
      // Aguarda um tamanho util e evita repetir o ajuste para o mesmo tamanho.
      if (largura <= 32 || altura <= 32) return;
      if (largura === larguraAnterior && altura === alturaAnterior) return;

      map.stop();
      map.invalidateSize({ pan: false, animate: false });
      // getBoundsZoom considera o minZoom atual: libere-o antes do calculo.
      map.setMinZoom(0);
      const zoomMinimo = map.getBoundsZoom(limites, false, L.point(32, 32));
      map.fitBounds(limites, {
        padding: [16, 16],
        maxZoom: zoomMinimo,
        animate: false
      });
      map.setMinZoom(zoomMinimo);
      larguraAnterior = largura;
      alturaAnterior = altura;
    };

    const agendarEnquadramento = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(enquadrar);
    };

    agendarEnquadramento();
    // Observa tambem mudancas de tamanho do container sem resize da janela.
    const observador = new ResizeObserver(agendarEnquadramento);
    observador.observe(container);

    return () => {
      observador.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [geojson, map]);

  return null;
}

// ==========================================
// COMPONENTE PRINCIPAL DO MAPA
// ==========================================

function Map({ distritoSelecionado, onSelecionarDistrito }) {
  const [distritos, setDistritos] = useState(null);
  const [erroMapa, setErroMapa] = useState("");

  useEffect(() => {
    let ativo = true;

    async function carregarDistritos() {
      try {
        const geojson = await buscarGeoJSONDistritos();

        if (ativo) {
          setDistritos(geojson);
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
      {/* Erro ao carregar a malha distrital */}
      {erroMapa && (
        <div
          role="alert"
          className="map-error"
        >
          {erroMapa}
        </div>
      )}

      {/* Mapa interativo */}
      <MapContainer
        center={[-23.55, -46.63]}
        zoom={10}
        zoomSnap={0.25}
        maxZoom={18}
        dragging={false}
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

        {distritos && (
          <>
            <CamadaDistritos
              distritos={distritos}
              idSelecionado={distritoSelecionado?.id_territorial ?? null}
              onSelecionarDistrito={onSelecionarDistrito}
            />

            <AjustarMapa geojson={distritos} />
          </>
        )}
      </MapContainer>

    </div>
  );
}

export default Map;

