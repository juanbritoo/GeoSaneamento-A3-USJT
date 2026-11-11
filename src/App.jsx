
import { useEffect, useRef, useState } from 'react';
import { Building2, ClipboardList, Layers, Map as MapIcon, MapPin, RotateCcw } from 'lucide-react';

import Map from "./components/Map/Map";
import IndicadoresDistrito from "./components/IndicadoresDistrito";
import Questionario from "./components/Questionario/Questionario";

import logoImg from './logo.png';
import { buscarDistritos, buscarSaneamento } from "./services/api";
import "./App.css";

function App() {
  const [mostrarQuestionario, setMostrarQuestionario] = useState(false);
  const [distritoSelecionado, setDistritoSelecionado] = useState(null);
  const [dadosSaneamento, setDadosSaneamento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erroAPI, setErroAPI] = useState("");
  const [distritos, setDistritos] = useState([]);
  const [carregandoDistritos, setCarregandoDistritos] = useState(true);
  const [erroDistritos, setErroDistritos] = useState("");
  const painelRef = useRef(null);

  useEffect(() => {
    // A identificacao deve aparecer mesmo se os indicadores estavam rolados.
    painelRef.current.scrollTop = 0;
  }, [distritoSelecionado]);

  useEffect(() => {
    const controller = new AbortController();

    buscarDistritos({ signal: controller.signal })
      .then((dados) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(dados) || dados.some((distrito) =>
          !distrito || typeof distrito.id_territorial !== 'string' || typeof distrito.nome !== 'string'
        )) {
          throw new Error('Lista de distritos inválida.');
        }
        setDistritos(dados);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setErroDistritos('Não foi possível carregar os distritos. Selecione pelo mapa.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCarregandoDistritos(false);
      });

    return () => controller.abort();
  }, []);

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
        margin: 0
      }}
    >

      <header className="app-header">
        <img className="app-logo" src={logoImg} alt="Logo GeoSaneamento" />
        <nav aria-label="Tela atual">
          <span className="app-current-page" aria-current="page">
            <MapIcon size={22} aria-hidden="true" />
            Mapa
          </span>
        </nav>
        <div className="app-header-actions">
          <div className="district-selector">
            <select
              aria-label="Selecione um distrito"
              aria-describedby={erroDistritos ? 'district-error' : undefined}
              aria-busy={carregandoDistritos}
              value={distritoSelecionado?.id_territorial ?? ''}
              disabled={carregandoDistritos || !!erroDistritos || distritos.length === 0}
              onChange={(event) => setDistritoSelecionado(
                distritos.find((distrito) => distrito.id_territorial === event.target.value) ?? null
              )}
            >
              <option value="">
                {carregandoDistritos ? 'Carregando distritos...' : erroDistritos
                  ? 'Distritos indisponíveis' : distritos.length === 0
                    ? 'Nenhum distrito disponível' : 'Selecione um distrito...'}
              </option>
              {distritoSelecionado && !distritos.some((distrito) =>
                distrito.id_territorial === distritoSelecionado.id_territorial
              ) && (
                <option value={distritoSelecionado.id_territorial}>
                  {distritoSelecionado.nome}
                </option>
              )}
              {distritos.map((distrito) => (
                <option key={distrito.id_territorial} value={distrito.id_territorial}>
                  {distrito.nome}
                </option>
              ))}
            </select>
            {erroDistritos && <p id="district-error" role="alert">{erroDistritos}</p>}
          </div>
          <button
            type="button"
            className="questionnaire-trigger"
            onClick={() => setMostrarQuestionario(true)}
          >
            <ClipboardList size={22} aria-hidden="true" />
            Questionário
          </button>
        </div>
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
        >
          <section className="territorial-panel" aria-live="polite" aria-label="Informações territoriais">
            <h2>Informações de Saneamento</h2>
            {distritoSelecionado && (
              <>
                <h3 className="territorial-name">
                  <MapPin size={24} aria-hidden="true" />
                  {distritoSelecionado.nome}
                </h3>
                <dl className="territorial-details">
                  <div>
                    <dt><MapIcon size={20} aria-hidden="true" />Código territorial</dt>
                    <dd>{distritoSelecionado.id_territorial}</dd>
                  </div>
                  <div>
                    <dt><Building2 size={20} aria-hidden="true" />Município</dt>
                    <dd>São Paulo</dd>
                  </div>
                  <div>
                    <dt><Layers size={20} aria-hidden="true" />UF</dt>
                    <dd>SP</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="territorial-clear"
                  onClick={() => setDistritoSelecionado(null)}
                  aria-label="Limpar seleção distrital"
                >
                  <RotateCcw size={18} aria-hidden="true" />
                  Limpar seleção
                </button>
              </>
            )}
          </section>

          {distritoSelecionado ? (
              <IndicadoresDistrito
                key={distritoSelecionado.id_territorial}
                idTerritorial={distritoSelecionado.id_territorial}
              />
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
