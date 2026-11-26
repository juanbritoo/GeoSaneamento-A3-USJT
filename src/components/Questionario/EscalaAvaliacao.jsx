import { useId } from 'react';
import { Check, CircleHelp } from 'lucide-react';

const cores = ['#DBEAFE', '#D0E4FF', '#BFDBFE', '#A5CAFD', '#93B9FC', '#79A8FA', '#60A5FA', '#3B82F6', '#2272ED', '#1D5FD1', '#174BAA'];

export default function EscalaAvaliacao({ value, onChange, minLabel, maxLabel, disabled = false, labelId }) {
  const id = useId();
  function teclado(e, nota) {
    const destino = { ArrowRight: (nota + 1) % 11, ArrowDown: (nota + 1) % 11, ArrowLeft: (nota + 10) % 11, ArrowUp: (nota + 10) % 11, Home: 0, End: 10 }[e.key];
    if (destino === undefined) return;
    e.preventDefault(); onChange(destino);
    e.currentTarget.parentElement.parentElement.querySelector(`[data-nota="${destino}"]`).focus();
  }
  return <div className="questionario-avaliacao">
    <output className={`questionario-nota ${value === null ? 'sem-nota' : ''}`} aria-live="polite">{value === null ? 'Não sei avaliar' : <>{value ?? '—'} <span>/ 10</span></>}</output>
    <p className="questionario-ajuda" id={`${id}-ajuda`}>Selecione uma nota. Use as setas do teclado para ajustar.</p>
    <div className="escala-segmentos" role="radiogroup" aria-labelledby={labelId} aria-describedby={`${id}-ajuda ${id}-extremos`}>
      {cores.map((cor, nota) => <label key={nota} className={`escala-item ${value === nota ? 'selecionada' : ''}`} style={{ '--segmento-cor': typeof value === 'number' && nota <= value ? cor : 'var(--color-border)' }}>
        <input type="radio" data-nota={nota} name={id} aria-label={`Nota ${nota} de 10`} checked={value === nota} disabled={disabled} tabIndex={(typeof value === 'number' ? value : 0) === nota ? 0 : -1} onKeyDown={(e) => teclado(e, nota)} onChange={() => onChange(nota)} />
        <span className="escala-bloco" aria-hidden="true">{value === nota && <Check size={16} />}</span><span className="escala-numero" aria-hidden="true">{nota}</span>
      </label>)}
    </div>
    <div className="questionario-extremos" id={`${id}-extremos`}><span>0 · {minLabel}</span><span>10 · {maxLabel}</span></div>
    <label className="escala-alternativa">Selecionar nota na lista
      <select aria-labelledby={labelId} disabled={disabled} value={value == null ? '' : value} onChange={(e) => onChange(Number(e.target.value))}><option value="" disabled>Escolha de 0 a 10</option>{cores.map((_, nota) => <option key={nota} value={nota}>{nota}</option>)}</select>
    </label>
    <button type="button" className="questionario-botao-secundario escala-desconhecida" disabled={disabled} aria-pressed={value === null} onClick={() => onChange(null)}><CircleHelp size={18} aria-hidden="true" />Não sei avaliar / Não se aplica</button>
  </div>;
}
