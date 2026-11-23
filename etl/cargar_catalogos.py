import os
from pathlib import Path
import pandas as pd
import psycopg
from dotenv import load_dotenv

load_dotenv()

ARCHIVO_DICCIONARIO = Path("data/raw/20260618101911hk9xzLjtlLyIqA5fF0FY3udjjRUQlTkq.xlsx")

def extraer_catalogos(filepath: Path):
    df = pd.read_excel(filepath, sheet_name="Hechos de Tránsito")
    # Renombrar columnas clave basadas en la estructura del diccionario INE
    df.columns = ["_empty", "variable", "etiqueta", "codigo", "valor", "obs"][: len(df.columns)]
    # Propagar el nombre de la variable hacia abajo (forward fill)
    df["variable"] = df["variable"].ffill()

    # 1. Departamentos (1 al 22 -> normalizados a 2 dígitos '01'..'22')
    deptos_df = df[df["variable"] == "depto_ocu"][["codigo", "valor"]].dropna()
    deptos = []
    for _, row in deptos_df.iterrows():
        cod = str(int(float(row["codigo"]))).zfill(2)
        nombre = str(row["valor"]).strip()
        deptos.append((cod, nombre))

    # 2. Municipios (101 al 2217 -> normalizados a 4 dígitos '0101'..'2217')
    munis_df = df[df["variable"] == "mupio_ocu"][["codigo", "valor"]].dropna()
    munis = []
    for _, row in munis_df.iterrows():
        muni_cod = str(int(float(row["codigo"]))).zfill(4)
        depto_cod = muni_cod[:2]
        nombre = str(row["valor"]).strip()
        munis.append((muni_cod, depto_cod, nombre))

    return deptos, munis

def cargar_en_postgres(deptos, munis):
    conn_str = (
        f"host=localhost port={os.getenv('POSTGRES_PORT', '5433')} "
        f"dbname={os.getenv('POSTGRES_DB')} "
        f"user={os.getenv('POSTGRES_USER')} "
        f"password={os.getenv('POSTGRES_PASSWORD')}"
    )
    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO dim_departamentos (depto_cod, nombre)
                VALUES (%s, %s)
                ON CONFLICT (depto_cod) DO UPDATE SET nombre = EXCLUDED.nombre;
                """,
                deptos,
            )
            cur.executemany(
                """
                INSERT INTO dim_municipios (muni_cod, depto_cod, nombre)
                VALUES (%s, %s, %s)
                ON CONFLICT (muni_cod) DO UPDATE SET nombre = EXCLUDED.nombre;
                """,
                munis,
            )
        conn.commit()
    print(f"✅ Cargados {len(deptos)} departamentos y {len(munis)} municipios en PostgreSQL.")

if __name__ == "__main__":
    deptos, munis = extraer_catalogos(ARCHIVO_DICCIONARIO)
    cargar_en_postgres(deptos, munis)
