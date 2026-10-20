#!/usr/bin/env python3
"""Read-only structural and provenance checks for prepared GeoSaneamento data."""
import csv
import argparse
import json
import os
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path

import psycopg

SEED = Path(__file__).resolve().parent
MUNICIPALITY_ID = "3550308"
SIDRA_REQUIRED_HEADERS = {
    "tabela", "descricao_tabela", "Nível Territorial (Código)",
    "Nível Territorial", "Unidade de Medida (Código)", "Unidade de Medida",
    "Valor", "Município (Código)", "Município", "Variável (Código)",
    "Variável", "Ano (Código)", "Ano", "fonte",
}


def read_csv(name):
    with (SEED / name).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_sidra():
    with (SEED / "sidra_municipio_sp.csv").open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames or []
        rows = list(reader)
    require(len(headers) == len(set(headers)), "SIDRA CSV has duplicate headers; column mapping is ambiguous")
    missing = SIDRA_REQUIRED_HEADERS - set(headers)
    require(not missing, f"SIDRA CSV is missing expected headers: {sorted(missing)}")
    code_headers = [
        name for name in headers
        if name.endswith(" (Código)") and name not in SIDRA_REQUIRED_HEADERS
    ]
    pairs = []
    for code_header in code_headers:
        label_header = code_header.removesuffix(" (Código)")
        require(label_header in headers,
                f"SIDRA classification column {code_header!r} has no matching label column {label_header!r}")
        pairs.append((code_header, label_header))
    require(bool(pairs), "SIDRA CSV has no identifiable classification code/label columns")
    for line_number, row in enumerate(rows, start=2):
        require(None not in row and all(value is not None for value in row.values()),
                f"SIDRA CSV row {line_number} has missing or extra fields")
    return headers, rows, pairs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.getenv("DATABASE_URL"),
        help="Read-only PostgreSQL/PostGIS URL (defaults to DATABASE_URL).",
    )
    args = parser.parse_args()

    districts = read_csv("distritos.csv")
    catalog = read_csv("indicador_catalogo.csv")
    district_values = read_csv("valor_indicador_json.csv")
    sidra_headers, sidra, classification_pairs = read_sidra()
    geojson = json.loads((SEED / "distritos.geojson").read_text(encoding="utf-8-sig"))
    features = geojson.get("features", [])

    district_ids = [row["id_territorial"].strip() for row in districts]
    require(len(district_ids) == len(set(district_ids)), "Duplicate district territory IDs")
    require(all(len(code) == 9 and code.startswith(MUNICIPALITY_ID) for code in district_ids),
            "District code outside expected Sao Paulo/3550308 pattern")
    require(all(row["id_municipio"].strip() == MUNICIPALITY_ID for row in districts),
            "District references a different municipality")
    require(all(row["periodo"].strip() == "2022" for row in districts), "Unexpected territory period")
    require(all(row["fonte"].strip() == "IBGE - Localidades" for row in districts),
            "Unknown territory source attribution")

    catalog_by_code = {row["codigo"].strip(): row for row in catalog}
    require(len(catalog_by_code) == len(catalog), "Duplicate indicator codes in catalog")
    district_keys = [
        (row["id_territorial"].strip(), row["indicador"].strip(), row["periodo"].strip(), row["fonte"].strip())
        for row in district_values
    ]
    require(len(district_keys) == len(set(district_keys)), "Duplicate district natural keys")
    district_id_set = set(district_ids)
    require(all(row["id_territorial"].strip() in district_id_set for row in district_values),
            "District value references a missing district")
    require(all(row["indicador"].strip() in catalog_by_code for row in district_values),
            "District value references an indicator missing from the catalog")
    require(all(row["periodo"].strip() == "2022" for row in district_values), "Unexpected district value period")
    require(all(row["is_mock"].strip().lower() == "true" for row in district_values),
            "A district value is missing the test-data marker")
    require(all(row["fonte"].strip().startswith("JSON do projeto") or
                row["fonte"].strip().upper().startswith("MOCK") for row in district_values),
            "Unknown district value provenance")
    for row in district_values:
        require(row["unidade"].strip() == catalog_by_code[row["indicador"].strip()]["unidade"].strip(),
                f"District value unit differs from catalog for {row['indicador']}")
        try:
            value = Decimal(row["valor"].strip())
        except InvalidOperation as exc:
            raise ValueError(f"Non-numeric district value: {row['valor']!r}") from exc
        if row["unidade"].strip() == "%":
            require(Decimal("0") <= value <= Decimal("100"),
                    f"Percentage outside 0..100 for district indicator {row['indicador']}")
    require(district_id_set == {row["id_territorial"].strip() for row in district_values},
            "District values do not cover exactly the listed territories")
    require(set(catalog_by_code) == {row["indicador"].strip() for row in district_values},
            "District values do not cover exactly the listed indicators")
    require(len(district_values) == len(district_ids) * len(catalog_by_code),
            "District value count is not one per district/indicator")

    feature_ids = [str(feature.get("properties", {}).get("codarea", "")).strip() for feature in features]
    require(len(feature_ids) == len(set(feature_ids)), "Duplicate codes in district GeoJSON")
    require(set(feature_ids) == district_id_set, "GeoJSON IDs do not match districts.csv")
    require(all(feature.get("geometry", {}).get("type") in {"Polygon", "MultiPolygon"} for feature in features),
            "Unexpected geometry type in GeoJSON")

    require(all(row["Município (Código)"].strip() == MUNICIPALITY_ID for row in sidra),
            "SIDRA CSV contains a different municipality code")
    require(all(row["Nível Territorial (Código)"].strip() == "6" for row in sidra),
            "SIDRA row is not at municipality level")
    require(all(row["Ano"].strip() == "2022" for row in sidra), "SIDRA CSV contains an unexpected period")
    require(all(row["fonte"].strip() == f"IBGE - Censo 2022 - SIDRA tabela {row['tabela'].strip()}" for row in sidra),
            "SIDRA source attribution does not match table")
    allowed_sidra_tables = {"6803", "6805", "6892"}
    require({row["tabela"].strip() for row in sidra} <= allowed_sidra_tables,
            "SIDRA CSV contains a table without a configured source")
    require(all(row["Valor"].strip() for row in sidra), "SIDRA CSV contains missing values")
    for row in sidra:
        try:
            Decimal(row["Valor"].strip().replace(",", "."))
        except InvalidOperation as exc:
            raise ValueError(f"Non-numeric SIDRA value: {row['Valor']!r}") from exc

    series_keys = []
    for row in sidra:
        categories = [row[code].strip() for code, _ in classification_pairs if row[code].strip()]
        require(categories, "SIDRA observation has no classification category")
        series_keys.append("SIDRA_" + "_".join([
            row["tabela"].strip(), row["Variável (Código)"].strip(),
            row["Unidade de Medida (Código)"].strip(), *categories,
        ]))
    require(len(series_keys) == len(set(series_keys)),
            "SIDRA series collide with the current indicator/territory/period/source key")

    if not args.db:
        raise ValueError("A DATABASE_URL or --db value is required for the PostGIS geometry validity check")
    invalid_geometries = []
    try:
        with psycopg.connect(args.db, connect_timeout=10) as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            with conn.cursor() as cur:
                for feature in features:
                    code = str(feature["properties"]["codarea"]).strip()
                    geometry = json.dumps(feature["geometry"], ensure_ascii=False)
                    cur.execute("""
                        SELECT ST_IsValid(g), ST_IsValidReason(g), ST_SRID(g), ST_GeometryType(g)
                        FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON(%s),4326) AS g) AS parsed
                    """, (geometry,))
                    valid, reason, srid, geometry_type = cur.fetchone()
                    if not valid or srid != 4326:
                        invalid_geometries.append({
                            "id_territorial": code,
                            "valid": valid,
                            "reason": reason,
                            "srid": srid,
                            "type": geometry_type,
                        })
    except psycopg.Error as exc:
        raise RuntimeError(f"Read-only PostGIS geometry validation failed: {exc}") from exc
    if invalid_geometries:
        for invalid in invalid_geometries:
            print("Invalid geometry:", json.dumps(invalid, ensure_ascii=False))
        raise ValueError(f"PostGIS found {len(invalid_geometries)} invalid or unexpected-SRID geometries")

    print("Local audit completed (read-only).")
    print(f"Territories: {len(districts)} unique districts; matching boundary codes: {len(feature_ids)}")
    print(f"District catalog: {len(catalog)} indicators; values: {len(district_values)} unique natural keys")
    print("District value source labels:", dict(Counter(row["fonte"] for row in district_values)))
    print("All district indicators carry is_mock=true; periods:", dict(Counter(row["periodo"] for row in district_values)))
    print(f"Municipal SIDRA: {len(sidra)} numeric rows; periods:", dict(Counter(row["Ano"].strip() for row in sidra)))
    print("SIDRA tables:", dict(Counter(row["tabela"].strip() for row in sidra)))
    print("SIDRA units:", dict(Counter(row["Unidade de Medida"].strip() for row in sidra)))
    print(f"SIDRA series distinguishable with current schema: {len(series_keys)}")
    print(f"PostGIS geometry check: {len(features)} geometries valid; SRID 4326.")
    print("District boundary source is undocumented and must remain unverified.")


if __name__ == "__main__":
    main()
