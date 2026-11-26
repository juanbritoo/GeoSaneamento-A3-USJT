import { useState } from 'react';
import { ChartNoAxesColumn, ChevronDown, CircleCheck, ClipboardCheck, Droplets, House, MapPin, MessageSquare, Pencil } from 'lucide-react';
import { perguntasAplicaveis, textoResposta } from './perguntasV2';

const grupos = [
  { titulo: 'Condições domiciliares', Icone: House, ids: ['abastecimento_agua_rede_geral', 'esgotamento_sanitario_rede_geral', 'destino_lixo_coleta_direta', 'existencia_banheiro_exclusivo', 'falta_agua_30_dias'] },
  { titulo: 'Experiência na região', Icone: Droplets, ids: ['esgoto_ceu_aberto_30_dias', 'satisfacao_saneamento'] },
  { titulo: 'Suas avaliações', Icone: ChartNoAxesColumn, ids: ['regularidade_agua', 'qualidade_agua_percebida', 'condicoes_esgotamento'] },
  { titulo: 'Relato complementar', Icone: MessageSquare, ids: ['comentario'] },
];
const rotulos = ['Rede geral de água', 'Rede geral de esgoto', 'Coleta direta de lixo', 'Banheiro exclusivo', 'Falta de água', 'Esgoto a céu aberto', 'Satisfação geral', 'Regularidade da água', 'Qualidade percebida da água', 'Condições de esgotamento', 'Comentário'];
const nomes = Object.fromEntries(grupos.flatMap((g) => g.ids).map((id, i) => [id, rotulos[i]]));

export default function RevisaoRespostas({ payload, territorio, onEditar, disabled, tituloRef }) {
  const [abertos, setAbertos] = useState([true, true, false, false]);
  const perguntas = perguntasAplicaveis(payload.vinculo_territorial);
  return <div className="questionario-revisao" aria-busy={disabled}>
    <div className="revisao-intro"><span className="revisao-icone"><ClipboardCheck size={24} aria-hidden="true" /></span><div><h3 ref={tituloRef} tabIndex={-1}>Tudo pronto!</h3><p>Confira suas informações antes de enviar.</p></div></div>
    <div className="revisao-territorio"><MapPin size={20} aria-hidden="true" /><div><strong>{territorio.nome}</strong><p>{textoResposta(perguntas[0], payload.vinculo_territorial)}</p><small><CircleCheck size={14} aria-hidden="true" />Respostas obrigatórias preenchidas</small></div><button type="button" aria-label="Editar vínculo territorial" disabled={disabled} onClick={() => onEditar('vinculo_territorial')}><Pencil size={16} aria-hidden="true" /></button></div>
    {grupos.map(({ titulo, Icone, ids }, index) => {
      const itens = perguntas.filter((p) => ids.includes(p.id));
      if (!itens.length) return null;
      return <details className="revisao-grupo" key={titulo} open={abertos[index]} onToggle={(e) => { const aberto = e.currentTarget.open; setAbertos((antes) => antes[index] === aberto ? antes : antes.map((v, i) => i === index ? aberto : v)); }}>
        <summary aria-expanded={abertos[index]}><Icone size={20} aria-hidden="true" /><span>{titulo}</span><small>{itens.length}</small><ChevronDown size={18} aria-hidden="true" /></summary>
        <dl>{itens.map((p) => {
          const resposta = p.id === 'comentario' ? payload.comentario : payload.respostas[p.id];
          return <div className="revisao-linha" key={p.id}><dt>{nomes[p.id]}</dt><dd>{p.tipo === 'texto' ? resposta ? <details className="revisao-relato"><summary>Ver relato</summary><p>{resposta}</p></details> : 'Não informado' : resposta === null ? 'Não sei avaliar' : textoResposta(p, resposta)}
            {p.tipo === 'nota' && typeof resposta === 'number' && <span className="revisao-mini-barra" aria-hidden="true"><span style={{ width: `${resposta * 10}%` }} /></span>}</dd>
            <button type="button" disabled={disabled} aria-label={`Editar ${nomes[p.id]}`} onClick={() => onEditar(p.id)}><Pencil size={16} aria-hidden="true" /></button></div>;
        })}</dl>
      </details>;
    })}
  </div>;
}
