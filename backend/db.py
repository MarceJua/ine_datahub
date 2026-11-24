"""Módulo de conexión de solo lectura a PostgreSQL para INE-DataHub.

Todas las consultas de la API se ejecutan exclusivamente mediante el rol
restringido `ine_readonly` (con permisos estrictos de SELECT) y en modo de
transacción de solo lectura como capa adicional de defensa en profundidad.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

# Cargar variables de entorno desde la raíz del proyecto
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

READONLY_DB_USER = "ine_readonly"


def get_readonly_dsn() -> str:
    """Construye la cadena de conexión PostgreSQL usando exclusivamente el rol ine_readonly."""
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_PORT", "5433")
    dbname = os.getenv("POSTGRES_DB", "ine_datahub")
    password = os.getenv("READONLY_PASSWORD", "")

    return (
        f"host={host} "
        f"port={port} "
        f"dbname={dbname} "
        f"user={READONLY_DB_USER} "
        f"password={password} "
        f"options='-c default_transaction_read_only=on -c statement_timeout=10000'"
    )


@contextmanager
def get_readonly_connection() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    """Provee una conexión PostgreSQL de solo lectura con filas tipo diccionario."""
    dsn = get_readonly_dsn()
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        yield conn


def serialize_value(value: Any) -> Any:
    """Convierte tipos nativos de PostgreSQL (Decimal, datetime, date) a formatos JSON seguros."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def serialize_row(row: dict[str, Any]) -> dict[str, Any]:
    """Serializa todos los valores de una fila obtenida de PostgreSQL."""
    return {key: serialize_value(val) for key, val in row.items()}


def execute_readonly_query(
    sql: str,
    params: tuple[Any, ...] | dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Ejecuta una consulta SELECT segura usando el rol ine_readonly."""
    with get_readonly_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return [serialize_row(dict(row)) for row in rows]


def check_database_connection() -> bool:
    """Verifica conectividad activa a PostgreSQL bajo el rol ine_readonly."""
    rows = execute_readonly_query("SELECT 1 AS ok;")
    return bool(rows and rows[0].get("ok") == 1)
