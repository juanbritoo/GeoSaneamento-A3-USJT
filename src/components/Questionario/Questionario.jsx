
import { useState } from "react";
import "./Questionario.css";

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

export default function Questionario({ aberto, onFechar }) {
  const [etapa, setEtapa] = useState(0);
  const [respostas, setRespostas] = useState({});
  const [concluido, setConcluido] = useState(false);

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

  function avancar() {
    if (!respostaAtual) return;

    if (etapa < perguntas.length - 1) {
      setEtapa((atual) => atual + 1);
      return;
    }

    setConcluido(true);

    // Nesta etapa, as respostas ficam no frontend.
    // Futuramente, podemos enviá-las para a API FastAPI.
    console.log("Respostas do questionário:", respostas);
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
            <span className="questionario-icone">
              💧
            </span>

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
            ×
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
                  disabled={!respostaAtual}
                >
                  {etapa === perguntas.length - 1
                    ? "Concluir"
                    : "Próxima pergunta"}
                </button>
              </footer>
            </>
          ) : (
            <div className="questionario-sucesso">
              <div className="questionario-sucesso-icone">
                ✓
              </div>

              <h3>Questionário concluído!</h3>

              <p>
                Obrigado por participar do GeoSaneamento.
                Sua contribuição é importante para compreender
                as condições de saneamento básico.
              </p>

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
