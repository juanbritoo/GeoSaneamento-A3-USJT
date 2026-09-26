
import { useState } from 'react';
import Map from "./components/Map/Map";
import logoImg from './logo.png';

function App() {
  const [mostrarQuestionario, setMostrarQuestionario] = useState(false);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      margin: 0,
      backgroundColor: '#f4f6f9'
    }}>

      {/* 1. HEADER */}
      <header style={{
        height: '75px',
        backgroundColor: '#121212',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      }}>

        {/* LOGO */}
        <div style={{
          display: 'flex',
          alignItems: 'center'
        }}>
          <img
            src={logoImg}
            alt="Logo GeoSaneamento"
            style={{
              height: '55px',
              objectFit: 'contain'
            }}
          />
        </div>

        {/* BOTÃO DO QUESTIONÁRIO */}
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
      <div style={{
        display: 'flex',
        flex: 1
      }}>

        {/* 2. BARRA LATERAL */}
        <aside style={{
          width: '280px',
          backgroundColor: 'white',
          borderRight: '1px solid #e5e7eb',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '15px'
        }}>

          <h2 style={{
            fontSize: '18px',
            color: '#111827',
            margin: '0 0 10px 0'
          }}>
            Informações de Saneamento
          </h2>

          <div style={{
            padding: '12px',
            backgroundColor: '#EFF6FF',
            borderRadius: '6px'
          }}>
            <h3 style={{
              margin: '0 0 5px 0',
              fontSize: '14px',
              color: '#1E4A9A'
            }}>
              Índice de Tratamento
            </h3>

            <p style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              62.4%
            </p>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#FEF3C7',
            borderRadius: '6px'
          }}>
            <h3 style={{
              margin: '0 0 5px 0',
              fontSize: '14px',
              color: '#B45309'
            }}>
              Alertas de Vazamento
            </h3>

            <p style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              14 Ativos
            </p>
          </div>

        </aside>

        {/* 3. MEIO — MAPA */}
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

          {/* JANELA DO QUESTIONÁRIO */}
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
                zIndex: 10
              }}
            >

              <h3 style={{
                margin: '0 0 15px 0',
                color: '#121212'
              }}>
                Questionário de Saneamento
              </h3>

              <label style={{
                display: 'block',
                marginBottom: '10px',
                fontSize: '14px'
              }}>
                Sua região sofre com falta de água?

                <select style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '5px',
                  padding: '5px'
                }}>
                  <option>Selecione...</option>
                  <option>Sim, frequentemente</option>
                  <option>Às vezes</option>
                  <option>Não, nunca</option>
                </select>

              </label>

              <label style={{
                display: 'block',
                marginBottom: '15px',
                fontSize: '14px'
              }}>
                Já presenciou esgoto a céu aberto na sua rua?

                <select style={{
                  display: 'block',
                  width: '100%',
                  marginTop: '5px',
                  padding: '5px'
                }}>
                  <option>Selecione...</option>
                  <option>Sim</option>
                  <option>Não</option>
                </select>

              </label>

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>

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

