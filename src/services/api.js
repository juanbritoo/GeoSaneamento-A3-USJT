
const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function requisicaoAPI(endpoint, options = {}, statusEsperado) {
    let resposta;

    try {
        resposta = await fetch(`${API_URL}${endpoint}`, {
            method: "GET",
            ...options,
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
        const detalhe =
            typeof dados?.detail === "string"
                ? dados.detail
                : `A API retornou HTTP ${resposta.status}.`;

        const erroAPI = new Error(detalhe);
        erroAPI.status = resposta.status;
        erroAPI.detalhe = dados?.detail ?? null;

        throw erroAPI;
    }

    if (statusEsperado !== undefined && resposta.status !== statusEsperado) {
        const erroStatus = new Error("A API nao confirmou o registro com o status esperado.");
        erroStatus.status = resposta.status;
        throw erroStatus;
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

export async function enviarQuestionarioV2(payload) {
    const registro = await requisicaoAPI("/api/v1/questionario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    }, 201);

    if (!Number.isInteger(registro?.id) || registro.id <= 0 ||
        registro.versao_questionario !== 2 || registro.id_territorial !== payload.id_territorial ||
        typeof registro.nome_territorio !== "string" || !registro.nome_territorio.trim()) {
        throw new Error("A resposta da API nao permitiu confirmar o registro enviado.");
    }
    eventosQuestionarioV2.dispatchEvent(new Event('registrado'));
    return registro;
}

export const eventosQuestionarioV2 = new EventTarget();

export function buscarCorrelacao(options = {}, idTerritorial) {
    const parametros = new URLSearchParams();
    if (idTerritorial) parametros.set('id_territorial', idTerritorial);
    const query = parametros.size ? '?' + parametros.toString() : '';
    return requisicaoAPI('/api/v1/correlacao' + query, options);
}

export function buscarIndicadoresParticipativos(idTerritorial, options = {}) {
    const parametros = new URLSearchParams({ id_territorial: idTerritorial });
    return requisicaoAPI('/api/v1/questionario/indicadores?' + parametros.toString(), options);
}
