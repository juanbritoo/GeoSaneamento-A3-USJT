import { useEffect, useRef, useState } from "react";

import {
    MapContainer,
    TileLayer,
    GeoJSON,
    useMap
} from "react-leaflet";

import L from "leaflet";

import "leaflet/dist/leaflet.css";


// ==========================================
// ESTILOS DOS MUNICÍPIOS
// ==========================================

const estiloNormal = {

    color: "#1b5e20",

    weight: 1,

    fillColor: "#c8e6c1",

    fillOpacity: 0.35

};


const estiloHover = {

    color: "#000000",

    weight: 3,

    fillColor: "#c8e6c1",

    fillOpacity: 0.65

};


const estiloSelecionado = {

    color: "#1565c0",

    weight: 4,

    fillColor: "#90caf9",

    fillOpacity: 0.75

};


// ==========================================
// AJUSTAR MAPA
// ==========================================

function AjustarMapa({ geojson }) {

    const map = useMap();

    useEffect(() => {

        if (!geojson) {
            return;
        }

        const camada = L.geoJSON(geojson);

        const limites = camada.getBounds();

        // Ajusta o mapa para São Paulo
        map.fitBounds(limites);

        // Impede a navegação muito distante
        map.setMaxBounds(limites);

        // Restrição rígida
        map.options.maxBoundsViscosity = 1.0;

    }, [geojson, map]);

    return null;
}


// ==========================================
// MAPA
// ==========================================

function Map() {

    const [municipios, setMunicipios] = useState(null);


    // Município atualmente selecionado
    const [
        municipioSelecionado,
        setMunicipioSelecionado
    ] = useState(null);


    // Guarda a camada do município selecionado
    const camadaSelecionada = useRef(null);


    // ==========================================
    // FECHAR PAINEL
    // ==========================================

    const fecharPainel = () => {

        // Se existir um município selecionado
        if (camadaSelecionada.current) {

            // Volta o município para o estilo normal
            camadaSelecionada.current.setStyle(
                estiloNormal
            );

            // Limpa a referência
            camadaSelecionada.current = null;

        }

        // Fecha o painel
        setMunicipioSelecionado(null);

    };


    // ==========================================
    // CARREGAR GEOJSON
    // ==========================================

    useEffect(() => {

        fetch("/maps/sao_paulo_municipios.geojson")

            .then(response => {

                if (!response.ok) {

                    throw new Error(
                        "Não foi possível carregar o GeoJSON dos municípios."
                    );

                }

                return response.json();

            })

            .then(data => {

                console.log(
                    "GeoJSON carregado:",
                    data
                );

                console.log(
                    "Quantidade de municípios:",
                    data.features.length
                );

                setMunicipios(data);

            })

            .catch(error => {

                console.error(
                    "Erro ao carregar municípios:",
                    error
                );

            });

    }, []);


    // ==========================================
    // INTERFACE
    // ==========================================

    return (

        <div
            style={{
                height: "100%",
                width: "100%",
                position: "relative"
            }}
        >

            <MapContainer

                center={[-22.2, -48.8]}

                zoom={7}

                style={{
                    height: "100%",
                    width: "100%"
                }}

            >

                {/* ==================================
                    MAPA BASE
                ================================== */}

                <TileLayer

                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"

                    attribution="&copy; OpenStreetMap contributors"

                />


                {/* ==================================
                    MUNICÍPIOS
                ================================== */}

                {municipios && (

                    <>

                        <GeoJSON

                            data={municipios}

                            style={estiloNormal}


                            // ==================================
                            // EVENTOS DOS MUNICÍPIOS
                            // ==================================

                            onEachFeature={(feature, layer) => {

                                const propriedades =
                                    feature.properties;


                                // ==================================
                                // POPUP
                                // ==================================

                                layer.bindPopup(`

                                    <div>

                                        <h3>
                                            ${propriedades.NM_MUN}
                                        </h3>

                                        <p>
                                            <strong>
                                                Código IBGE:
                                            </strong>

                                            ${propriedades.CD_MUN}
                                        </p>

                                        <p>
                                            <strong>
                                                UF:
                                            </strong>

                                            ${propriedades.SIGLA_UF}
                                        </p>

                                        <p>
                                            <strong>
                                                Área:
                                            </strong>

                                            ${propriedades.AREA_KM2}
                                            km²
                                        </p>

                                    </div>

                                `);


                                // ==================================
                                // HOVER + CLIQUE
                                // ==================================

                                layer.on({

                                    // ==================================
                                    // MOUSE ENTRA
                                    // ==================================

                                    mouseover: (evento) => {

                                        // Abre o popup
                                        evento.target.openPopup();


                                        // Se este município já estiver
                                        // selecionado, mantém o destaque
                                        if (
                                            camadaSelecionada.current ===
                                            evento.target
                                        ) {

                                            evento.target.setStyle(
                                                estiloSelecionado
                                            );

                                            return;

                                        }


                                        // Aplica o estilo de hover
                                        evento.target.setStyle(
                                            estiloHover
                                        );

                                    },


                                    // ==================================
                                    // MOUSE SAI
                                    // ==================================

                                    mouseout: (evento) => {

                                        // Fecha o popup
                                        evento.target.closePopup();


                                        // Se este município estiver
                                        // selecionado, mantém o destaque
                                        if (
                                            camadaSelecionada.current ===
                                            evento.target
                                        ) {

                                            evento.target.setStyle(
                                                estiloSelecionado
                                            );

                                            return;

                                        }


                                        // Volta para o estilo normal
                                        evento.target.setStyle(
                                            estiloNormal
                                        );

                                    },


                                    // ==================================
                                    // CLIQUE
                                    // ==================================

                                    click: (evento) => {

                                        // ==================================
                                        // REMOVE DESTAQUE ANTERIOR
                                        // ==================================

                                        if (
                                            camadaSelecionada.current
                                        ) {

                                            camadaSelecionada.current.setStyle(
                                                estiloNormal
                                            );

                                        }


                                        // ==================================
                                        // DESTACA NOVO MUNICÍPIO
                                        // ==================================

                                        evento.target.setStyle(
                                            estiloSelecionado
                                        );


                                        // Guarda a nova camada selecionada
                                        camadaSelecionada.current =
                                            evento.target;


                                        // ==================================
                                        // SALVA MUNICÍPIO
                                        // ==================================

                                        setMunicipioSelecionado(
                                            propriedades
                                        );


                                        // ==================================
                                        // FECHA POPUP DO LEAFLET
                                        // ==================================

                                        evento.target.closePopup();


                                        console.log(
                                            "Município selecionado:",
                                            propriedades
                                        );

                                    }

                                });

                            }}

                        />


                        {/* ==================================
                            AJUSTAR MAPA
                        ================================== */}

                        <AjustarMapa
                            geojson={municipios}
                        />

                    </>

                )}

            </MapContainer>


            {/* ==========================================
                PAINEL DO MUNICÍPIO SELECIONADO
            ========================================== */}

            {municipioSelecionado && (

                <div

                    style={{

                        position: "absolute",

                        top: "20px",

                        right: "20px",

                        width: "280px",

                        padding: "20px",

                        backgroundColor: "white",

                        borderRadius: "10px",

                        boxShadow:
                            "0 4px 15px rgba(0,0,0,0.2)",

                        zIndex: 1000

                    }}

                >

                    {/* ==================================
                        BOTÃO FECHAR
                    ================================== */}

                    <button

                        onClick={fecharPainel}

                        style={{

                            position: "absolute",

                            top: "10px",

                            right: "10px",

                            border: "none",

                            background: "transparent",

                            fontSize: "20px",

                            cursor: "pointer"

                        }}

                    >

                        ✕

                    </button>


                    {/* ==================================
                        NOME DO MUNICÍPIO
                    ================================== */}

                    <h2>

                        {municipioSelecionado.NM_MUN}

                    </h2>


                    {/* ==================================
                        CÓDIGO IBGE
                    ================================== */}

                    <p>

                        <strong>
                            Código IBGE:
                        </strong>

                        <br />

                        {municipioSelecionado.CD_MUN}

                    </p>


                    {/* ==================================
                        UF
                    ================================== */}

                    <p>

                        <strong>
                            UF:
                        </strong>

                        <br />

                        {municipioSelecionado.SIGLA_UF}

                    </p>


                    {/* ==================================
                        ÁREA
                    ================================== */}

                    <p>

                        <strong>
                            Área:
                        </strong>

                        <br />

                        {municipioSelecionado.AREA_KM2}
                        {" "}km²

                    </p>

                </div>

            )}

        </div>

    );

}


export default Map;
