
import { useEffect, useState } from "react";

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
  color: "#1b5e20",
  weight: 1,
  fillColor: "#c8e6c1",
  fillOpacity: 0.35
};

const estiloHover = {
  color: "#000000",
  weight: 3,
  fillColor: "#c8e6c1",
  fillOpacity: 0.65
};

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

function Map() {
  const [distritos, setDistritos] = useState(null);
  const [erroMapa, setErroMapa] = useState("");

  const [municipioSelecionado, setMunicipioSelecionado] = useState(null);
  const [dadosSaneamento, setDadosSaneamento] = useState(null);
  const [carregandoSaneamento, setCarregandoSaneamento] = useState(false);
  const [erroSaneamento, setErroSaneamento] = useState("");

  // Painel preservado; seleção municipal temporariamente desativada.
  const fecharPainel = () => {
    setMunicipioSelecionado(null);
    setDadosSaneamento(null);
    setCarregandoSaneamento(false);
    setErroSaneamento("");
  };

  // ==========================================
  // CARREGAR GEOJSON DOS DISTRITOS
  // ==========================================

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
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative"
      }}
    >
      {/* Erro ao carregar a malha distrital */}
      {erroMapa && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 1000,
            padding: 12,
            backgroundColor: "white",
            color: "#b91c1c",
            borderRadius: 6
          }}
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
        style={{
          height: "100%",
          width: "100%"
        }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {distritos && (
          <>
            <GeoJSON
              data={distritos}
              style={estiloNormal}
              onEachFeature={(_feature, layer) => {
                // Popups e cliques municipais desativados nesta etapa.
                layer.on({
                  mouseover: (evento) => evento.target.setStyle(estiloHover),
                  mouseout: (evento) => evento.target.setStyle(estiloNormal)
                });
              }}
            />

            <AjustarMapa geojson={distritos} />
          </>
        )}
      </MapContainer>

      {/* Painel lateral de informações */}
      {municipioSelecionado && (
        <div
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            width: 320,
            maxWidth: "calc(100% - 70px)",
            maxHeight: "calc(100% - 60px)",
            overflowY: "auto",
            boxSizing: "border-box",
            padding: 20,
            backgroundColor: "white",
            borderRadius: 10,
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
            zIndex: 1000
          }}
        >
          <button
            type="button"
            onClick={fecharPainel}
            aria-label="Fechar painel"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              border: "none",
              background: "transparent",
              fontSize: 20,
              cursor: "pointer"
            }}
          >
            ✕
          </button>

          <h2
            style={{
              marginTop: 0,
              paddingRight: 20
            }}
          >
            {municipioSelecionado.NM_MUN ?? "Município"}
          </h2>

          <p>
            <strong>Código IBGE:</strong>
            <br />
            {municipioSelecionado.CD_MUN ?? "Não informado"}
          </p>

          <p>
            <strong>UF:</strong>
            <br />
            {municipioSelecionado.SIGLA_UF ?? "SP"}
          </p>

          <p>
            <strong>Área:</strong>
            <br />
            {municipioSelecionado.AREA_KM2 ?? "Não informada"} km²
          </p>

          <hr />

          <h3>Indicadores de Saneamento</h3>

          {/* Estado de carregamento */}
          {carregandoSaneamento && (
            <p role="status">
              Carregando indicadores...
            </p>
          )}

          {/* Erros da consulta ao backend */}
          {erroSaneamento && (
            <p
              role="alert"
              style={{
                color: "#b91c1c",
                fontSize: 14
              }}
            >
              {erroSaneamento}
            </p>
          )}

          {/* Dados recebidos da API */}
          {!carregandoSaneamento &&
            !erroSaneamento &&
            dadosSaneamento && (
              <>
                {Array.isArray(dadosSaneamento.territorios) &&
                dadosSaneamento.territorios.length > 0 ? (
                  dadosSaneamento.territorios.map((territorio) => (
                    <div
                      key={territorio.id_territorial}
                    >
                      {Array.isArray(territorio.indicadores) &&
                      territorio.indicadores.length > 0 ? (
                        territorio.indicadores.map(
                          (indicador, index) => (
                            <div
                              key={`${indicador.codigo}-${indicador.periodo}-${index}`}
                              style={{
                                padding: 12,
                                marginBottom: 10,
                                backgroundColor: "#EFF6FF",
                                borderRadius: 6
                              }}
                            >
                              <h4
                                style={{
                                  margin: "0 0 8px",
                                  color: "#1E4A9A"
                                }}
                              >
                                {indicador.nome ?? indicador.codigo}
                              </h4>

                              <p
                                style={{
                                  margin: "0 0 8px",
                                  fontSize: 20,
                                  fontWeight: "bold"
                                }}
                              >
                                {indicador.valor ?? "Não informado"}
                                {indicador.unidade
                                  ? ` ${indicador.unidade}`
                                  : ""}
                              </p>

                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#475569"
                                }}
                              >
                                <p style={{ margin: "4px 0" }}>
                                  <strong>Período:</strong>{" "}
                                  {indicador.periodo ?? "Não informado"}
                                </p>

                                <p style={{ margin: "4px 0" }}>
                                  <strong>Fonte:</strong>{" "}
                                  {indicador.fonte ?? "Não informada"}
                                </p>

                                <p style={{ margin: "4px 0" }}>
                                  <strong>Classificação:</strong>{" "}
                                  {indicador.classificacao_fonte ??
                                    "Não informada"}
                                </p>

                                <p style={{ margin: "4px 0" }}>
                                  <strong>Procedência:</strong>{" "}
                                  {indicador.procedencia ??
                                    "Não informada"}
                                </p>
                              </div>

                              {indicador.is_mock && (
                                <p
                                  style={{
                                    marginBottom: 0,
                                    color: "#92400e",
                                    fontSize: 12,
                                    fontWeight: "bold"
                                  }}
                                >
                                  ⚠ Dado simulado
                                </p>
                              )}
                            </div>
                          )
                        )
                      ) : (
                        <p>
                          Não há indicadores cadastrados para este município.
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p>
                    Não foram encontrados dados para este município.
                  </p>
                )}
              </>
            )}
        </div>
      )}
    </div>
  );
}

export default Map;

