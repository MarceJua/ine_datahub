"""API REST de INE-DataHub con FastAPI y consultor Text-to-SQL de solo lectura."""

from __future__ import annotations

import os
from typing import Any

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from .db import check_database_connection, execute_readonly_query
from .llm_adapter import (
    LLMAdapter,
    LLMProviderError,
    SQLSecurityError,
    get_llm_adapter,
    validar_pregunta_segura,
    validar_sql_seguro,
)
from .schemas import (
    AskRequest,
    AskResponse,
    DepartamentoOut,
    FuenteOut,
    HealthResponse,
    IndicadorOut,
)

app = FastAPI(
    title="INE-DataHub API",
    description=(
        "Plataforma Analítica y Consultor IA de Datos Oficiales del "
        "Instituto Nacional de Estadística (INE) de Guatemala."
    ),
    version="0.1.0",
)

# Configuración de CORS para el frontend en Vite/React
cors_origins_env = os.getenv("CORS_ORIGINS", "http://localhost:5173")
allowed_origins = [origin.strip() for origin in cors_origins_env.split(",") if origin.strip()]
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _normalizar_depto_cod(depto_cod: str) -> str:
    """Normaliza códigos de departamento de Guatemala al estándar INE de 2 dígitos ('01'-'22')."""
    codigo = depto_cod.strip()
    if codigo.isdigit():
        return codigo.zfill(2)
    return codigo


def _formatear_fuente_oficial(dominio: str, archivo_origen: str, cuadro: str) -> str:
    """Construye una cita oficial legible a partir de los metadatos de meta_fuentes."""
    return f"INE Guatemala — {dominio} | {archivo_origen} ({cuadro})"


def _resolver_fuente_oficial_para_sql(sql_seguro: str) -> str:
    """Obtiene la cita oficial trazable desde meta_fuentes según el contenido del SQL ejecutado."""
    sql_lower = sql_seguro.lower()
    try:
        fuentes = execute_readonly_query(
            """
            SELECT DISTINCT m.dominio, m.archivo_origen, m.cuadro, f.indicador
            FROM meta_fuentes m
            LEFT JOIN fact_indicadores_depto f ON f.fuente_id = m.id
            ORDER BY m.dominio, m.cuadro;
            """
        )
    except psycopg.Error:
        return "INE Guatemala — Base de datos oficial INE-DataHub (2021-2025)"

    coincidencias: list[str] = []
    vistas: set[tuple[str, str, str]] = set()
    for fila in fuentes:
        indicador = str(fila.get("indicador") or "").lower()
        dominio = str(fila.get("dominio") or "")
        archivo = str(fila.get("archivo_origen") or "")
        cuadro = str(fila.get("cuadro") or "")
        clave = (dominio, archivo, cuadro)

        if indicador and indicador in sql_lower and clave not in vistas:
            vistas.add(clave)
            coincidencias.append(_formatear_fuente_oficial(dominio, archivo, cuadro))

    if coincidencias:
        return "; ".join(coincidencias)

    return "INE Guatemala — Estadísticas Vitales y Hechos de Tránsito (2021-2025)"


@app.get("/health", response_model=HealthResponse, tags=["Sistema"])
def health_check() -> HealthResponse:
    """Verifica conexión activa a PostgreSQL usando el rol de solo lectura."""
    try:
        if check_database_connection():
            return HealthResponse(status="ok", database="connected")
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error de conexión con PostgreSQL: {exc}",
        ) from exc

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="No se pudo verificar la conexión a PostgreSQL.",
    )


@app.get("/api/departamentos", response_model=list[DepartamentoOut], tags=["Catálogos"])
def listar_departamentos() -> list[DepartamentoOut]:
    """Lista los 22 departamentos oficiales de Guatemala ordenados por `depto_cod`."""
    try:
        rows = execute_readonly_query(
            """
            SELECT depto_cod, nombre
            FROM dim_departamentos
            ORDER BY depto_cod ASC;
            """
        )
        return [DepartamentoOut(**row) for row in rows]
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar departamentos: {exc}",
        ) from exc


@app.get("/api/fuentes", response_model=list[FuenteOut], tags=["Catálogos"])
def listar_fuentes() -> list[FuenteOut]:
    """Lista todas las fuentes oficiales del INE registradas en `meta_fuentes`."""
    try:
        rows = execute_readonly_query(
            """
            SELECT id, dominio, archivo_origen, cuadro, fecha_carga
            FROM meta_fuentes
            ORDER BY id ASC;
            """
        )
        return [FuenteOut(**row) for row in rows]
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar fuentes oficiales: {exc}",
        ) from exc


@app.get("/api/indicadores", response_model=list[IndicadorOut], tags=["Indicadores"])
def listar_indicadores(
    indicador: str | None = Query(
        default=None,
        description="Nombre del indicador (ej. tasa_fallecidos_transito_100k).",
    ),
    depto_cod: str | None = Query(
        default=None,
        description="Código oficial del departamento ('01'-'22').",
    ),
    anio: int | None = Query(
        default=None,
        ge=2000,
        le=2100,
        description="Año del indicador (ej. 2025).",
    ),
) -> list[IndicadorOut]:
    """Devuelve indicadores departamentales homologados unidos con departamento y fuente oficial."""
    condiciones: list[str] = []
    parametros: list[Any] = []

    if indicador is not None and indicador.strip():
        condiciones.append("f.indicador = %s")
        parametros.append(indicador.strip())

    if depto_cod is not None and depto_cod.strip():
        condiciones.append("f.depto_cod = %s")
        parametros.append(_normalizar_depto_cod(depto_cod))

    if anio is not None:
        condiciones.append("f.anio = %s")
        parametros.append(anio)

    where_clause = f"WHERE {' AND '.join(condiciones)}" if condiciones else ""

    sql = f"""
        SELECT
            f.id,
            f.depto_cod,
            d.nombre AS departamento,
            f.anio,
            f.indicador,
            f.valor,
            f.unidad,
            f.fuente_id,
            m.dominio,
            m.archivo_origen,
            m.cuadro
        FROM fact_indicadores_depto f
        INNER JOIN dim_departamentos d ON d.depto_cod = f.depto_cod
        INNER JOIN meta_fuentes m ON m.id = f.fuente_id
        {where_clause}
        ORDER BY f.anio ASC, f.depto_cod ASC, f.indicador ASC;
    """

    try:
        rows = execute_readonly_query(sql, tuple(parametros) if parametros else None)
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al consultar indicadores: {exc}",
        ) from exc

    resultado: list[IndicadorOut] = []
    for row in rows:
        row["fuente_oficial"] = _formatear_fuente_oficial(
            dominio=str(row["dominio"]),
            archivo_origen=str(row["archivo_origen"]),
            cuadro=str(row["cuadro"]),
        )
        resultado.append(IndicadorOut(**row))

    return resultado


@app.post("/api/ask", response_model=AskResponse, tags=["Consultor IA"])
def consultar_text_to_sql(
    payload: AskRequest,
    adapter: LLMAdapter = Depends(get_llm_adapter),
) -> AskResponse:
    """Convierte una pregunta en SQL seguro (solo SELECT), lo ejecuta con `ine_readonly` y cita la fuente."""
    try:
        pregunta_segura = validar_pregunta_segura(payload.pregunta)
    except SQLSecurityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        sql_crudo = adapter.generar_sql(pregunta_segura)
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        sql_seguro = validar_sql_seguro(sql_crudo)
    except SQLSecurityError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    try:
        resultados = execute_readonly_query(sql_seguro)
    except psycopg.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error al ejecutar la consulta SQL generada: {exc}",
        ) from exc

    fuente_oficial = _resolver_fuente_oficial_para_sql(sql_seguro)

    return AskResponse(
        pregunta=pregunta_segura,
        sql_generado=sql_seguro,
        resultados=resultados,
        fuente_oficial=fuente_oficial,
    )
