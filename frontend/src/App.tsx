import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import {
  Navbar,
  type EstadoConexion,
  type VistaActiva,
} from './components/Navbar'
import { ConsultorIA } from './views/ConsultorIA'
import { ExploradorTerritorial } from './views/ExploradorTerritorial'

export function App() {
  const [vistaActiva, setVistaActiva] = useState<VistaActiva>('explorador')
  const [estadoConexion, setEstadoConexion] =
    useState<EstadoConexion>('verificando')

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal)
      .then((res) => {
        setEstadoConexion(
          res.status === 'ok' && res.database === 'connected'
            ? 'conectado'
            : 'desconectado',
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEstadoConexion('desconectado')
        }
      })

    return () => controller.abort()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-white text-[#003876]">
      <Navbar
        vistaActiva={vistaActiva}
        onCambiarVista={setVistaActiva}
        estadoConexion={estadoConexion}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {vistaActiva === 'explorador' ? (
          <ExploradorTerritorial />
        ) : (
          <ConsultorIA />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-[#F4F6F8]">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-[#475569] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            INE-DataHub · Plataforma Analítica de Estadísticas Vitales y Hechos de Tránsito (2021–2025)
          </p>
          <p>Fuente oficial: Instituto Nacional de Estadística (INE) Guatemala</p>
        </div>
      </footer>
    </div>
  )
}

export default App
