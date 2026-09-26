from pathlib import Path
import geopandas as gpd


# ==========================================
# CAMINHOS
# ==========================================

BASE = Path(__file__).resolve().parent

arquivo_ibge = (
    BASE
    / "ibge"
    / "municipal"
    / "SP_Municipios_2024.shp"
)

saida = (
    BASE.parent.parent
    / "public"
    / "maps"
    / "sao_paulo_municipios.geojson"
)


# ==========================================
# INÍCIO
# ==========================================

print("===================================")
print(" MALHA MUNICIPAL DE SÃO PAULO")
print("===================================")


# ==========================================
# VERIFICAR ARQUIVO
# ==========================================

print("\nArquivo do IBGE:")
print(arquivo_ibge)

print("\nArquivo existe?")
print(arquivo_ibge.exists())


if not arquivo_ibge.exists():

    print("\n❌ ERRO: arquivo do IBGE não encontrado.")

    exit()


# ==========================================
# LER SHAPEFILE
# ==========================================

print("\nLendo arquivo do IBGE...")

municipios = gpd.read_file(arquivo_ibge)


print("\n✅ Arquivo carregado com sucesso!")


# ==========================================
# INFORMAÇÕES
# ==========================================

print("\nQuantidade de municípios:")
print(len(municipios))


print("\nColunas:")
print(municipios.columns)


print("\nSistema de coordenadas original:")
print(municipios.crs)


# ==========================================
# CONVERTER PARA WGS84
# ==========================================

municipios = municipios.to_crs(epsg=4326)


print("\nSistema de coordenadas convertido:")
print(municipios.crs)


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


municipios.to_file(
    saida,
    driver="GeoJSON"
)


# ==========================================
# FINAL
# ==========================================

print("\n===================================")
print(" ✅ GEOJSON MUNICIPAL CRIADO!")
print("===================================")

print("\nArquivo:")
print(saida)

print("\nArquivo existe?")
print(saida.exists())