const opcoes = (pares) => pares.map(([valor, texto]) => ({ valor, texto }));
const simNao = opcoes([['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei informar']]);
const contexto = 'Contextualização territorial';
const condicoes = 'Condições de saneamento';
const percepcao = 'Percepção e satisfação';

export const perguntasV2 = [
  { id: 'vinculo_territorial', dimensao: contexto, tipo: 'categoria',
    titulo: 'Você reside no distrito selecionado?',
    opcoes: opcoes([
      ['morador_mais_1_ano', 'Sim, há mais de 1 ano'],
      ['morador_menos_1_ano', 'Sim, há menos de 1 ano'],
      ['trabalha_estuda', 'Não, mas trabalho ou estudo na região'],
      ['sem_vinculo_frequente', 'Não possuo vínculo frequente com a região'],
    ]) },
  { id: 'abastecimento_agua_rede_geral', dimensao: condicoes, tipo: 'categoria', domiciliar: true,
    titulo: 'Sua residência utiliza a rede geral como principal forma de abastecimento de água?', opcoes: simNao },
  { id: 'esgotamento_sanitario_rede_geral', dimensao: condicoes, tipo: 'categoria', domiciliar: true,
    titulo: 'Sua residência possui esgotamento sanitário pela rede geral?', opcoes: simNao },
  { id: 'destino_lixo_coleta_direta', dimensao: condicoes, tipo: 'categoria', domiciliar: true,
    titulo: 'O lixo da sua residência é coletado diretamente pelo serviço de coleta?', opcoes: simNao },
  { id: 'existencia_banheiro_exclusivo', dimensao: condicoes, tipo: 'categoria', domiciliar: true,
    titulo: 'Sua residência possui banheiro de uso exclusivo dos moradores?', opcoes: simNao },
  { id: 'falta_agua_30_dias', dimensao: condicoes, tipo: 'categoria', domiciliar: true,
    titulo: 'Nos últimos 30 dias, em quantos dias faltou água na sua residência?',
    opcoes: opcoes([['nenhum', 'Nenhum dia'], ['1_2', '1 a 2 dias'], ['3_7', '3 a 7 dias'],
      ['8_15', '8 a 15 dias'], ['mais_15', 'Mais de 15 dias'], ['nao_sei', 'Não sei informar']]) },
  { id: 'esgoto_ceu_aberto_30_dias', dimensao: condicoes, tipo: 'categoria',
    titulo: 'Nos últimos 30 dias, com que frequência você observou esgoto a céu aberto na região avaliada?',
    opcoes: opcoes([['nunca', 'Nunca'], ['uma_duas_vezes', 'Uma ou duas vezes'],
      ['semanalmente', 'Semanalmente'], ['diariamente', 'Diariamente'], ['nao_sei', 'Não sei informar']]) },
  { id: 'satisfacao_saneamento', dimensao: percepcao, tipo: 'categoria',
    titulo: 'Considerando os últimos 30 dias, qual seu nível de satisfação com o saneamento da região?',
    opcoes: opcoes([['muito_satisfeito', 'Muito satisfeito'], ['satisfeito', 'Satisfeito'],
      ['neutro', 'Neutro'], ['insatisfeito', 'Insatisfeito'], ['muito_insatisfeito', 'Muito insatisfeito'],
      ['nao_sei', 'Não sei avaliar']]) },
  { id: 'regularidade_agua', dimensao: percepcao, tipo: 'nota', domiciliar: true,
    titulo: 'De 0 a 10, como você avalia a regularidade do abastecimento de água na sua residência?',
    minimo: 'Muito irregular', maximo: 'Totalmente regular' },
  { id: 'qualidade_agua_percebida', dimensao: percepcao, tipo: 'nota', domiciliar: true,
    titulo: 'De 0 a 10, como você avalia a qualidade percebida da água que chega à sua residência?',
    minimo: 'Muito ruim', maximo: 'Excelente' },
  { id: 'condicoes_esgotamento', dimensao: percepcao, tipo: 'nota',
    titulo: 'De 0 a 10, como você avalia as condições de coleta e afastamento de esgoto na região?',
    minimo: 'Muito precárias', maximo: 'Excelentes' },
  { id: 'comentario', dimensao: 'Relato complementar', tipo: 'texto', opcional: true,
    titulo: 'Gostaria de compartilhar algum relato sobre o saneamento da sua região?',
    limite: 500, placeholder: 'Descreva problemas recorrentes, situações vivenciadas ou sugestões de melhoria...' },
];

export const naoMorador = (vinculo) => ['trabalha_estuda', 'sem_vinculo_frequente'].includes(vinculo);
export const perguntasAplicaveis = (vinculo) => perguntasV2.filter((p) => !p.domiciliar || !naoMorador(vinculo));

export function atualizarResposta(dados, id, valor) {
  const novos = { ...dados, [id]: valor };
  if (id === 'vinculo_territorial' && naoMorador(valor) !== naoMorador(dados[id])) {
    perguntasV2.filter((p) => p.domiciliar).forEach((p) => {
      if (naoMorador(valor)) novos[p.id] = null;
      else delete novos[p.id];
    });
  }
  return novos;
}

export function respostaValida(pergunta, valor) {
  if (pergunta.tipo === 'texto') return valor === undefined || (typeof valor === 'string' && [...valor].length <= pergunta.limite);
  if (pergunta.tipo === 'nota') return valor === null || (Number.isInteger(valor) && valor >= 0 && valor <= 10);
  return pergunta.opcoes.some((opcao) => opcao.valor === valor);
}

export function prepararPayloadV2(idTerritorial, dados) {
  if (!/^[0-9]{9}$/.test(idTerritorial) || typeof idTerritorial !== 'string' ||
      !perguntasAplicaveis(dados.vinculo_territorial).every((p) => respostaValida(p, dados[p.id]))) {
    throw new Error('Confira as respostas obrigatórias antes de revisar.');
  }
  return {
    id_territorial: idTerritorial,
    versao_questionario: 2,
    vinculo_territorial: dados.vinculo_territorial,
    respostas: Object.fromEntries(perguntasV2.filter((p) => !['vinculo_territorial', 'comentario'].includes(p.id))
      .map((p) => [p.id, p.domiciliar && naoMorador(dados.vinculo_territorial) ? null : dados[p.id]])),
    comentario: dados.comentario?.trim() || null,
  };
}

export function textoResposta(pergunta, valor) {
  if (pergunta.tipo === 'texto') return valor?.trim() || 'Sem relato complementar';
  if (valor === null) return 'Não sei avaliar / Não se aplica';
  if (pergunta.tipo === 'nota') return `${valor} / 10`;
  return pergunta.opcoes.find((opcao) => opcao.valor === valor)?.texto ?? 'Não respondida';
}
