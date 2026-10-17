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
