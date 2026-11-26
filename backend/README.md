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
