
import { useState } from "react";
import { CircleCheck, X } from "lucide-react";
import { enviarQuestionario } from "../../services/api";
import "./Questionario.css";

const NIVEIS = {
  critico: "Crítico",
  precario: "Precário",
  regular: "Regular",
  adequado: "Adequado",
};

const perguntas = [
  {
    id: "abastecimento",
    titulo: "Sua região sofre com falta de água?",
    descricao: "Considere as condições de abastecimento da sua residência.",
    opcoes: [
      "Sim, frequentemente",
      "Às vezes",
      "Raramente",
      "Não, nunca",
    ],
  },
  {
    id: "esgoto",
    titulo: "Já presenciou esgoto a céu aberto na sua rua?",
    descricao: "Considere situações observadas no seu bairro.",
    opcoes: [
      "Sim, frequentemente",
      "Sim, algumas vezes",
      "Raramente",
      "Não",
    ],
  },
  {
    id: "abastecimentoFonte",
    titulo: "Qual é a principal fonte de água da sua residência?",
    descricao: "Selecione a alternativa que melhor representa sua situação.",
    opcoes: [
      "Rede pública de abastecimento",
      "Poço artesiano",
      "Nascente",
      "Caminhão-pipa",
      "Outra fonte",
      "Não sei informar",
    ],
  },
  {
    id: "esgotoDestino",
    titulo: "Qual é o destino do esgoto da sua residência?",
    descricao: "Selecione a alternativa que melhor representa sua situação.",
    opcoes: [
      "Rede pública de esgoto",
      "Fossa séptica",
      "Fossa rudimentar",
      "Despejo em rios ou córregos",
      "Não sei informar",
    ],
  },
  {
    id: "avaliacao",
    titulo: "Como você avalia o saneamento do seu bairro?",
    descricao: "Considere água, esgoto e coleta de resíduos.",
    opcoes: [
      "Muito bom",
      "Bom",
      "Regular",
      "Ruim",
      "Muito ruim",
    ],
  },
];

export default function Questionario({
  aberto,
  onFechar,
  distritos = [],
  distritoSelecionado = null,
  onSelecionarDistrito,
}) {
  const [etapa, setEtapa] = useState(0);
  const [respostas, setRespostas] = useState({});
  const [concluido, setConcluido] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState("");
  const [resultado, setResultado] = useState(null);

  if (!aberto) {
    return null;
  }

  const perguntaAtual = perguntas[etapa];
  const respostaAtual = respostas[perguntaAtual.id];

  const progresso = concluido
    ? 100
    : ((etapa + 1) / perguntas.length) * 100;

  function selecionarResposta(valor) {
    setRespostas((anteriores) => ({
      ...anteriores,
      [perguntaAtual.id]: valor,
    }));
  }

  async function avancar() {
    if (!respostaAtual) return;

    if (etapa < perguntas.length - 1) {
      setEtapa((atual) => atual + 1);
      return;
    }

    if (!distritoSelecionado) {
      setErroEnvio("Selecione o distrito antes de concluir.");
      return;
    }

    setEnviando(true);
    setErroEnvio("");

    try {
      const registro = await enviarQuestionario(
        distritoSelecionado.id_territorial,
        respostas
      );
      setResultado(registro);
      setConcluido(true);
    } catch (erro) {
      setErroEnvio(
        erro.message || "Não foi possível enviar o questionário."
      );
    } finally {
      setEnviando(false);
    }
  }

  function voltar() {
    if (etapa > 0) {
      setEtapa((atual) => atual - 1);
    }
  }

  function fechar() {
    setEtapa(0);
    setRespostas({});
    setConcluido(false);
    setErroEnvio("");
    setResultado(null);
    onFechar();
  }

  function fecharAoClicarFora(evento) {
    if (evento.target === evento.currentTarget) {
      fechar();
    }
  }

  return (
    <div
      className="questionario-overlay"
      onMouseDown={fecharAoClicarFora}
    >
      <section
        className="questionario-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="questionario-titulo"
      >
        <header className="questionario-header">
          <div className="questionario-identidade">
            <img className="questionario-icone" src="/icon_gota.png" alt="" />

            <div>
              <h2 id="questionario-titulo">
                GeoSaneamento
              </h2>

              <p>Pesquisa de saneamento básico</p>
            </div>
          </div>

          <button
            type="button"
            className="questionario-fechar"
            onClick={fechar}
            aria-label="Fechar questionário"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>

        <div className="questionario-conteudo">
          {!concluido ? (
            <>
              <div className="questionario-introducao">
                <span className="questionario-etiqueta">
                  QUESTIONÁRIO
                </span>

                <h3>
                  Sua opinião é importante!
                </h3>

                <p>
                  Ajude a compreender as condições de
                  saneamento básico da sua região.
                </p>
              </div>

              <div className="questionario-regiao">
                <label htmlFor="questionario-distrito">
                  Região avaliada
                </label>

                <select
                  id="questionario-distrito"
                  value={distritoSelecionado?.id_territorial ?? ""}
                  onChange={(evento) =>
                    onSelecionarDistrito?.(
                      distritos.find(
                        (distrito) =>
                          distrito.id_territorial === evento.target.value
                      ) ?? null
                    )
                  }
                >
                  <option value="">Selecione um distrito...</option>
                  {distritos.map((distrito) => (
                    <option
                      key={distrito.id_territorial}
                      value={distrito.id_territorial}
                    >
                      {distrito.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="questionario-progresso">
                <div className="questionario-progresso-info">
                  <span>
                    Pergunta {etapa + 1} de {perguntas.length}
                  </span>

                  <span>
                    {Math.round(progresso)}%
                  </span>
                </div>

                <div className="questionario-progresso-trilho">
                  <div
                    className="questionario-progresso-preenchido"
                    style={{ width: `${progresso}%` }}
                  />
                </div>
              </div>

              <div className="questionario-pergunta">
                <h3>{perguntaAtual.titulo}</h3>

                <p>{perguntaAtual.descricao}</p>

                <div className="questionario-opcoes">
                  {perguntaAtual.opcoes.map((opcao) => (
                    <label
                      key={opcao}
                      className={`questionario-opcao ${
                        respostaAtual === opcao
                          ? "selecionada"
                          : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name={perguntaAtual.id}
                        value={opcao}
                        checked={respostaAtual === opcao}
                        onChange={() =>
                          selecionarResposta(opcao)
                        }
                      />

                      <span>{opcao}</span>
                    </label>
                  ))}
                </div>
              </div>

              {erroEnvio && (
                <p className="questionario-erro" role="alert">
                  {erroEnvio}
                </p>
              )}

              <footer className="questionario-footer">
                <button
                  type="button"
                  className="questionario-botao-secundario"
                  onClick={voltar}
                  disabled={etapa === 0}
                >
                  Voltar
                </button>

                <button
                  type="button"
                  className="questionario-botao-principal"
                  onClick={avancar}
                  disabled={
                    !respostaAtual ||
                    enviando ||
                    (etapa === perguntas.length - 1 && !distritoSelecionado)
                  }
                >
                  {etapa === perguntas.length - 1
                    ? enviando
                      ? "Enviando..."
                      : "Concluir"
                    : "Próxima pergunta"}
                </button>
              </footer>
            </>
          ) : (
            <div className="questionario-sucesso">
              <div className="questionario-sucesso-icone">
                <CircleCheck size={36} aria-hidden="true" />
              </div>

              <h3>Questionário concluído!</h3>

              <p>
                Obrigado por participar do GeoSaneamento.
                Sua contribuição é importante para compreender
                as condições de saneamento básico.
              </p>

              {resultado && (
                <p className="questionario-resultado">
                  {resultado.nome_territorio}: nível de saneamento{" "}
                  <strong>
                    {NIVEIS[resultado.nivel_saneamento] ??
                      resultado.nivel_saneamento}
                  </strong>{" "}
                  ({Math.round(resultado.pontuacao)}/100)
                </p>
              )}

              <button
                type="button"
                className="questionario-botao-principal"
                onClick={fechar}
              >
                Fechar questionário
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
