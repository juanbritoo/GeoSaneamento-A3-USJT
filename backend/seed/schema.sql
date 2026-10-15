-- GeoSaneamento - schema inicial (PostgreSQL + PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS territorio (
    id_territorial TEXT PRIMARY KEY,            -- código IBGE do distrito (RF10/RN03)
    nome           TEXT NOT NULL,
    id_municipio   TEXT NOT NULL DEFAULT '3550308',
    fonte          TEXT NOT NULL,
    periodo        TEXT NOT NULL,
    geom           geometry(MultiPolygon, 4326)  -- preenchido a partir de distritos.geojson
);
CREATE INDEX IF NOT EXISTS idx_territorio_geom ON territorio USING GIST (geom);

CREATE TABLE IF NOT EXISTS indicador (
    codigo  TEXT PRIMARY KEY,
    nome    TEXT NOT NULL,
    unidade TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS valor_indicador (
    id_territorial TEXT NOT NULL REFERENCES territorio(id_territorial),
    indicador      TEXT NOT NULL REFERENCES indicador(codigo),
    valor          NUMERIC,
    unidade        TEXT,
    fonte          TEXT NOT NULL,               -- DT07: fonte sempre visível
    periodo        TEXT NOT NULL,               -- DT07: período sempre visível
    is_mock        BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id_territorial, indicador, periodo, fonte)
);

-- Carga (psql):
-- \copy territorio(id_territorial,nome,id_municipio,fonte,periodo) FROM 'seed/distritos.csv' CSV HEADER
-- \copy indicador(codigo,nome,unidade) FROM 'seed/indicador_catalogo.csv' CSV HEADER
-- \copy valor_indicador(id_territorial,indicador,valor,unidade,fonte,periodo,is_mock) FROM 'seed/valor_indicador_json.csv' CSV HEADER
-- Geometria: ogr2ogr -f PostgreSQL PG:"dbname=geosaneamento" seed/distritos.geojson -nln territorio_stg
--   depois: UPDATE territorio t SET geom = ST_Multi(s.wkb_geometry) FROM territorio_stg s WHERE s.codarea = t.id_territorial;


