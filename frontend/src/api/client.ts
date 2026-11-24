/**
 * Cliente HTTP tipado para la API REST de INE-DataHub (FastAPI).
 * Contratos estrictamente alineados con `backend/schemas.py` y `backend/main.py`.
 */

const DEFAULT_API_URL = 'http://127.0.0.1:8000'

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL?.trim() || DEFAULT_API_URL
).replace(/\/+$/, '')

/** Respuesta de GET /health (HealthResponse). */
export interface HealthResponse {
  status: string
  database: string
}

/** Representación oficial de un departamento de Guatemala (DepartamentoOut). */
export interface DepartamentoOut {
  depto_cod: string
  nombre: string
}

/** Metadatos de trazabilidad de una fuente oficial del INE (FuenteOut). */
export interface FuenteOut {
  id: number
  dominio: string
  archivo_origen: string
  cuadro: string
  fecha_carga: string
}

/** Registro homologado de un indicador anual por departamento (IndicadorOut). */
export interface IndicadorOut {
  id: number
  depto_cod: string
  departamento: string
  anio: number
  indicador: string
  valor: number
  unidad: string
  fuente_id: number
  dominio: string
  archivo_origen: string
  cuadro: string
  fuente_oficial: string
}

/** Solicitud para POST /api/ask (AskRequest). */
export interface AskRequest {
  pregunta: string
}

/** Respuesta estructurada de POST /api/ask (AskResponse). */
export interface AskResponse {
  pregunta: string
  sql_generado: string
  resultados: Array<Record<string, unknown>>
  fuente_oficial: string
}

/** Parámetros de filtro opcionales para GET /api/indicadores. */
export interface IndicadoresQueryParams {
  indicador?: string
  depto_cod?: string
  anio?: number
}

interface FastAPIValidationDetail {
  msg?: string
  loc?: Array<string | number>
}

interface FastAPIErrorBody {
  detail?: string | FastAPIValidationDetail[]
}

/** Error tipado para respuestas HTTP y fallos de red de la API INE-DataHub. */
export class ApiError extends Error {
  public readonly status: number
  public readonly detail: string
  public readonly isNetworkError: boolean

  constructor(
    message: string,
    status: number,
    detail?: string,
    isNetworkError = false,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? message
    this.isNetworkError = isNetworkError
  }
}

function extraerDetalleError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  const body = payload as FastAPIErrorBody
  if (typeof body.detail === 'string' && body.detail.trim()) {
    return body.detail.trim()
  }

  if (Array.isArray(body.detail) && body.detail.length > 0) {
    const mensajes = body.detail
      .map((item) => item.msg?.trim())
      .filter((msg): msg is string => Boolean(msg))
    if (mensajes.length > 0) {
      return mensajes.join(' ')
    }
  }

  return fallback
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(
      `No se pudo establecer conexión con la API en ${API_BASE_URL}. Verifica que el servidor FastAPI esté en ejecución.`,
      0,
      `Error de red al contactar ${url}`,
      true,
    )
  }

  let parsedBody: unknown = null
  try {
    parsedBody = await response.json()
  } catch {
    parsedBody = null
  }

  if (!response.ok) {
    const fallback = `La API respondió con código HTTP ${response.status}.`
    const detail = extraerDetalleError(parsedBody, fallback)
    throw new ApiError(detail, response.status, detail, false)
  }

  return parsedBody as T
}

/** Verifica el estado de salud de la API y conexión a PostgreSQL. */
export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/health', { signal })
}

/** Obtiene el catálogo oficial de los 22 departamentos de Guatemala. */
export function getDepartamentos(
  signal?: AbortSignal,
): Promise<DepartamentoOut[]> {
  return requestJson<DepartamentoOut[]>('/api/departamentos', { signal })
}

/** Obtiene el registro de fuentes oficiales del INE cargadas en BD. */
export function getFuentes(signal?: AbortSignal): Promise<FuenteOut[]> {
  return requestJson<FuenteOut[]>('/api/fuentes', { signal })
}

/** Consulta registros homologados de indicadores anuales por departamento. */
export function getIndicadores(
  params?: IndicadoresQueryParams,
  signal?: AbortSignal,
): Promise<IndicadorOut[]> {
  const query = new URLSearchParams()

  if (params?.indicador) {
    query.set('indicador', params.indicador)
  }
  if (params?.depto_cod) {
    query.set('depto_cod', params.depto_cod)
  }
  if (typeof params?.anio === 'number') {
    query.set('anio', String(params.anio))
  }

  const suffix = query.toString() ? `?${query.toString()}` : ''
  return requestJson<IndicadorOut[]>(`/api/indicadores${suffix}`, { signal })
}

/** Envía una consulta en lenguaje natural al agente Text-to-SQL de solo lectura. */
export function askConsultor(
  pregunta: string,
  signal?: AbortSignal,
): Promise<AskResponse> {
  const payload: AskRequest = { pregunta: pregunta.trim() }
  return requestJson<AskResponse>('/api/ask', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal,
  })
}
