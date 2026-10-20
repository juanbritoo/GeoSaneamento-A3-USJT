import { useEffect, useState } from 'react';
import Map from "./components/Map/Map";
import logoImg from './logo.png';
import { buscarSaneamento } from "./services/api";

function App() {
  const [mostrarQuestionario, setMostrarQuestionario] = useState(false);
  const [dadosSaneamento, setDadosSaneamento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroAPI, setErroAPI] = useState("");

  useEffect(() => {
    buscarSaneamento("municipio")
      .then((dados) => {
        setDadosSaneamento(dados);
      })
      .catch((erro) => {
        console.error("Erro ao buscar saneamento:", erro);
        setErroAPI("Não foi possível carregar os dados de saneamento.");
      })
      .finally(() => {
        setCarregando(false);
      });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'Arial, sans-serif',
        margin: 0,
        backgroundColor: '#f4f6f9'
      }}
    >
      {/* HEADER */}
      <header
        style={{
          height: '75px',
          backgroundColor: '#121212',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img
            src={logoImg}
            alt="Logo GeoSaneamento"
            style={{ height: '55px', objectFit: 'contain' }}
          />
        </div>

        <button
          style={{
            backgroundColor: '#1E70E6',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: '0.2s'
          }}
          onClick={() => setMostrarQuestionario(true)}
        >
          Questionário
        </button>
      </header>

      {/* ÁREA INFERIOR */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* BARRA LATERAL */}
        <aside
          style={{
            width: '280px',
            backgroundColor: 'white',
            borderRight: '1px solid #e5e7eb',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px',
            overflowY: 'auto'
          }}
        >
          <h2
            style={{
              fontSize: '18px',
              color: '#111827',
              margin: '0 0 10px 0'
            }}
          >
            Informações de Saneamento
          </h2>

          {carregando && <p>Carregando indicadores...</p>}

          {erroAPI && (
            <p style={{ color: '#b91c1c' }}>
              {erroAPI}
            </p>
          )}

          {!carregando && !erroAPI && dadosSaneamento && (
            <>
              {dadosSaneamento.territorios.map((territorio) => (
                <div key={territorio.id_territorial}>
                  <h3
                    style={{
                      fontSize: '15px',
                      color: '#1E4A9A',
                      marginBottom: '10px'
                    }}
                  >
                    {territorio.nome}
                  </h3>

                  {territorio.indicadores.length === 0 ? (
                    <p>Nenhum indicador disponível para este município.</p>
                  ) : (
                    territorio.indicadores.map((indicador, index) => (
                      <div
                        key={`${indicador.codigo}-${indicador.periodo}-${index}`}
                        style={{
                          padding: '12px',
                          backgroundColor: '#EFF6FF',
                          borderRadius: '6px',
                          marginBottom: '10px'
                        }}
                      >
                        <h4
                          style={{
                            margin: '0 0 5px 0',
                            fontSize: '14px',
                            color: '#1E4A9A'
                          }}
                        >
                          {indicador.nome}
                        </h4>

                        <p
                          style={{
                            margin: 0,
                            fontSize: '20px',
                            fontWeight: 'bold'
                          }}
                        >
                          {indicador.valor ?? 'Não informado'}
                          {indicador.unidade ? ` ${indicador.unidade}` : ''}
                        </p>

                        <small>
                          Período: {indicador.periodo ?? 'Não informado'}
                        </small>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </>
          )}

        </aside>

        {/* MAPA */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            backgroundColor: '#FFFFFF',
            position: 'relative',
            minHeight: '500px'
          }}
        >
          <div
            className="map-area"
            style={{
              width: 'calc(100% - 30px)',
              height: 'calc(100% - 30px)',
              margin: '15px'
            }}
          >
            <Map />
          </div>

          {/* QUESTIONÁRIO */}
          {mostrarQuestionario && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                width: '350px',
                zIndex: 1000
              }}
            >
              <h3
                style={{
                  margin: '0 0 15px 0',
                  color: '#121212'
                }}
              >
                Questionário de Saneamento
              </h3>

              <label
                style={{
                  display: 'block',
                  marginBottom: '10px',
                  fontSize: '14px'
                }}
              >
                Sua região sofre com falta de água?

                <select
                  defaultValue=""
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '5px',
                    padding: '5px'
                  }}
                >
                  <option value="" disabled>Selecione...</option>
                  <option>Sim, frequentemente</option>
                  <option>Às vezes</option>
                  <option>Não, nunca</option>
                </select>
              </label>

              <label
                style={{
                  display: 'block',
                  marginBottom: '15px',
                  fontSize: '14px'
                }}
              >
                Já presenciou esgoto a céu aberto na sua rua?

                <select
                  defaultValue=""
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '5px',
                    padding: '5px'
                  }}
                >
                  <option value="" disabled>Selecione...</option>
                  <option>Sim</option>
                  <option>Não</option>
                </select>
              </label>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px'
                }}
              >
                <button
                  onClick={() => setMostrarQuestionario(false)}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>

                <button
                  onClick={() => {
                    alert('Obrigado por responder!');
                    setMostrarQuestionario(false);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#1E70E6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Enviar
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;