from pathlib import Path
import geopandas as gpd

# ==========================================
# CAMINHOS
# ==========================================

# Pasta onde está o converter.py
BASE = Path(__file__).resolve().parent

# Shapefile do IBGE
arquivo_ibge = BASE / "ibge" / "SP_UF_2024.shp"

# Arquivo GeoJSON que será criado
saida = BASE.parent.parent / "public" / "maps" / "sao_paulo.geojson"


# ==========================================
# TESTE
# ==========================================

print("===================================")
print(" TESTE DA MALHA DO IBGE")
print("===================================")

print("\nArquivo do IBGE:")
print(arquivo_ibge)

print("\nArquivo existe?")
print(arquivo_ibge.exists())


# ==========================================
# LEITURA
# ==========================================

if not arquivo_ibge.exists():

    print("\n❌ ERRO: arquivo do IBGE não encontrado.")

    exit()


print("\nLendo arquivo...")

mapa = gpd.read_file(arquivo_ibge)

print("\n✅ Arquivo carregado com sucesso!")


# ==========================================
# INFORMAÇÕES
# ==========================================

print("\nQuantidade de registros:")
print(len(mapa))

print("\nColunas:")
print(mapa.columns)

print("\nSistema de coordenadas original:")
print(mapa.crs)


# ==========================================
# CONVERTER PARA EPSG:4326
# ==========================================

mapa = mapa.to_crs(epsg=4326)

print("\nSistema de coordenadas convertido:")
print(mapa.crs)


# ==========================================
# CRIAR PASTA DE DESTINO
# ==========================================

saida.parent.mkdir(
    parents=True,
    exist_ok=True
)


# ==========================================
# SALVAR GEOJSON
# ==========================================

print("\nSalvando GeoJSON em:")
print(saida)

mapa.to_file(
    saida,
    driver="GeoJSON"
)


# ==========================================
# RESULTADO
# ==========================================

print("\n===================================")
print(" ✅ GEOJSON CRIADO COM SUCESSO!")
print("===================================")

print("\nArquivo:")
print(saida)

print("\nArquivo existe?")
print(saida.exists())