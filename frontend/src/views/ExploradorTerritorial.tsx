import {
  AlertCircle,
  MapPin,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApiError,
  getDepartamentos,
  getIndicadores,
  type DepartamentoOut,
  type IndicadorOut,
} from '../api/client'
import {
  DepartamentosTable,
  type FilaDepartamento,
} from '../components/DepartamentosTable'
import { KpiCard } from '../components/KpiCard'
import {
  TendenciaHistoricaChart,
  type PuntoTendencia,
} from '../components/TendenciaHistoricaChart'
import { TopDepartamentosChart } from '../components/TopDepartamentosChart'
import {
  ANIO_BASE_COMPARACION,
  ANIO_POR_DEFECTO,
  ANIOS_DISPONIBLES,
  GRUPOS_INDICADORES,
  formatearValor,
  formatearVariacion,
  normalizarBusqueda,
  obtenerMetaIndicador,
} from '../config/indicadores'

export function ExploradorTerritorial() {
  const [indicadorSeleccionado, setIndicadorSeleccionado] =
    useState<string>('defunciones_total')
  const [anioSeleccionado, setAnioSeleccionado] =
    useState<number>(ANIO_POR_DEFECTO)
  const [busquedaDepto, setBusquedaDepto] = useState<string>('')
  const [deptoSeleccionado, setDeptoSeleccionado] = useState<string | null>(
    null,
  )

  const [departamentos, setDepartamentos] = useState<DepartamentoOut[]>([])
  const [registros, setRegistros] = useState<IndicadorOut[]>([])
  const [cargando, setCargando] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState<number>(0)

  // Cargar catálogo oficial de los 22 departamentos una vez
  useEffect(() => {
    const controller = new AbortController()
    getDepartamentos(controller.signal)
      .then((data) => setDepartamentos(data))
      .catch(() => {
        // Si falla aquí, el error principal se mostrará en la carga de indicadores
      })
    return () => controller.abort()
  }, [reloadToken])

  // Cargar serie completa (2021-2025) del indicador seleccionado
  useEffect(() => {
    const controller = new AbortController()
    setCargando(true)
    setError(null)

    getIndicadores({ indicador: indicadorSeleccionado }, controller.signal)
      .then((data) => {
        setRegistros(data)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        if (err instanceof ApiError) {
          setError(err.detail)
        } else {
          setError('Ocurrió un error inesperado al cargar los indicadores del INE.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargando(false)
        }
      })

    return () => controller.abort()
  }, [indicadorSeleccionado, reloadToken])

  const meta = useMemo(() => {
    const muestra = registros[0]
    return obtenerMetaIndicador(
      indicadorSeleccionado,
      muestra?.unidad,
      muestra?.dominio,
    )
  }, [indicadorSeleccionado, registros])

  const fuenteOficial = useMemo(() => {
    const registroAnio = registros.find((r) => r.anio === anioSeleccionado)
    return (
      registroAnio?.fuente_oficial ||
      registros[0]?.fuente_oficial ||
      'INE Guatemala — Estadísticas Vitales y Hechos de Tránsito (2021–2025)'
    )
  }, [registros, anioSeleccionado])

  // Registros del año activo y del año base 2021
  const registrosAnio = useMemo(
    () => registros.filter((r) => r.anio === anioSeleccionado),
    [registros, anioSeleccionado],
  )

  const registrosBase2021 = useMemo(
    () => registros.filter((r) => r.anio === ANIO_BASE_COMPARACION),
    [registros],
  )

  const mapaBase2021 = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of registrosBase2021) {
      map.set(r.depto_cod, r.valor)
    }
    return map
  }, [registrosBase2021])

  // Función auxiliar para calcular agregado nacional (suma para casos, promedio para tasas)
  const calcularAgregado = useCallback(
    (lista: IndicadorOut[]): number | null => {
      if (lista.length === 0) return null
      const suma = lista.reduce((acc, item) => acc + item.valor, 0)
      return meta.agregacion === 'sum' ? suma : suma / lista.length
    },
    [meta.agregacion],
  )

  // KPIs nacionales del año seleccionado
  const kpis = useMemo(() => {
    const agregadoActual = calcularAgregado(registrosAnio)
    const agregado2021 = calcularAgregado(registrosBase2021)

    let mayorDepto: IndicadorOut | null = null
    for (const item of registrosAnio) {
      if (!mayorDepto || item.valor > mayorDepto.valor) {
        mayorDepto = item
      }
    }

    let variacionNacional: number | null = null
    if (
      agregadoActual !== null &&
      agregado2021 !== null &&
      agregado2021 !== 0
    ) {
      variacionNacional =
        ((agregadoActual - agregado2021) / agregado2021) * 100
    }

    return {
      agregadoActual,
      agregado2021,
      mayorDepto,
      variacionNacional,
      departamentosConDatos: registrosAnio.length,
    }
  }, [registrosAnio, registrosBase2021, calcularAgregado])

  // Datos filtrados por buscador de departamento (para tabla y ayuda visual)
  const busquedaNormalizada = normalizarBusqueda(busquedaDepto)

  const registrosAnioFiltrados = useMemo(() => {
    if (!busquedaNormalizada) return registrosAnio
    return registrosAnio.filter(
      (item) =>
        normalizarBusqueda(item.departamento).includes(busquedaNormalizada) ||
        item.depto_cod.includes(busquedaNormalizada),
    )
  }, [registrosAnio, busquedaNormalizada])

  // Departamento activo para la gráfica de tendencia histórica
  const deptoActivoInfo = useMemo(() => {
    if (!deptoSeleccionado) return null
    const deCatalogo = departamentos.find(
      (d) => d.depto_cod === deptoSeleccionado,
    )
    if (deCatalogo) return deCatalogo
    const deRegistro = registros.find((r) => r.depto_cod === deptoSeleccionado)
    if (deRegistro) {
      return {
        depto_cod: deRegistro.depto_cod,
        nombre: deRegistro.departamento,
      }
    }
    return null
  }, [deptoSeleccionado, departamentos, registros])

  // Serie 2021-2025 para TendenciaHistoricaChart
  const serieHistorica: PuntoTendencia[] = useMemo(() => {
    return ANIOS_DISPONIBLES.map((anio) => {
      if (deptoSeleccionado) {
        const registro = registros.find(
          (r) => r.anio === anio && r.depto_cod === deptoSeleccionado,
        )
        return { anio, valor: registro ? registro.valor : null }
      }
      const delAnio = registros.filter((r) => r.anio === anio)
      return { anio, valor: calcularAgregado(delAnio) }
    })
  }, [registros, deptoSeleccionado, calcularAgregado])

  // Filas completas para la tabla de 22 departamentos
  const filasTabla: FilaDepartamento[] = useMemo(() => {
    const mapaAnio = new Map<string, IndicadorOut>()
    for (const r of registrosAnio) {
      mapaAnio.set(r.depto_cod, r)
    }

    const sumaNacional =
      meta.agregacion === 'sum'
        ? registrosAnio.reduce((acc, item) => acc + item.valor, 0)
        : 0

    // Base de 22 departamentos desde catálogo oficial o desde registros si catálogo no ha llegado
    const catalogoBase: DepartamentoOut[] =
      departamentos.length > 0
        ? departamentos
        : Array.from(
            new Map(
              registros.map((r) => [
                r.depto_cod,
                { depto_cod: r.depto_cod, nombre: r.departamento },
              ]),
            ).values(),
          ).sort((a, b) => a.depto_cod.localeCompare(b.depto_cod))

    const filas = catalogoBase.map<FilaDepartamento>((depto) => {
      const regActual = mapaAnio.get(depto.depto_cod)
      const valor = regActual ? regActual.valor : null
      const valorBase2021 = mapaBase2021.get(depto.depto_cod) ?? null

      let variacionVs2021: number | null = null
      if (valor !== null && valorBase2021 !== null && valorBase2021 !== 0) {
        variacionVs2021 = ((valor - valorBase2021) / valorBase2021) * 100
      }

      const participacionNacional =
        meta.agregacion === 'sum' && valor !== null && sumaNacional > 0
          ? (valor / sumaNacional) * 100
          : null

      return {
        depto_cod: depto.depto_cod,
        departamento: depto.nombre,
        valor,
        valorBase2021,
        variacionVs2021,
        participacionNacional,
      }
    })

    if (!busquedaNormalizada) return filas
    return filas.filter(
      (f) =>
        normalizarBusqueda(f.departamento).includes(busquedaNormalizada) ||
        f.depto_cod.includes(busquedaNormalizada),
    )
  }, [
    departamentos,
    registros,
    registrosAnio,
    mapaBase2021,
    meta.agregacion,
    busquedaNormalizada,
  ])

  const handleToggleDepto = useCallback((deptoCod: string) => {
    setDeptoSeleccionado((prev) => (prev === deptoCod ? null : deptoCod))
  }, [])

  return (
    <div className="space-y-6">
      {/* Encabezado de sección */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#007BFF]">
            Explorador Territorial
          </p>
          <h1 className="font-display text-2xl font-bold text-[#003876]">
            Indicadores Departamentales de Guatemala
          </h1>
        </div>
        <p className="text-xs text-[#475569]">
          Cobertura oficial: 22 departamentos · Serie histórica 2021–2025
        </p>
      </div>

      {/* Barra de filtros limpia */}
      <section
        aria-label="Filtros del explorador territorial"
        className="rounded-xl border border-slate-200 bg-[#F4F6F8] p-4"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-end">
          {/* Selector de indicador agrupado por Vitales y Tránsito */}
          <div className="lg:col-span-5">
            <label
              htmlFor="selector-indicador"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
            >
              Indicador oficial
            </label>
            <select
              id="selector-indicador"
              value={indicadorSeleccionado}
              onChange={(e) => setIndicadorSeleccionado(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-[#003876] focus:border-[#007BFF] focus:outline-none focus:ring-2 focus:ring-[#007BFF]/20"
            >
              {GRUPOS_INDICADORES.map((grupo) => (
                <optgroup key={grupo.dominio} label={grupo.etiqueta}>
                  {grupo.items.map((item) => (
                    <option key={item.codigo} value={item.codigo}>
                      {item.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Selector de año 2021 - 2025 */}
          <div className="lg:col-span-4">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]">
              Año de análisis
            </span>
            <div
              role="group"
              aria-label="Selector de año"
              className="inline-flex w-full items-center justify-between gap-1 rounded-lg border border-slate-200 bg-white p-1"
            >
              {ANIOS_DISPONIBLES.map((anio) => {
                const activo = anio === anioSeleccionado
                return (
                  <button
                    key={anio}
                    type="button"
                    onClick={() => setAnioSeleccionado(anio)}
                    aria-pressed={activo}
                    className={`flex-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors tabular-nums ${
                      activo
                        ? 'bg-[#FFD100] text-[#003876]'
                        : 'text-[#475569] hover:bg-[#F4F6F8] hover:text-[#003876]'
                    }`}
                  >
                    {anio}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Buscador por departamento */}
          <div className="lg:col-span-3">
            <label
              htmlFor="buscador-departamento"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#475569]"
            >
              Filtrar departamento
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#475569]"
                aria-hidden="true"
              />
              <input
                id="buscador-departamento"
                type="text"
                value={busquedaDepto}
                onChange={(e) => setBusquedaDepto(e.target.value)}
                placeholder="Ej. Guatemala, 01..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-[#003876] placeholder:text-slate-400 focus:border-[#007BFF] focus:outline-none focus:ring-2 focus:ring-[#007BFF]/20"
              />
              {busquedaDepto && (
                <button
                  type="button"
                  onClick={() => setBusquedaDepto('')}
                  aria-label="Limpiar búsqueda de departamento"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[#475569] hover:text-[#003876]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Banner de error de carga si aplica */}
      {error && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#003876]" />
            <div>
              <p className="text-sm font-semibold text-[#003876]">
                No se pudieron cargar los datos oficiales
              </p>
              <p className="mt-0.5 text-xs text-[#475569]">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReloadToken((t) => t + 1)}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#003876] transition-colors hover:bg-[#F4F6F8]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* 3 tarjetas KPI minimalistas */}
      <section
        aria-label="Indicadores clave"
        className="grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <KpiCard
          etiqueta={
            meta.agregacion === 'sum'
              ? `Total nacional · ${anioSeleccionado}`
              : `Promedio departamental · ${anioSeleccionado}`
          }
          valor={
            kpis.agregadoActual !== null
              ? formatearValor(kpis.agregadoActual, meta.decimales)
              : 'N/D'
          }
          subtitulo={`${meta.unidadEtiqueta} · ${kpis.departamentosConDatos} departamentos con dato`}
          badge={String(anioSeleccionado)}
          badgeDestacado
          cargando={cargando}
        />

        <KpiCard
          etiqueta={`Valor más alto · ${anioSeleccionado}`}
          valor={
            kpis.mayorDepto
              ? formatearValor(kpis.mayorDepto.valor, meta.decimales)
              : 'N/D'
          }
          subtitulo={
            kpis.mayorDepto
              ? `${kpis.mayorDepto.departamento} (Código ${kpis.mayorDepto.depto_cod}) · ${meta.unidadCorta}`
              : 'Sin registros para el año seleccionado'
          }
          icono={<MapPin className="h-4 w-4" />}
          cargando={cargando}
        />

        <KpiCard
          etiqueta={`Variación vs. ${ANIO_BASE_COMPARACION}`}
          valor={
            anioSeleccionado === ANIO_BASE_COMPARACION
              ? '0.0%'
              : formatearVariacion(kpis.variacionNacional)
          }
          subtitulo={
            anioSeleccionado === ANIO_BASE_COMPARACION
              ? 'Año base de referencia de la serie 2021–2025'
              : kpis.agregado2021 !== null
                ? `Referencia ${ANIO_BASE_COMPARACION}: ${formatearValor(kpis.agregado2021, meta.decimales)} ${meta.unidadCorta}`
                : `Sin referencia disponible para ${ANIO_BASE_COMPARACION}`
          }
          icono={<TrendingUp className="h-4 w-4" />}
          cargando={cargando}
        />
      </section>

      {/* Grid de 12 columnas para gráficas principales */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <TopDepartamentosChart
            datos={
              registrosAnioFiltrados.length > 0
                ? registrosAnioFiltrados
                : registrosAnio
            }
            meta={meta}
            anio={anioSeleccionado}
            deptoSeleccionado={deptoSeleccionado}
            onSeleccionarDepto={handleToggleDepto}
            fuenteOficial={fuenteOficial}
            cargando={cargando}
          />
        </div>

        <div className="lg:col-span-5">
          <TendenciaHistoricaChart
            serie={serieHistorica}
            meta={meta}
            anioActivo={anioSeleccionado}
            deptoActivo={deptoActivoInfo}
            onRestablecerNacional={() => setDeptoSeleccionado(null)}
            fuenteOficial={fuenteOficial}
            cargando={cargando}
          />
        </div>
      </div>

      {/* Tabla detallada de los 22 departamentos */}
      <DepartamentosTable
        filas={filasTabla}
        meta={meta}
        anio={anioSeleccionado}
        deptoSeleccionado={deptoSeleccionado}
        onSeleccionarDepto={handleToggleDepto}
        fuenteOficial={fuenteOficial}
        cargando={cargando}
      />
    </div>
  )
}
