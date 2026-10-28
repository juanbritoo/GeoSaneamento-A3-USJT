
import { useEffect, useRef, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { buscarSaneamento } from "../../services/api";

// ==========================================
// ESTILOS DOS MUNICÍPIOS
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

const estiloSelecionado = {
  color: "#1565c0",
  weight: 4,
  fillColor: "#90caf9",
  fillOpacity: 0.75
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

    map.fitBounds(limites);
    map.setMaxBounds(limites);
    map.options.maxBoundsViscosity = 1.0;
  }, [geojson, map]);

  return null;
}

// ==========================================
// TRATAMENTO DE ERROS DA API
// ==========================================

function obterMensagemErro(error) {
  const status = error?.status;
  const mensagem = error?.message ?? "";

  if (status === 404 || mensagem.includes("HTTP 404")) {
    return "Município não encontrado no banco de dados de saneamento.";
  }

  if (status === 422 || mensagem.includes("HTTP 422")) {
    return "O código territorial enviado é inválido. Verifique o código IBGE.";
  }

  if (status === 503 || mensagem.includes("HTTP 503")) {
    return mensagem ||
      "O banco de dados está indisponível no momento.";
  }

  if (
    error?.cause ||
    mensagem.includes("Failed to fetch") ||
    mensagem.includes("conectar à API")
  ) {
    return "Não foi possível conectar ao backend. Verifique se a API está disponível.";
  }

  return mensagem ||
    "Não foi possível carregar os indicadores. Consulte o Console para detalhes.";
}

// ==========================================
// COMPONENTE PRINCIPAL DO MAPA
// ==========================================

function Map() {
  const [municipios, setMunicipios] = useState(null);
  const [erroMapa, setErroMapa] = useState("");

  const [municipioSelecionado, setMunicipioSelecionado] = useState(null);
  const [dadosSaneamento, setDadosSaneamento] = useState(null);
  const [carregandoSaneamento, setCarregandoSaneamento] = useState(false);
  const [erroSaneamento, setErroSaneamento] = useState("");

  const camadaSelecionada = useRef(null);
  const requisicaoAtual = useRef(0);

  // ==========================================
  // FECHAR PAINEL DO MUNICÍPIO
  // ==========================================

  const fecharPainel = () => {
    if (camadaSelecionada.current) {
      camadaSelecionada.current.setStyle(estiloNormal);
      camadaSelecionada.current = null;
    }

    // Invalida qualquer requisição anterior ainda em andamento.
    requisicaoAtual.current += 1;

    setMunicipioSelecionado(null);
    setDadosSaneamento(null);
    setCarregandoSaneamento(false);
    setErroSaneamento("");
  };

  // ==========================================
  // CARREGAR GEOJSON DOS MUNICÍPIOS
  // ==========================================

  useEffect(() => {
    let ativo = true;

    async function carregarMunicipios() {
      try {
        const resposta = await fetch(
          "/maps/sao_paulo_municipios.geojson"
        );

        if (!resposta.ok) {
          throw new Error(`HTTP ${resposta.status}`);
        }

        const geojson = await resposta.json();

        if (ativo) {
          setMunicipios(geojson);
          setErroMapa("");
        }
      } catch (error) {
        console.error(
          "Erro ao carregar o GeoJSON dos municípios:",
          error
        );

        if (ativo) {
          setErroMapa(
            "Não foi possível carregar o mapa dos municípios."
          );
        }
      }
    }

    carregarMunicipios();

    return () => {
      ativo = false;
    };
  }, []);

  // ==========================================
  // SELECIONAR MUNICÍPIO E CONSULTAR BACKEND
  // ==========================================

  const selecionarMunicipio = async (propriedades, camada) => {
    // Restaura o estilo do município selecionado anteriormente.
    if (camadaSelecionada.current) {
      camadaSelecionada.current.setStyle(estiloNormal);
    }

    camada.setStyle(estiloSelecionado);
    camadaSelecionada.current = camada;

    setMunicipioSelecionado(propriedades);
    setDadosSaneamento(null);
    setErroSaneamento("");
    setCarregandoSaneamento(true);

    // Identificador para impedir que respostas antigas
    // sobrescrevam os dados do município mais recente.
    const idRequisicao = ++requisicaoAtual.current;

    try {
      const codigoOriginal = propriedades.CD_MUN;

      if (
        codigoOriginal === null ||
        codigoOriginal === undefined ||
        !/^\d{7}$/.test(String(codigoOriginal))
      ) {
        throw new Error(
          `Código IBGE municipal inválido: ${codigoOriginal}`
        );
      }

      const codigoIBGE = String(codigoOriginal);

      console.log(
        "Município selecionado:",
        propriedades.NM_MUN
      );

      console.log(
        "Código IBGE enviado ao backend:",
        codigoIBGE
      );

      // Consulta o endpoint de saneamento da API FastAPI.
      const dados = await buscarSaneamento(
        "municipio",
        codigoIBGE
      );

      // Ignora a resposta caso outro município tenha sido selecionado.
      if (idRequisicao !== requisicaoAtual.current) {
        return;
      }

      setDadosSaneamento(dados);
    } catch (error) {
      if (idRequisicao !== requisicaoAtual.current) {
        return;
      }

      console.error(
        "Erro ao buscar dados de saneamento:",
        error
      );

      setErroSaneamento(obterMensagemErro(error));
    } finally {
      if (idRequisicao === requisicaoAtual.current) {
        setCarregandoSaneamento(false);
      }
    }
  };

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        position: "relative"
      }}
    >
      {/* Erro ao carregar o arquivo GeoJSON */}
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
        center={[-22.2, -48.8]}
        zoom={7}
        style={{
          height: "100%",
          width: "100%"
        }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {municipios && (
          <>
            <GeoJSON
              data={municipios}
              style={estiloNormal}
              onEachFeature={(feature, layer) => {
                const propriedades = feature.properties ?? {};

                // Popup com informações geográficas do município.
                layer.bindPopup(`
                  <div>
                    <h3>${propriedades.NM_MUN ?? "Município"}</h3>
                    <p>
                      <strong>Código IBGE:</strong>
                      ${propriedades.CD_MUN ?? "Não informado"}
                    </p>
                    <p>
                      <strong>UF:</strong>
                      ${propriedades.SIGLA_UF ?? "SP"}
                    </p>
                    <p>
                      <strong>Área:</strong>
                      ${propriedades.AREA_KM2 ?? "Não informada"} km²
                    </p>
                  </div>
                `);

                layer.on({
                  mouseover: (evento) => {
                    evento.target.openPopup();

                    if (
                      camadaSelecionada.current === evento.target
                    ) {
                      evento.target.setStyle(estiloSelecionado);
                    } else {
                      evento.target.setStyle(estiloHover);
                    }
                  },

                  mouseout: (evento) => {
                    evento.target.closePopup();

                    if (
                      camadaSelecionada.current === evento.target
                    ) {
                      evento.target.setStyle(estiloSelecionado);
                    } else {
                      evento.target.setStyle(estiloNormal);
                    }
                  },

                  click: (evento) => {
                    evento.target.closePopup();

                    selecionarMunicipio(
                      propriedades,
                      evento.target
                    );
                  }
                });
              }}
            />

            <AjustarMapa geojson={municipios} />
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

