import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronDown, CircleCheck, CircleHelp, Info, Layers, MapPin, TriangleAlert, UsersRound } from 'lucide-react';
import { Marker, Tooltip } from 'react-leaflet';
import { DivIcon, DomEvent } from 'leaflet';
import { buscarCorrelacao, eventosQuestionarioV2 } from '../../services/api';
import './CamadaParticipativa.css';

const ESTADOS = {
  sem_alerta: 'Sem alerta',
  amostra_insuficiente: 'Amostra insuficiente',
  nao_comparavel: 'Não comparável',
  possivel_divergencia: 'Possível divergência',
  divergencia_elevada: 'Divergência identificada',
  sem_dados: 'Sem dados comparáveis',
};

function pontoInterno(geometria) {
  const poligonos = geometria?.type === 'Polygon' ? [geometria.coordinates]
    : geometria?.type === 'MultiPolygon' ? geometria.coordinates : [];
  let melhor = null;
  for (const aneis of poligonos) {
    if (!aneis?.length || aneis.some((anel) => anel.length < 4 || anel.some(
      (p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])))) continue;
    const alturas = [...new Set(aneis.flat().map((p) => p[1]))].sort((a, b) => a - b);
    // Entre vertices, intersecoes alternadas delimitam interior, excluindo buracos.
    for (let i = 1; i < alturas.length; i++) {
      const y = (alturas[i - 1] + alturas[i]) / 2;
      const cortes = [];
      for (const anel of aneis) {
        for (let j = 0, k = anel.length - 1; j < anel.length; k = j++) {
          const a = anel[k], b = anel[j];
          if ((a[1] > y) !== (b[1] > y)) cortes.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
      }
      cortes.sort((a, b) => a - b);
      for (let j = 0; j + 1 < cortes.length; j += 2) {
        const largura = cortes[j + 1] - cortes[j];
        const folga = Math.min(largura, alturas[i] - alturas[i - 1]);
        if (folga > 0 && (!melhor || folga > melhor.folga)) melhor = { folga, posicao: [y, (cortes[j] + cortes[j + 1]) / 2] };
      }
    }
  }
  return melhor?.posicao ?? null;
}

function validarDados(dados) {
  const ids = new Set();
  if (!Array.isArray(dados?.distritos) || dados.distritos.some((d) => {
    const invalido = !/^[0-9]{9}$/.test(d?.id_territorial) || ids.has(d.id_territorial) ||
      typeof d.nome_territorio !== 'string' || !Number.isSafeInteger(d.total_questionarios) || d.total_questionarios < 0 ||
      !Object.hasOwn(ESTADOS, d.resumo?.status) || typeof d.resumo?.exibir_alerta !== 'boolean';
    ids.add(d?.id_territorial);
    return invalido;
  })) throw new Error('Resposta participativa inválida.');
  return dados.distritos;
}

function visual(distrito) {
  const simulado = distrito.resumo_simulado;
  if (distrito.resumo.indicadores_comparados === 0 && simulado?.indicadores_comparados > 0 &&
      simulado.exibir_alerta === false && Object.hasOwn(ESTADOS, simulado.status)) {
    return { alerta: false, destaque: ['possivel_divergencia', 'divergencia_elevada'].includes(simulado.status), simulada: true, classe: simulado.status,
      texto: ` ${ESTADOS[simulado.status]}. Maior diferença identificada: ${simulado.maior_divergencia_absoluta_pp?.toLocaleString('pt-BR')} p.p.` };
  }
  const { status, exibir_alerta } = distrito.resumo;
  const divergente = status === 'possivel_divergencia' || status === 'divergencia_elevada';
  const alerta = divergente && exibir_alerta === true;
  return { alerta, classe: divergente && !alerta ? 'nao_comparavel' : status,
    texto: divergente && !alerta ? 'Alerta não autorizado pelo backend' : ESTADOS[status] };
}

function ConteudoTooltipParticipativo({ distrito }) {
  const estado = visual(distrito);
  const resumo = estado.simulada ? distrito.resumo_simulado : distrito.resumo;
  const diferenca = resumo?.maior_divergencia_absoluta_pp;
  const disponivel = resumo?.indicadores_comparados > 0 && Number.isFinite(diferenca);
  const Icone = estado.alerta || estado.destaque ? TriangleAlert
    : estado.classe === 'sem_alerta' ? CircleCheck : CircleHelp;
  const simulada = distrito.indicadores?.some((i) => i.is_mock || i.simulacao);
  return <div className={`participativa-tooltip-conteudo participativa-${estado.classe}`}>
    <div className="cobertura-tooltip-titulo"><MapPin size={16} color="#2272ED" aria-hidden="true" /><strong>{distrito.nome_territorio}</strong></div>
    <div className="cobertura-tooltip-indice" style={{ '--cobertura-cor': '#2272ED' }}>
      <strong className="cobertura-tooltip-valor">{distrito.total_questionarios.toLocaleString('pt-BR')}</strong>
      <span className="cobertura-tooltip-rotulo">{distrito.total_questionarios === 1 ? 'Questionário' : 'Questionários'}</span>
    </div>
    <div className="participativa-tooltip-status"><Icone size={16} aria-hidden="true" /><span>{ESTADOS[estado.classe]}</span></div>
    <div className="participativa-tooltip-diferenca"><span>Maior diferença identificada</span>
      <strong>{disponivel ? `${diferenca.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} p.p.` : 'Não disponível'}</strong>
    </div>
    <div className="participativa-tooltip-rodape"><small>Clique para analisar</small>
      {simulada && <span className="participativa-tooltip-info" tabIndex={0} aria-label="Os dados de referência deste distrito são simulados para fins acadêmicos.">
        <Info size={14} aria-hidden="true" /><span role="tooltip">Os dados de referência deste distrito são simulados para fins acadêmicos.</span>
      </span>}
    </div>
  </div>;
}

function PinsParticipativos({ posicoes, onSelecionarDistrito, idSelecionado }) {
  const [consulta, setConsulta] = useState({ estado: 'carregando', distritos: [] });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    let controlador;
    let sequencia = 0;
    const carregar = () => {
      const atual = ++sequencia;
      controlador?.abort();
      controlador = new AbortController();
      const { signal } = controlador;
      Promise.resolve().then(async () => {
        if (!ativo || atual !== sequencia) return;
        setConsulta({ estado: 'carregando', distritos: [] });
        try {
          const distritos = validarDados(await buscarCorrelacao({ signal }));
          if (ativo && atual === sequencia) setConsulta({ estado: 'pronto', distritos });
        } catch (erro) {
          if (ativo && atual === sequencia && erro.name !== 'AbortError') setConsulta({ estado: 'erro', distritos: [] });
        }
      });
    };
    eventosQuestionarioV2.addEventListener('registrado', carregar);
    carregar();
    return () => {
      ativo = false;
      controlador?.abort();
      eventosQuestionarioV2.removeEventListener('registrado', carregar);
    };
  }, [tentativa]);

  const pins = useMemo(() => consulta.distritos.filter((d) => d.total_questionarios > 0).map((d) => {
    const posicao = posicoes.get(d.id_territorial);
    if (!posicao) return null;
    const estado = visual(d);
    const texto = `${d.nome_territorio}: ${d.total_questionarios.toLocaleString('pt-BR')} questionários. ${estado.texto}.`;
    const quantidade = d.total_questionarios.toLocaleString('pt-BR');
    const largura = 40 + quantidade.length * 8;
    const conteudo = renderToStaticMarkup(<span className="participativa-pin-conteudo"><UsersRound size={14} aria-hidden="true" /><span>{quantidade}</span>{(estado.alerta || estado.destaque) && <span className="participativa-pin-alerta" aria-hidden="true"><TriangleAlert size={11} /></span>}</span>);
    return { distrito: d, posicao, texto, icon: new DivIcon({
      html: conteudo, className: `participativa-pin participativa-${estado.classe} ${d.id_territorial === idSelecionado ? 'participativa-selecionado' : ''}`,
      iconSize: [largura, 30], iconAnchor: [largura / 2, 15], tooltipAnchor: [0, -17],
    }) };
  }).filter(Boolean), [consulta.distritos, posicoes, idSelecionado]);
  const semGeometria = consulta.distritos.filter((d) => d.total_questionarios > 0 && !posicoes.has(d.id_territorial)).length;

  return <>
    <div className="participativa-informacoes" aria-live="polite">
      {consulta.estado === 'carregando' && <p role="status">Carregando percepção popular...</p>}
      {consulta.estado === 'erro' && <><p role="alert">Não foi possível carregar a percepção popular.</p><button type="button" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</button></>}
      {consulta.estado === 'pronto' && <>
        {pins.length === 0 && <p>Não há questionários disponíveis para exibir nesta malha.</p>}
        {semGeometria > 0 && <p>{semGeometria} distrito(s) com respostas sem posição disponível na malha.</p>}
        <details className="participativa-legenda"><summary>Legenda dos pins<ChevronDown size={16} aria-hidden="true" /></summary>
          <ul>{Object.entries(ESTADOS).filter(([status]) => status !== 'sem_dados').map(([status, texto]) =>
            <li key={status}><span className={`participativa-amostra participativa-${status}`} aria-hidden="true">{status.includes('divergencia') || status === 'divergencia_elevada' ? <TriangleAlert size={12} /> : <UsersRound size={12} />}</span>{texto}</li>)}</ul>
          <p>Números indicam questionários, não pessoas únicas. Diferenças em amostras voluntárias não comprovam irregularidades.</p>
        </details>
      </>}
    </div>
    {pins.map(({ distrito, posicao, texto, icon }) => <Marker key={distrito.id_territorial} position={posicao} icon={icon}
      zIndexOffset={distrito.id_territorial === idSelecionado ? 1000 : 0} title={texto} alt={texto} keyboard autoPanOnFocus={false} riseOnHover
      eventHandlers={{ click: () => onSelecionarDistrito({ id_territorial: distrito.id_territorial, nome: distrito.nome_territorio }, 'comparativa') }}>
      <Tooltip direction="top" opacity={1} interactive className="cobertura-tooltip participativa-tooltip"><ConteudoTooltipParticipativo distrito={distrito} /></Tooltip>
    </Marker>)}
  </>;
}

export default function CamadaParticipativa({ distritos, onSelecionarDistrito, idSelecionado }) {
  const [ativa, setAtiva] = useState(false);
  const controle = useRef(null);
  const posicoes = useMemo(() => {
    const resultado = new Map();
    for (const feature of distritos.features ?? []) {
      const posicao = pontoInterno(feature.geometry);
      if (posicao) resultado.set(feature.properties.id_territorial, posicao);
    }
    return resultado;
  }, [distritos]);
  useEffect(() => {
    DomEvent.disableClickPropagation(controle.current);
    DomEvent.disableScrollPropagation(controle.current);
  }, []);
  return <div ref={controle} className="participativa-controle">
    <button type="button" className="participativa-toggle" aria-pressed={ativa} onClick={() => setAtiva((valor) => !valor)}><Layers size={20} aria-hidden="true" /><span>Percepção popular</span><span className="participativa-switch" aria-hidden="true" /></button>
    {ativa && <PinsParticipativos idSelecionado={idSelecionado} posicoes={posicoes} onSelecionarDistrito={onSelecionarDistrito} />}
  </div>;
}
