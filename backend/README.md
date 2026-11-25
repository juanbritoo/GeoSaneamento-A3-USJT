# GeoSaneamento — Backend

## 📋 Pré-requisitos

- Docker Desktop com Docker Compose: [instalação oficial](https://docs.docker.com/desktop/setup/install/).

## 🚀 Primeira execução

No PowerShell, na raiz do repositório, crie o arquivo de configuração e abra-o para definir uma senha local em `POSTGRES_PASSWORD`:

```powershell
Copy-Item backend/env.example backend/.env
notepad backend/.env
```

Salve o `.env` e inicie os serviços (o primeiro início constrói a imagem):

```powershell
Set-Location backend
docker-compose up -d --build
```

Aplique o esquema somente se ainda não tiver sido aplicado ao banco:

```powershell
docker-compose exec api python seed/init_db.py
```

O script lê `seed/schema.sql` e aplica alterações incrementais, sem apagar tabelas ou registros. O Compose aguarda o banco ficar saudável; os dados persistem no volume `pgdata`.

## ▶️ Execução diária

No PowerShell, a partir de `backend/`:

```powershell
docker-compose up -d
```

## 🔌 Rotas da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/health` | Verifica a API e a conexão com o banco. |
| `GET` | `/api/v1/saneamento` | Consulta dados municipais ou distritais e aceita filtros. |
| `GET` | `/distritos` | Lista os distritos. |
| `GET` | `/distritos/geojson` | Retorna as geometrias distritais em GeoJSON. |
| `GET` | `/indicadores` | Lista o catálogo de indicadores. |
| `POST` | `/api/v1/questionario` | Grava as respostas do questionário de um distrito, com pontuação e nível de saneamento. |
| `GET` | `/api/v1/questionario` | Consulta as respostas gravadas (filtros `id_territorial`, `nivel_saneamento`; paginação `limite`/`deslocamento`). |

## 📝 Questionário

O `POST /api/v1/questionario` recebe o distrito e as respostas, calcula a pontuação (0 a 100) e classifica em `critico`, `precario`, `regular` ou `adequado`. O critério fica em `app/classificacao.py`.

```json
{
  "id_territorial": "355030801",
  "respostas": {
    "abastecimento": "Às vezes",
    "esgoto": "Raramente",
    "abastecimento_fonte": "Rede pública de abastecimento",
    "esgoto_destino": "Rede pública de esgoto",
    "avaliacao": "Regular"
  }
}
```

Depois de atualizar o código, reconstrua a imagem e aplique o esquema para criar a tabela `resposta_questionario`:

```powershell
docker-compose up -d --build
docker-compose exec api python seed/init_db.py
```

## 🧪 Testes e encerramento

Swagger: [http://localhost:8000/docs](http://localhost:8000/docs).

Opcionalmente, consulte os logs da API a partir de `backend/`:

```powershell
docker-compose logs -f api
```

Para parar os serviços sem apagar os dados, execute em `backend/`:

```powershell
docker-compose down
```

## Etapa 01/08 - estrutura do questionario participativo V2

O schema continua canonico em `seed/schema.sql`. O bloco delimitado por
`BEGIN/END QUESTIONARIO MIGRATION` e executado tanto na instalacao completa
quanto pela opcao `--questionario-only` de `seed/init_db.py`. Nao ha framework
novo, carga de respostas ou migracao automatica na inicializacao da API.

- `versao_questionario INTEGER NOT NULL DEFAULT 1`, limitado a 1 ou 2:
  registros anteriores e INSERTs do endpoint atual continuam V1 (Gabriel).
  Gravacoes futuras V2 deverao informar explicitamente a versao 2.
- `vinculo_territorial TEXT` e `comentario VARCHAR(500)` opcionais, sem valor
  fabricado para o legado. O vinculo permite distinguir moradores e nao moradores;
  seu vocabulario e obrigatoriedade V2 ficam para a definicao posterior do contrato.
- `pontuacao NUMERIC(5,2)` e `nivel_saneamento` preservam valores e validacoes
  anteriores. Um CHECK exige ambos para V1; V2 pode deixa-los nulos. Valores
  presentes continuam sujeitos a faixa 0-100 e as quatro classificacoes legadas.
- `respostas JSONB NOT NULL` permanece flexivel para categorias, inteiros e
  JSON null (nao aplicavel). Nao se definem ainda chaves/alternativas V2 nem
  validacoes de notas por pergunta. O contrato futuro devera validar notas 0-10.
- PK, sequencia BIGSERIAL, FK para `territorio`, timestamp e indice territorial
  sao preservados. Nao ha alteracao de geometria, indicadores ou classificacao.
- O GET existente filtra V1 internamente, inclusive no total da paginacao, pois
  seu contrato exige pontuacao/classificacao e respostas textuais. POST e modelos
  Pydantic permanecem iguais. Nao ha endpoint V2 nesta etapa.
- Futuras analises devem filtrar explicitamente `versao_questionario = 2` (ou 1
  para o legado); a coluna torna a separacao possivel, mas nao impede consultas
  SQL arbitrarias sem filtro. Nenhum calculo agregado foi implementado.

### Aplicacao manual, exclusivamente no banco local

Antes de subir a API atualizada em uma base existente, aplique a migracao.
O GET passa a depender da coluna de versao. A partir de `backend/`, com as
configuracoes locais conferidas e o banco local ja iniciado:

```powershell
# Prepara a imagem local com os arquivos atualizados, sem iniciar a nova API.
docker compose build api
# Base existente: altera apenas resposta_questionario e seus metadados.
docker compose run --rm --no-deps api python seed/init_db.py --questionario-only
# Inicia a API depois da migracao bem-sucedida.
docker compose up -d --no-deps api
```

Para uma instalacao nova, substitua o comando de migracao por:

```powershell
docker compose run --rm --no-deps api python seed/init_db.py
```

A opcao restrita exige `territorio` existente; tambem cria a tabela de respostas
se ela ainda nao existir. O modo completo conserva o pipeline anterior de
territorios/fontes/indicadores; nao o use apenas para migrar o questionario de
uma base existente. O carregador `seed/load_db.py` permanece independente.

Cada execucao do inicializador e transacional. A migracao e reexecutavel e nao
apaga registros. ALTER TABLE exige bloqueio; `lock_timeout=10s` cancela a
operacao se o bloqueio nao for obtido. Nesse caso, aguarde uma janela local sem
concorrencia e repita. Nao ha rollback destrutivo automatico: nao reverta a
estrutura depois de receber dados V2.

### Testes locais isolados

`tests/test_questionario_migration.py` usa unittest e as dependencias existentes.
Aponte `TEST_DATABASE_URL` exclusivamente para uma instancia de testes
PostgreSQL/PostGIS, nunca para a base da aplicacao. Nao carrega `.env`.

```powershell
# Defina TEST_DATABASE_URL com a conexao da instancia isolada antes de executar.
python -m unittest discover -s tests -p test_questionario_migration.py -v
```

Cada cenario cria um schema de teste dentro de uma transacao e faz rollback ao
terminar, sem DROP TABLE, DELETE, TRUNCATE ou fixtures permanentes. Cobre base
legada, instalacao nova, reexecucao, preservacao de dados/constraints, V1/V2,
JSONB, limite de comentario, FK e funcoes reais do POST/GET com validacao dos
modelos Pydantic. Nao substitui testes HTTP ou de navegador.

## Etapa 02/08 - contratos e persistencia V2

Esta secao atualiza o comportamento da API descrito na etapa 01. Nao ha novas
rotas, migracoes ou dependencias. A migracao da etapa 01 deve estar aplicada
antes de iniciar esta versao da API. `app/classificacao.py` permanece intacto.

### POST /api/v1/questionario

Sem `versao_questionario` ou com `versao_questionario: 1`, continua aceitando o
JSON V1 apresentado acima, calculando pontuacao e classificacao e retornando o
mesmo contrato original (sem campos novos na resposta). A versao 2 deve ser
explicita e utiliza `QuestionarioEntradaV2` e `RespostasQuestionarioV2`, ambos
com campos extras proibidos. O codigo territorial deve ser string de nove
digitos e corresponder a um registro de nivel `distrito`.

Exemplo V2 de morador:

```json
{
  "id_territorial": "355030801",
  "versao_questionario": 2,
  "vinculo_territorial": "morador_mais_1_ano",
  "respostas": {
    "abastecimento_agua_rede_geral": "sim",
    "esgotamento_sanitario_rede_geral": "nao_sei",
    "destino_lixo_coleta_direta": "sim",
    "existencia_banheiro_exclusivo": "sim",
    "falta_agua_30_dias": "1_2",
    "esgoto_ceu_aberto_30_dias": "nunca",
    "satisfacao_saneamento": "neutro",
    "regularidade_agua": 0,
    "qualidade_agua_percebida": 10,
    "condicoes_esgotamento": null
  },
  "comentario": "  Relato opcional  "
}
```

Vinculos aceitos: `morador_mais_1_ano`, `morador_menos_1_ano`, `trabalha_estuda`
e `sem_vinculo_frequente`. Os dois primeiros seguem as regras de moradores.
Todas as dez chaves de `respostas` sao obrigatorias, inclusive quando o valor
for `null`: omitir uma chave retorna 422. Nao ha notas preenchidas por padrao.

| Campo | Valores |
|---|---|
| As quatro perguntas comparaveis | `sim`, `nao`, `nao_sei`; `null` somente para nao moradores |
| `falta_agua_30_dias` | `nenhum`, `1_2`, `3_7`, `8_15`, `mais_15`, `nao_sei`; `null` somente para nao moradores |
| `esgoto_ceu_aberto_30_dias` | `nunca`, `uma_duas_vezes`, `semanalmente`, `diariamente`, `nao_sei` |
| `satisfacao_saneamento` | `muito_satisfeito`, `satisfeito`, `neutro`, `insatisfeito`, `muito_insatisfeito`, `nao_sei` |
| `regularidade_agua`, `qualidade_agua_percebida`, `condicoes_esgotamento` | Inteiro JSON 0-10 ou `null` |

Notas rejeitam booleanos, strings e decimais, inclusive `1.0`. Zero e uma nota
valida, nunca representa desconhecimento. Use `null` para notas desconhecidas.
Nas categorias aplicaveis, desconhecimento e `nao_sei`, nao `null`.

Nao moradores devem enviar as quatro perguntas comparaveis, falta de agua,
regularidade e qualidade da agua como `null`. Podem informar observacao de
esgoto, satisfacao e condicoes de esgotamento, usando `nao_sei` nas categorias
ou `null` na nota quando nao souberem avaliar. Exemplo:

```json
{
  "id_territorial": "355030801",
  "versao_questionario": 2,
  "vinculo_territorial": "trabalha_estuda",
  "respostas": {
    "abastecimento_agua_rede_geral": null,
    "esgotamento_sanitario_rede_geral": null,
    "destino_lixo_coleta_direta": null,
    "existencia_banheiro_exclusivo": null,
    "falta_agua_30_dias": null,
    "esgoto_ceu_aberto_30_dias": "semanalmente",
    "satisfacao_saneamento": "nao_sei",
    "regularidade_agua": null,
    "qualidade_agua_percebida": null,
    "condicoes_esgotamento": null
  }
}
```

Comentario pode ser omitido ou `null`. A entrada aceita no maximo 500 caracteres
antes da normalizacao; remove espacos nas extremidades e converte texto vazio
ou somente espacos em `null`. Nao altera espacos internos. As regras
complementares ficam em `app/validacao_questionario.py`.

Sucesso retorna 201. `QuestionarioRespostaV2` contem `id`, `id_territorial`,
`nome_territorio`, `versao_questionario`, `vinculo_territorial`, `respostas`,
`comentario` normalizado e `criado_em`. Nao retorna pontuacao/classificacao;
ambas sao gravadas como SQL NULL. As notas permanecem numeros no JSONB, e os
valores nao aplicaveis permanecem JSON null. Vinculo e comentario ficam nas
colunas especificas. A resposta POST devolve o comentario apenas ao solicitante.

### GET /api/v1/questionario

| Consulta | Comportamento |
|---|---|
| Sem versao ou `?versao_questionario=1` | Contrato V1 original |
| `?versao_questionario=2` | `QuestionarioListaV2`, somente V2 |
| `?versao_questionario=2&id_territorial=355030801&limite=10&deslocamento=0` | Filtro territorial e paginacao V2 |
| `?versao_questionario=1&nivel_saneamento=adequado` | Filtro de classificacao V1 |
| `?versao_questionario=2&nivel_saneamento=adequado` | 422: filtros incompativeis |

Ambas as listas retornam `total`, `limite`, `deslocamento` e `itens`. Limite:
1-200 (padrao 50); deslocamento: minimo 0 (padrao 0). Total e itens usam o
mesmo filtro de versao. Ordenacao: data decrescente e id decrescente.
Cada item V2 tem os campos da resposta POST **exceto comentario**. O campo nao
e consultado no SQL nem existe no modelo coletivo `QuestionarioItemV2`.
Nenhuma consulta coletiva desta etapa divulga comentarios livres.

### Erros, Swagger e testes

- 200: consulta; 201: registro.
- 404: no POST, identificador bem formado sem distrito correspondente (inclui
  territorio de outro nivel). GET sem correspondencias retorna lista vazia.
- 422: contrato, categoria, nota, identificador malformado ou parametros invalidos.
- 503: indisponibilidade do banco, com mensagens publicas dos handlers existentes,
  sem detalhes SQL.

O Swagger em `/docs` apresenta os modelos e exemplos V1/V2 na mesma operacao.
O exemplo interativo V2 usa notas numericas; os exemplos acima demonstram `null`.
Para enviar um JSON salvo localmente, por exemplo:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/questionario -ContentType 'application/json; charset=utf-8' -InFile questionario-v2.json
Invoke-RestMethod 'http://localhost:8000/api/v1/questionario?versao_questionario=2'
```

Execute os testes somente com `TEST_DATABASE_URL` apontando para uma instancia
isolada de PostgreSQL/PostGIS, a partir de `backend/`:

```powershell
python -m unittest discover -s tests -p 'test_questionario*.py' -v
```

A suite V2 exercita a aplicacao ASGI real (validacao de entrada, serializacao,
status, OpenAPI e handlers) com cursor direcionado ao banco isolado, sem abrir
o pool da aplicacao nem precisar de httpx. Fixtures e DDL ficam em transacoes
revertidas ao finalizar. A suite de migracao da etapa 01 permanece inalterada.
Nao ha teste de navegador nem de servidor HTTP/TCP nesta suite.

## Etapa 04/08 - indicadores participativos por distrito

As duas consultas abaixo agregam exclusivamente questionarios V2, sem modificar
respostas, schema, frontend ou contratos de entrada. Nao consultam indicadores
oficiais e nao calculam correlacao. A etapa 03 continua sem envio pelo frontend.

### Rotas e periodo

- `GET /api/v1/questionario/indicadores?id_territorial=355030801`
- `GET /api/v1/questionario/resumo-territorial`

Ambas aceitam `data_inicio` e `data_fim` opcionais em `AAAA-MM-DD`. As datas
se referem a `criado_em`, no fuso `America/Sao_Paulo`. Inicio e fim sao
inclusivos: aplica-se `>=` inicio do primeiro dia e `<` inicio do dia seguinte
ao fim. Sem uma das datas, aquele limite fica aberto; sem ambas, todo o
historico V2 e considerado. Periodo invertido ou data invalida retorna 422.

O primeiro endpoint exige codigo de nove digitos e territorio existente de
nivel `distrito`: codigo malformado/ausente retorna 422, distrito inexistente
ou territorio de outro nivel retorna 404. Distrito existente sem dados retorna
200, contadores zero e medidas sem denominador valido como `null`.
Indisponibilidade do banco retorna 503 pelos handlers existentes, sem detalhes
SQL. As rotas e os contratos de resposta estao documentados no Swagger.

```powershell
Invoke-RestMethod 'http://localhost:8000/api/v1/questionario/indicadores?id_territorial=355030801&data_inicio=2026-11-01&data_fim=2026-11-30'
Invoke-RestMethod 'http://localhost:8000/api/v1/questionario/resumo-territorial?data_inicio=2026-11-01&data_fim=2026-11-30'
```

### Contrato de resposta e contadores

`IndicadoresParticipativosResposta` contem `territorio` (`id_territorial`,
`nome`), `periodo` (`data_inicio`, `data_fim`, `fuso_horario`),
`versao_questionario: 2`, `unidade_contagem: "questionarios"`, `contadores`,
`principais` e `complementares`.

Os contadores sao `total_questionarios`, `total_moradores`,
`total_nao_moradores`, `total_comentarios` e `total_vinculo_nao_informado`.
Moradores incluem os vinculos `morador_mais_1_ano` e `morador_menos_1_ano`;
nao moradores incluem `trabalha_estuda` e `sem_vinculo_frequente`. Vinculos
nulos ou fora do contrato entram no ultimo contador, sem serem classificados
artificialmente como moradores/nao moradores. Nao entram nos indicadores.
Comentario so conta se contiver algum caractere que nao seja espaco em branco.
Nenhum texto livre, id de resposta ou resposta individual e retornado.

**Contagens representam questionarios, nao pessoas unicas.** Envios repetidos
continuam sendo registros distintos; nao existe deduplicacao de participantes.
Os indicadores descrevem a amostra participativa, sem inferir representatividade
estatistica da populacao do distrito.

`ResumoTerritorialParticipativo` contem o mesmo periodo, versao e unidade de
contagem, mais `distritos`: lista de objetos com `territorio` e `contadores`.
Inclui todos os distritos cadastrados, mesmo sem respostas no periodo, ordenados
por nome e codigo. Nao inclui municipios, comentarios ou geometrias. Os filtros
incidem sobre as respostas do LEFT JOIN, preservando os distritos com zero.

### Indicadores principais

Cada item de `principais` tem `codigo`, `valor`, `unidade: "%"`, `total_sim`,
`total_nao`, `total_nao_sei` e `respostas_validas`. Codigos:

- `ABASTECIMENTO_AGUA_REDE_GERAL`
- `ESGOTAMENTO_SANITARIO_REDE_GERAL`
- `DESTINO_LIXO_COLETA_DIRETA`
- `EXISTENCIA_BANHEIRO_EXCLUSIVO`

Somente moradores V2 participam desses calculos. Para cada campo, de forma
independente: `respostas_validas = total_sim + total_nao` e
`valor = 100 * total_sim / respostas_validas`. `nao_sei` e contado separadamente;
null, campo ausente e valores fora do contrato nao entram no denominador.
Quando o denominador e zero, valor e `null`, nunca zero artificial.

Exemplo de um item (cenario de teste: 72 sim, 28 nao e 20 desconhecidas):

```json
{
  "codigo": "ABASTECIMENTO_AGUA_REDE_GERAL",
  "valor": 72.0,
  "unidade": "%",
  "total_sim": 72,
  "total_nao": 28,
  "total_nao_sei": 20,
  "respostas_validas": 100
}
```

### Indicadores complementares

`complementares` possui tres listas: `medias`, `distribuicoes` e `percentuais`.
Nao e calculada uma nota geral combinando as tres avaliacoes.

| Media (`campo`) | Populacao aplicavel |
|---|---|
| `regularidade_agua` | Moradores V2 |
| `qualidade_agua_percebida` | Moradores V2 |
| `condicoes_esgotamento` | Moradores e nao moradores V2 |

Cada media retorna `campo`, `valor`, `unidade: "nota_0_10"` e
`respostas_validas`. Zero e uma nota valida; somente valores JSON numericos
inteiros entre 0 e 10 entram no AVG. Nulos, strings, booleanos, numeros fora da
faixa e fracionarios sao excluidos sem provocar erro de conversao.

| Distribuicao (`campo`) | Populacao aplicavel | Categorias validas |
|---|---|---|
| `falta_agua_30_dias` | Moradores V2 | `nenhum`, `1_2`, `3_7`, `8_15`, `mais_15` |
| `esgoto_ceu_aberto_30_dias` | Moradores e nao moradores V2 | `nunca`, `uma_duas_vezes`, `semanalmente`, `diariamente` |
| `satisfacao_saneamento` | Moradores e nao moradores V2 | `muito_satisfeito`, `satisfeito`, `neutro`, `insatisfeito`, `muito_insatisfeito` |

Cada distribuicao retorna `campo`, `respostas_validas`, `total_nao_sei` e
`categorias`, cada uma com `codigo`, `total` e `percentual`. O denominador e a
soma das categorias validas daquele campo; `nao_sei` fica fora da lista de
categorias e do denominador, mas seu total fica explicito. Todas as categorias
validas aparecem, mesmo com contagem zero. Sem respostas validas, todos os
percentuais da distribuicao sao `null`. Nao aplicaveis e categorias invalidas
nao entram nos calculos.

| Percentual (`codigo`) | Numerador | Denominador |
|---|---|---|
| `SATISFEITOS` | muito_satisfeito + satisfeito | Respostas validas de satisfacao |
| `COM_FALTA_AGUA` | 1_2 + 3_7 + 8_15 + mais_15 | Respostas validas de falta de agua, incluindo nenhum |
| `OBSERVARAM_ESGOTO_EXPOSTO` | uma_duas_vezes + semanalmente + diariamente | Respostas validas de observacao de esgoto, incluindo nunca |

Cada percentual retorna `codigo`, `valor`, `unidade: "%"`, `total_favoravel`
(contagem do evento indicado pelo codigo, nao um julgamento positivo) e
`respostas_validas`. Usa o mesmo denominador da distribuicao correspondente,
sem somar percentuais ja arredondados.

Todas as medias e porcentagens sao arredondadas no PostgreSQL para duas casas
decimais. JSON usa numeros, portanto zeros finais podem nao aparecer. Por
arredondamento, a soma das categorias pode resultar em 99.99 ou 100.01.

### Implementacao e testes locais

`app/indicadores_participativos.py` concentra as agregacoes parametrizadas,
usando COUNT, AVG, FILTER, GROUP BY, janelas e NULLIF. Os dados individuais
permanecem no banco: Python recebe somente agregados. O detalhe usa uma unica
instrucao SQL para os calculos, garantindo a mesma visao dos dados entre seus
denominadores. Nao ha tabela materializada, migracao ou dependencia nova.
A classificacao V1 e as rotas anteriores permanecem intactas.

A partir de `backend/`, com `TEST_DATABASE_URL` definido exclusivamente para
PostgreSQL/PostGIS isolado:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
```

Inclui testes de calculos/denominadores, caso 72%, medias 0/10, nulos e JSON
invalido, V1/nao moradores, comentarios privados, questionarios repetidos,
distritos vazios, limites de data e fuso, validacao HTTP/ASGI e 503, alem das
regressoes V1/V2 e migracao. Fixtures e schema de teste sao revertidos por
rollback; nao executar na base utilizada pela aplicacao.

## Integracao do frontend V2 (etapa 05/08)

A partir desta etapa, o Diagnostico participativo envia efetivamente as respostas.
A revisao local da etapa 03 permanece como conferencia anterior ao envio, sem as
mensagens temporarias de demonstracao. `enviarQuestionarioV2(payload)` reutiliza
o mecanismo de requisicoes e faz um unico POST em `/api/v1/questionario`, usando
`VITE_API_URL` (padrao local: `http://localhost:8000`). O servico V1 permanece intacto.
O backend local deve possuir a migracao da etapa 01 e os contratos da etapa 02;
a origem do frontend precisa estar autorizada no CORS existente.

O payload revisado conserva `versao_questionario: 2`, codigos internos, notas
numericas (inclusive zero), campos nao aplicaveis `null` e comentario opcional.
Nao calcula pontuacao ou classificacao. O usuario confirma explicitamente o envio.
Durante a requisicao, editar, reiniciar, fechar, Escape e clique no fundo ficam
bloqueados; uma trava sincrona impede requisicoes simultaneas. O aviso de saida
da pagina depende do navegador e nao impede encerramento forcado.

Somente HTTP 201 com identificacao coerente do registro permite a conclusao
"Obrigado pela participacao!", com distrito e retorno ao mapa. HTTP 200, resposta
invalida ou erro nao confirmam armazenamento. Erros 404 e 422 orientam revisar
o distrito/formulario; 503 indica indisponibilidade. As respostas ficam em memoria
para edicao ou nova tentativa manual, sem reenvio automatico nem persistencia local.
Falhas de conexao ou respostas inconclusivas podem ocorrer depois do commit:
o aviso informa essa possibilidade e uma nova tentativa exige confirmacao do
risco de duplicidade. Nao ha garantia de idempotencia no contrato atual.

Os indicadores e resumo territorial existentes consultam os registros persistidos
nas proximas requisicoes GET. Esta etapa nao acrescenta indicadores na interface,
nao altera o mapa nem consulta comentarios coletivos.

Validacao local realizada com App completo, Edge headless, FastAPI e PostgreSQL/
PostGIS isolado em tmpfs: envio de morador e nao moradores; notas 0/10/null;
confirmacao 201; agregados/resumo atualizados; erros 404/422/503/rede; resposta
200 e JSON 201 invalido; clique duplo, fechamento bloqueado, respostas preservadas,
perda de resposta apos commit e tentativa consciente. Regressao: 18 testes Python
(migracao, V1/V2 e agregacoes), lint e build aprovados. Mapa/seletor testados com
dois distritos sinteticos; requisicoes externas de tiles interceptadas. Nenhum
acesso ao banco da aplicacao. Toque fisico e leitor de tela nao foram testados.

Para verificar localmente: na raiz, `npm run lint` e `npm run build`; para o backend,
executar o comando de unittest acima somente com `TEST_DATABASE_URL` apontando
para banco isolado. Nenhuma migracao ou dependencia adicional nesta etapa.

## Analise comparativa territorial (etapa 06/08)

`GET /api/v1/correlacao` compara os quatro codigos principais de saneamento.
Nao calcula correlacao estatistica. Retorna `periodo`, `periodo_oficial`, `aviso`
e `distritos`; cada distrito inclui identificacao, `total_questionarios`, quatro
`indicadores` e `resumo`. Sem identificador, inclui todos os distritos, mesmo
vazios. Nao utiliza valores municipais como substitutos nem expoe comentarios.

```text
GET /api/v1/correlacao?id_territorial=355030801&data_inicio=2026-01-01&data_fim=2026-12-31&periodo_oficial=2026
GET /api/v1/correlacao
```

Parametros opcionais: `id_territorial` (nove digitos), `data_inicio`/`data_fim`
(AAAA-MM-DD, inclusivas em America/Sao_Paulo) e `periodo_oficial` (texto exato
armazenado, 1-50 caracteres, sem espacos nas extremidades). Intervalo invertido,
data ou identificador invalidos: 422. Distrito inexistente: 404. Banco indisponivel:
503 sem detalhes SQL. Sucesso: 200, inclusive quando nao ha comparacoes elegiveis.

### Elegibilidade, metodologia e periodo

- Usa exclusivamente respostas V2 de moradores para cada percentual, com o mesmo
  denominador `sim + nao` da etapa 04. Total de questionarios inclui todos os V2
  filtrados, sem inferir pessoas/domicilios unicos. Zero percentual e valido.
- Codigo e territorio devem coincidir. Valor e unidade do catalogo devem ser
  percentuais (`%`, `Percentual` ou `percentual`), com valor finito entre 0 e 100.
  Nao ha conversao de proporcoes, unidades absolutas ou recortes parciais.
- O schema atual nao contem uma certificacao metodologica dedicada. A comparacao
  exige declaracao explicita no JSONB `valor_indicador.dimensoes`, sem alterar o
  schema ou os dados nesta etapa. O objeto deve conter exclusivamente:

  ```json
  {"metodologia_comparavel_v2": "domicilios_ocupados:abastecimento_agua_rede_geral:v2"}
  ```

  Para os demais codigos, substituir o campo em minusculas por
  `esgotamento_sanitario_rede_geral`, `destino_lixo_coleta_direta` ou
  `existencia_banheiro_exclusivo`. Identificadores aceitos ficam centralizados em
  `METODOLOGIAS_V2`. Esse marcador e uma convencao de validacao, nao uma evidencia
  produzida automaticamente: somente o responsavel pela curadoria pode atribui-lo
  apos conferir universo domiciliar ocupado, definicao da pergunta, numerador,
  denominador, escala distrital e ausencia de recortes adicionais. Agua deve
  representar rede geral como forma principal; esgoto deve representar rede geral;
  lixo, coleta direta; banheiro, uso exclusivo dos moradores. O marcador nao
  torna uma amostra voluntaria representativa nem iguala seus pesos aos do censo.
  Dimensoes ausentes, outro marcador ou campos adicionais impedem a comparacao.
  A carga distrital atual nao fornece esse marcador: nao presumir compatibilidade
  apenas porque nomes/codigos coincidem. Nenhum dado foi marcado nesta etapa.
- Periodo oficial anual (quatro digitos) deve coincidir com o ano da primeira e
  ultima resposta valida daquele indicador. Respostas que atravessam anos ou
  referencia de outro ano tornam-no nao comparavel. Referencias nao anuais nao
  sao interpretadas implicitamente. Primeira/ultima resposta sao retornadas por
  indicador; os filtros solicitados tambem aparecem na resposta. Mesmo ano nao
  garante simultaneidade das coletas, advertida no campo `aviso`.
- Com `periodo_oficial`, usa apenas o periodo exato; sem ele, prioriza fontes
  classificadas como oficiais e nao mock, depois seleciona o ano mais recente
  por codigo dentro desse grupo. Nao recua silenciosamente a anos antigos se o
  mais recente for incompativel. Multiplas fontes no periodo selecionado ou
  multiplos periodos sem ordenacao anual resultam em referencia ambigua, sem
  escolha arbitraria. Fonte ausente/ambigua retorna metadados nulos e motivo.
- Fonte precisa estar classificada como `oficial`, com procedencia preenchida e
  `is_mock=false` para gerar alerta real. Referencias simuladas/nao oficiais
  metodologica e temporalmente compativeis podem ter diferencas apenas no bloco
  `simulacao`, com `status_simulado`. Status principal fica `nao_comparavel`,
  divergencias principais nulas e exclusao integral do resumo oficial. O campo
  `valor_oficial` conserva o nome do contrato mesmo para referencia simulada;
  sempre interpretar junto com `is_mock`, `classificacao_fonte` e `simulacao`.

### Classificacao e resumo

Precedencia por indicador: nenhum V2 no distrito/periodo => `sem_dados`; menos
que `MINIMO_RESPOSTAS_VALIDAS=30` respostas validas naquele campo =>
`amostra_insuficiente`; referencia ausente/incompativel => `nao_comparavel`.
Somente indicadores elegiveis calculam `oficial - participativo` e seu modulo.
Decimal com arredondamento de metade para cima, duas casas; limites aplicados
sobre a diferenca arredondada. Os percentuais participativos ja sao arredondados
pela regra da etapa 04. Sem dados validos, valores permanecem `null`, nunca zero.

Limites centralizados em `app/correlacao.py`: `LIMITE_POSSIVEL_PP=10` e
`LIMITE_ELEVADA_PP=20`. Modulo <10: `sem_alerta`; >=10 e <20:
`possivel_divergencia`; >=20: `divergencia_elevada`. Alterar constantes exige
revisao tecnica/testes; nenhum parametro publico permite relaxar os criterios.

O resumo conta somente comparacoes oficiais elegiveis. A media e descritiva;
a maior divergencia absoluta determina status, `indicador_critico` e
`exibir_alerta`. Empate usa o primeiro codigo em ordem alfabetica. Sem elegiveis,
media/maximo/critico sao nulos, contagens zero e alerta falso; status e `sem_dados`
se nao ha V2, `amostra_insuficiente` se todos ficam abaixo do minimo, ou
`nao_comparavel` nos demais casos. Nunca retorna `sem_alerta` sem comparacoes.

Exemplo de indicador em fixture isolada (72 sim, 28 nao, 20 desconhecidas;
referencia validada de 92%, ano 2026):

```json
{
  "codigo": "ABASTECIMENTO_AGUA_REDE_GERAL",
  "valor_oficial": 92.0,
  "valor_participativo": 72.0,
  "unidade": "%",
  "unidade_oficial": "%",
  "respostas_validas": 100,
  "primeira_resposta": "2026-11-24",
  "ultima_resposta": "2026-11-24",
  "divergencia_pp": 20.0,
  "divergencia_absoluta_pp": 20.0,
  "fonte": "Fonte fixture",
  "periodo": "2026",
  "id_fonte": "teste_oficial",
  "procedencia": "Fonte distrital validada apenas para teste",
  "classificacao_fonte": "oficial",
  "is_mock": false,
  "status": "divergencia_elevada",
  "motivo": null,
  "simulacao": null
}
```

Alertas representam diferencas observadas em amostras voluntarias, **nao
comprovacao estatistica de irregularidades**. Minimo de 30 nao garante
representatividade, independencia, ausencia de duplicidade ou significancia.
Nao ha teste de hipotese, causalidade, painel comparativo ou pins nesta etapa.

### Implementacao e testes

Duas consultas parametrizadas para um ou todos os distritos: participativos em
lote com `base_sql`/`PRINCIPAIS` da etapa 04, COUNT/FILTER/GROUP BY e formula
existente; referencias em lote com os mesmos joins territoriais/catalogo/fonte
da consulta de saneamento. Nao chama o endpoint de cada distrito nem muda as
agregacoes anteriores. Teste de equivalencia confere percentual/denominador
contra `agregar_indicadores`; outro confere duas consultas para todos os distritos.
Sem nova tabela, migracao, dependencia ou acesso ao banco da aplicacao.

Suite local: `python -m unittest discover -s tests -p 'test_*.py' -v`, em backend,
com `TEST_DATABASE_URL` exclusivamente isolado. Resultado: 26 testes aprovados
(8 novos e 18 regressoes), incluindo ASGI real, SQL/PostGIS, limites, privacidade,
periodos, fontes, metodo, simulacoes, 503 e isolamento municipal. Fixtures/DDL
revertidos por rollback. Nao executado teste de carga, navegador ou servidor TCP
nesta etapa de backend; frontend inalterado. Nenhuma migracao nova necessaria.
