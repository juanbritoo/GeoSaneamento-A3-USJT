
import { useEffect, useRef, useState } from 'react';

import Map from "./components/Map/Map";
import IndicadoresDistrito from "./components/IndicadoresDistrito";
import Questionario from "./components/Questionario/Questionario";

import logoImg from './logo.png';
import { buscarSaneamento } from "./services/api";
import "./App.css";

function App() {
  const [mostrarQuestionario, setMostrarQuestionario] = useState(false);
  const [distritoSelecionado, setDistritoSelecionado] = useState(null);
  const [dadosSaneamento, setDadosSaneamento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroAPI, setErroAPI] = useState("");
  const painelRef = useRef(null);

  useEffect(() => {
    // A identificacao deve aparecer mesmo se os indicadores estavam rolados.
    painelRef.current.scrollTop = 0;
  }, [distritoSelecionado]);

  // ==========================================
  // BUSCAR DADOS DE SANEAMENTO NA API
  // ==========================================

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

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================

  return (
    <div
      className="app-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Arial, sans-serif',
        margin: 0,
        backgroundColor: '#f4f6f9'
      }}
    >

      {/* ====================================== */}
      {/* HEADER */}
      {/* ====================================== */}

      <header
        style={{
          height: '75px',
          flexShrink: 0,
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
            style={{
              height: '55px',
              objectFit: 'contain'
            }}
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

      {/* ====================================== */}
      {/* ÁREA INFERIOR */}
      {/* ====================================== */}

      <div className="app-workspace">

        {/* ==================================== */}
        {/* BARRA LATERAL */}
        {/* ==================================== */}

        <aside
          ref={painelRef}
          className="app-sidebar"
          style={{
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

          {distritoSelecionado ? (
            <section aria-live="polite" aria-label="Distrito selecionado">
              <h3 style={{ color: '#1E4A9A', marginTop: 0 }}>
                {distritoSelecionado.nome}
              </h3>
              <p><strong>Código territorial:</strong> {distritoSelecionado.id_territorial}</p>
              <p><strong>Município:</strong> São Paulo</p>
              <p><strong>UF:</strong> SP</p>
              <button
                type="button"
                onClick={() => setDistritoSelecionado(null)}
                aria-label="Limpar seleção distrital"
                style={{ cursor: 'pointer', padding: '6px 10px' }}
              >
                Limpar seleção
              </button>
              <IndicadoresDistrito
                key={distritoSelecionado.id_territorial}
                idTerritorial={distritoSelecionado.id_territorial}
              />
            </section>
          ) : (
            <>
              {/* Carregamento */}

              {carregando && (
                <p>Carregando indicadores...</p>
              )}

              {/* Erro da API */}

              {erroAPI && (
                <p style={{ color: '#b91c1c' }}>
                  {erroAPI}
                </p>
              )}

              {/* Dados recebidos da API */}

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

                      {/* Verificar indicadores disponíveis */}

                      {territorio.indicadores.length === 0 ? (
                        <p>
                          Nenhum indicador disponível para este município.
                        </p>
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

                              {indicador.unidade
                                ? ` ${indicador.unidade}`
                                : ''}
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
            </>
          )}

        </aside>

        {/* ==================================== */}
        {/* MAPA */}
        {/* ==================================== */}

        <main
          className="app-map"
          style={{
            flex: 1,
            display: 'flex',
            backgroundColor: '#FFFFFF',
            position: 'relative'
          }}
        >

          <div
            className="map-area"
          >
            <Map
              distritoSelecionado={distritoSelecionado}
              onSelecionarDistrito={setDistritoSelecionado}
            />
          </div>

        </main>

      </div>

      {/* ====================================== */}
      {/* QUESTIONÁRIO */}
      {/* ====================================== */}

      <Questionario
        aberto={mostrarQuestionario}
        onFechar={() => setMostrarQuestionario(false)}
      />

    </div>
  );
}

export default App;
