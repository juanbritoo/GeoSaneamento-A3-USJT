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
