"""Esquemas Pydantic para solicitudes y respuestas de la API INE-DataHub."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class HealthResponse(BaseModel):
    """Respuesta del endpoint de salud del servicio y base de datos."""

    status: str = Field(..., examples=["ok"])
    database: str = Field(..., examples=["connected"])


class DepartamentoOut(BaseModel):
    """Representación oficial de un departamento de Guatemala (código 01-22)."""

    depto_cod: str = Field(..., description="Código INE normalizado a 2 dígitos ('01'-'22').")
    nombre: str = Field(..., description="Nombre oficial del departamento.")


class FuenteOut(BaseModel):
    """Metadatos de trazabilidad de una fuente oficial del INE cargada en BD."""

    id: int
    dominio: str
    archivo_origen: str
    cuadro: str
    fecha_carga: datetime


class IndicadorOut(BaseModel):
    """Registro homologado de un indicador anual por departamento con su fuente oficial."""

    id: int
    depto_cod: str = Field(..., description="Código INE del departamento ('01'-'22').")
    departamento: str = Field(..., description="Nombre oficial del departamento.")
    anio: int = Field(..., description="Año del registro estadístico.")
    indicador: str = Field(..., description="Identificador normalizado del indicador.")
    valor: float = Field(..., description="Valor numérico del indicador.")
    unidad: str = Field(..., description="Unidad de medida (ej. 'casos', 'tasa_100k').")
    fuente_id: int
    dominio: str
    archivo_origen: str
    cuadro: str
    fuente_oficial: str = Field(..., description="Cita oficial trazable del cuadro INE.")


class AskRequest(BaseModel):
    """Solicitud en lenguaje natural para el consultor Text-to-SQL."""

    pregunta: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Pregunta analítica en lenguaje natural sobre los datos del INE.",
    )

    @field_validator("pregunta")
    @classmethod
    def validar_pregunta_no_vacia(cls, value: str) -> str:
        texto = value.strip()
        if len(texto) < 3:
            raise ValueError("La pregunta debe tener al menos 3 caracteres.")
        return texto


class AskResponse(BaseModel):
    """Respuesta estructurada del consultor Text-to-SQL de solo lectura."""

    pregunta: str
    sql_generado: str
    resultados: list[dict[str, Any]]
    fuente_oficial: str
