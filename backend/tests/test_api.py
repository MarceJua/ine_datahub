"""Tests de homologación para la API REST y seguridad Text-to-SQL de INE-DataHub."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.llm_adapter import (
    LLMAdapter,
    SQLSecurityError,
    get_llm_adapter,
    validar_sql_seguro,
)
from backend.main import app


class FakeLLMAdapter(LLMAdapter):
    """Adaptador simulado para pruebas sin llamadas a APIs externas."""

    def __init__(self, sql_a_devolver: str) -> None:
        self._sql_a_devolver = sql_a_devolver

    def generar_sql(self, pregunta: str, esquema_bd: str = "") -> str:
        return self._sql_a_devolver


@pytest.fixture
def client() -> TestClient:
    """Cliente de pruebas FastAPI con limpieza automática de dependency_overrides."""
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health_confirma_conexion_bd(client: TestClient) -> None:
    """a) /health responde 200 y confirma conexión activa a PostgreSQL."""
    response = client.get("/health")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"


def test_departamentos_devuelve_exactamente_22(client: TestClient) -> None:
    """b) /api/departamentos responde 200 y devuelve exactamente 22 departamentos ordenados."""
    response = client.get("/api/departamentos")
    assert response.status_code == 200

    departamentos = response.json()
    assert isinstance(departamentos, list)
    assert len(departamentos) == 22

    codigos = [d["depto_cod"] for d in departamentos]
    assert codigos == [f"{i:02d}" for i in range(1, 23)]
    assert departamentos[0]["depto_cod"] == "01"
    assert departamentos[0]["nombre"].lower() == "guatemala"


def test_fuentes_devuelve_catalogo_cargado(client: TestClient) -> None:
    """Verifica que /api/fuentes expone las fuentes registradas en meta_fuentes."""
    response = client.get("/api/fuentes")
    assert response.status_code == 200

    fuentes = response.json()
    assert isinstance(fuentes, list)
    assert len(fuentes) >= 1

    campos_esperados = {"id", "dominio", "archivo_origen", "cuadro", "fecha_carga"}
    assert campos_esperados.issubset(fuentes[0].keys())


def test_indicadores_tasa_fallecidos_2025_devuelve_22_registros_homologados(
    client: TestClient,
) -> None:
    """c) /api/indicadores?indicador=tasa_fallecidos_transito_100k&anio=2025 devuelve 22 registros homologados."""
    response = client.get(
        "/api/indicadores",
        params={
            "indicador": "tasa_fallecidos_transito_100k",
            "anio": 2025,
        },
    )
    assert response.status_code == 200

    registros = response.json()
    assert isinstance(registros, list)
    assert len(registros) == 22

    campos_homologados = {
        "id",
        "depto_cod",
        "departamento",
        "anio",
        "indicador",
        "valor",
        "unidad",
        "fuente_id",
        "dominio",
        "archivo_origen",
        "cuadro",
        "fuente_oficial",
    }

    codigos_vistos = set()
    for item in registros:
        assert campos_homologados.issubset(item.keys())
        assert item["indicador"] == "tasa_fallecidos_transito_100k"
        assert item["anio"] == 2025
        assert len(item["depto_cod"]) == 2
        assert isinstance(item["departamento"], str) and item["departamento"]
        assert isinstance(item["valor"], (int, float))
        assert isinstance(item["fuente_oficial"], str) and "INE Guatemala" in item["fuente_oficial"]
        codigos_vistos.add(item["depto_cod"])

    assert len(codigos_vistos) == 22


@pytest.mark.parametrize(
    "sql_malicioso",
    [
        "DROP TABLE fact_indicadores_depto;",
        "DELETE FROM dim_departamentos WHERE depto_cod = '01';",
        "UPDATE fact_indicadores_depto SET valor = 0;",
        "INSERT INTO dim_departamentos (depto_cod, nombre) VALUES ('99', 'Fake');",
        "SELECT * FROM dim_departamentos; DROP TABLE meta_fuentes;",
        "TRUNCATE TABLE fact_indicadores_depto;",
        "WITH borrado AS (DELETE FROM dim_departamentos RETURNING *) SELECT * FROM borrado;",
    ],
)
def test_ask_bloquea_sql_no_permitido_sin_llamar_a_gemini(
    client: TestClient,
    sql_malicioso: str,
) -> None:
    """d) El validador de seguridad de /api/ask bloquea DDL/DML sin invocar a Gemini."""
    app.dependency_overrides[get_llm_adapter] = lambda: FakeLLMAdapter(sql_malicioso)

    response = client.post(
        "/api/ask",
        json={"pregunta": "Muéstrame los departamentos de Guatemala"},
    )
    assert response.status_code == 400
    assert "detail" in response.json()


def test_ask_bloquea_prompt_con_ddl_dml_directo_sin_llamar_a_gemini(
    client: TestClient,
) -> None:
    """Verifica que un intento directo de DROP TABLE o DELETE FROM en la pregunta es rechazado antes del LLM."""

    class FailIfCalledAdapter(LLMAdapter):
        def generar_sql(self, pregunta: str, esquema_bd: str = "") -> str:
            raise AssertionError("No debía invocarse el adaptador LLM externo.")

    app.dependency_overrides[get_llm_adapter] = lambda: FailIfCalledAdapter()

    for prompt_malicioso in [
        "DROP TABLE fact_indicadores_depto",
        "DELETE FROM dim_departamentos",
    ]:
        response = client.post("/api/ask", json={"pregunta": prompt_malicioso})
        assert response.status_code == 400


def test_ask_ejecuta_select_valido_con_ine_readonly(client: TestClient) -> None:
    """Verifica el flujo completo de /api/ask con un SELECT válido usando el adaptador simulado."""
    sql_seguro = (
        "SELECT d.depto_cod, d.nombre, f.anio, f.valor "
        "FROM fact_indicadores_depto f "
        "JOIN dim_departamentos d ON d.depto_cod = f.depto_cod "
        "WHERE f.indicador = 'tasa_fallecidos_transito_100k' AND f.anio = 2025 "
        "ORDER BY f.valor DESC LIMIT 3"
    )
    app.dependency_overrides[get_llm_adapter] = lambda: FakeLLMAdapter(sql_seguro)

    response = client.post(
        "/api/ask",
        json={"pregunta": "¿Cuáles son los 3 departamentos con mayor tasa de fallecidos de tránsito en 2025?"},
    )
    assert response.status_code == 200

    data = response.json()
    assert data["pregunta"] == "¿Cuáles son los 3 departamentos con mayor tasa de fallecidos de tránsito en 2025?"
    assert data["sql_generado"] == sql_seguro
    assert len(data["resultados"]) == 3
    assert "INE Guatemala" in data["fuente_oficial"]


def test_validador_sql_permite_select_y_rechaza_escritura() -> None:
    """Prueba unitaria directa sobre validar_sql_seguro."""
    limpio = validar_sql_seguro("```sql\nSELECT depto_cod, nombre FROM dim_departamentos;\n```")
    assert limpio == "SELECT depto_cod, nombre FROM dim_departamentos"

    with pytest.raises(SQLSecurityError):
        validar_sql_seguro("DROP TABLE dim_departamentos")
