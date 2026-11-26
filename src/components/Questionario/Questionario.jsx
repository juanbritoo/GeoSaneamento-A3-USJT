import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Circle, CircleCheck, CircleCheckBig, CircleHelp, LoaderCircle, LockKeyhole, Map, MapPin, RotateCcw, Send, X } from 'lucide-react';
import { atualizarResposta, naoMorador, perguntasAplicaveis, perguntasV2, prepararPayloadV2, respostaValida } from './perguntasV2';
import { enviarQuestionarioV2 } from '../../services/api';
import EscalaAvaliacao from './EscalaAvaliacao';
import RevisaoRespostas from './RevisaoRespostas';
import SeletorDistrito from '../SeletorDistrito/SeletorDistrito';
import './Questionario.css';

export default function Questionario({ aberto, ...props }) {
  return aberto ? <FormularioQuestionario {...props} /> : null;
}

function FormularioQuestionario({ onFechar, distritos = [], distritoSelecionado = null }) {
  const [distritoQuestionario, setDistritoQuestionario] = useState(distritoSelecionado);
  const [edicao, setEdicao] = useState(false);
  const [territorio, setTerritorio] = useState(null);
  const [etapa, setEtapa] = useState(0);
  const [dados, setDados] = useState({});
  const [revisao, setRevisao] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [registro, setRegistro] = useState(null);
  const [envioIncerto, setEnvioIncerto] = useState(false);
  const envioRef = useRef(false);
  const statusRef = useRef(null);
  const modalRef = useRef(null);
  const tituloRef = useRef(null);
  const conteudoRef = useRef(null);
  const perguntas = perguntasAplicaveis(dados.vinculo_territorial);
  const pergunta = perguntas[etapa];
  const valor = dados[pergunta.id];
  const distritoValido = distritos.find((d) => d.id_territorial === distritoQuestionario?.id_territorial && /^[0-9]{9}$/.test(d.id_territorial));
  const progresso = revisao ? 100 : territorio ? Math.round(((etapa + 1) / perguntas.length) * 100) : 0;

  useEffect(() => {
    const anterior = document.activeElement;
    const overlay = modalRef.current.parentElement;
    const irmaos = [...overlay.parentElement.children].filter((el) => el !== overlay);
    const inertes = irmaos.map((el) => el.inert);
    irmaos.forEach((el) => { el.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const ajustarAltura = () => {
      if (!viewport) return;
      overlay.style.setProperty('--questionario-altura', `${viewport.height}px`);
      overlay.style.height = `${viewport.height}px`;
      overlay.style.top = `${viewport.offsetTop}px`;
      overlay.style.bottom = 'auto';
    };
    ajustarAltura();
    viewport?.addEventListener('resize', ajustarAltura);
    viewport?.addEventListener('scroll', ajustarAltura);
    return () => {
      viewport?.removeEventListener('resize', ajustarAltura);
      viewport?.removeEventListener('scroll', ajustarAltura);
      irmaos.forEach((el, i) => { el.inert = inertes[i]; });
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, []);

  useEffect(() => {
    {
      conteudoRef.current?.scrollTo({ top: 0 });
      tituloRef.current?.focus();
    }
  }, [etapa, territorio, revisao, registro]);

  useEffect(() => {
    if (!territorio || registro) return;
    const proteger = (evento) => { evento.preventDefault(); evento.returnValue = ''; };
    window.addEventListener('beforeunload', proteger);
    return () => window.removeEventListener('beforeunload', proteger);
  }, [territorio, registro]);

  useEffect(() => {
    if (enviando || erro) statusRef.current?.focus();
  }, [enviando, erro]);

  function reiniciar() {
    setTerritorio(null);
    setEdicao(false);
    setEtapa(0);
    setDados({});
    setRevisao(null);
    setErro('');
    setRegistro(null);
    setEnvioIncerto(false);
  }

  function descartar(fechar = false) {
    if (envioRef.current) return;
    if (territorio && !registro && !window.confirm(envioIncerto
      ? 'O envio anterior pode ter sido registrado. Deseja descartar as respostas mantidas nesta tela?'
      : 'Deseja descartar as respostas deste formulário?')) return;
    reiniciar();
    if (fechar) onFechar();
  }

  function selecionar(id, resposta) {
    if (envioRef.current) return;
    if (id === 'vinculo_territorial' && naoMorador(resposta) && !naoMorador(dados[id]) &&
        perguntasV2.some((p) => p.domiciliar && dados[p.id] !== undefined) &&
        !window.confirm('Ao mudar para não morador, as respostas sobre sua residência serão apagadas. Deseja continuar?')) return;
    setDados((anteriores) => atualizarResposta(anteriores, id, resposta));
    setErro('');
  }

  function avancar() {
    if (envioRef.current || !respostaValida(pergunta, valor)) return;
    if (edicao) {
      const pendente = perguntas.findIndex((p) => !respostaValida(p, dados[p.id]));
      if (pendente >= 0) { setEtapa(pendente); setErro('Complete as respostas aplicáveis ao vínculo escolhido para voltar à revisão.'); return; }
      setRevisao(prepararPayloadV2(territorio.id_territorial, dados)); setEdicao(false); setErro('');
    } else if (etapa < perguntas.length - 1) setEtapa(etapa + 1);
    else {
      try { setRevisao(prepararPayloadV2(territorio.id_territorial, dados)); }
      catch (e) { setErro(e.message); }
    }
  }

  async function enviar() {
    if (envioRef.current || !revisao || registro) return;
    if (envioIncerto && !window.confirm('O envio anterior pode ter sido registrado. Uma nova tentativa pode duplicar sua participação. Deseja tentar novamente?')) return;
    envioRef.current = true;
    setEnviando(true);
    setErro('');
    try {
      const recebido = await enviarQuestionarioV2(revisao);
      setRegistro(recebido);
      setEnvioIncerto(false);
    } catch (falha) {
      const mensagens = {
        404: 'O distrito não foi encontrado. Confira o distrito avaliado antes de tentar novamente.',
        422: 'Algumas respostas não foram aceitas. Revise o formulário antes de tentar novamente.',
        503: 'O serviço está indisponível no momento.',
      };
      const incerto = ![404, 422].includes(falha.status);
      setEnvioIncerto((anterior) => anterior || incerto);
      setErro((mensagens[falha.status] ?? 'Não foi possível confirmar o envio.') +
        ((incerto || envioIncerto) ? ' O registro pode ter ocorrido. Uma nova tentativa pode duplicar sua participação.' : '') +
        ' Suas respostas foram preservadas nesta tela.');
    } finally {
      envioRef.current = false;
      setEnviando(false);
    }
  }

  function editar(id = 'vinculo_territorial') {
    if (envioRef.current) return;
    setRevisao(null);
    setEtapa(perguntas.findIndex((p) => p.id === id));
    setEdicao(true);
    setErro('');
  }

  function teclado(evento) {
    if (evento.key === 'Escape') { evento.preventDefault(); descartar(true); }
    if (evento.key !== 'Tab') return;
    const controles = [...modalRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')].filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
    if (controles.length === 0) { evento.preventDefault(); statusRef.current?.focus(); return; }
    const primeiro = controles[0];
    const ultimo = controles.at(-1);
    if (evento.shiftKey && (document.activeElement === primeiro || document.activeElement === tituloRef.current)) {
      evento.preventDefault(); ultimo?.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault(); primeiro?.focus();
    }
  }

  return (
    <div className="questionario-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) descartar(true); }}>
      <section ref={modalRef} className="questionario-modal" role="dialog" aria-modal="true" aria-labelledby="questionario-titulo" onKeyDown={teclado}>
        <header className="questionario-header">
          <div className="questionario-identidade"><img className="questionario-icone" src="/icon_gota.png" alt="" /><div><h2 id="questionario-titulo">Diagnóstico participativo</h2><p>Sua experiência importa</p></div></div>
          <button type="button" className="questionario-fechar" disabled={enviando} onClick={() => descartar(true)} aria-label="Fechar questionário"><X size={20} aria-hidden="true" /></button>
        </header>
        <div className="questionario-conteudo" ref={conteudoRef}>
          {registro ? <div className="questionario-conclusao">
            <span className="questionario-sucesso-icone"><CircleCheckBig size={48} aria-hidden="true" /></span>
            <h3 ref={tituloRef} tabIndex={-1}>Obrigado pela participação!</h3>
            <p>Suas respostas foram registradas e contribuirão para compreender as condições de saneamento da região.</p>
            <div className="revisao-territorio"><MapPin size={20} aria-hidden="true" /><strong>{territorio.nome}</strong></div>
            <p className="questionario-confirmado"><CircleCheck size={16} aria-hidden="true" />Registro confirmado</p>
          </div> : !territorio ? <>
            <div className="questionario-introducao"><h3 ref={tituloRef} tabIndex={-1}>Compartilhe sua experiência</h3><p>Compartilhe sua experiência com o saneamento da região. Suas respostas ajudarão a complementar os indicadores existentes e compreender a realidade vivenciada pela população.</p></div>
            <div className="questionario-regiao"><p className="questionario-rotulo">Região avaliada</p><SeletorDistrito distritos={distritos} value={distritoQuestionario} onChange={setDistritoQuestionario} label="Distrito do questionário" /><p>Esta escolha não altera o mapa. Para trocá-la após iniciar, será necessário reiniciar.</p></div>
            <p className="questionario-aviso">Você poderá revisar suas respostas antes de confirmar o envio.</p>
          </> : <>
            <div className="questionario-territorio"><p><MapPin size={16} aria-hidden="true" /><strong>{territorio.nome}</strong><LockKeyhole size={14} aria-label="Distrito fixado" /></p><button type="button" className="questionario-reiniciar" disabled={enviando} onClick={() => descartar()}><RotateCcw size={16} aria-hidden="true" />Reiniciar</button></div>
            <div className="questionario-progresso"><div className="questionario-progresso-info"><span>{revisao ? 'Revisão das respostas' : pergunta.dimensao}</span><span>{revisao ? 'Concluído' : `Pergunta ${etapa + 1} de ${perguntas.length}`}</span></div><div className="questionario-progresso-trilho" role="progressbar" aria-label="Progresso do questionário" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}><div className="questionario-progresso-preenchido" style={{ width: `${progresso}%` }} /></div></div>
            {enviando && <p ref={statusRef} tabIndex={-1} className="questionario-status" role="status"><LoaderCircle size={20} aria-hidden="true" />Enviando respostas. Aguarde a confirmação e mantenha esta página aberta.</p>}
            {erro && <p ref={statusRef} tabIndex={-1} className="questionario-erro" role="alert">{erro}</p>}
            {!enviando && !erro && envioIncerto && <p className="questionario-aviso">O envio anterior pode ter sido registrado. Uma nova tentativa pode duplicar sua participação.</p>}
            {revisao ? <RevisaoRespostas payload={revisao} territorio={territorio} onEditar={editar} disabled={enviando} tituloRef={tituloRef} /> : <div className="questionario-pergunta" key={pergunta.id}>
              <h3 id="questionario-pergunta-titulo" ref={tituloRef} tabIndex={-1}>{pergunta.titulo}</h3>
              {pergunta.tipo === 'categoria' && <div className={`questionario-opcoes ${pergunta.opcoes.every((o) => o.texto.length < 28) ? 'curtas' : ''}`} role="radiogroup" aria-labelledby="questionario-pergunta-titulo">
                {pergunta.opcoes.map((opcao) => {
                  const Icone = { sim: Check, nao: X, nao_sei: CircleHelp }[opcao.valor];
                  return <label key={opcao.valor} className={`questionario-opcao ${valor === opcao.valor ? 'selecionada' : ''}`}>
                    <input type="radio" name={pergunta.id} value={opcao.valor} checked={valor === opcao.valor} onChange={() => selecionar(pergunta.id, opcao.valor)} />
                    {valor === opcao.valor ? <CircleCheck size={20} aria-hidden="true" /> : <Circle size={20} aria-hidden="true" />}<span>{opcao.texto}</span>{Icone && <Icone size={18} aria-hidden="true" />}
                  </label>;
                })}
              </div>}
              {pergunta.tipo === 'nota' && <EscalaAvaliacao value={valor} onChange={(nota) => selecionar(pergunta.id, nota)} minLabel={pergunta.minimo} maxLabel={pergunta.maximo} labelId="questionario-pergunta-titulo" disabled={enviando} />}
              {pergunta.tipo === 'texto' && <><p id="questionario-comentario-ajuda">Opcional. Não inclua nomes, endereços completos ou informações pessoais.</p><textarea aria-labelledby="questionario-pergunta-titulo" aria-describedby="questionario-comentario-ajuda questionario-contador" rows={5} maxLength={pergunta.limite} value={valor ?? ''} placeholder={pergunta.placeholder} onChange={(e) => selecionar(pergunta.id, e.target.value)} /><p id="questionario-contador" className="questionario-contador" aria-live="polite">{[...(valor ?? '')].length} / {pergunta.limite} caracteres</p></>}
            </div>}
          </>}
        </div>
        <footer className="questionario-footer">
          {registro ? <button type="button" className="questionario-botao-principal" onClick={() => descartar(true)}><Map size={18} aria-hidden="true" />Retornar ao mapa</button> : !territorio ? <button type="button" className="questionario-botao-principal" disabled={!distritoValido} onClick={() => { if (distritoValido) setTerritorio({ ...distritoValido }); }}>Iniciar questionário<ArrowRight size={18} aria-hidden="true" /></button> : revisao ? <>
            <button type="button" className="questionario-botao-secundario" disabled={enviando} onClick={() => editar(perguntas.at(-1).id)}><ArrowLeft size={18} aria-hidden="true" />Voltar</button><button type="button" className="questionario-botao-principal" disabled={enviando} onClick={enviar}><Send size={18} aria-hidden="true" />{enviando ? 'Enviando...' : erro || envioIncerto ? 'Tentar enviar novamente' : 'Confirmar envio'}</button>
          </> : <><button type="button" className="questionario-botao-secundario" onClick={() => setEtapa(etapa - 1)} disabled={etapa === 0}><ArrowLeft size={18} aria-hidden="true" />Voltar</button><button type="button" className="questionario-botao-principal" disabled={!respostaValida(pergunta, valor)} onClick={avancar}>{edicao ? 'Salvar e voltar à revisão' : pergunta.opcional ? 'Revisar respostas' : 'Continuar'}<ArrowRight size={18} aria-hidden="true" /></button></>}
        </footer>
      </section>
    </div>
  );
}
