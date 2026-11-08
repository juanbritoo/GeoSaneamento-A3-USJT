import { useEffect, useState } from "react";
import { buscarSaneamento } from "../services/api";

const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 20 });

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
    <div aria-label="Indicadores distritais">
      <h3>Indicadores de saneamento do distrito</h3>
      {consulta.status === "carregando" && <p role="status">Carregando indicadores do distrito...</p>}
      {consulta.status === "erro" && (
        <>
          <p role="alert" style={{ color: "#b91c1c" }}>{consulta.mensagem}</p>
          <button type="button" onClick={() => {
            setConsulta({ status: "carregando" });
            setTentativa((atual) => atual + 1);
          }}>Tentar novamente</button>
        </>
      )}
      {consulta.status === "sucesso" && consulta.indicadores.length === 0 && (
        <p>Nenhum indicador de saneamento disponível para este distrito.</p>
      )}
      {consulta.status === "sucesso" && consulta.indicadores.map((indicador, index) => (
        <article key={`${indicador.codigo}-${indicador.periodo}-${index}`} style={{
          padding: "12px", backgroundColor: "#EFF6FF", borderRadius: "6px", marginBottom: "10px"
        }}>
          <h4 style={{ margin: "0 0 5px", fontSize: "14px", color: "#1E4A9A" }}>
            {indicador.nome || indicador.descricao || indicador.codigo || "Indicador sem nome"}
          </h4>
          <p style={{ margin: 0, fontSize: "20px", fontWeight: "bold" }}>
            {indicador.valor == null ? "Não informado" : (
              typeof indicador.valor === "number" ? formatoNumero.format(indicador.valor) : indicador.valor
            )}
            {indicador.valor != null && indicador.unidade ? ` ${indicador.unidade}` : ""}
          </p>
          <p><strong>Período:</strong> {indicador.periodo ?? "Não informado"}</p>
          <p><strong>Fonte:</strong> {indicador.fonte || "Não informada"}</p>
          {indicador.classificacao_fonte && <p><strong>Classificação da fonte:</strong> {indicador.classificacao_fonte}</p>}
          {indicador.procedencia && <p><strong>Procedência:</strong> {indicador.procedencia}</p>}
          {indicador.is_mock === true && (
            <p style={{ color: "#854d0e", backgroundColor: "#fef3c7", padding: "8px", fontWeight: "bold" }}>
              Dado simulado — utilizado para fins acadêmicos.
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
