#!/usr/bin/env python3
"""Add prepared municipal and district records without replacing existing rows.

The schema must already be initialized with ``python seed/init_db.py``.
"""
import argparse
import csv
import json
import os
import sys
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

SEED = Path(__file__).resolve().parent
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/geosaneamento"
MUNICIPALITY_ID = "3550308"
GEOMETRY_PROVENANCE = "Original provenance of the district boundary is undocumented in the project's GeoJSON."


def read_csv(filename):
    with (SEED / filename).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def source_for_district(label):
    if label.startswith("JSON do projeto"):
        return "projeto_json_nao_verificado"
    if label.upper().startswith("MOCK"):
        return "projeto_valor_ficticio"
    raise ValueError(f"Unknown district value provenance: {label!r}")


def sidra_rows():
    path = SEED / "sidra_municipio_sp.csv"
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        raw_rows = list(reader)
    prepared = []
    required_headers = {
        "tabela", "descricao_tabela", "Nível Territorial (Código)",
        "Nível Territorial", "Unidade de Medida (Código)", "Unidade de Medida",
        "Valor", "Município (Código)", "Município", "Variável (Código)",
        "Variável", "Ano (Código)", "Ano", "fonte",
    }
    if len(headers) != len(set(headers)):
        raise ValueError("SIDRA CSV has duplicate column names; column mapping is ambiguous")
    missing_headers = required_headers - set(headers)
    if missing_headers:
        raise ValueError(f"SIDRA CSV is missing required columns: {sorted(missing_headers)}")
    classification_headers = [
        name for name in headers
        if name.endswith(" (Código)") and name not in required_headers
    ]
    classification_pairs = []
    for code_header in classification_headers:
        label_header = code_header.removesuffix(" (Código)")
        if label_header not in headers:
            raise ValueError(
                f"SIDRA classification column {code_header!r} has no matching label column {label_header!r}"
            )
        classification_pairs.append((code_header, label_header))
    if not classification_pairs:
        raise ValueError("SIDRA CSV has no identifiable classification code/label columns")

    seen_series = set()
    for line_number, raw in enumerate(raw_rows, start=2):
        if None in raw or any(value is None for value in raw.values()):
            raise ValueError(f"SIDRA CSV row {line_number} has a missing or extra field")
        table, description = raw["tabela"].strip(), raw["descricao_tabela"].strip()
        unit_code = raw["Unidade de Medida (Código)"].strip()
        unit_name, value = raw["Unidade de Medida"].strip(), raw["Valor"].strip()
        territory, source = raw["Município (Código)"].strip(), raw["fonte"].strip()
        variable_code, period = raw["Variável (Código)"].strip(), raw["Ano"].strip()
        category_codes = [raw[code].strip() for code, _ in classification_pairs if raw[code].strip()]
        category_labels = [raw[label].strip() for code, label in classification_pairs if raw[code].strip()]
        if not category_codes:
            raise ValueError(f"SIDRA observation without a classification code: table {table}")
        source_code = {
            "6803": "ibge_sidra_6803",
            "6805": "ibge_sidra_6805",
            "6892": "ibge_sidra_6892",
        }.get(table)
        if source_code is None:
            raise ValueError(f"SIDRA table without a catalogued source: {table}")
        indicator_code = "SIDRA_" + "_".join([table, variable_code, unit_code, *category_codes])
        if indicator_code in seen_series:
            raise ValueError(f"SIDRA series code is ambiguous or duplicated at CSV row {line_number}: {indicator_code}")
        seen_series.add(indicator_code)
        name = description
        if category_labels:
            name += " - " + " / ".join(category_labels)
        dimensions = {
            key: value
            for key, value in raw.items()
            if key not in {"Valor", "fonte"}
        }
        try:
            numeric_value = Decimal(value.replace(",", "."))
        except (InvalidOperation, ValueError) as exc:
            raise ValueError(f"Non-numeric SIDRA value: table {table}, value {value!r}") from exc
        prepared.append({
            "territory": territory,
            "indicator": indicator_code,
            "name": name,
            "unit": unit_name,
            "value": numeric_value,
            "source": source,
            "source_code": source_code,
            "period": period,
            "dimensions": dimensions,
        })
    return prepared


def audit_existing(cur, districts, catalog, district_values, sidra, feature_by_id):
    """Compare all incoming natural keys without writing to the database."""
    counts = Counter()
    conflicts = []

    def compare(kind, key, existing, incoming):
        if existing is None:
            counts[(kind, "new")] += 1
        elif existing == incoming:
            counts[(kind, "identical")] += 1
        else:
            counts[(kind, "conflict")] += 1
            conflicts.append({
                "record_type": kind,
                "key": key,
                "existing": existing,
                "incoming": incoming,
            })

    municipality = (
        "São Paulo", MUNICIPALITY_ID, "IBGE - Localidades", "2022",
        "municipio", "ibge_localidades",
    )
    cur.execute("""
        SELECT nome,id_municipio,fonte,periodo,nivel,id_fonte
        FROM territorio WHERE id_territorial=%s
    """, (MUNICIPALITY_ID,))
    compare("municipality", MUNICIPALITY_ID, cur.fetchone(), municipality)

    for row in districts:
        district_id = row["id_territorial"].strip()
        expected = (
            row["nome"].strip(), row["id_municipio"].strip(), row["fonte"].strip(),
            row["periodo"].strip(), "distrito", "ibge_localidades",
        )
        cur.execute("""
            SELECT nome,id_municipio,fonte,periodo,nivel,id_fonte
            FROM territorio WHERE id_territorial=%s
        """, (district_id,))
        compare("territory", district_id, cur.fetchone(), expected)

    indicator_by_code = {
        (row["codigo"].strip()): (row["nome"].strip(), row["unidade"].strip())
        for row in catalog
    }
    for row in sidra:
        code = row["indicator"]
        expected = (row["name"], row["unit"])
        previous = indicator_by_code.setdefault(code, expected)
        if previous != expected:
            conflicts.append({
                "record_type": "incoming_indicator_definition",
                "key": code,
                "existing": previous,
                "incoming": expected,
            })
            counts[("incoming_indicator_definition", "conflict")] += 1
    for code, expected in indicator_by_code.items():
        cur.execute("SELECT nome,unidade FROM indicador WHERE codigo=%s", (code,))
        compare("indicator", code, cur.fetchone(), expected)

    for row in district_values:
        territory = row["id_territorial"].strip()
        indicator = row["indicador"].strip()
        period = row["periodo"].strip()
        source = row["fonte"].strip()
        expected = (
            Decimal(row["valor"].strip()), row["unidade"].strip(),
            row["is_mock"].strip().lower() == "true", source_for_district(source), {},
        )
        key = (territory, indicator, period, source)
        cur.execute("""
            SELECT valor,unidade,is_mock,id_fonte,dimensoes FROM valor_indicador
            WHERE id_territorial=%s AND indicador=%s AND periodo=%s AND fonte=%s
        """, key)
        compare("district_value", key, cur.fetchone(), expected)

    for row in sidra:
        key = (row["territory"], row["indicator"], row["period"], row["source"])
        expected = (
            row["value"], row["unit"], False, row["source_code"], row["dimensions"],
        )
        cur.execute("""
            SELECT valor,unidade,is_mock,id_fonte,dimensoes FROM valor_indicador
            WHERE id_territorial=%s AND indicador=%s AND periodo=%s AND fonte=%s
        """, key)
        compare("municipal_value", key, cur.fetchone(), expected)

    for district_id, feature in feature_by_id.items():
        geometry = json.dumps(feature["geometry"], ensure_ascii=False)
        cur.execute("""
            SELECT geom IS NOT NULL,
                   CASE WHEN geom IS NULL THEN NULL ELSE ST_Equals(
                       geom, ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)
                   ) END,
                   id_fonte_geom,procedencia_geom
            FROM territorio WHERE id_territorial=%s AND nivel='distrito'
        """, (geometry, district_id))
        existing = cur.fetchone()
        incoming_provenance = (
            "malha_nao_verificada", GEOMETRY_PROVENANCE,
        )
        if existing is None or not existing[0]:
            compare("geometry", district_id, None, incoming_provenance)
        elif existing[1] is True and existing[2:] == incoming_provenance:
            compare("geometry", district_id, incoming_provenance, incoming_provenance)
        else:
            compare(
                "geometry", district_id,
                {"spatially_equal": existing[1], "source_id": existing[2], "provenance": existing[3]},
                {"spatially_equal": True, "source_id": incoming_provenance[0], "provenance": incoming_provenance[1]},
            )

    return counts, conflicts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="Database URL (defaults to DATABASE_URL).",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Compare incoming records with the database without writing anything.",
    )
    args = parser.parse_args()

    districts = read_csv("distritos.csv")
    catalog = read_csv("indicador_catalogo.csv")
    district_values = read_csv("valor_indicador_json.csv")
    sidra = sidra_rows()
    geojson = json.loads((SEED / "distritos.geojson").read_text(encoding="utf-8-sig"))
    features = geojson.get("features", [])

    expected_district_ids = {row["id_territorial"].strip() for row in districts}
    feature_by_id = {str(feature.get("properties", {}).get("codarea", "")).strip(): feature for feature in features}
    if len(feature_by_id) != len(features) or set(feature_by_id) != expected_district_ids:
        raise ValueError("GeoJSON codes do not exactly match districts.csv")
    if any(feature.get("geometry", {}).get("type") not in {"Polygon", "MultiPolygon"} for feature in features):
        raise ValueError("Unsupported geometry type in district GeoJSON")

    destination = args.db.split("@")[-1]
    print(f"Connecting to {destination} ...", flush=True)
    try:
        conn = psycopg.connect(args.db, connect_timeout=10)
    except psycopg.OperationalError as exc:
        sys.exit(f"Could not connect to database ({destination}): {exc}")

    with conn:
        with conn.cursor() as cur:
            if args.check_only:
                cur.execute("SET TRANSACTION READ ONLY")
            cur.execute("""
                SELECT to_regclass('territorio'), to_regclass('indicador'),
                       to_regclass('valor_indicador'), to_regclass('fonte_dado')
            """)
            if any(value is None for value in cur.fetchone()):
                raise RuntimeError("Schema is missing/incomplete; run seed/init_db.py before loading")

            audit_counts, conflicts = audit_existing(
                cur, districts, catalog, district_values, sidra, feature_by_id
            )
            print("Existing records: idempotent matches and pending additive inserts")
            for (kind, state), count in sorted(audit_counts.items()):
                print(f"  {kind}: {state}={count}")
            if conflicts:
                print(f"Conflicts found: {len(conflicts)}; no data will be written.")
                for conflict in conflicts:
                    print(json.dumps(conflict, ensure_ascii=False, default=str, sort_keys=True))
                raise RuntimeError("Resolve the listed content conflicts before running the additive load")
            if args.check_only:
                print("Check-only finished; database was opened read-only and no load was run.")
                return

            cur.execute("SELECT id_territorial,nome,id_municipio,nivel FROM territorio WHERE id_territorial = %s", (MUNICIPALITY_ID,))
            municipality = cur.fetchone()
            if municipality is None or municipality[2:] != (MUNICIPALITY_ID, "municipio"):
                raise RuntimeError("Existing municipality identity is missing or conflicts with Sao Paulo/3550308")

            for district in districts:
                district_id = district["id_territorial"].strip()
                cur.execute("SELECT nome,id_municipio,nivel FROM territorio WHERE id_territorial=%s", (district_id,))
                existing = cur.fetchone()
                expected = (district["nome"].strip(), district["id_municipio"].strip(), "distrito")
                if existing is not None and existing != expected:
                    raise RuntimeError(f"Existing territory identity conflicts for {district_id}; load cancelled")
                cur.execute("""
                    INSERT INTO territorio (id_territorial,nome,id_municipio,fonte,periodo,nivel,id_fonte)
                    VALUES (%s,%s,%s,%s,%s,'distrito','ibge_localidades')
                    ON CONFLICT (id_territorial) DO NOTHING
                """, (district_id, expected[0], expected[1], district["fonte"].strip(), district["periodo"].strip()))

            all_indicators = [
                (row["codigo"].strip(), row["nome"].strip(), row["unidade"].strip())
                for row in catalog
            ] + [(row["indicator"], row["name"], row["unit"]) for row in sidra]
            indicator_by_code = {}
            for code, name, unit in all_indicators:
                previous = indicator_by_code.setdefault(code, (name, unit))
                if previous != (name, unit):
                    raise RuntimeError(f"Ambiguous indicator catalog entry for {code}")
            for code, (name, unit) in indicator_by_code.items():
                cur.execute("SELECT nome,unidade FROM indicador WHERE codigo=%s", (code,))
                existing = cur.fetchone()
                if existing is not None and existing != (name, unit):
                    raise RuntimeError(f"Existing indicator conflicts for {code}; load cancelled")
                cur.execute("""
                    INSERT INTO indicador (codigo,nome,unidade) VALUES (%s,%s,%s)
                    ON CONFLICT (codigo) DO NOTHING
                """, (code, name, unit))

            loaded = {"district_values": 0, "municipal_values": 0, "geometries": 0}
            preserved = {"district_values": 0, "municipal_values": 0, "geometries": 0}
            for row in district_values:
                source_code = source_for_district(row["fonte"].strip())
                cur.execute("""
                    INSERT INTO valor_indicador
                      (id_territorial,indicador,valor,unidade,fonte,periodo,is_mock,id_fonte)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (id_territorial,indicador,periodo,fonte) DO NOTHING
                """, (
                    row["id_territorial"].strip(), row["indicador"].strip(), row["valor"].strip(),
                    row["unidade"].strip(), row["fonte"].strip(), row["periodo"].strip(),
                    row["is_mock"].strip().lower() == "true", source_code,
                ))
                loaded["district_values"] += cur.rowcount
                preserved["district_values"] += 1 - cur.rowcount

            for row in sidra:
                cur.execute("""
                    INSERT INTO valor_indicador
                      (id_territorial,indicador,valor,unidade,fonte,periodo,is_mock,id_fonte,dimensoes)
                    VALUES (%s,%s,%s,%s,%s,%s,FALSE,%s,%s)
                    ON CONFLICT (id_territorial,indicador,periodo,fonte) DO NOTHING
                """, (
                    row["territory"], row["indicator"], row["value"], row["unit"],
                    row["source"], row["period"], row["source_code"], Jsonb(row["dimensions"]),
                ))
                loaded["municipal_values"] += cur.rowcount
                preserved["municipal_values"] += 1 - cur.rowcount

            for district_id, feature in feature_by_id.items():
                geometry = json.dumps(feature["geometry"], ensure_ascii=False)
                cur.execute("""
                    UPDATE territorio
                    SET geom=ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s),4326)),
                        id_fonte_geom='malha_nao_verificada', procedencia_geom=%s
                    WHERE id_territorial=%s AND nivel='distrito' AND geom IS NULL
                """, (geometry, GEOMETRY_PROVENANCE, district_id))
                loaded["geometries"] += cur.rowcount
                preserved["geometries"] += 1 - cur.rowcount

            cur.execute("""
                SELECT count(*) FILTER (WHERE geom IS NOT NULL AND NOT ST_IsValid(geom))
                FROM territorio WHERE nivel='distrito' AND id_municipio=%s
            """, (MUNICIPALITY_ID,))
            invalid_geometries = cur.fetchone()[0]
            if invalid_geometries:
                raise RuntimeError(
                    f"{invalid_geometries} invalid district geometries found; transaction cancelled without repairing them"
                )
            cur.execute("""
                SELECT count(*) FILTER (WHERE nivel='distrito'),
                       count(*) FILTER (WHERE nivel='distrito' AND geom IS NOT NULL)
                FROM territorio WHERE id_municipio=%s
            """, (MUNICIPALITY_ID,))
            district_count, geometry_count = cur.fetchone()
            cur.execute("SELECT count(*) FROM valor_indicador")
            value_count = cur.fetchone()[0]

    print(f"Districts: {district_count}; with geometry: {geometry_count}; invalid geometries: {invalid_geometries}")
    print(f"Inserted: {loaded}; existing data preserved: {preserved}")
    print(f"Total indicator values in database: {value_count}")
    if invalid_geometries:
        print("[warning] invalid geometries were preserved without automatic repair")


if __name__ == "__main__":
    main()
