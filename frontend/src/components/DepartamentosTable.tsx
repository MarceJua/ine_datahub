import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  ANIO_BASE_COMPARACION,
  formatearValor,
  formatearVariacion,
  type IndicadorMeta,
} from '../config/indicadores'

export interface FilaDepartamento {
  depto_cod: string
  departamento: string
  valor: number | null
  valorBase2021: number | null
  variacionVs2021: number | null
  participacionNacional: number | null
}

type ColumnaOrden = 'depto_cod' | 'departamento' | 'valor' | 'variacionVs2021'
type DireccionOrden = 'asc' | 'desc'

interface DepartamentosTableProps {
  filas: FilaDepartamento[]
  meta: IndicadorMeta
  anio: number
  deptoSeleccionado: string | null
  onSeleccionarDepto: (deptoCod: string) => void
  fuenteOficial: string
  cargando?: boolean
}

export function DepartamentosTable({
  filas,
  meta,
  anio,
  deptoSeleccionado,
  onSeleccionarDepto,
  fuenteOficial,
  cargando = false,
}: DepartamentosTableProps) {
  const [columnaOrden, setColumnaOrden] = useState<ColumnaOrden>('valor')
  const [direccionOrden, setDireccionOrden] = useState<DireccionOrden>('desc')

  const handleOrdenar = (columna: ColumnaOrden) => {
    if (columnaOrden === columna) {
      setDireccionOrden((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setColumnaOrden(columna)
      setDireccionOrden(
        columna === 'valor' || columna === 'variacionVs2021' ? 'desc' : 'asc',
      )
    }
  }

  const filasOrdenadas = useMemo(() => {
    const copia = [...filas]
    copia.sort((a, b) => {
      const factor = direccionOrden === 'asc' ? 1 : -1

      if (columnaOrden === 'depto_cod') {
        return a.depto_cod.localeCompare(b.depto_cod) * factor
      }
      if (columnaOrden === 'departamento') {
        return a.departamento.localeCompare(b.departamento, 'es') * factor
      }
      if (columnaOrden === 'valor') {
        const va = a.valor ?? -Infinity
        const vb = b.valor ?? -Infinity
        return (va - vb) * factor
      }
      const va = a.variacionVs2021 ?? -Infinity
      const vb = b.variacionVs2021 ?? -Infinity
      return (va - vb) * factor
    })
    return copia
  }, [filas, columnaOrden, direccionOrden])

  const renderIconoOrden = (columna: ColumnaOrden) => {
    if (columnaOrden !== columna) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
    }
    return direccionOrden === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-[#003876]" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-[#003876]" />
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-[#003876]">
            Desglose territorial · 22 departamentos
          </h2>
          <p className="mt-0.5 text-xs text-[#475569]">
            {meta.nombre} en {anio}. Haz clic en un departamento para visualizar su evolución histórica.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-[#F4F6F8] px-2.5 py-0.5 text-xs font-medium text-[#475569] tabular-nums">
          {filasOrdenadas.length} {filasOrdenadas.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-[#F4F6F8] text-xs font-semibold uppercase tracking-wider text-[#475569]">
              <th scope="col" className="w-24 px-5 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleOrdenar('depto_cod')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-[#003876]"
                >
                  <span>Código</span>
                  {renderIconoOrden('depto_cod')}
                </button>
              </th>
              <th scope="col" className="px-5 py-3">
                <button
                  type="button"
                  onClick={() => handleOrdenar('departamento')}
                  className="inline-flex items-center gap-1.5 hover:text-[#003876]"
                >
                  <span>Departamento</span>
                  {renderIconoOrden('departamento')}
                </button>
              </th>
              <th scope="col" className="px-5 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleOrdenar('valor')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-[#003876]"
                >
                  <span>
                    Valor {anio} ({meta.unidadCorta})
                  </span>
                  {renderIconoOrden('valor')}
                </button>
              </th>
              {meta.agregacion === 'sum' && (
                <th scope="col" className="px-5 py-3 text-right">
                  Participación
                </th>
              )}
              <th scope="col" className="px-5 py-3 text-right">
                <button
                  type="button"
                  onClick={() => handleOrdenar('variacionVs2021')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-[#003876]"
                >
                  <span>Var. vs {ANIO_BASE_COMPARACION}</span>
                  {renderIconoOrden('variacionVs2021')}
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {cargando ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx}>
                  <td colSpan={meta.agregacion === 'sum' ? 5 : 4} className="px-5 py-3.5">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : filasOrdenadas.length === 0 ? (
              <tr>
                <td
                  colSpan={meta.agregacion === 'sum' ? 5 : 4}
                  className="px-5 py-10 text-center text-sm text-[#475569]"
                >
                  No se encontraron departamentos que coincidan con el filtro de búsqueda.
                </td>
              </tr>
            ) : (
              filasOrdenadas.map((fila) => {
                const seleccionado = deptoSeleccionado === fila.depto_cod
                return (
                  <tr
                    key={fila.depto_cod}
                    onClick={() => onSeleccionarDepto(fila.depto_cod)}
                    className={`cursor-pointer transition-colors ${
                      seleccionado
                        ? 'bg-[#007BFF]/[0.06] font-medium'
                        : 'hover:bg-[#F4F6F8]'
                    }`}
                  >
                    <td className="px-5 py-3 text-right text-xs font-medium text-[#475569] tabular-nums">
                      {fila.depto_cod}
                    </td>
                    <td className="px-5 py-3 text-[#003876]">
                      <div className="flex items-center gap-2">
                        {seleccionado && (
                          <span
                            className="h-2 w-2 rounded-full bg-[#007BFF]"
                            aria-hidden="true"
                          />
                        )}
                        <span>{fila.departamento}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-[#003876] tabular-nums">
                      {fila.valor !== null
                        ? formatearValor(fila.valor, meta.decimales)
                        : 'N/D'}
                    </td>
                    {meta.agregacion === 'sum' && (
                      <td className="px-5 py-3 text-right text-[#475569] tabular-nums">
                        {fila.participacionNacional !== null
                          ? `${formatearValor(fila.participacionNacional, 1)}%`
                          : 'N/D'}
                      </td>
                    )}
                    <td className="px-5 py-3 text-right tabular-nums">
                      {anio === ANIO_BASE_COMPARACION ? (
                        <span className="text-xs text-[#475569]">Año base</span>
                      ) : fila.variacionVs2021 === null ? (
                        <span className="text-xs text-[#475569]">N/D</span>
                      ) : (
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            fila.variacionVs2021 > 0
                              ? 'bg-slate-100 text-[#003876]'
                              : fila.variacionVs2021 < 0
                                ? 'bg-[#007BFF]/10 text-[#003876]'
                                : 'bg-slate-100 text-[#475569]'
                          }`}
                        >
                          {formatearVariacion(fila.variacionVs2021)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-slate-200 bg-[#F4F6F8]/60 px-5 py-3 text-[11px] text-[#475569]">
        Fuente oficial: {fuenteOficial || 'INE Guatemala — Estadísticas Vitales y Hechos de Tránsito (2021–2025)'}
      </footer>
    </section>
  )
}
