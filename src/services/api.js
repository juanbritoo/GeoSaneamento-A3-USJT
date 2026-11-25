const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

// ==========================================
// SESSÃO (token JWT)
// ==========================================

const CHAVE_TOKEN = "geosaneamento.token";

// Cópia em memória: a sessão continua funcionando mesmo se o navegador bloquear o localStorage.
let tokenEmMemoria = null;
let aoSessaoExpirar = null;

export function lerToken() {
    if (tokenEmMemoria) return tokenEmMemoria;

    try {
        tokenEmMemoria = window.localStorage.getItem(CHAVE_TOKEN);
    } catch {
        tokenEmMemoria = null;
    }

    return tokenEmMemoria;
}

export function salvarToken(token) {
    tokenEmMemoria = token;

    try {
        window.localStorage.setItem(CHAVE_TOKEN, token);
    } catch {
        // Sem localStorage, a sessão dura apenas até recarregar a página.
    }
}

export function removerToken() {
    tokenEmMemoria = null;

    try {
        window.localStorage.removeItem(CHAVE_TOKEN);
    } catch {
        // Nada a fazer: o token em memória já foi descartado.
    }
}

// O AuthProvider registra aqui o que fazer quando a API recusa o token (expirado/inválido).
export function registrarAoSessaoExpirar(callback) {
    aoSessaoExpirar = callback;

    return () => {
        if (aoSessaoExpirar === callback) aoSessaoExpirar = null;
    };
}

// ==========================================
// REQUISIÇÃO BASE
// ==========================================

// Opções próprias: `corpo` (objeto enviado como JSON) e `comToken` (padrão: true).
// As demais opções vão direto para o fetch (method, signal...).
async function requisicaoAPI(endpoint, { corpo, comToken = true, ...options } = {}) {
    const headers = new Headers(options.headers);
    const token = comToken ? lerToken() : null;

    if (corpo !== undefined) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let resposta;

    try {
        resposta = await fetch(`${API_URL}${endpoint}`, {
            method: "GET",
            ...options,
            headers,
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
        });
    } catch (erro) {
        if (erro.name === "AbortError") throw erro;
        const erroConexao = new Error(
            `Não foi possível conectar à API em ${API_URL}. ` +
            "Verifique a disponibilidade do backend e a configuração de rede."
        );

        erroConexao.cause = erro;
        throw erroConexao;
    }

    const tipoConteudo = resposta.headers.get("content-type") || "";
    const conteudoJSON = tipoConteudo.includes("application/json") ||
        tipoConteudo.includes("application/geo+json");
    let dados = null;

    if (conteudoJSON) {
        try {
            dados = await resposta.json();
        } catch {
            dados = null;
        }
    }

    if (!resposta.ok) {
        // Token enviado e recusado: a sessão acabou. Limpa e avisa a interface.
        if (resposta.status === 401 && token) {
            removerToken();
            aoSessaoExpirar?.();
        }

        // 422 (validação do FastAPI) traz uma lista em `detail`, não um texto.
        const detalhe =
            typeof dados?.detail === "string"
                ? dados.detail
                : resposta.status === 422
                    ? "Dados inválidos. Verifique os campos e tente novamente."
                    : `A API retornou HTTP ${resposta.status}.`;

        const erroAPI = new Error(detalhe);
        erroAPI.status = resposta.status;
        erroAPI.detalhe = dados?.detail ?? null;

        throw erroAPI;
    }

    if (!conteudoJSON) {
        throw new Error(
            "A API respondeu com um formato diferente de JSON."
        );
    }

    return dados;
}

export function buscarIndicadores() {
    return requisicaoAPI("/indicadores");
}

export function buscarSaneamento(
    escala,
    idTerritorial,
    indicador,
    periodo,
    options = {}
) {
    const parametros = new URLSearchParams();
    parametros.set("escala", escala);

    if (idTerritorial !== undefined &&
        idTerritorial !== null &&
        String(idTerritorial).trim() !== "") {
        parametros.set("id_territorial", String(idTerritorial));
    }

    if (indicador !== undefined &&
        indicador !== null &&
        String(indicador).trim() !== "") {
        parametros.set("indicador", String(indicador));
    }

    if (periodo !== undefined &&
        periodo !== null &&
        String(periodo).trim() !== "") {
        parametros.set("periodo", String(periodo));
    }

    return requisicaoAPI(
        `/api/v1/saneamento?${parametros.toString()}`,
        options
    );
}

export function buscarGeoJSONDistritos() {
    return requisicaoAPI("/distritos/geojson");
}

export function buscarDistritos(options = {}) {
    return requisicaoAPI("/distritos", options);
}

// ==========================================
// AUTENTICAÇÃO
// ==========================================

export function cadastrarUsuario({ nome, email, senha }) {
    return requisicaoAPI("/auth/cadastro", {
        method: "POST",
        corpo: { nome, email, senha },
        comToken: false,
    });
}

export function entrarUsuario({ email, senha }) {
    return requisicaoAPI("/auth/login", {
        method: "POST",
        corpo: { email, senha },
        comToken: false,
    });
}

export function buscarUsuarioAtual(options = {}) {
    return requisicaoAPI("/auth/me", options);
}