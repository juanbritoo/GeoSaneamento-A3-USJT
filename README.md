# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## 🚀 Instalação e execução do projeto

### 1. Pré-requisitos

Antes de iniciar, verifique se as seguintes ferramentas estão instaladas:

- Git
- Node.js
- npm
- Docker Desktop
- Docker Compose

Confira as versões pelo PowerShell:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

### 2. Acessar o projeto

Abra o PowerShell e execute:

```powershell
cd C:\GIT\GeoSaneamento-A3-USJT
```

Confira a branch atual:

```powershell
git branch --show-current
```

### 3. Configurar as variáveis de ambiente

Crie o arquivo `.env` a partir do exemplo disponibilizado no backend:

```powershell
Copy-Item backend/env.example backend/.env
```

Abra o arquivo para configurar as variáveis:

```powershell
notepad backend/.env
```

**Observação:** execute o comando de cópia somente se o arquivo `backend/.env` ainda não existir. Configure as variáveis conforme o ambiente de execução.

### 4. Inicializar o backend e o banco de dados

Entre na pasta do backend:

```powershell
cd C:\GIT\GeoSaneamento-A3-USJT\backend
```

Construa as imagens e inicie os containers:

```powershell
docker compose up -d --build
```

Verifique se os containers foram iniciados:

```powershell
docker compose ps
```

### 5. Inicializar o esquema do banco de dados

Execute o script responsável pela inicialização da estrutura do banco:

```powershell
docker compose exec api python seed/init_db.py
```

### 6. Copiar os arquivos de carga para o container

Os arquivos necessários para a importação dos dados devem ser copiados para o diretório `/app/seed/` do container da API.

Execute os comandos na pasta `backend`:

```powershell
docker compose cp seed/load_db.py api:/app/seed/load_db.py

docker compose cp seed/distritos.csv api:/app/seed/distritos.csv

docker compose cp seed/indicador_catalogo.csv api:/app/seed/indicador_catalogo.csv

docker compose cp seed/valor_indicador_json.csv api:/app/seed/valor_indicador_json.csv

docker compose cp seed/sidra_municipio_sp.csv api:/app/seed/sidra_municipio_sp.csv

docker compose cp seed/distritos.geojson api:/app/seed/distritos.geojson
```

### 7. Carregar os dados no banco

Após copiar os arquivos, execute o script de carga:

```powershell
docker compose exec api python seed/load_db.py
```

Esse procedimento realiza a importação dos dados disponibilizados pelo projeto para o banco de dados.

### 8. Consultar os logs da API

Caso seja necessário verificar a inicialização ou identificar erros:

```powershell
docker compose logs -f api
```

Para sair da visualização dos logs, pressione `Ctrl + C`.

### 9. Instalar as dependências do frontend

Volte para a raiz do projeto:

```powershell
cd C:\GIT\GeoSaneamento-A3-USJT
```

Instale as dependências utilizando o `npm ci`:

```powershell
npm ci
```

Esse comando instala as dependências conforme as versões registradas no arquivo `package-lock.json`.

### 10. Iniciar o frontend

Execute:

```powershell
npm run dev
```

O Vite iniciará o servidor de desenvolvimento. Acesse o endereço local apresentado no terminal para visualizar a aplicação.
