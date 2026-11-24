import { BarChart3, Sparkles } from 'lucide-react'

export type VistaActiva = 'explorador' | 'consultor'
export type EstadoConexion = 'verificando' | 'conectado' | 'desconectado'

interface NavbarProps {
  vistaActiva: VistaActiva
  onCambiarVista: (vista: VistaActiva) => void
  estadoConexion: EstadoConexion
}

export function Navbar({
  vistaActiva,
  onCambiarVista,
  estadoConexion,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="h-1 w-full bg-[#003876]" />
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        {/* Identidad Institucional */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#003876] text-xs font-extrabold tracking-tight text-white"
              aria-hidden="true"
            >
              INE
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-display text-base font-bold text-[#003876]">
                  INE-DataHub
                </span>
                <span className="rounded-full bg-[#FFD100] px-2 py-0.5 text-[11px] font-semibold text-[#003876] tabular-nums">
                  2021–2025
                </span>
              </div>
              <p className="text-xs text-[#475569]">
                Instituto Nacional de Estadística · Guatemala
              </p>
            </div>
          </div>

          {/* Indicador compacto en móvil */}
          <StatusPill estado={estadoConexion} className="lg:hidden" />
        </div>

        {/* Navegación principal entre vistas */}
        <div className="flex items-center justify-between gap-4">
          <nav
            aria-label="Vistas principales"
            className="inline-flex w-full rounded-lg border border-slate-200 bg-[#F4F6F8] p-1 sm:w-auto"
          >
            <button
              type="button"
              onClick={() => onCambiarVista('explorador')}
              aria-current={vistaActiva === 'explorador' ? 'page' : undefined}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors sm:flex-initial ${
                vistaActiva === 'explorador'
                  ? 'bg-[#003876] text-white'
                  : 'text-[#475569] hover:text-[#003876]'
              }`}
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span>Explorador Territorial</span>
            </button>

            <button
              type="button"
              onClick={() => onCambiarVista('consultor')}
              aria-current={vistaActiva === 'consultor' ? 'page' : undefined}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors sm:flex-initial ${
                vistaActiva === 'consultor'
                  ? 'bg-[#003876] text-white'
                  : 'text-[#475569] hover:text-[#003876]'
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>Consultor IA</span>
            </button>
          </nav>

          <StatusPill estado={estadoConexion} className="hidden lg:inline-flex" />
        </div>
      </div>
    </header>
  )
}

function StatusPill({
  estado,
  className = '',
}: {
  estado: EstadoConexion
  className?: string
}) {
  const config: Record<
    EstadoConexion,
    { dot: string; texto: string; borde: string }
  > = {
    verificando: {
      dot: 'bg-slate-400',
      texto: 'Conectando API',
      borde: 'border-slate-200 text-[#475569]',
    },
    conectado: {
      dot: 'bg-emerald-600',
      texto: 'BD conectada',
      borde: 'border-slate-200 text-[#475569]',
    },
    desconectado: {
      dot: 'bg-amber-500',
      texto: 'API sin conexión',
      borde: 'border-amber-300 bg-amber-50 text-[#003876]',
    },
  }

  const actual = config[estado]

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${actual.borde} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${actual.dot}`} />
      <span>{actual.texto}</span>
    </div>
  )
}
