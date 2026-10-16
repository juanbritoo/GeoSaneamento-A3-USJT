#!/usr/bin/env python3
"""
Carrega os arquivos gerados em seed/ no PostgreSQL/PostGIS.

Coloque este arquivo na pasta seed/ (junto dos outros) e rode:
  pip install "psycopg[binary]"
  python load_db.py                       # usa DATABASE_URL ou o padrão abaixo
  python load_db.py --db postgresql://usuario:senha@localhost:5432/geosaneamento

Importa dados preparados sem TRUNCATE. Registros com a mesma chave natural são atualizados;
linhas que não aparecem nos arquivos permanecem no banco.

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
    print("Conectado. Aplicando o esquema e importando sem apagar linhas existentes ...", flush=True)

    with conn:
        with conn.cursor() as cur:
            cur.execute((SEED / "schema.sql").read_text(encoding="utf-8"), prepare=False)

            cur.execute("""
                INSERT INTO territorio
                    (id_territorial,nome,id_municipio,fonte,periodo,nivel,id_fonte)
                VALUES ('3550308','São Paulo','3550308','IBGE - Localidades','2022','municipio','ibge_localidades')
                ON CONFLICT (id_territorial) DO NOTHING
            """)

            cur.execute("""
                CREATE TEMP TABLE stg_territorio (
                    id_territorial TEXT, nome TEXT, id_municipio TEXT, fonte TEXT, periodo TEXT
                ) ON COMMIT DROP
            """)
            copiar_csv(cur, "stg_territorio(id_territorial,nome,id_municipio,fonte,periodo)", "distritos.csv")
            cur.execute("""
                INSERT INTO territorio
                    (id_territorial,nome,id_municipio,fonte,periodo,nivel,id_fonte)
                SELECT id_territorial,nome,id_municipio,fonte,periodo,'distrito','ibge_localidades'
                FROM stg_territorio
                ON CONFLICT (id_territorial) DO UPDATE SET
                    nome=EXCLUDED.nome, id_municipio=EXCLUDED.id_municipio,
                    fonte=EXCLUDED.fonte, periodo=EXCLUDED.periodo,
                    nivel='distrito', id_fonte='ibge_localidades'
            """)

            cur.execute("CREATE TEMP TABLE stg_indicador (codigo TEXT, nome TEXT, unidade TEXT) ON COMMIT DROP")
            copiar_csv(cur, "stg_indicador(codigo,nome,unidade)", "indicador_catalogo.csv")
            cur.execute("""
                INSERT INTO indicador (codigo,nome,unidade)
                SELECT codigo,nome,unidade FROM stg_indicador
                ON CONFLICT (codigo) DO UPDATE SET nome=EXCLUDED.nome, unidade=EXCLUDED.unidade
            """)

            cur.execute("""
                CREATE TEMP TABLE stg_valor_indicador (
                    id_territorial TEXT, indicador TEXT, valor NUMERIC, unidade TEXT,
                    fonte TEXT, periodo TEXT, is_mock BOOLEAN
                ) ON COMMIT DROP
            """)
            copiar_csv(cur,
                       "stg_valor_indicador(id_territorial,indicador,valor,unidade,fonte,periodo,is_mock)",
                       "valor_indicador_json.csv")
            cur.execute("""
                WITH preparados AS (
                    SELECT *, CASE
                        WHEN fonte ILIKE '%mock%' OR fonte ILIKE '%fictício%' OR fonte ILIKE '%ficticio%'
                            THEN 'projeto_valor_ficticio'
                        WHEN fonte ILIKE '%JSON do projeto%' THEN 'projeto_json_nao_verificado'
                        WHEN fonte ILIKE '%SIDRA%6803%' THEN 'ibge_sidra_6803'
                        WHEN fonte ILIKE '%SIDRA%6805%' THEN 'ibge_sidra_6805'
                        WHEN fonte ILIKE '%SIDRA%6892%' THEN 'ibge_sidra_6892'
                        ELSE 'nao_classificada'
                    END AS id_fonte
                    FROM stg_valor_indicador
                )
                INSERT INTO valor_indicador
                    (id_territorial,indicador,valor,unidade,fonte,periodo,is_mock,id_fonte)
                SELECT p.id_territorial,p.indicador,p.valor,p.unidade,p.fonte,p.periodo,p.is_mock,p.id_fonte
                FROM preparados p JOIN fonte_dado f USING (id_fonte)
                ON CONFLICT (id_territorial,indicador,periodo,fonte) DO UPDATE SET
                    valor=EXCLUDED.valor, unidade=EXCLUDED.unidade,
                    is_mock=EXCLUDED.is_mock, id_fonte=EXCLUDED.id_fonte
            """)

            gj = json.loads((SEED / "distritos.geojson").read_text(encoding="utf-8"))
            sem_par = []
            for feat in gj["features"]:
                cod = str(feat["properties"]["codarea"])
                cur.execute(
                    "UPDATE territorio SET geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), "
                    "id_fonte_geom = 'malha_nao_verificada', "
                    "procedencia_geom = 'Origem não documentada no GeoJSON fornecido pelo projeto.' "
                    "WHERE id_territorial = %s AND nivel = 'distrito'",
                    (json.dumps(feat["geometry"]), cod),
                )
                if cur.rowcount == 0:
                    sem_par.append(cod)

            # EX03 / RN04: geometrias inválidas são corrigidas; as irrecuperáveis são reportadas
            cur.execute("UPDATE territorio SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3)) "
                        "WHERE nivel = 'distrito' AND geom IS NOT NULL AND NOT ST_IsValid(geom)")
            corrigidas = cur.rowcount

            cur.execute("SELECT count(*), count(geom), count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom)) "
                        "FROM territorio WHERE nivel = 'distrito' AND id_municipio = '3550308'")
            total, com_geom, invalidas = cur.fetchone()
            cur.execute("SELECT count(*) FROM valor_indicador")
            n_valores = cur.fetchone()[0]
            cur.execute("SELECT count(*) FROM (SELECT t.id_territorial "
                        "FROM territorio t LEFT JOIN valor_indicador v USING (id_territorial) "
                        "WHERE t.nivel = 'distrito' AND t.id_municipio = '3550308' "
                        "GROUP BY t.id_territorial "
                        "HAVING count(DISTINCT v.indicador) FILTER (WHERE v.indicador IS NOT NULL) "
                        "<> (SELECT count(*) FROM indicador)) x")
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
