import os
import re
import unicodedata
from pathlib import Path
import pandas as pd
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path("data/raw")

# Configuración declarativa de cuadros a ingestar (2021-2025)
FUENTES_CONFIG = [
    {
        "dominio": "vitales",
        "archivo": "2026110585637np6TqmXHddhgzyO1lhMwzFOyjELGCFt4.xlsx",
        "hoja": "Cuadro 1",
        "indicador": "defunciones_total",
        "unidad": "casos",
    },
    {
        "dominio": "vitales",
        "archivo": "2026110585723znMs1GX2uHXp0Xll0m6XJg2Yogi0N7X4.xlsx",
        "hoja": "Cuadro 1",
        "indicador": "defunciones_fetales_total",
        "unidad": "casos",
    },
    {
        "dominio": "transito",
        "archivo": "202606181018101IEXgdbH5VrBaFELy0vSCIH5OEAVcc53.xlsx",
        "hoja": "C1",
        "indicador": "accidentes_transito_total",
        "unidad": "casos",
    },
    {
        "dominio": "transito",
        "archivo": "202606181018101IEXgdbH5VrBaFELy0vSCIH5OEAVcc53.xlsx",
        "hoja": "C8",
        "indicador": "victimas_transito_total",
        "unidad": "casos",
    },
    {
        "dominio": "transito",
        "archivo": "202606181018101IEXgdbH5VrBaFELy0vSCIH5OEAVcc53.xlsx",
        "hoja": "C9",
        "indicador": "lesionados_transito_total",
        "unidad": "casos",
    },
    {
        "dominio": "transito",
        "archivo": "202606181018101IEXgdbH5VrBaFELy0vSCIH5OEAVcc53.xlsx",
        "hoja": "C11",
        "indicador": "fallecidos_transito_total",
        "unidad": "casos",
    },
    {
        "dominio": "transito",
        "archivo": "202606181018101IEXgdbH5VrBaFELy0vSCIH5OEAVcc53.xlsx",
        "hoja": "C15",
        "indicador": "tasa_fallecidos_transito_100k",
        "unidad": "tasa_100k",
    },
]


def normalizar_texto(texto: str) -> str:
    """Quita tildes, espacios extra y convierte a minúsculas para hacer match seguro."""
    s = str(texto).strip().lower()
    s = "".join(
        c for c in unicodedata.normalize("NFD", s)
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", s)


def detectar_anio(valor) -> int | None:
    """Extrae un año válido (2015-2030) desde encabezados tipo 2021, 2022.0 o '2025*'."""
    if pd.isna(valor):
        return None
    m = re.search(r"\b(20[1-3]\d)\b", str(valor).strip())
    return int(m.group(1)) if m else None


def parsear_cuadro_anual_depto(filepath: Path, hoja: str, mapa_deptos: dict[str, str]):
    """Lee cualquier cuadro anual por departamento del INE y devuelve filas (depto_cod, anio, valor)."""
    df = pd.read_excel(filepath, sheet_name=hoja, header=None)

    # 1. Detectar dinámicamente la fila de encabezados (la que tenga >= 3 años)
    header_idx = None
    cols_anios = {}
    for idx, row in df.iterrows():
        anios_en_fila = {}
        for col_i, val in enumerate(row):
            anio = detectar_anio(val)
            if anio:
                anios_en_fila[col_i] = anio
        if len(anios_en_fila) >= 3:
            header_idx = idx
            cols_anios = anios_en_fila
            break

    if header_idx is None:
        raise ValueError(f"No se encontró fila de años en {filepath.name} [{hoja}]")

    # 2. Detectar qué columna contiene los nombres de departamentos (buscando 'guatemala')
    col_depto = None
    for col_i in range(df.shape[1]):
        muestra = df.iloc[header_idx + 1 : header_idx + 10, col_i].dropna().astype(str)
        if any(normalizar_texto(v) == "guatemala" for v in muestra):
            col_depto = col_i
            break

    if col_depto is None:
        raise ValueError(f"No se encontró columna de departamentos en {filepath.name} [{hoja}]")

    # 3. Extraer datos limpios (ignorando totales, república y notas al pie)
    registros = []
    for idx in range(header_idx + 1, len(df)):
        raw_depto = df.iloc[idx, col_depto]
        if pd.isna(raw_depto):
            continue

        depto_norm = normalizar_texto(raw_depto)
        if depto_norm not in mapa_deptos:
            continue  # Filtra 'Todos los departamentos', 'República', notas, etc.

        depto_cod = mapa_deptos[depto_norm]
        for col_i, anio in cols_anios.items():
            val = pd.to_numeric(df.iloc[idx, col_i], errors="coerce")
            if pd.notna(val):
                registros.append((depto_cod, anio, round(float(val), 2)))

    return registros


def main():
    conn_str = (
        f"host=localhost port={os.getenv('POSTGRES_PORT', '5433')} "
        f"dbname={os.getenv('POSTGRES_DB')} "
        f"user={os.getenv('POSTGRES_USER')} "
        f"password={os.getenv('POSTGRES_PASSWORD')}"
    )

    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            # Cargar mapa oficial desde dim_departamentos
            cur.execute("SELECT depto_cod, nombre FROM dim_departamentos;")
            mapa_deptos = {normalizar_texto(nombre): cod for cod, nombre in cur.fetchall()}

            total_filas = 0
            for cfg in FUENTES_CONFIG:
                filepath = DATA_DIR / cfg["archivo"]
                if not filepath.exists():
                    print(f"⚠️ Archivo no encontrado, saltando: {cfg['archivo']}")
                    continue

                registros = parsear_cuadro_anual_depto(filepath, cfg["hoja"], mapa_deptos)

                # Idempotencia: limpiar carga previa del mismo cuadro si existiera
                cur.execute(
                    """
                    DELETE FROM meta_fuentes
                    WHERE dominio = %s AND archivo_origen = %s AND cuadro = %s;
                    """,
                    (cfg["dominio"], cfg["archivo"], cfg["hoja"]),
                )

                # Registrar fuente en meta_fuentes
                cur.execute(
                    """
                    INSERT INTO meta_fuentes (dominio, archivo_origen, cuadro)
                    VALUES (%s, %s, %s)
                    RETURNING id;
                    """,
                    (cfg["dominio"], cfg["archivo"], cfg["hoja"]),
                )
                fuente_id = cur.fetchone()[0]

                # Insertar hechos
                cur.executemany(
                    """
                    INSERT INTO fact_indicadores_depto (fuente_id, depto_cod, anio, indicador, valor, unidad)
                    VALUES (%s, %s, %s, %s, %s, %s);
                    """,
                    [
                        (fuente_id, depto_cod, anio, cfg["indicador"], valor, cfg["unidad"])
                        for depto_cod, anio, valor in registros
                    ],
                )
                total_filas += len(registros)
                print(f"✅ {cfg['dominio'].upper()} | {cfg['indicador']} ({cfg['hoja']}): {len(registros)} registros cargados.")

        conn.commit()
    print(f"\n🎯 Carga completada. Total de registros en fact_indicadores_depto: {total_filas}")


if __name__ == "__main__":
    main()
