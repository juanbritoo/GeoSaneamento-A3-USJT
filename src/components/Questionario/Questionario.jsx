import { useEffect, useRef, useState } from 'react';
import { ClipboardList, RotateCcw, X } from 'lucide-react';
import { atualizarResposta, naoMorador, perguntasAplicaveis, perguntasV2, prepararPayloadV2, respostaValida, textoResposta } from './perguntasV2';
import './Questionario.css';

export default function Questionario({ aberto, onFechar, distritos = [], distritoSelecionado = null, onSelecionarDistrito }) {
  const [territorio, setTerritorio] = useState(null);
  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState({});
  const [revisao, setRevisao] = useState(null);
  const [erro, setErro] = useState('');
  const modalRef = useRef(null);
  const tituloRef = useRef(null);
  const conteudoRef = useRef(null);
  const perguntas = perguntasAplicaveis(dados.vinculo_territorial);
  const pergunta = perguntas[etapa];
  const valor = dados[pergunta.id];
  const distritoValido = distritos.find((d) => d.id_territorial === distritoSelecionado?.id_territorial && /^[0-9]{9}$/.test(d.id_territorial));
  const progresso = revisao ? 100 : territorio ? Math.round(((etapa + 1) / perguntas.length) * 100) : 0;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement;
    const overlay = modalRef.current.parentElement;
    const irmaos = [...overlay.parentElement.children].filter((el) => el !== overlay);
    const inertes = irmaos.map((el) => el.inert);
    irmaos.forEach((el) => { el.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      irmaos.forEach((el, i) => { el.inert = inertes[i]; });
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [aberto]);

  useEffect(() => {
    if (aberto) {
      conteudoRef.current?.scrollTo({ top: 0 });
      tituloRef.current?.focus();
    }
  }, [aberto, etapa, territorio, revisao]);

  useEffect(() => {
    if (!territorio) return;
    const proteger = (evento) => { evento.preventDefault(); evento.returnValue = ''; };
    window.addEventListener('beforeunload', proteger);
    return () => window.removeEventListener('beforeunload', proteger);
  }, [territorio]);

  function reiniciar() {
    setTerritorio(null);
    setEtapa(0);
    setDados({});
    setRevisao(null);
    setErro('');
  }

  function descartar(fechar = false) {
    if (territorio && !window.confirm('As respostas ainda não foram enviadas. Deseja descartá-las?')) return;
    reiniciar();
    if (fechar) onFechar();
  }

  function selecionar(id, resposta) {
    if (id === 'vinculo_territorial' && naoMorador(resposta) && !naoMorador(dados[id]) &&
        perguntasV2.some((p) => p.domiciliar && dados[p.id] !== undefined) &&
        !window.confirm('Ao mudar para não morador, as respostas sobre sua residência serão apagadas. Deseja continuar?')) return;
    setDados((anteriores) => atualizarResposta(anteriores, id, resposta));
    setErro('');
  }

  function avancar() {
    if (!respostaValida(pergunta, valor)) return;
    if (etapa < perguntas.length - 1) setEtapa(etapa + 1);
    else {
      try { setRevisao(prepararPayloadV2(territorio.id_territorial, dados)); }
      catch (e) { setErro(e.message); }
    }
  }

  function teclado(evento) {
    if (evento.key === 'Escape') { evento.preventDefault(); descartar(true); }
    if (evento.key !== 'Tab') return;
    const controles = [...modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')];
    const primeiro = controles[0];
    const ultimo = controles.at(-1);
    if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === tituloRef.current)) {
      evento.preventDefault(); ultimo?.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault(); primeiro?.focus();
    }
  }

  if (!aberto) return null;

  return (
    <div className="questionario-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) descartar(true); }}>
      <section ref={modalRef} className="questionario-modal" role="dialog" aria-modal="true" aria-labelledby="questionario-titulo" onKeyDown={teclado}>
        <header className="questionario-header">
          <div className="questionario-identidade">
            <img className="questionario-icone" src="/icon_gota.png" alt="" />
            <div><h2 id="questionario-titulo">Diagnóstico participativo</h2><p>GeoSaneamento</p></div>
          </div>
          <button type="button" className="questionario-fechar" onClick={() => descartar(true)} aria-label="Fechar questionário"><X size={22} aria-hidden="true" /></button>
        </header>
        <div className="questionario-conteudo" ref={conteudoRef}>
          {!territorio ? <>
            <div className="questionario-introducao">
              <h3 ref={tituloRef} tabIndex={-1}>Sua experiência importa</h3>
              <p>Compartilhe sua experiência com o saneamento da região. Suas respostas ajudarão a complementar os indicadores existentes e compreender a realidade vivenciada pela população.</p>
            </div>
            <div className="questionario-regiao">
              <label htmlFor="questionario-distrito">Região avaliada</label>
              <select id="questionario-distrito" value={distritoSelecionado?.id_territorial ?? ''} onChange={(e) => onSelecionarDistrito?.(distritos.find((d) => d.id_territorial === e.target.value) ?? null)}>
                <option value="">Selecione um distrito...</option>
                {distritos.map((d) => <option key={d.id_territorial} value={d.id_territorial}>{d.nome}</option>)}
              </select>
              <p>Selecione um distrito para iniciar. Para trocá-lo depois, será necessário reiniciar.</p>
            </div>
            <p className="questionario-aviso">Nesta etapa, você poderá revisar as respostas localmente. Elas ainda não serão enviadas.</p>
            <button type="button" className="questionario-botao-principal" disabled={!distritoValido} onClick={() => { if (distritoValido) setTerritorio({ ...distritoValido }); }}>Iniciar questionário</button>
          </> : <>
            <div className="questionario-territorio">
              <p>Região avaliada: <strong>{territorio.nome}</strong></p>
              <button type="button" className="questionario-botao-secundario" onClick={() => descartar()}><RotateCcw size={16} aria-hidden="true" /> Reiniciar</button>
            </div>
            <div className="questionario-progresso">
              <div className="questionario-progresso-info"><span>{revisao ? 'Revisão local' : `Pergunta ${etapa + 1} de ${perguntas.length}`}</span><span>{progresso}%</span></div>
              <div className="questionario-progresso-trilho" role="progressbar" aria-label="Progresso do questionário" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
                <div className="questionario-progresso-preenchido" style={{ width: `${progresso}%` }} />
              </div>
            </div>
            {revisao ? <div className="questionario-revisao">
              <h3 ref={tituloRef} tabIndex={-1}><ClipboardList size={24} aria-hidden="true" /> Revise suas respostas</h3>
              <p className="questionario-aviso" role="status"><strong>Questionário ainda não enviado.</strong> Esta revisão é local; nenhuma resposta foi armazenada no servidor. Ao fechar, as respostas serão descartadas mediante confirmação.</p>
              <dl>{perguntas.map((p) => <div key={p.id}><dt>{p.titulo}</dt><dd>{textoResposta(p, p.id === 'comentario' ? revisao.comentario : p.id === 'vinculo_territorial' ? revisao.vinculo_territorial : revisao.respostas[p.id])}</dd></div>)}</dl>
              {naoMorador(revisao.vinculo_territorial) && <p>As sete perguntas domiciliares não se aplicam ao vínculo informado e foram preparadas como não aplicáveis.</p>}
              <footer className="questionario-footer">
                <button type="button" className="questionario-botao-secundario" onClick={() => { setRevisao(null); setEtapa(0); }}>Editar respostas</button>
                <button type="button" className="questionario-botao-principal" onClick={() => descartar(true)}>Fechar revisão</button>
              </footer>
            </div> : <>
              <div className="questionario-pergunta" key={pergunta.id}>
                <p className="questionario-etiqueta">{pergunta.dimensao}</p>
                <h3 id="questionario-pergunta-titulo" ref={tituloRef} tabIndex={-1}>{pergunta.titulo}</h3>
                {pergunta.tipo === 'categoria' && <div className="questionario-opcoes" role="radiogroup" aria-labelledby="questionario-pergunta-titulo">
                  {pergunta.opcoes.map((opcao) => <label key={opcao.valor} className={`questionario-opcao ${valor === opcao.valor ? 'selecionada' : ''}`}>
                    <input type="radio" name={pergunta.id} value={opcao.valor} checked={valor === opcao.valor} onChange={() => selecionar(pergunta.id, opcao.valor)} /><span>{opcao.texto}</span>
                  </label>)}
                </div>}
                {pergunta.tipo === 'nota' && <div className="questionario-avaliacao">
                  <output className="questionario-nota" htmlFor="questionario-slider" aria-live="polite">{typeof valor === 'number' ? `Nota ${valor}` : valor === null ? 'Não sei avaliar / Não se aplica' : 'Nenhuma nota selecionada'}</output>
                  <p id="questionario-nota-ajuda">Mova o controle ou confirme a nota zero. Use as setas do teclado para ajustar. Nenhuma nota é atribuída automaticamente.</p>
                  <input id="questionario-slider" type="range" min={0} max={10} step={1} value={typeof valor === 'number' ? valor : 0} aria-labelledby="questionario-pergunta-titulo" aria-describedby="questionario-nota-ajuda questionario-extremos" aria-valuetext={typeof valor === 'number' ? `Nota ${valor} de 10` : 'Sem nota numérica selecionada'} onChange={(e) => selecionar(pergunta.id, Number(e.target.value))} />
                  <div className="questionario-extremos" id="questionario-extremos"><span>0: {pergunta.minimo}.</span><span>10: {pergunta.maximo}.</span></div>
                  {typeof valor !== 'number' && <button type="button" className="questionario-botao-secundario" onClick={() => selecionar(pergunta.id, 0)}>Usar nota 0</button>}
                  <button type="button" className="questionario-botao-secundario" aria-pressed={valor === null} onClick={() => selecionar(pergunta.id, null)}>Não sei avaliar / Não se aplica</button>
                </div>}
                {pergunta.tipo === 'texto' && <>
                  <p id="questionario-comentario-ajuda">Opcional. Não inclua nomes, endereços completos ou informações pessoais.</p>
                  <textarea aria-labelledby="questionario-pergunta-titulo" aria-describedby="questionario-comentario-ajuda questionario-contador" rows={5} maxLength={pergunta.limite} value={valor ?? ''} placeholder={pergunta.placeholder} onChange={(e) => selecionar(pergunta.id, e.target.value)} />
                  <p id="questionario-contador" className="questionario-contador" aria-live="polite">{[...(valor ?? '')].length} / {pergunta.limite} caracteres</p>
                </>}
              </div>
              {erro && <p className="questionario-erro" role="alert">{erro}</p>}
              <footer className="questionario-footer">
                <button type="button" className="questionario-botao-secundario" onClick={() => setEtapa(etapa - 1)} disabled={etapa === 0}>Voltar</button>
                <button type="button" className="questionario-botao-principal" disabled={!respostaValida(pergunta, valor)} onClick={avancar}>{pergunta.opcional ? 'Revisar respostas (sem enviar)' : 'Próxima pergunta'}</button>
              </footer>
            </>}
          </>}
        </div>
      </section>
    </div>
  );
}
