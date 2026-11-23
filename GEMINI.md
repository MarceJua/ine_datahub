# INE-DataHub — Plataforma Analítica y Consultor IA de Datos del INE Guatemala

## Objetivo del Proyecto
Sistema open-source que ingesta, normaliza y expone datos oficiales del INE de Guatemala (Estadísticas Vitales y Accidentes de Tránsito 2021-2025) mediante:
1. Un pipeline ETL en Python que limpia plantillas multipestaña (.xlsx) del INE.
2. Una base de datos relacional en PostgreSQL con catálogo oficial de departamentos (1-22) y municipios (101-2217).
3. Una API REST en FastAPI + un agente Text-to-SQL de solo lectura (arquitectura agnóstica: Gemini API / Ollama).
4. Un frontend en React + TypeScript con mapas territoriales y chat analítico.

## Stack Tecnológico
- **ETL / Datos:** Python 3.12, Pandas, OpenPyXL, SQLAlchemy / Psycopg.
- **Base de Datos:** PostgreSQL 16 (en Docker).
- **Backend:** FastAPI, Pydantic, Uvicorn.
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, Recharts, Leaflet (GeoJSON Guatemala).
- **Infraestructura:** Docker & Docker Compose.

## Reglas de Datos del INE (Estrictas)
- Los archivos Excel del INE tienen carátulas (`Presentación`, `Contenido`/`Índice`) y notas al pie; siempre detectar dinámicamente la fila de encabezado real.
- Separar o filtrar filas de totales (`Todos los departamentos`, `Total`, `República`) antes de insertar en tablas de hechos para evitar doble conteo.
- Códigos geográficos: tratar departamentos (`01`-`22`) y municipios (`0101`-`2217`) como strings/códigos normalizados.
- Valores ignorados (`99`, `999`, `9999`) deben mapearse a `NULL` o categoría explícita `"Ignorado"` antes de cualquier agregación numérica.

## Convenciones de Desarrollo
- Seguridad: El agente Text-to-SQL solo puede conectarse con un rol de PostgreSQL con permisos estrictos de `SELECT`.
- Variables sensibles (API Keys, credenciales DB) van exclusivamente en `.env` (nunca hardcodeadas).
- Mantener el código modular, tipado y documentado en español.
