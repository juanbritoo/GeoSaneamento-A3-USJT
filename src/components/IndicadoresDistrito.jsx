import { useEffect, useState } from "react";
import { ChartNoAxesColumn, Droplet, House, Trash2, Waves } from "lucide-react";
import { buscarSaneamento } from "../services/api";

const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 20 });

const indicadoresDistritais = {
  ABASTECIMENTO_AGUA_REDE_GERAL: { titulo: "Abastecimento de água", Icone: Droplet },
  ESGOTAMENTO_SANITARIO_REDE_GERAL: { titulo: "Esgotamento sanitário", Icone: Waves },
  DESTINO_LIXO_COLETA_DIRETA: { titulo: "Coleta de lixo", Icone: Trash2 },
  EXISTENCIA_BANHEIRO_EXCLUSIVO: { titulo: "Banheiro exclusivo", Icone: House },
};

const classificacoes = {
  oficial: "Fonte oficial",
  nao_verificada: "Fonte não verificada",
  ficticia: "Fonte fictícia",
};

export function CardIndicador({ indicador, distrital = false }) {
  const apresentacao = distrital ? indicadoresDistritais[indicador.codigo] : null;
  const Icone = apresentacao?.Icone ?? ChartNoAxesColumn;
  const nome = indicador.nome || indicador.descricao || indicador.codigo || "Indicador sem nome";
  const dimensoes = indicador.dimensoes;
  const camposDimensoes = dimensoes != null && typeof dimensoes === "object" && !Array.isArray(dimensoes)
    ? Object.entries(dimensoes).filter(([, valor]) => valor != null && valor !== "")
    : dimensoes != null && dimensoes !== "" ? [["Dimensões", dimensoes]] : [];

  return (
    <article className="indicator-card">
      <h4><Icone size={22} aria-hidden="true" />{apresentacao?.titulo ?? nome}</h4>
      <p className="indicator-value">
        {indicador.valor == null ? "Não informado" : (
          typeof indicador.valor === "number" ? formatoNumero.format(indicador.valor) : indicador.valor
        )}
        {indicador.valor != null && indicador.unidade && <span> {indicador.unidade}</span>}
      </p>
      <p className="indicator-period">Período: {indicador.periodo ?? "Não informado"}</p>
      {(indicador.classificacao_fonte || indicador.is_mock === true) && (
        <div className="indicator-badges">
          {indicador.classificacao_fonte && (
            <span>{classificacoes[indicador.classificacao_fonte] ?? indicador.classificacao_fonte}</span>
          )}
          {indicador.is_mock === true && <span>Dado simulado</span>}
        </div>
      )}
      <details className="indicator-source">
        <summary>Detalhes da fonte</summary>
        <dl>
          <div><dt>Fonte</dt><dd>{indicador.fonte || "Não informada"}</dd></div>
          {indicador.procedencia && <div><dt>Procedência</dt><dd>{indicador.procedencia}</dd></div>}
          {indicador.id_fonte && <div><dt>Identificador da fonte</dt><dd>{indicador.id_fonte}</dd></div>}
          {apresentacao && <div><dt>Nome na API</dt><dd>{nome}</dd></div>}
        </dl>
        {camposDimensoes.length > 0 && (
          <details className="indicator-dimensions">
            <summary>Dimensões adicionais</summary>
            <dl>
              {camposDimensoes.map(([campo, valor]) => (
                <div key={campo}>
                  <dt>{campo}</dt>
                  <dd>{typeof valor === "object" ? JSON.stringify(valor) : String(valor)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </details>
    </article>
  );
}

function extrairIndicadores(dados, idTerritorial) {
  if (dados == null) return [];
  const erroFormato = () => {
    const erro = new Error("A API retornou dados em formato inesperado. Tente novamente.");
    erro.formatoInvalido = true;
    throw erro;
  };
  if (dados.escala !== "distrito" || !Array.isArray(dados.territorios)) erroFormato();
  if (dados.territorios.length === 0) return [];
  const territorio = dados.territorios.find(
    (item) => item && String(item.id_territorial) === idTerritorial
  );
  if (!Array.isArray(territorio?.indicadores)) erroFormato();
  for (const indicador of territorio.indicadores) {
    if (!indicador || typeof indicador !== "object" || Array.isArray(indicador)) erroFormato();
    for (const campo of ["nome", "descricao", "codigo", "valor", "unidade", "periodo", "fonte", "classificacao_fonte", "procedencia"]) {
      const valor = indicador[campo];
      if (valor != null && typeof valor !== "string" && typeof valor !== "number") erroFormato();
    }
    if (indicador.is_mock != null && typeof indicador.is_mock !== "boolean") erroFormato();
  }
  return territorio.indicadores;
}

function mensagemErro(erro) {
  if (erro.formatoInvalido) return erro.message;
  if (erro.status === 404) return "Não foram encontrados dados para este distrito.";
  if (erro.status === 503 || erro.cause) {
    return "Não foi possível conectar ao serviço de saneamento. Tente novamente em instantes.";
  }
  return "Não foi possível carregar os indicadores deste distrito. Tente novamente.";
}

// O pai usa o codigo territorial como key: cada selecao tem seu proprio estado.
export default function IndicadoresDistrito({ idTerritorial }) {
  const [consulta, setConsulta] = useState({ status: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let ativo = true;
    buscarSaneamento("distrito", idTerritorial, undefined, undefined, { signal: controller.signal })
      .then((dados) => {
        const indicadores = extrairIndicadores(dados, idTerritorial);
        if (ativo) setConsulta({ status: "sucesso", indicadores });
      })
      .catch((erro) => {
        if (ativo && !controller.signal.aborted) {
          setConsulta({ status: "erro", mensagem: mensagemErro(erro) });
        }
      });
    return () => {
      ativo = false;
      controller.abort();
    };
  }, [idTerritorial, tentativa]);

  return (
    <section className="indicators-section" aria-label="Indicadores distritais">
      <h3>Indicadores de saneamento</h3>
      {consulta.status === "carregando" && <p className="indicator-state" role="status">Carregando indicadores do distrito...</p>}
      {consulta.status === "erro" && (
        <>
          <p className="indicator-state" role="alert">{consulta.mensagem}</p>
          <button className="indicator-retry" type="button" onClick={() => {
            setConsulta({ status: "carregando" });
            setTentativa((atual) => atual + 1);
          }}>Tentar novamente</button>
        </>
      )}
      {consulta.status === "sucesso" && consulta.indicadores.length === 0 && (
        <p className="indicator-state">Nenhum indicador de saneamento disponível para este distrito. Isso não significa ausência de saneamento.</p>
      )}
      {consulta.status === "sucesso" && consulta.indicadores.map((indicador, index) => (
        <CardIndicador key={`${indicador.codigo}-${indicador.periodo}-${index}`} indicador={indicador} distrital />
      ))}
    </section>
  );
}
