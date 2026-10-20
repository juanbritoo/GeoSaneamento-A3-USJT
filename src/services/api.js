
const API_URL = (
    import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");

async function requisicaoAPI(endpoint, options = {}) {
    let resposta;

    try {
        resposta = await fetch(`${API_URL}${endpoint}`, {
            method: "GET",
            ...options,
        });
    } catch (erro) {
        const erroConexao = new Error(
            `Não foi possível conectar à API em ${API_URL}. ` +
            "Verifique a disponibilidade do backend e a configuração de rede."
        );

        erroConexao.cause = erro;
        throw erroConexao;
    }

    const tipoConteudo = resposta.headers.get("content-type") || "";
    let dados = null;

    if (tipoConteudo.includes("application/json")) {
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

    if (!tipoConteudo.includes("application/json")) {
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
    periodo
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
        `/api/v1/saneamento?${parametros.toString()}`
    );
}

export function buscarGeoJSONDistritos() {
    return requisicaoAPI("/distritos/geojson");
}
