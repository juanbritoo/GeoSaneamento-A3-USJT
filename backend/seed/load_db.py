#!/usr/bin/env python3
"""
Carrega os arquivos gerados em seed/ no PostgreSQL/PostGIS.

Coloque este arquivo na pasta seed/ (junto dos outros) e rode:
  pip install "psycopg[binary]"
  python load_db.py                       # usa DATABASE_URL ou o padrão abaixo
  python load_db.py --db postgresql://usuario:senha@localhost:5432/geosaneamento

ATENÇÃO: recria o conteúdo das tabelas territorio, indicador e valor_indicador
(TRUNCATE) a cada execução. É o comportamento desejado enquanto os dados são de teste.

Ordem: schema.sql -> territorio -> indicador -> valor_indicador -> geometria -> validação.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import psycopg

BASE = Path(__file__).resolve().parent
SEED = BASE if BASE.name == "seed" else BASE / "seed"
DEFAULT_DB = "postgresql://postgres:postgres@localhost:5432/geosaneamento"

ARQUIVOS = [
    "schema.sql", "distritos.csv", "indicador_catalogo.csv",
    "valor_indicador_json.csv", "distritos.geojson",
]


def copiar_csv(cur, tabela_colunas, arquivo):
    sql = f"COPY {tabela_colunas} FROM STDIN WITH (FORMAT csv, HEADER true)"
    with cur.copy(sql) as cp, open(SEED / arquivo, "rb") as f:
        while chunk := f.read(65536):
            cp.write(chunk)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=os.getenv("DATABASE_URL", DEFAULT_DB))
    args = ap.parse_args()

    faltando = [a for a in ARQUIVOS if not (SEED / a).exists()]
    if faltando:
        sys.exit(f"Arquivos ausentes em {SEED}: {faltando}. Rode antes o geosaneamento_seed.py.")

    destino = args.db.split("@")[-1]  # não imprime usuário/senha
    print(f"Conectando em {destino} ...", flush=True)
    try:
        conn = psycopg.connect(args.db, connect_timeout=10)
    except psycopg.OperationalError as e:
        sys.exit(
            f"\n[erro] não foi possível conectar ao banco ({destino}).\n"
            "Confira: 1) o PostgreSQL/Docker está rodando? 2) usuário, senha, porta e nome do banco "
            "(use --db postgresql://usuario:senha@localhost:5432/geosaneamento); "
            "3) o banco 'geosaneamento' foi criado?\n"
            f"Detalhe: {str(e).strip()}"
        )
    print("Conectado. Carregando dados ...", flush=True)

    with conn:
        with conn.cursor() as cur:
            cur.execute((SEED / "schema.sql").read_text(encoding="utf-8"))
            cur.execute("TRUNCATE valor_indicador, indicador, territorio")

            copiar_csv(cur, "territorio(id_territorial,nome,id_municipio,fonte,periodo)", "distritos.csv")
            copiar_csv(cur, "indicador(codigo,nome,unidade)", "indicador_catalogo.csv")
            copiar_csv(cur, "valor_indicador(id_territorial,indicador,valor,unidade,fonte,periodo,is_mock)",
                       "valor_indicador_json.csv")

            gj = json.loads((SEED / "distritos.geojson").read_text(encoding="utf-8"))
            sem_par = []
            for feat in gj["features"]:
                cod = str(feat["properties"]["codarea"])
                cur.execute(
                    "UPDATE territorio SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)) "
                    "WHERE id_territorial = %s",
                    (json.dumps(feat["geometry"]), cod),
                )
                if cur.rowcount == 0:
                    sem_par.append(cod)

            # EX03 / RN04: geometrias inválidas são corrigidas; as irrecuperáveis são reportadas
            cur.execute("UPDATE territorio SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) "
                        "WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)")
            corrigidas = cur.rowcount

            cur.execute("SELECT count(*), count(geom), count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)) "
                        "FROM territorio")
            total, com_geom, invalidas = cur.fetchone()
            cur.execute("SELECT count(*) FROM valor_indicador")
            n_valores = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM (SELECT id_territorial FROM valor_indicador GROUP BY 1 "
                        "HAVING count(*) <> (SELECT count(*) FROM indicador)) x")
            incompletos = cur.fetchone()[0]

    print(f"territorio: {total} distritos | com geometria: {com_geom} | inválidas: {invalidas} "
          f"| corrigidas com ST_MakeValid: {corrigidas}")
    print(f"valor_indicador: {n_valores} linhas | distritos com indicadores incompletos: {incompletos}")
    if sem_par:
        print(f"[aviso] feições da malha sem distrito correspondente: {sem_par}")
    problemas = (total != 96) or (com_geom != total) or invalidas or incompletos or sem_par
    print("OK" if not problemas else "[atenção] revise as mensagens acima")


if __name__ == "__main__":
    main()
