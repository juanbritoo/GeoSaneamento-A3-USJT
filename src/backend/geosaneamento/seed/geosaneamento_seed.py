#!/usr/bin/env python3
"""
GeoSaneamento - gerador de dataset para desenvolvimento do backend.

Gera em seed/ (ou na própria pasta do script, se ela se chamar seed):
  distritos.csv            96 distritos de São Paulo (ID IBGE real + nome)
  distritos.geojson        malha dos distritos, EPSG:4326 (via --malha-local, ver abaixo)
  distritos_corrigido.json JSON de distritos corrigido (se json__distritos.json estiver ao lado)
  valor_indicador_json.csv / indicador_catalogo.csv  indicadores de teste (is_mock=true)
  indicadores_mock.csv     só se NÃO houver json__distritos.json
  sidra_municipio_sp.csv   dados REAIS do Censo 2022 (SIDRA) p/ o município de SP
  schema.sql               PostgreSQL/PostGIS + carga dos CSVs

Uso:
  pip install requests pandas
  python geosaneamento_seed.py            # tudo
  python geosaneamento_seed.py --offline  # só o schema.sql
  python geosaneamento_seed.py --malha-local SP_Distritos_2022.shp   # requer geopandas
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import pandas as pd
import requests

MUN_SP = "3550308"
# Saída = a própria pasta do script se ela se chamar "seed"; senão, uma subpasta "seed" ao lado do script.
BASE = Path(__file__).resolve().parent
OUT = BASE if BASE.name == "seed" else BASE / "seed"
TIMEOUT = 60

# Tabelas SIDRA (Censo 2022, características dos domicílios).
# ATENÇÃO: nível territorial máximo = município (MU). Não existe N10 (distrito).
SIDRA_TABELAS = {
    6803: "Água - ligação à rede geral e forma de abastecimento",
    6805: "Esgotamento sanitário",
    6892: "Destino do lixo",
}

# Indicadores mock: (codigo, nome, unidade, min, max)
MOCK_INDICADORES = [
    ("AGUA_REDE_GERAL", "Domicílios com abastecimento de água por rede geral", "%", 85, 100),
    ("ESGOTO_REDE", "Domicílios com esgotamento por rede geral/pluvial", "%", 70, 99),
    ("LIXO_COLETADO", "Domicílios com lixo coletado", "%", 90, 100),
]


def get_json(url):
    r = requests.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def build_distritos():
    data = get_json(
        f"https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{MUN_SP}/distritos"
    )
    df = pd.DataFrame(
        [{"id_territorial": str(d["id"]), "nome": d["nome"].strip()} for d in data]
    ).sort_values("id_territorial")
    import merge_json  # mesma pasta
    df["nome"] = df["nome"].replace(merge_json.NOMES_ACENTO)  # IBGE devolve alguns sem acento
    df["id_municipio"] = MUN_SP
    df["fonte"] = "IBGE - Localidades"
    df["periodo"] = "2022"
    if len(df) != 96:
        print(f"[aviso] esperado 96 distritos, API retornou {len(df)}", file=sys.stderr)
    df.to_csv(OUT / "distritos.csv", index=False)
    return df


def build_malha(local_path=None):
    """Malha dos 96 distritos -> seed/distritos.geojson (propriedade codarea = id do distrito).

    A API de Malhas do IBGE só subdivide por UF/meso/micro/município, então a malha
    de distritos vem de um arquivo baixado (shapefile/GPKG do IBGE ou GeoSampa).
    Se --malha-local for informado, converte esse arquivo; senão tenta a API v4.
    """
    if local_path:
        return _malha_de_arquivo(local_path)
    url = (
        f"https://servicodados.ibge.gov.br/api/v4/malhas/municipios/{MUN_SP}"
        "?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=distrito"
    )
    try:
        gj = get_json(url)
    except Exception as e:
        raise RuntimeError(
            f"API de malhas não entrega distritos ({e}). Baixe a malha de distritos/setores "
            "do IBGE (ibge.gov.br > Geociências > Malha de Setores Censitários > SP) e rode: "
            "python geosaneamento_seed.py --malha-local CAMINHO_DO_ARQUIVO"
        )
    (OUT / "distritos.geojson").write_text(json.dumps(gj), encoding="utf-8")
    return gj


def _malha_de_arquivo(path):
    import geopandas as gpd  # pip install geopandas

    gdf = gpd.read_file(path)
    cols = {c.upper(): c for c in gdf.columns}
    col = cols.get("CD_DIST") or cols.get("CD_DISTRITO")
    if not col:
        raise RuntimeError(f"coluna CD_DIST não encontrada. Colunas: {list(gdf.columns)}")
    gdf[col] = gdf[col].astype(str)
    gdf = gdf[gdf[col].str.startswith(MUN_SP)]
    gdf = gdf.dissolve(by=col, as_index=False)  # funciona p/ malha de distritos ou de setores
    gdf = gdf.rename(columns={col: "codarea"})[["codarea", "geometry"]]
    gdf = gdf.to_crs(4326)
    gdf["geometry"] = gdf.geometry.simplify(0.0001, preserve_topology=True)
    gdf.to_file(OUT / "distritos.geojson", driver="GeoJSON")
    print(f"malha: {len(gdf)} distritos convertidos de {path}")
    return gdf


def _det(id_, cod, lo, hi):
    """Valor determinístico (sempre igual p/ o mesmo distrito+indicador)."""
    h = int(hashlib.sha256(f"{id_}:{cod}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return round(lo + (hi - lo) * h, 2)


def build_mock(distritos):
    rows = []
    for id_ in distritos["id_territorial"]:
        for cod, _nome, unidade, lo, hi in MOCK_INDICADORES:
            rows.append(
                {
                    "id_territorial": id_,
                    "indicador": cod,
                    "valor": _det(id_, cod, lo, hi),
                    "unidade": unidade,
                    "fonte": "MOCK (dado fictício)",
                    "periodo": "2022",
                    "is_mock": True,
                }
            )
    pd.DataFrame(rows).to_csv(OUT / "indicadores_mock.csv", index=False)


def build_sidra():
    frames = []
    for tabela, desc in SIDRA_TABELAS.items():
        meta = get_json(f"https://servicodados.ibge.gov.br/api/v3/agregados/{tabela}/metadados")
        cls = "".join(f"/c{c['id']}/all" for c in meta.get("classificacoes", []))
        url = f"https://apisidra.ibge.gov.br/values/t/{tabela}/n6/{MUN_SP}/v/all/p/last{cls}"
        rows = get_json(url)
        header, data = rows[0], rows[1:]
        df = pd.DataFrame(data).rename(columns=header)  # 1ª linha = rótulos das colunas
        df.insert(0, "tabela", tabela)
        df.insert(1, "descricao_tabela", desc)
        df["fonte"] = f"IBGE - Censo 2022 - SIDRA tabela {tabela}"
        frames.append(df)
    pd.concat(frames, ignore_index=True).to_csv(OUT / "sidra_municipio_sp.csv", index=False)


SCHEMA = """-- GeoSaneamento - schema inicial (PostgreSQL + PostGIS)
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
-- \\copy territorio(id_territorial,nome,id_municipio,fonte,periodo) FROM 'seed/distritos.csv' CSV HEADER
-- \\copy indicador(codigo,nome,unidade) FROM 'seed/indicador_catalogo.csv' CSV HEADER
-- \\copy valor_indicador(id_territorial,indicador,valor,unidade,fonte,periodo,is_mock) FROM 'seed/valor_indicador_json.csv' CSV HEADER
-- Geometria: ogr2ogr -f PostgreSQL PG:"dbname=geosaneamento" seed/distritos.geojson -nln territorio_stg
--   depois: UPDATE territorio t SET geom = ST_Multi(s.wkb_geometry) FROM territorio_stg s WHERE s.codarea = t.id_territorial;
"""


def build_schema(com_mock=False):
    inserts = ""
    if com_mock:  # só quando não há JSON de distritos (indicadores_mock.csv)
        inserts = "\n".join(
            f"INSERT INTO indicador VALUES ('{c}', '{n}', '{u}') ON CONFLICT DO NOTHING;"
            for c, n, u, _lo, _hi in MOCK_INDICADORES
        )
    (OUT / "schema.sql").write_text(SCHEMA + "\n" + inserts + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="só gera schema.sql")
    ap.add_argument("--malha-local", help="shapefile/GPKG de distritos ou setores do IBGE (SP)")
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)

    import merge_json  # mesma pasta; corrige o JSON de distritos automaticamente
    json_path = merge_json.achar_json()
    tem_json = Path(json_path).exists()

    build_schema(com_mock=not tem_json)
    if args.offline:
        print("schema.sql gerado.")
        return
    d = build_distritos()
    print(f"distritos.csv: {len(d)} distritos")

    if tem_json:
        merge_json.run(json_path, str(OUT / "distritos.csv"), str(OUT))
        print("distritos_corrigido.json e valor_indicador_json.csv gerados")
    else:
        print("[aviso] json__distritos.json não encontrado: usando indicadores fictícios simples")
        build_mock(d)
        print("indicadores_mock.csv gerado")

    for nome, fn in (("malha", lambda: build_malha(args.malha_local)), ("sidra", build_sidra)):
        try:
            fn()
            print(f"{nome}: ok")
        except Exception as e:  # não derruba o resto
            print(f"[erro] {nome}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
