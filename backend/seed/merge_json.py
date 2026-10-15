#!/usr/bin/env python3
"""
Corrige o JSON de distritos do projeto usando a lista oficial do IBGE (distritos.csv).

Uso (sem argumentos: acha o JSON ao lado do script ou na pasta acima):
  python merge_json.py

Correções aplicadas automaticamente:
  - IDs: SP-3550308-xx (ordem alfabética) -> código IBGE de 9 dígitos (ex.: 355030801)
  - Nomes: grafias corrigidas pelo ALIAS (ex.: "Itaaim Bibi" -> "Itaim Bibi")
  - Entradas que não são distritos oficiais ou são duplicadas: removidas
  - Distritos oficiais ausentes: adicionados com valores FICTÍCIOS determinísticos
  - Metadados: não afirmam mais "IBGE"; cada região diz a origem real do valor

Gera em seed/:
  distritos_corrigido.json  JSON corrigido (96 distritos, mesma estrutura do original)
  indicador_catalogo.csv    catálogo dos indicadores (codigo, nome, unidade)
  valor_indicador_json.csv  valores no formato da tabela valor_indicador
  merge_report.txt          o que foi corrigido
"""
import argparse, hashlib, json, unicodedata
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
OUT = BASE if BASE.name == "seed" else BASE / "seed"

ALIAS = {  # nome no JSON -> nome oficial (IBGE Localidades)
    "Itaaim Bibi": "Itaim Bibi",
    "São Miguel Paulista": "São Miguel",
    "Parque São Rafael": "São Rafael",  # alias provável; confira
}
NOMES_ACENTO = {  # a API de Localidades do IBGE devolve estes sem acento
    "Cangaiba": "Cangaíba",
    "Cidade Lider": "Cidade Líder",
}
FONTE_JSON = "JSON do projeto (origem não verificada)"
FONTE_MOCK = "MOCK (dado fictício)"
AVISO = ("Indicadores de TESTE (is_mock=true). Ids e nomes dos distritos: IBGE - Localidades. "
         "Valores: JSON do projeto (origem não verificada) ou fictícios onde ausentes.")


def achar_json():
    for d in (BASE, BASE.parent):
        f = d / "json__distritos.json"
        if f.exists():
            return str(f)
    return str(BASE / "json__distritos.json")


def norm(s):
    s = unicodedata.normalize("NFD", str(s).lower().strip())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def det(id_, cod, lo, hi):
    h = int(hashlib.sha256(f"{id_}:{cod}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return round(lo + (hi - lo) * h, 1)


def run(json_path, csv_path, out):
    out = Path(out); out.mkdir(exist_ok=True)
    dist = pd.read_csv(csv_path, dtype=str)
    nomes_antes = dist["nome"].copy()
    dist["nome"] = dist["nome"].replace(NOMES_ACENTO)
    acentos = [f"{a} -> {b}" for a, b in zip(nomes_antes, dist["nome"]) if a != b]
    if acentos:
        dist.to_csv(csv_path, index=False)  # mantém distritos.csv consistente com o JSON
    por_nome = {norm(n): (i, n) for i, n in zip(dist["id_territorial"], dist["nome"])}
    orig = json.load(open(json_path, encoding="utf-8"))
    regs = orig["regioes"]
    periodo = orig.get("periodo_referencia", "2022")
    codigos = sorted({k for r in regs for k in r["indicadores"]})

    corrigidas, usados, aliases, descartados = {}, set(), [], []
    for r in regs:
        nome = ALIAS.get(r["nome"], r["nome"])
        achou = por_nome.get(norm(nome))
        if achou is None or achou[0] in usados:
            descartados.append(r["nome"]); continue
        id_, nome_oficial = achou
        usados.add(id_)
        if r["nome"] != nome_oficial:
            aliases.append(f'{r["nome"]} -> {nome_oficial}')
        corrigidas[id_] = {
            "id_regiao": id_, "nome": nome_oficial, "tipo_unidade": "Distrito",
            "indicadores": {k: r["indicadores"][k] for k in codigos},
            "metadata": {"fonte": FONTE_JSON, "periodo": periodo, "is_mock": True, "origem_valor": "json_original"},
        }

    faixa = {k: (min(r["indicadores"][k] for r in regs), max(r["indicadores"][k] for r in regs)) for k in codigos}
    completados = []
    for id_, nome in zip(dist["id_territorial"], dist["nome"]):
        if id_ in corrigidas: continue
        completados.append(nome)
        corrigidas[id_] = {
            "id_regiao": id_, "nome": nome, "tipo_unidade": "Distrito",
            "indicadores": {k: det(id_, k, *faixa[k]) for k in codigos},
            "metadata": {"fonte": FONTE_MOCK, "periodo": periodo, "is_mock": True, "origem_valor": "ficticio"},
        }

    final = [corrigidas[i] for i in sorted(corrigidas)]
    novo = {
        "municipio": orig.get("municipio", "São Paulo"), "uf": orig.get("uf", "SP"),
        "codigo_municipio": "3550308", "unidade_territorial": "Distrito",
        "periodo_referencia": periodo, "fonte_base": "IBGE - Localidades (ids e nomes); valores de teste",
        "aviso": AVISO, "total_regioes": len(final), "regioes": final,
    }
    (out / "distritos_corrigido.json").write_text(json.dumps(novo, ensure_ascii=False, indent=2), encoding="utf-8")

    cat = [{"codigo": k.removesuffix("_pct").upper(), "nome": k.removesuffix("_pct").replace("_", " ").capitalize(), "unidade": "%"} for k in codigos]
    pd.DataFrame(cat).to_csv(out / "indicador_catalogo.csv", index=False)
    rows = [{"id_territorial": r["id_regiao"], "indicador": k.removesuffix("_pct").upper(), "valor": v, "unidade": "%",
             "fonte": r["metadata"]["fonte"], "periodo": periodo, "is_mock": True}
            for r in final for k, v in r["indicadores"].items()]
    df = pd.DataFrame(rows).sort_values(["id_territorial", "indicador"])
    df.to_csv(out / "valor_indicador_json.csv", index=False)

    rel = [f"Distritos oficiais: {len(dist)} | do JSON: {len(final) - len(completados)} | completados (mock): {len(completados)}",
           f"Linhas em valor_indicador_json.csv: {len(df)}", "", "Acentuação corrigida (distritos.csv e JSON):"] + [f"  {a}" for a in acentos] + [
           "", "Nomes do JSON corrigidos:"] + [f"  {a}" for a in aliases] + [
           "", "Removidos do JSON (não são distritos oficiais ou duplicados):"] + [f"  {d}" for d in descartados] + [
           "", "Adicionados com valor fictício (ausentes no JSON):"] + [f"  {c}" for c in completados]
    (out / "merge_report.txt").write_text("\n".join(rel), encoding="utf-8")
    print("\n".join(rel))
    return novo


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", default=achar_json())
    ap.add_argument("--csv", default=str(OUT / "distritos.csv"))
    ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args()
    run(a.json, a.csv, a.out)


if __name__ == "__main__":
    main()
