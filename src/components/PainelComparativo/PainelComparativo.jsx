import { useEffect, useState } from 'react';
import { CalendarDays, ChartNoAxesCombined, ChevronDown, CircleHelp, Database, Info, TriangleAlert, UsersRound } from 'lucide-react';
import IndicadoresDistrito, { CabecalhoIndicador, IconeIndicador } from '../IndicadoresDistrito';
import { perguntasV2 } from '../Questionario/perguntasV2';
import { buscarCorrelacao, buscarIndicadoresParticipativos, eventosQuestionarioV2 } from '../../services/api';
import './PainelComparativo.css';

const ABAS = [['oficiais', 'Dados de referência', 'Referência', Database], ['popular', 'Percepção popular', 'Percepção', UsersRound], ['comparativa', 'Análise comparativa', 'Comparação', ChartNoAxesCombined]];
const TITULOS = {
  ABASTECIMENTO_AGUA_REDE_GERAL: 'Abastecimento pela rede geral',
  ESGOTAMENTO_SANITARIO_REDE_GERAL: 'Esgotamento pela rede geral',
  DESTINO_LIXO_COLETA_DIRETA: 'Coleta direta de lixo',
  EXISTENCIA_BANHEIRO_EXCLUSIVO: 'Banheiro exclusivo',
  regularidade_agua: 'Regularidade do abastecimento',
  qualidade_agua_percebida: 'Qualidade percebida da água',
  condicoes_esgotamento: 'Condições de esgotamento',
  falta_agua_30_dias: 'Falta de água nos últimos 30 dias',
  esgoto_ceu_aberto_30_dias: 'Observação de esgoto exposto',
  satisfacao_saneamento: 'Satisfação com o saneamento',
};
const STATUS = { sem_dados: 'Sem dados', amostra_insuficiente: 'Amostra insuficiente',
  nao_comparavel: 'Não comparável', sem_alerta: 'Sem alerta',
  possivel_divergencia: 'Possível divergência', divergencia_elevada: 'Divergência identificada' };
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const valor = (n, unidade = '') => Number.isFinite(n) ? `${numero.format(n)}${unidade}` : 'Não disponível';
const diferenca = (n) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${numero.format(n)} p.p.` : 'Não disponível';
const data = (texto) => texto ? texto.split('-').reverse().join('/') : 'Não disponível';
const divergente = (status) => ['possivel_divergencia', 'divergencia_elevada'].includes(status);
const contagem = (n) => Number.isSafeInteger(n) && n >= 0;
const medida = (n) => n === null || Number.isFinite(n);

function validar(dados, id, aba) {
  const falhar = () => { throw new Error('Formato ou distrito inesperado.'); };
  const principais = (itens) => Array.isArray(itens) && itens.length === 4 &&
    new Set(itens.map((i) => i?.codigo)).size === 4 && itens.every((i) =>
      Object.hasOwn(TITULOS, i?.codigo) && contagem(i.respostas_validas));
  if (aba === 'popular') {
    if (dados?.territorio?.id_territorial !== id || !principais(dados.principais) ||
      !['total_questionarios', 'total_moradores', 'total_nao_moradores', 'total_comentarios'].every((k) => contagem(dados.contadores?.[k])) ||
      !dados.principais.every((i) => medida(i.valor)) ||
      !Array.isArray(dados.complementares?.percentuais) || !dados.complementares.percentuais.every((i) => typeof i.codigo === 'string' && medida(i.valor) && contagem(i.respostas_validas)) ||
      !Array.isArray(dados.complementares?.medias) || !dados.complementares.medias.every((i) => typeof i.campo === 'string' && medida(i.valor) && contagem(i.respostas_validas)) ||
      !Array.isArray(dados.complementares?.distribuicoes) || !dados.complementares.distribuicoes.every((i) => typeof i.campo === 'string' && contagem(i.respostas_validas) && contagem(i.total_nao_sei) && Array.isArray(i.categorias) && i.categorias.every((c) => typeof c.codigo === 'string' && medida(c.percentual) && contagem(c.total)))) falhar();
    return dados;
  }
  if (!Array.isArray(dados?.distritos) || dados.distritos.length !== 1) falhar();
  const distrito = dados.distritos[0];
  if (distrito?.id_territorial !== id || !contagem(distrito.total_questionarios) || !principais(distrito.indicadores) ||
    !Object.hasOwn(STATUS, distrito.resumo?.status) || typeof distrito.resumo.exibir_alerta !== 'boolean' ||
    !contagem(distrito.resumo.indicadores_comparados) || !contagem(distrito.resumo.indicadores_divergentes) ||
    !medida(distrito.resumo.maior_divergencia_absoluta_pp) ||
    !distrito.indicadores.every((i) => Object.hasOwn(STATUS, i.status) && ['valor_oficial', 'valor_participativo', 'divergencia_pp'].every((k) => medida(i[k])) &&
      ['fonte', 'periodo', 'procedencia', 'motivo', 'primeira_resposta', 'ultima_resposta', 'classificacao_fonte', 'unidade_oficial'].every((k) => i[k] == null || typeof i[k] === 'string'))) falhar();
  return distrito;
}

function Barra({ rotulo, percentual, classe = '' }) {
  const disponivel = Number.isFinite(percentual) && percentual >= 0 && percentual <= 100;
  return <div className={`comparativo-barra ${classe}`}>
    <div><span>{rotulo}</span><strong>{disponivel ? valor(percentual, '%') : 'Não disponível'}</strong></div>
    {disponivel && <div className="comparativo-trilho" aria-hidden="true"><span style={{ width: `${percentual}%` }} /></div>}
  </div>;
}

function Percepcao({ dados }) {
  const contadores = [['total_questionarios', 'Questionários'], ['total_moradores', 'De moradores'], ['total_nao_moradores', 'De não moradores'], ['total_comentarios', 'Comentários']];
  const eventos = { SATISFEITOS: 'Satisfeitos', COM_FALTA_AGUA: 'Com falta de água', OBSERVARAM_ESGOTO_EXPOSTO: 'Observaram esgoto exposto' };
  return <>
    <dl className="comparativo-contadores">{contadores.map(([codigo, titulo]) => <div key={codigo}><dt><IconeIndicador codigo={codigo} size={18} />{titulo}</dt><dd>{valor(dados.contadores[codigo])}</dd></div>)}</dl>
    {dados.contadores.total_questionarios === 0 && <p className="indicator-state">Este distrito ainda não recebeu contribuições da população.</p>}
    <h3>Condições de saneamento</h3>
    {dados.principais.map((i) => <article className="comparativo-card" key={i.codigo}><CabecalhoIndicador codigo={i.codigo} titulo={TITULOS[i.codigo]} />
      <p className="comparativo-valor">{valor(i.valor, '%')}</p>{i.valor !== null && <div className="comparativo-trilho" aria-hidden="true"><span style={{ width: `${i.valor}%` }} /></div>}<p className="comparativo-nota">{valor(i.respostas_validas)} respostas válidas</p></article>)}
    <article className="comparativo-card"><CabecalhoIndicador titulo="Avaliações de 0 a 10" />
      {dados.complementares.medias.map((i) => <div className="comparativo-media" key={i.campo}><div><IconeIndicador codigo={i.campo} size={16} /><span>{TITULOS[i.campo] ?? i.campo}</span><strong>{valor(i.valor, ' / 10')}</strong></div>
        {i.valor !== null && <div className="comparativo-trilho" aria-hidden="true"><span style={{ width: `${i.valor * 10}%` }} /></div>}<p className="comparativo-nota">{valor(i.respostas_validas)} respostas válidas</p></div>)}
    </article>
    <h3>Frequências e satisfação</h3>
    <article className="comparativo-card comparativo-frequencias">{dados.complementares.percentuais.map((i) => <div key={i.codigo}><div><IconeIndicador codigo={i.codigo} size={18} /><span>{eventos[i.codigo] ?? i.codigo}</span><strong>{valor(i.valor, '%')}</strong></div><p className="comparativo-nota">{valor(i.respostas_validas)} respostas válidas</p></div>)}</article>
    <details className="comparativo-card comparativo-detalhes"><summary>Ver distribuições completas<ChevronDown size={16} aria-hidden="true" /></summary>
      {dados.complementares.distribuicoes.map((i) => <section className="comparativo-distribuicao-grupo" key={i.campo}><CabecalhoIndicador codigo={i.campo} titulo={TITULOS[i.campo] ?? i.campo} />
        <p className="comparativo-nota">Respostas válidas: {valor(i.respostas_validas)} · Não sei: {valor(i.total_nao_sei)}</p>
        <ul className="comparativo-distribuicao">{i.categorias.map((c) => <li key={c.codigo}><span>{perguntasV2.find((p) => p.id === i.campo)?.opcoes?.find((o) => o.valor === c.codigo)?.texto ?? c.codigo}</span><strong>{valor(c.percentual, '%')}</strong><small>{valor(c.total)} respostas</small></li>)}</ul></section>)}
    </details>
    <p className="comparativo-aviso"><Info size={18} aria-hidden="true" />Cada indicador tem seu próprio denominador. Respostas desconhecidas e não aplicáveis ficam fora dos percentuais e médias; nota zero é válida.</p>
  </>;
}

const AVISO_REFERENCIA = 'Os dados de referência deste distrito são simulados para fins acadêmicos.';

function InfoReferencia() {
  return <span className="comparativo-info" tabIndex={0} aria-label={AVISO_REFERENCIA}>
    <Info size={14} aria-hidden="true" /><span role="tooltip">{AVISO_REFERENCIA}</span>
  </span>;
}

function Comparacao({ dados }) {
  const resumos = dados.resumo_simulado?.indicadores_comparados > 0
    ? [...(dados.resumo.indicadores_comparados > 0 ? [{ resumo: dados.resumo, simulado: false }] : []),
      { resumo: dados.resumo_simulado, simulado: true }]
    : [{ resumo: dados.resumo, simulado: false }];
  return <>
    {resumos.map(({ resumo, simulado }) => {
      const destaque = divergente(resumo.status) && (simulado || resumo.exibir_alerta);
      return <section key={String(simulado)} className={`comparativo-resumo ${destaque ? `comparativo-alerta ${resumo.status}` : ''}`} aria-label="Resumo da análise">
        <h3>{destaque ? <TriangleAlert size={20} aria-hidden="true" /> : <Info size={20} aria-hidden="true" />}{STATUS[resumo.status]}{simulado && <InfoReferencia />}</h3>
        <p>Questionários: {valor(dados.total_questionarios)}</p>
        <p>Indicadores comparados: {valor(resumo.indicadores_comparados)}</p>
        <p>Indicadores divergentes: {valor(resumo.indicadores_divergentes)}</p>
        <p>Maior diferença identificada: <strong>{valor(resumo.maior_divergencia_absoluta_pp, ' p.p.')}</strong></p>
        {resumo.indicador_critico && <p>{TITULOS[resumo.indicador_critico] ?? resumo.indicador_critico}</p>}
        {resumo.indicadores_comparados === 0 && <p>Sem indicadores disponíveis para comparação.</p>}
      </section>;
    })}
    {dados.indicadores.map((i) => {
      const simulada = i.is_mock === true || i.simulacao != null;
      const status = i.simulacao?.status_simulado ?? i.status;
      const destaque = divergente(status) && (i.simulacao != null || dados.resumo.exibir_alerta);
      const unidadePercentual = ['%', 'Percentual', 'percentual'].includes(i.unidade_oficial);
      return <article className={`comparativo-card ${destaque ? `comparativo-alerta ${status}` : ''}`} key={i.codigo}>
        <CabecalhoIndicador codigo={i.codigo} titulo={TITULOS[i.codigo]} />
        <p className="comparativo-status">{destaque ? <TriangleAlert size={16} aria-hidden="true" /> : status === 'nao_comparavel' ? <CircleHelp size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}{STATUS[status]}{simulada && <InfoReferencia />}</p>
        <div className="comparativo-duas-barras"><Barra rotulo="Dados de referência" percentual={unidadePercentual ? i.valor_oficial : null} classe="comparativo-referencia" />
        {!unidadePercentual && i.valor_oficial != null && <p>Valor da fonte: {valor(i.valor_oficial)} {i.unidade_oficial ?? '(unidade não informada)'}. Unidade incompatível com a barra percentual.</p>}
        <Barra rotulo="Percepção popular" percentual={i.valor_participativo} /></div>
        <p className="comparativo-diferenca">Diferença identificada: <strong>{diferenca(i.simulacao?.divergencia_pp ?? i.divergencia_pp)}</strong></p>
        <p>Respostas válidas: {valor(i.respostas_validas)}</p>
        {!i.simulacao && i.motivo && <p className="comparativo-motivo">{i.motivo}</p>}
        <details className="comparativo-detalhes"><summary>Fonte e período<ChevronDown size={16} aria-hidden="true" /></summary>
          <p><Database size={16} aria-hidden="true" />Fonte: {i.fonte || 'Não informada'}</p>
          <p><CalendarDays size={16} aria-hidden="true" />Referência: {i.periodo || 'Não informada'}</p>
          <p>Respostas válidas de {data(i.primeira_resposta)} a {data(i.ultima_resposta)}</p>
          {i.procedencia && <p>Procedência: {i.procedencia}</p>}
        </details>
      </article>;
    })}
  </>;
}

function Consulta({ idTerritorial, aba }) {
  const [consulta, setConsulta] = useState({ estado: 'carregando' });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true, sequencia = 0, controller;
    const carregar = () => {
      const atual = ++sequencia;
      controller?.abort();
      controller = new AbortController();
      const { signal } = controller;
      Promise.resolve().then(async () => {
        if (!ativo || atual !== sequencia) return;
        setConsulta({ estado: 'carregando' });
        try {
          const resposta = aba === 'popular' ? await buscarIndicadoresParticipativos(idTerritorial, { signal }) : await buscarCorrelacao({ signal }, idTerritorial);
          const dados = validar(resposta, idTerritorial, aba);
          if (ativo && atual === sequencia) setConsulta({ estado: 'pronto', dados });
        } catch (erro) {
          if (ativo && atual === sequencia && erro.name !== 'AbortError') setConsulta({ estado: 'erro' });
        }
      });
    };
    eventosQuestionarioV2.addEventListener('registrado', carregar);
    carregar();
    return () => { ativo = false; controller?.abort(); eventosQuestionarioV2.removeEventListener('registrado', carregar); };
  }, [idTerritorial, aba, tentativa]);
  if (consulta.estado === 'carregando') return <p role="status" className="indicator-state">Carregando dados do distrito...</p>;
  if (consulta.estado === 'erro') return <><p role="alert" className="indicator-state">Não foi possível carregar os dados deste distrito.</p><button type="button" className="indicator-retry" onClick={() => { setConsulta({ estado: 'carregando' }); setTentativa((n) => n + 1); }}>Tentar novamente</button></>;
  return aba === 'popular' ? <Percepcao dados={consulta.dados} /> : <Comparacao dados={consulta.dados} />;
}

export default function PainelComparativo({ idTerritorial, aba, onMudarAba }) {
  function navegar(evento, indice) {
    let destino;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % ABAS.length;
    if (evento.key === 'ArrowLeft') destino = (indice + ABAS.length - 1) % ABAS.length;
    if (evento.key === 'Home') destino = 0;
    if (evento.key === 'End') destino = ABAS.length - 1;
    if (destino === undefined) return;
    evento.preventDefault();
    onMudarAba(ABAS[destino][0]);
    evento.currentTarget.parentElement.children[destino].focus();
  }
  return <section className="painel-comparativo" aria-label="Diagnóstico territorial">
    <div className="comparativo-abas" role="tablist" aria-label="Dados do distrito">
      {ABAS.map(([id, titulo, curto, Icone], indice) => <button key={id} type="button" role="tab" id={`aba-${id}`} aria-label={titulo} aria-controls={`conteudo-${id}`} aria-selected={aba === id} tabIndex={aba === id ? 0 : -1} onKeyDown={(e) => navegar(e, indice)} onClick={() => onMudarAba(id)}><Icone size={16} aria-hidden="true" /><span>{curto}</span></button>)}
    </div>
    <div role="tabpanel" id={`conteudo-${aba}`} aria-labelledby={`aba-${aba}`} tabIndex={0}>
      {aba === 'oficiais' ? <IndicadoresDistrito key={idTerritorial} idTerritorial={idTerritorial} /> : <>
        <p className="comparativo-aviso"><Info size={18} aria-hidden="true" />As respostas são voluntárias e não representam necessariamente toda a população.</p>
        <p className="comparativo-nota">Período analisado: todas as contribuições da população registradas até o momento.</p>
        <Consulta key={`${idTerritorial}:${aba}`} idTerritorial={idTerritorial} aba={aba} />
      </>}
    </div>
  </section>;
}
