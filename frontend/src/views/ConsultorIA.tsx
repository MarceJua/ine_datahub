import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Database,
  Loader2,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError, askConsultor, type AskResponse } from '../api/client'

const PREGUNTAS_SUGERIDAS: readonly string[] = [
  'Top 5 departamentos por tasa de fallecidos en tránsito en 2025',
  'Evolución anual de defunciones totales en Guatemala de 2021 a 2025',
  'Departamentos con más accidentes y lesionados de tránsito en 2024',
]

interface ErrorConsultor {
  tipo: 'cuota' | 'seguridad' | 'sql_invalido' | 'red' | 'general'
  titulo: string
  mensaje: string
  detalleTecnico?: string
}

function clasificarErrorConsultor(err: unknown): ErrorConsultor {
  if (err instanceof ApiError) {
    if (err.isNetworkError) {
      return {
        tipo: 'red',
        titulo: 'No fue posible conectar con el servidor de consultas',
        mensaje:
          'Verifica que la API de FastAPI esté activa y accesible desde el navegador.',
        detalleTecnico: err.detail,
      }
    }

    if (err.status === 503) {
      return {
        tipo: 'cuota',
        titulo: 'Servicio de IA temporalmente no disponible',
        mensaje:
          'El proveedor de lenguaje no pudo completar la solicitud (posible límite de cuota, clave API no configurada o servicio local inactivo). Puedes seguir utilizando el Explorador Territorial con normalidad.',
        detalleTecnico: err.detail,
      }
    }

    if (err.status === 400) {
      return {
        tipo: 'seguridad',
        titulo: 'Consulta bloqueada por seguridad',
        mensaje:
          'Por política de solo lectura de INE-DataHub, el consultor únicamente ejecuta sentencias de consulta (SELECT) sobre las tablas oficiales.',
        detalleTecnico: err.detail,
      }
    }

    if (err.status === 422) {
      return {
        tipo: 'sql_invalido',
        titulo: 'No se pudo ejecutar el SQL generado',
        mensaje:
          'El modelo generó una consulta SQL con un error de sintaxis o referencia en PostgreSQL. Intenta reformular tu pregunta con mayor precisión o utiliza una de las consultas sugeridas.',
        detalleTecnico: err.detail,
      }
    }

    return {
      tipo: 'general',
      titulo: `No se pudo procesar la consulta (HTTP ${err.status})`,
      mensaje: err.detail,
    }
  }

  return {
    tipo: 'general',
    titulo: 'Error inesperado al consultar',
    mensaje:
      'Ocurrió un inconveniente al comunicarse con el agente Text-to-SQL. Intenta reformular tu pregunta.',
  }
}

function esValorNumerico(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor)
}

function esColumnaNumerica(
  filas: Array<Record<string, unknown>>,
  clave: string,
): boolean {
  let hayNoNulo = false
  for (const fila of filas) {
    const val = fila[clave]
    if (val === null || val === undefined || val === '') continue
    hayNoNulo = true
    if (esValorNumerico(val)) continue
    if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim())) {
      continue
    }
    return false
  }
  return hayNoNulo
}

function formatearEncabezadoColumna(clave: string): string {
  const mapa: Record<string, string> = {
    depto_cod: 'Código',
    departamento: 'Departamento',
    nombre: 'Nombre',
    anio: 'Año',
    indicador: 'Indicador',
    valor: 'Valor',
    total: 'Total',
    unidad: 'Unidad',
    dominio: 'Dominio',
  }
  if (mapa[clave.toLowerCase()]) {
    return mapa[clave.toLowerCase()]
  }
  return clave.replace(/_/g, ' ')
}

function formatearCelda(valor: unknown, clave: string): string {
  if (valor === null || valor === undefined) {
    return '—'
  }
  const claveLower = clave.toLowerCase()
  // No agregar separador de miles a años ni códigos geográficos
  if (
    claveLower === 'anio' ||
    claveLower === 'año' ||
    claveLower.endsWith('_cod') ||
    claveLower === 'id'
  ) {
    return String(valor)
  }

  if (esValorNumerico(valor)) {
    const tieneDecimales = !Number.isInteger(valor)
    return new Intl.NumberFormat('es-GT', {
      minimumFractionDigits: tieneDecimales ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(valor)
  }

  if (typeof valor === 'string' && /^-?\d+(\.\d+)?$/.test(valor.trim())) {
    const numero = Number(valor)
    if (Number.isFinite(numero)) {
      const tieneDecimales = valor.includes('.') && !Number.isInteger(numero)
      return new Intl.NumberFormat('es-GT', {
        minimumFractionDigits: tieneDecimales ? 2 : 0,
        maximumFractionDigits: 2,
      }).format(numero)
    }
  }

  return String(valor)
}

export function ConsultorIA() {
  const [pregunta, setPregunta] = useState<string>('')
  const [cargando, setCargando] = useState<boolean>(false)
  const [respuesta, setRespuesta] = useState<AskResponse | null>(null)
  const [error, setError] = useState<ErrorConsultor | null>(null)
  const [sqlAbierto, setSqlAbierto] = useState<boolean>(false)
  const [copiado, setCopiado] = useState<boolean>(false)

  const ejecutarConsulta = async (textoConsulta: string) => {
    const limpia = textoConsulta.trim()
    if (limpia.length < 3) {
      setError({
        tipo: 'general',
        titulo: 'Pregunta demasiado corta',
        mensaje: 'Ingresa al menos 3 caracteres para formular tu consulta.',
      })
      return
    }

    setPregunta(limpia)
    setCargando(true)
    setError(null)
    setSqlAbierto(false)
    setCopiado(false)

    try {
      const data = await askConsultor(limpia)
      setRespuesta(data)
    } catch (err: unknown) {
      setError(clasificarErrorConsultor(err))
    } finally {
      setCargando(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ejecutarConsulta(pregunta)
  }

  const handleCopiarSql = async () => {
    if (!respuesta?.sql_generado) return
    try {
      await navigator.clipboard.writeText(respuesta.sql_generado)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Ignorar si el navegador restringe acceso al portapapeles
    }
  }

  const columnas =
    respuesta && respuesta.resultados.length > 0
      ? Object.keys(respuesta.resultados[0])
      : []

  const columnasNumericas = new Set(
    respuesta
      ? columnas.filter((col) => esColumnaNumerica(respuesta.resultados, col))
      : [],
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#007BFF]">
            Consultor IA · Text-to-SQL
          </p>
          <h1 className="font-display text-2xl font-bold text-[#003876]">
            Consulta en lenguaje natural sobre datos del INE
          </h1>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-slate-200 bg-[#F4F6F8] px-3 py-1 text-xs font-medium text-[#475569]">
          <Database className="h-3.5 w-3.5 text-[#003876]" />
          <span>Solo lectura (SELECT)</span>
        </span>
      </div>

      {/* Formulario de consulta */}
      <section className="rounded-xl border border-slate-200 bg-[#F4F6F8] p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="consulta-ia-input"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
            >
              Pregunta analítica
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                id="consulta-ia-input"
                type="text"
                value={pregunta}
                onChange={(e) => setPregunta(e.target.value)}
                disabled={cargando}
                maxLength={1000}
                placeholder="Ej. ¿Cuáles fueron los 5 departamentos con mayor tasa de fallecidos en tránsito en 2025?"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-[#003876] placeholder:text-slate-400 focus:border-[#007BFF] focus:outline-none focus:ring-2 focus:ring-[#007BFF]/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={cargando || pregunta.trim().length < 3}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#007BFF] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#003876] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {cargando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Consultando...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Consultar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3 chips de preguntas sugeridas */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#475569]">
              Preguntas sugeridas:
            </p>
            <div className="flex flex-wrap gap-2">
              {PREGUNTAS_SUGERIDAS.map((sugerencia) => (
                <button
                  key={sugerencia}
                  type="button"
                  disabled={cargando}
                  onClick={() => void ejecutarConsulta(sugerencia)}
                  className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-left text-xs font-medium text-[#003876] transition-colors hover:border-[#007BFF] hover:bg-[#007BFF]/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sugerencia}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      {/* Manejo elegante de errores (503 cuota, 400 seguridad, 422 sintaxis SQL, red) */}
      {error && (
        <section
          role="alert"
          className={`rounded-xl border p-5 ${
            error.tipo === 'cuota'
              ? 'border-[#FFD100] bg-[#FFD100]/15'
              : error.tipo === 'seguridad'
                ? 'border-red-200 bg-red-50/70'
                : error.tipo === 'sql_invalido'
                  ? 'border-amber-300 bg-amber-50/80'
                  : 'border-slate-200 bg-[#F4F6F8]'
          }`}
        >
          <div className="flex items-start gap-3">
            {error.tipo === 'seguridad' ? (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            ) : error.tipo === 'sql_invalido' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#003876]" />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-bold text-[#003876]">
                  {error.titulo}
                </h2>
                {error.tipo === 'cuota' && (
                  <span className="rounded-full bg-[#FFD100] px-2 py-0.5 text-[11px] font-semibold text-[#003876]">
                    HTTP 503
                  </span>
                )}
                {error.tipo === 'seguridad' && (
                  <span className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-red-700">
                    Política de solo lectura
                  </span>
                )}
                {error.tipo === 'sql_invalido' && (
                  <span className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                    Error de sintaxis SQL · HTTP 422
                  </span>
                )}
              </div>
              <p className="text-sm text-[#475569]">{error.mensaje}</p>
              {error.detalleTecnico && (
                <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 font-mono text-xs text-[#475569] break-words">
                  {error.detalleTecnico}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Estado de carga */}
      {cargando && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-3 text-sm text-[#475569]">
            <Loader2 className="h-4 w-4 animate-spin text-[#007BFF]" />
            <span>
              Generando consulta SQL de solo lectura y recuperando cifras oficiales del INE...
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-9 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-9 w-full animate-pulse rounded bg-slate-100" />
            <div className="h-9 w-4/5 animate-pulse rounded bg-slate-100" />
          </div>
        </section>
      )}

      {/* Respuesta estructurada */}
      {!cargando && respuesta && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#475569]">
                Resultado de la consulta
              </p>
              <h2 className="mt-0.5 font-display text-base font-bold text-[#003876]">
                {respuesta.pregunta}
              </h2>
            </div>
            <span className="rounded-full bg-[#FFD100] px-2.5 py-0.5 text-xs font-semibold text-[#003876] tabular-nums">
              {respuesta.resultados.length}{' '}
              {respuesta.resultados.length === 1 ? 'fila' : 'filas'}
            </span>
          </div>

          {/* Tabla de resultados */}
          {respuesta.resultados.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[#475569]">
              La consulta SQL se ejecutó correctamente pero no devolvió registros para los criterios solicitados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#F4F6F8] text-xs font-semibold uppercase tracking-wider text-[#475569]">
                    {columnas.map((col) => {
                      const numerica = columnasNumericas.has(col)
                      return (
                        <th
                          key={col}
                          scope="col"
                          className={`px-5 py-3 ${
                            numerica ? 'text-right' : 'text-left'
                          }`}
                        >
                          {formatearEncabezadoColumna(col)}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {respuesta.resultados.map((fila, idx) => (
                    <tr key={idx} className="hover:bg-[#F4F6F8]">
                      {columnas.map((col) => {
                        const numerica = columnasNumericas.has(col)
                        return (
                          <td
                            key={col}
                            className={`px-5 py-3 ${
                              numerica
                                ? 'text-right font-semibold text-[#003876] tabular-nums'
                                : 'text-[#003876]'
                            }`}
                          >
                            {formatearCelda(fila[col], col)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Acordeón colapsable con SQL generado */}
          <div className="border-t border-slate-200">
            <button
              type="button"
              onClick={() => setSqlAbierto((prev) => !prev)}
              aria-expanded={sqlAbierto}
              className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold text-[#003876] transition-colors hover:bg-[#F4F6F8]"
            >
              <span className="inline-flex items-center gap-2">
                <Code2 className="h-4 w-4 text-[#007BFF]" />
                <span>SQL generado (transparencia y auditoría)</span>
              </span>
              {sqlAbierto ? (
                <ChevronUp className="h-4 w-4 text-[#475569]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[#475569]" />
              )}
            </button>

            {sqlAbierto && (
              <div className="border-t border-slate-200 bg-[#F4F6F8] px-5 py-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#475569]">
                    PostgreSQL · Rol ine_readonly
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopiarSql()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-[#003876] transition-colors hover:bg-slate-50"
                  >
                    {copiado ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-[#475569]" />
                        <span>Copiar SQL</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-[#003876]">
                  <code>{respuesta.sql_generado}</code>
                </pre>
              </div>
            )}
          </div>

          {/* Cita oficial trazable del INE */}
          <footer className="border-t border-slate-200 bg-[#F4F6F8]/60 px-5 py-3 text-[11px] text-[#475569]">
            Fuente oficial: {respuesta.fuente_oficial}
          </footer>
        </section>
      )}

      {/* Estado inicial vacío */}
      {!cargando && !respuesta && !error && (
        <section className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
          <p className="font-display text-sm font-semibold text-[#003876]">
            Listo para consultar estadísticas oficiales del INE Guatemala
          </p>
          <p className="mx-auto mt-1 max-w-xl text-xs text-[#475569]">
            Escribe una pregunta sobre Estadísticas Vitales o Hechos de Tránsito (2021–2025) o selecciona una de las preguntas sugeridas arriba para inspeccionar resultados tabulares y el SQL auditado.
          </p>
        </section>
      )}
    </div>
  )
}
