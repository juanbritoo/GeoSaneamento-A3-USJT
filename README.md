# GeoSaneamento

Aplicação React/Vite com mapa Leaflet, API FastAPI e PostgreSQL/PostGIS para
consultar saneamento distrital e coletar percepções voluntárias da população.

## Diagnóstico territorial

Selecione um distrito pelo mapa, seletor ou pin da camada **Percepção popular**.
O painel oferece três abas:

- **Dados oficiais:** conteúdo e metadados do catálogo existente, incluindo os
  avisos de fonte não verificada ou simulada. O título da aba não certifica os dados.
- **Percepção popular:** contagens de questionários, respostas de moradores e
  comentários; quatro percentuais, três médias de 0 a 10 e distribuições sobre
  falta de água, esgoto exposto e satisfação. Cada indicador exibe seu número de
  respostas válidas. Comentários individuais nunca são exibidos.
- **Análise comparativa:** barras de referência e percepção, diferença assinada
  em pontos percentuais, fonte, período, status e motivo de impossibilidade de
  comparação. O resumo destaca o maior desvio elegível e quantos indicadores
  divergiram. Um clique no pin abre esta aba, inclusive para o distrito já selecionado.

Os cálculos e classificações vêm exclusivamente do backend. `null` aparece como
“Não disponível”; zero permanece zero. Referências simuladas são identificadas
com rótulo e barras hachuradas, sem destaque de alerta real. Dados não comparáveis
podem ter valores visíveis: duas barras não significam comparação elegível.

O questionário V2 oferece revisão antes do envio e confirma armazenamento somente
após HTTP 201 válido. Um registro confirmado atualiza a aba participativa/comparativa
visível e a camada de pins ativa na mesma aba do navegador. Reabrir a camada ou
uma aba consulta novamente os dados. Trocar de distrito cancela consultas anteriores;
respostas atrasadas são ignoradas. Falhas oferecem nova tentativa manual.

As respostas voluntárias **não representam necessariamente toda a população**.
Questionários não equivalem a pessoas ou domicílios únicos. Divergências observadas
não comprovam irregularidades, causalidade ou significância estatística.

## Execução local

Requer Node.js/npm compatíveis com as dependências do projeto e Docker Desktop
com Compose. Os comandos abaixo são para execução manual em ambiente local.
Não usar credenciais ou URLs de produção.

### Backend e banco

Na raiz, apenas se ainda não existir configuração local:

```powershell
Copy-Item backend/env.example backend/.env
notepad backend/.env
```

Defina uma senha local em `POSTGRES_PASSWORD`. Mantenha `CORS_ORIGINS` compatível
com a origem do frontend (por padrão, `http://localhost:5173`). Não sobrescreva um
`.env` já configurado.

```powershell
Set-Location backend
docker compose up -d db
docker compose build api
```

Em uma instalação nova, inicialize o schema:

```powershell
docker compose run --rm --no-deps api python seed/init_db.py
```

Em uma base existente que ainda não recebeu a etapa 01, aplique somente a migração
do questionário, antes de iniciar a API atualizada:

```powershell
docker compose run --rm --no-deps api python seed/init_db.py --questionario-only
```

Não há migração adicional nas etapas 07 e 08. Para uma instalação nova sem
territórios/indicadores, o carregador existente usa os arquivos preparados em
`backend/seed`. O Dockerfile da API não os copia integralmente; monte-os somente
para leitura. Confira primeiro os conflitos:

```powershell
$seedPath = (Resolve-Path ./seed).Path
docker compose run --rm --no-deps -v "${seedPath}:/app/seed:ro" api python seed/load_db.py --check-only
```

Após conferir a auditoria, para carregar os arquivos locais sem substituir
registros existentes:

```powershell
docker compose run --rm --no-deps -v "${seedPath}:/app/seed:ro" api python seed/load_db.py
docker compose up -d --no-deps api
```

A carga inclui dados distritais não verificados/simulados: não os trate como
oficiais. A análise comparativa exige procedência oficial, compatibilidade
metodológica explícita e período compatível. A ausência desses requisitos retorna
`nao_comparavel`, não um alerta. Consulte a documentação detalhada em
[backend/README.md](backend/README.md), especialmente a seção da etapa 06.
Não atribua marcadores metodológicos sem curadoria prévia.

API: `http://localhost:8000`; Swagger: `http://localhost:8000/docs`.
Para execução diária de uma base já preparada, basta `docker compose up -d`
em `backend/`. Para parar sem remover dados: `docker compose stop`.

### Frontend

Em outro terminal, na raiz do projeto:

```powershell
npm ci
```

O frontend usa `http://localhost:8000` por padrão. Se necessário, configure
`VITE_API_URL=http://localhost:8000` em `.env.local` e ajuste a origem autorizada
no backend. Não inclua segredos em variáveis `VITE_`.

```powershell
npm run dev -- --host localhost --port 5173 --strictPort
```

No PowerShell com restrição a `npm.ps1`, use `npm.cmd` nos comandos acima.

## Verificação local

```powershell
npm run lint
npm run build
```

Regressões Python existentes, a partir de `backend/`, somente com
`TEST_DATABASE_URL` configurado para PostgreSQL/PostGIS **isolado**:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
```

Não apontar testes ou fixtures ao banco da aplicação. Nesta entrega, testes
auxiliares frontend foram executados fora do repositório, conforme `AGENTS.md`.

Validação da etapa 08: lint e build aprovados, 26 regressões backend aprovadas e
fluxo real em ambiente isolado de questionário → HTTP 201 → PostgreSQL → agregação
→ comparação → pin → painel. Verificados estados vazios, zero/null, referências
simuladas, amostra insuficiente, incompatibilidade metodológica, falha/retry,
troca de distrito, resposta obsoleta, navegação por teclado e quatro resoluções.
Nenhum dado fictício foi inserido no banco utilizado pela aplicação.

## Limitações

- A amostra é voluntária e não deduplicada; mínimo amostral não garante representatividade.
- Ausência de dados não significa ausência de saneamento. Séries de anos ou métodos
  incompatíveis não geram alertas reais; o frontend não altera essa decisão.
- O contrato atual não possui chave de idempotência: uma falha após o commit pode
  levar a duplicidade numa tentativa posterior, com aviso no formulário.
- Atualização automática é local à aba; registros de outras sessões aparecem na
  próxima consulta. Os dados das abas são consultados quando abertas, sem cache persistente.
- Pins representam distritos, não endereços dos participantes, e podem se sobrepor.
- Leitor de tela, toque físico e desempenho com grande volume não foram avaliados.
  Tiles externos foram bloqueados nos testes; conferir o fundo cartográfico em uso normal.

Regras de cálculo, contratos, fontes e critérios de compatibilidade estão em
[backend/README.md](backend/README.md). Histórico de implementação e evidências
locais estão em `CODEX_PASSOS.md`.
