import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, MapPin, Search, SearchX } from 'lucide-react';
import './SeletorDistrito.css';

const normalizar = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function posicaoMenu(elemento) {
  const r = elemento.getBoundingClientRect();
  const dialogo = elemento.closest('[role="dialog"]')?.getBoundingClientRect();
  const inferior = Math.min(window.innerHeight - 8, dialogo?.bottom ?? Infinity);
  const superior = Math.max(8, dialogo?.top ?? 0);
  const abaixo = inferior - r.bottom - 6, acima = r.top - superior - 6;
  const subir = abaixo < 190 && acima > abaixo;
  return { left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)), width: r.width,
    maxHeight: Math.max(80, Math.min(352, subir ? acima : abaixo)),
    ...(subir ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }) };
}

export default function SeletorDistrito({ distritos, value, onChange, placeholder = 'Selecione um distrito...', disabled = false, loading = false, error = '', allowClear = false, label = 'Distrito' }) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const [posicao, setPosicao] = useState(null);
  const [destinoPortal, setDestinoPortal] = useState(null);
  const botao = useRef(null), menu = useRef(null), pesquisa = useRef(null);
  const lista = useMemo(() => [...distritos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).filter((d) => normalizar(d.nome).includes(normalizar(busca))), [distritos, busca]);
  const itens = allowClear && !busca ? [{ id_territorial: '', nome: 'Limpar seleção' }, ...lista] : lista;
  const indice = Math.min(ativo, Math.max(0, itens.length - 1));
  const bloqueado = disabled || loading || !!error;

  function fechar(foco = true) { setAberto(false); if (foco) botao.current?.focus(); }
  function escolher(distrito) { onChange(distrito.id_territorial ? distrito : null); fechar(); }
  function abrir() {
    if (bloqueado) return;
    setPosicao(posicaoMenu(botao.current));
    setDestinoPortal(botao.current.closest('[role="dialog"]') ?? botao.current.closest('.app-header') ?? document.body);
    setBusca(''); setAtivo(0); setAberto(true);
  }
  useEffect(() => {
    if (!aberto) return;
    const posicionar = () => setPosicao(posicaoMenu(botao.current));
    pesquisa.current?.focus();
    const fora = (e) => { if (!menu.current?.contains(e.target) && !botao.current.contains(e.target)) setAberto(false); };
    document.addEventListener('pointerdown', fora);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => { document.removeEventListener('pointerdown', fora); window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true); };
  }, [aberto]);
  useEffect(() => { if (aberto) menu.current?.querySelector('[data-ativo="true"]')?.scrollIntoView({ block: 'nearest' }); }, [indice, aberto]);

  function teclado(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); setAtivo((n) => Math.max(0, Math.min(itens.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1))));
    }
    if (e.key === 'Enter' && itens[indice]) { e.preventDefault(); escolher(itens[indice]); }
    if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); fechar(); }
  }
  return <div className="seletor-distrito">
    <button ref={botao} type="button" className="seletor-controle" aria-label={label} aria-haspopup="listbox" aria-expanded={aberto} aria-controls={`${id}-lista`} disabled={bloqueado} onClick={() => aberto ? fechar() : abrir()} onKeyDown={(e) => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); abrir(); } }}>
      <MapPin size={18} aria-hidden="true" /><span>{value?.nome ?? (loading ? 'Carregando distritos...' : error ? 'Distritos indisponíveis' : placeholder)}</span><ChevronDown size={18} className={aberto ? 'seletor-chevron aberto' : 'seletor-chevron'} aria-hidden="true" />
    </button>
    {error && <p className="seletor-erro" role="alert">{error}</p>}
    {aberto && destinoPortal && createPortal(<div ref={menu} className="seletor-menu" style={posicao ?? { visibility: 'hidden' }}>
      <div className="seletor-pesquisa"><Search size={18} aria-hidden="true" /><input ref={pesquisa} role="combobox" aria-label={`Pesquisar ${label.toLowerCase()}`} aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-lista`} aria-activedescendant={itens[indice] ? `${id}-${indice}` : undefined} placeholder="Pesquisar distrito..." value={busca} onChange={(e) => { setBusca(e.target.value); setAtivo(0); }} onKeyDown={teclado} /></div>
      <ul id={`${id}-lista`} role="listbox" aria-label={label}>
        {itens.map((d, i) => <li key={d.id_territorial} id={`${id}-${i}`} role="option" aria-selected={(value?.id_territorial ?? '') === d.id_territorial} data-ativo={i === indice} onPointerMove={() => setAtivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(d)}><MapPin size={16} aria-hidden="true" /><span>{d.nome}</span>{value?.id_territorial === d.id_territorial && <Check size={16} aria-hidden="true" />}</li>)}
      </ul>
      {!itens.length && <p className="seletor-vazio" role="status"><SearchX size={20} aria-hidden="true" />{distritos.length ? 'Nenhum distrito encontrado.' : 'Nenhum distrito disponível.'}</p>}
    </div>, destinoPortal)}
  </div>;
}
