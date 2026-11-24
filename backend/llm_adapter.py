"""Adaptadores de LLM (Adapter Pattern) y validador de seguridad Text-to-SQL.

Permite intercambiar proveedores de LLM mediante `LLM_PROVIDER` en `.env`
(soportando `gemini` vía `google-genai` y `ollama` vía HTTP local) y valida
estrictamente que cualquier consulta generada sea exclusivamente de lectura
(`SELECT`), bloqueando cualquier intento de DDL/DML o consultas apiladas.
"""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod

import httpx

# Palabras clave de escritura, DDL, DML o administración estrictamente prohibidas
FORBIDDEN_SQL_KEYWORDS: tuple[str, ...] = (
    "DROP",
    "DELETE",
    "UPDATE",
    "INSERT",
    "ALTER",
    "TRUNCATE",
    "CREATE",
    "REPLACE",
    "MERGE",
    "GRANT",
    "REVOKE",
    "EXECUTE",
    "EXEC",
    "CALL",
    "COPY",
    "DO",
    "SET",
    "RESET",
    "VACUUM",
    "ANALYZE",
    "CLUSTER",
    "LOCK",
    "COMMIT",
    "ROLLBACK",
    "SAVEPOINT",
    "PREPARE",
    "DEALLOCATE",
    "LISTEN",
    "NOTIFY",
    "LOAD",
    "IMPORT",
    "INTO",
)

FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(" + "|".join(FORBIDDEN_SQL_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

# Patrones de inyección directa DDL/DML en la pregunta de entrada
FORBIDDEN_PROMPT_SQL_PATTERN = re.compile(
    r"\b("
    r"DROP\s+(TABLE|DATABASE|SCHEMA|VIEW|INDEX|ROLE)|"
    r"DELETE\s+FROM|"
    r"TRUNCATE\s+(TABLE\s+)?\w+|"
    r"ALTER\s+(TABLE|DATABASE|SCHEMA|ROLE)|"
    r"INSERT\s+INTO|"
    r"UPDATE\s+\w+\s+SET|"
    r"GRANT\s+.+\s+TO|"
    r"REVOKE\s+.+\s+FROM"
    r")\b",
    re.IGNORECASE,
)

SCHEMA_CONTEXT = """
Esquema relacional oficial de INE-DataHub (PostgreSQL 16):

1. dim_departamentos:
   - depto_cod VARCHAR(2) PRIMARY KEY  -- Códigos normalizados '01' a '22' (ej. '01' = Guatemala)
   - nombre VARCHAR(100) NOT NULL UNIQUE

2. dim_municipios:
   - muni_cod VARCHAR(4) PRIMARY KEY   -- Códigos normalizados '0101' a '2217'
   - depto_cod VARCHAR(2) REFERENCES dim_departamentos(depto_cod)
   - nombre VARCHAR(120) NOT NULL

3. meta_fuentes:
   - id SERIAL PRIMARY KEY
   - dominio VARCHAR(50) NOT NULL      -- Ejemplos: 'vitales', 'transito'
   - archivo_origen VARCHAR(255) NOT NULL
   - cuadro VARCHAR(100) NOT NULL      -- Ejemplos: 'Cuadro 1', 'C1', 'C8', 'C9', 'C11', 'C15'
   - fecha_carga TIMESTAMP

4. fact_indicadores_depto:
   - id SERIAL PRIMARY KEY
   - fuente_id INT REFERENCES meta_fuentes(id)
   - depto_cod VARCHAR(2) REFERENCES dim_departamentos(depto_cod)
   - anio INT NOT NULL                 -- Años disponibles: 2021 a 2025
   - indicador VARCHAR(150) NOT NULL   -- Indicadores cargados:
       * 'defunciones_total' (unidad: 'casos')
       * 'defunciones_fetales_total' (unidad: 'casos')
       * 'accidentes_transito_total' (unidad: 'casos')
       * 'victimas_transito_total' (unidad: 'casos')
       * 'lesionados_transito_total' (unidad: 'casos')
       * 'fallecidos_transito_total' (unidad: 'casos')
       * 'tasa_fallecidos_transito_100k' (unidad: 'tasa_100k')
   - valor NUMERIC(14, 2) NOT NULL
   - unidad VARCHAR(50)

Reglas estrictas del INE Guatemala:
- Nunca asumas filas de totales en fact_indicadores_depto: los 22 departamentos están separados; para totales nacionales usa SUM(valor) (no sumes tasas, usa promedio ponderado o reporta por departamento).
- Usa siempre códigos de departamento como texto de 2 dígitos ('01'..'22').
- Une fact_indicadores_depto con dim_departamentos para devolver el nombre legible del departamento.
- Genera ÚNICAMENTE una sentencia SQL válida de solo lectura (SELECT).
- No incluyas explicaciones, comentarios SQL ni bloques de código markdown.
""".strip()


class SQLSecurityError(ValueError):
    """Error lanzado cuando una consulta o solicitud viola la política de solo lectura."""


class LLMProviderError(RuntimeError):
    """Error lanzado cuando el proveedor de LLM falla o no está configurado."""


def limpiar_bloques_markdown_sql(sql_crudo: str) -> str:
    """Elimina envoltorios markdown (```sql ... ```) y espacios sobrantes."""
    texto = sql_crudo.strip()
    bloque = re.match(r"^```(?:sql)?\s*(.*?)\s*```$", texto, flags=re.IGNORECASE | re.DOTALL)
    if bloque:
        texto = bloque.group(1).strip()
    return texto


def validar_pregunta_segura(pregunta: str) -> str:
    """Bloquea payloads obvios de DDL/DML enviados directamente en la pregunta."""
    texto = pregunta.strip()
    match = FORBIDDEN_PROMPT_SQL_PATTERN.search(texto)
    if match:
        raise SQLSecurityError(
            f"Solicitud rechazada por política de seguridad: contiene instrucción SQL no permitida ('{match.group(0)}')."
        )
    return texto


def validar_sql_seguro(sql: str) -> str:
    """Valida que la sentencia SQL sea exclusivamente una consulta SELECT segura.

    Reglas aplicadas:
    1. No puede estar vacía.
    2. No permite comentarios SQL (`--`, `/*`, `*/`).
    3. Solo permite una sentencia (bloquea múltiples sentencias separadas por `;`).
    4. Debe comenzar con `SELECT` o `WITH` (CTE de lectura).
    5. Prohíbe cualquier palabra clave DDL, DML o administrativa (DROP, DELETE, UPDATE, etc.).
    """
    sql_limpio = limpiar_bloques_markdown_sql(sql)
    if not sql_limpio:
        raise SQLSecurityError("La consulta SQL generada está vacía.")

    if "--" in sql_limpio or "/*" in sql_limpio or "*/" in sql_limpio:
        raise SQLSecurityError("No se permiten comentarios SQL en consultas generadas.")

    # Permitir únicamente un punto y coma opcional al final
    sin_punto_coma_final = sql_limpio.rstrip(";").strip()
    if not sin_punto_coma_final:
        raise SQLSecurityError("La consulta SQL generada está vacía.")

    if ";" in sin_punto_coma_final:
        raise SQLSecurityError(
            "No se permiten múltiples sentencias SQL separadas por punto y coma."
        )

    if not re.match(r"^(SELECT|WITH)\b", sin_punto_coma_final, flags=re.IGNORECASE):
        raise SQLSecurityError(
            "Solo se permiten consultas de lectura que inicien con SELECT o WITH."
        )

    # Si inicia con WITH, verificar que incluya SELECT
    if re.match(r"^WITH\b", sin_punto_coma_final, flags=re.IGNORECASE) and not re.search(
        r"\bSELECT\b", sin_punto_coma_final, flags=re.IGNORECASE
    ):
        raise SQLSecurityError("Una expresión CTE (WITH) debe contener una consulta SELECT.")

    match_prohibido = FORBIDDEN_SQL_PATTERN.search(sin_punto_coma_final)
    if match_prohibido:
        palabra = match_prohibido.group(1).upper()
        raise SQLSecurityError(
            f"Operación SQL no permitida detectada: '{palabra}'. Solo se permiten consultas SELECT."
        )

    return sin_punto_coma_final


def construir_prompt_text_to_sql(pregunta: str, esquema_bd: str = SCHEMA_CONTEXT) -> str:
    """Construye el prompt estandarizado para los adaptadores Text-to-SQL."""
    return (
        "Eres un asistente experto en SQL para PostgreSQL especializado en estadísticas "
        "oficiales del Instituto Nacional de Estadística (INE) de Guatemala.\n\n"
        f"{esquema_bd}\n\n"
        f"Pregunta del usuario: {pregunta}\n\n"
        "Devuelve exclusivamente la consulta SQL (SELECT) en texto plano, sin markdown ni explicaciones:"
    )


class LLMAdapter(ABC):
    """Interfaz base (Adapter Pattern) para proveedores de modelos Text-to-SQL."""

    @abstractmethod
    def generar_sql(self, pregunta: str, esquema_bd: str = SCHEMA_CONTEXT) -> str:
        """Traduce una pregunta en lenguaje natural a una consulta SQL para PostgreSQL."""


class GeminiAdapter(LLMAdapter):
    """Adaptador oficial para Google Gemini usando el SDK `google-genai`."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "")
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    def generar_sql(self, pregunta: str, esquema_bd: str = SCHEMA_CONTEXT) -> str:
        if not self.api_key or self.api_key == "tu_api_key_aqui":
            raise LLMProviderError(
                "GEMINI_API_KEY no está configurada en el archivo .env."
            )

        try:
            from google import genai
        except ImportError as exc:
            raise LLMProviderError(
                "El paquete 'google-genai' no está instalado en el entorno."
            ) from exc

        prompt = construir_prompt_text_to_sql(pregunta, esquema_bd)
        try:
            client = genai.Client(api_key=self.api_key)
            response = client.models.generate_content(
                model=self.model,
                contents=prompt,
            )
            texto = (response.text or "").strip()
        except Exception as exc:
            raise LLMProviderError(f"Error al consultar Gemini API: {exc}") from exc

        if not texto:
            raise LLMProviderError("Gemini devolvió una respuesta vacía.")

        return limpiar_bloques_markdown_sql(texto)


class OllamaAdapter(LLMAdapter):
    """Adaptador para modelos locales ejecutados mediante Ollama HTTP API."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = (base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")
        self.model = model or os.getenv("OLLAMA_MODEL", "llama3.1")
        self.timeout = timeout

    def generar_sql(self, pregunta: str, esquema_bd: str = SCHEMA_CONTEXT) -> str:
        prompt = construir_prompt_text_to_sql(pregunta, esquema_bd)
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise LLMProviderError(
                f"Error al comunicarse con Ollama en {url}: {exc}"
            ) from exc

        texto = str(data.get("response", "")).strip()
        if not texto:
            raise LLMProviderError("Ollama devolvió una respuesta vacía.")

        return limpiar_bloques_markdown_sql(texto)


def get_llm_adapter(provider: str | None = None) -> LLMAdapter:
    """Fábrica que instancia el adaptador LLM según `LLM_PROVIDER` en `.env`."""
    proveedor = (provider or os.getenv("LLM_PROVIDER", "gemini")).strip().lower()

    if proveedor == "gemini":
        return GeminiAdapter()
    if proveedor == "ollama":
        return OllamaAdapter()

    raise LLMProviderError(
        f"Proveedor LLM no soportado: '{proveedor}'. Opciones válidas: 'gemini', 'ollama'."
    )
