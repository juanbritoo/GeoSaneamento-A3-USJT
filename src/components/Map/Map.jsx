
import { useCallback, useEffect, useRef, useState } from "react";

import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap
} from "react-leaflet";

import { renderToStaticMarkup } from "react-dom/server";
import { Layers, ChevronDown, MapPin } from "lucide-react";
import CamadaParticipativa from "./CamadaParticipativa";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { buscarGeoJSONDistritos, buscarSaneamento } from "../../services/api";

// ==========================================
// ESTILOS DOS DISTRITOS
// ==========================================

const FAIXAS_COBERTURA = [
  { limite: 80, nome: 'Crítico', cor: '#DC2626', intervalo: 'Abaixo de 80%' },
  { limite: 90, nome: 'Insatisfatório', cor: '#F97316', intervalo: '80% a < 90%' },
  { limite: 95, nome: 'Regular', cor: '#EAB308', intervalo: '90% a < 95%' },
  { limite: 98, nome: 'Bom', cor: '#84CC16', intervalo: '95% a < 98%' },
  { limite: Infinity, nome: 'Excelente', cor: '#22A06B', intervalo: '98% a 100%' },
  { nome: 'Indisponível', cor: '#94A3B8', intervalo: 'Dados insuficientes' },
];
const CODIGOS_COBERTURA = [
  'ABASTECIMENTO_AGUA_REDE_GERAL', 'ESGOTAMENTO_SANITARIO_REDE_GERAL',
  'DESTINO_LIXO_COLETA_DIRETA', 'EXISTENCIA_BANHEIRO_EXCLUSIVO',
];
const percentual = (valor) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

function classificarCobertura(media) {
  return Number.isFinite(media) && media >= 0 && media <= 100
    ? FAIXAS_COBERTURA.find((faixa) => media < faixa.limite)
    : FAIXAS_COBERTURA[5];
}

function calcularCobertura(indicadores = []) {
  const grupos = new globalThis.Map();
  for (const indicador of indicadores) {
    if (!CODIGOS_COBERTURA.includes(indicador.codigo) || !indicador.periodo?.trim()) continue;
    const grupo = grupos.get(indicador.periodo) ?? [];
    grupo.push(indicador);
    grupos.set(indicador.periodo, grupo);
  }
  const completos = [...grupos.entries()].filter(([, itens]) =>
    CODIGOS_COBERTURA.every((codigo) => itens.filter((i) => i.codigo === codigo).length === 1) &&
    itens.every((i) => Number.isFinite(i.valor) && i.valor >= 0 && i.valor <= 100 &&
      ['%', 'Percentual', 'percentual'].includes(i.unidade)));
  // Sem ordem anual inequívoca, não escolher arbitrariamente entre períodos.
  const anuais = completos.every(([periodo]) => /^[0-9]{4}$/.test(periodo));
  if (!completos.length || (completos.length > 1 && !anuais)) return null;
  completos.sort(([a], [b]) => b.localeCompare(a));
  const [periodo, itens] = completos[0];
  return { periodo, media: itens.reduce((soma, i) => soma + i.valor, 0) / 4,
    menor: itens.reduce((menor, i) => i.valor < menor.valor ? i : menor),
    simulado: itens.some((i) => i.is_mock === true) };
}

const estiloNormal = { color: '#FFFFFF', weight: 1, fillOpacity: 0.60 };
const estiloHover = { color: '#334155', weight: 2, fillOpacity: 0.90 };
const estiloSelecionado = { color: '#123F80', weight: 2.5, fillOpacity: 1 };

function estiloDistrito(cobertura, selecionado = false, hover = false) {
  return { ...(selecionado ? estiloSelecionado : hover ? estiloHover : estiloNormal),
    fillColor: classificarCobertura(cobertura?.media).cor };
}

function tooltipDistrito(nome, cobertura) {
  const faixa = classificarCobertura(cobertura?.media);
  return renderToStaticMarkup(
    <div style={{ '--cobertura-cor': faixa.cor }}>
      <div className="cobertura-tooltip-titulo"><MapPin size={16} color="#2272ED" aria-hidden="true" /><strong>{nome}</strong></div>
      <div className="cobertura-tooltip-indice">
        <span className="cobertura-tooltip-valor">{cobertura ? percentual(cobertura.media) : '—'}</span>
        <div className="cobertura-tooltip-rotulo"><span>Índice médio</span><strong>{faixa.nome}</strong></div>
      </div>
      <div className="cobertura-tooltip-barra" aria-hidden="true">
        {cobertura && <span style={{ width: `${cobertura.media}%` }} />}
      </div>
    </div>
  );
}

function CamadaDistritos({ distritos, coberturas, idSelecionado, onSelecionarDistrito }) {
  const camadaRef = useRef(null);
  const selecaoRef = useRef(null);
  const coberturasRef = useRef(coberturas);
  const hoverRef = useRef(null);

  useEffect(() => {
    selecaoRef.current = idSelecionado;
    coberturasRef.current = coberturas;
    camadaRef.current?.eachLayer((camada) => {
      const { id_territorial, nome } = camada.feature.properties;
      camada.setStyle(estiloDistrito(coberturas[id_territorial], id_territorial === idSelecionado, id_territorial === hoverRef.current));
      camada.setTooltipContent(tooltipDistrito(nome, coberturas[id_territorial]));
    });
  }, [idSelecionado, distritos, coberturas]);

  const configurarDistrito = useCallback((feature, camada) => {
    const { id_territorial, nome } = feature.properties;
    camada.bindTooltip(tooltipDistrito(nome, coberturasRef.current[id_territorial]), {
      sticky: true, direction: 'auto', opacity: 1, className: 'cobertura-tooltip',
    });
    camada.on({
      mouseover: () => {
        hoverRef.current = id_territorial;
        camada.setStyle(estiloDistrito(coberturasRef.current[id_territorial], selecaoRef.current === id_territorial, true));
      },
      mouseout: () => {
        hoverRef.current = null;
        camada.setStyle(estiloDistrito(coberturasRef.current[id_territorial], selecaoRef.current === id_territorial));
      },
      click: () => onSelecionarDistrito({ id_territorial, nome }),
    });
  }, [onSelecionarDistrito]);

  return <GeoJSON className="district-polygon" ref={camadaRef} data={distritos}
    style={(feature) => estiloDistrito(coberturas[feature.properties.id_territorial], feature.properties.id_territorial === idSelecionado)}
    onEachFeature={configurarDistrito} />;
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
  const [coberturas, setCoberturas] = useState({});
  const [estadoCobertura, setEstadoCobertura] = useState('carregando');
  const consultaCobertura = useRef(null);

  useEffect(() => {
    let ativo = true;
    consultaCobertura.current ??= buscarSaneamento('distrito');
    consultaCobertura.current.then((dados) => {
      if (!ativo) return;
      if (dados?.escala !== 'distrito' || !Array.isArray(dados.territorios)) throw new Error('Resposta distrital inválida');
      setCoberturas(Object.fromEntries(dados.territorios.map((t) => [t.id_territorial, calcularCobertura(t.indicadores)])));
      setEstadoCobertura('pronto');
    }).catch(() => { if (ativo) setEstadoCobertura('erro'); });
    return () => { ativo = false; };
  }, []);

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
              coberturas={coberturas}
              idSelecionado={
                distritoSelecionado?.id_territorial ?? null
              }
              onSelecionarDistrito={onSelecionarDistrito}
            />

            <CamadaParticipativa idSelecionado={distritoSelecionado?.id_territorial} distritos={distritos} onSelecionarDistrito={onSelecionarDistrito} />

            <AjustarMapa geojson={distritos} />

            <LimitarArraste limites={limites} />
          </>
        )}
      </MapContainer>
      <details className="cobertura-legenda">
        <summary><Layers size={18} aria-hidden="true" /><span>Cobertura de saneamento</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="cobertura-legenda-conteudo">
          <ul>{FAIXAS_COBERTURA.map((faixa) => <li key={faixa.nome}><span className="cobertura-cor" style={{ backgroundColor: faixa.cor }} aria-hidden="true" /><span><strong>{faixa.nome}</strong> · {faixa.intervalo}</span></li>)}</ul>
          {estadoCobertura !== 'pronto' && <p role="status">{estadoCobertura === 'carregando' ? 'Carregando cobertura…' : 'Cobertura indisponível: não foi possível consultar a API. Recarregue a página para tentar novamente.'}</p>}
        </div>
      </details>

    </div>
  );
}

export default Map;
