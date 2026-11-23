-- 1. Tablas maestras geográficas (Estándar INE Guatemala)
CREATE TABLE IF NOT EXISTS dim_departamentos (
    depto_cod VARCHAR(2) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS dim_municipios (
    muni_cod VARCHAR(4) PRIMARY KEY,
    depto_cod VARCHAR(2) NOT NULL REFERENCES dim_departamentos(depto_cod),
    nombre VARCHAR(120) NOT NULL
);

-- 2. Catálogo de fuentes cargadas (Trazabilidad y citas oficiales)
CREATE TABLE IF NOT EXISTS meta_fuentes (
    id SERIAL PRIMARY KEY,
    dominio VARCHAR(50) NOT NULL,
    archivo_origen VARCHAR(255) NOT NULL,
    cuadro VARCHAR(100) NOT NULL,
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla unificada de series anuales por departamento (2021-2025)
CREATE TABLE IF NOT EXISTS fact_indicadores_depto (
    id SERIAL PRIMARY KEY,
    fuente_id INT REFERENCES meta_fuentes(id) ON DELETE CASCADE,
    depto_cod VARCHAR(2) REFERENCES dim_departamentos(depto_cod),
    anio INT NOT NULL,
    indicador VARCHAR(150) NOT NULL,
    valor NUMERIC(14, 2) NOT NULL,
    unidad VARCHAR(50) DEFAULT 'casos'
);

CREATE INDEX idx_fact_depto_anio ON fact_indicadores_depto(depto_cod, anio);
CREATE INDEX idx_fact_indicador ON fact_indicadores_depto(indicador);

-- 4. Rol de solo lectura exclusivo para el Agente Text-to-SQL
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ine_readonly') THEN
        CREATE ROLE ine_readonly WITH LOGIN PASSWORD 'ine_readonly_dev';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE ine_datahub TO ine_readonly;
GRANT USAGE ON SCHEMA public TO ine_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ine_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ine_readonly;
