
const REPORTES_MERCADO = [
  {
    fuente: 'Portal Inmobiliario',
    titulo: 'Informe Trimestral Mercado Residencial Santiago',
    resumen: 'Precios de venta y arriendo por comuna, variación trimestral, oferta disponible y tiempo promedio de venta. Datos de más de 50.000 propiedades publicadas en el portal.',
    url: 'https://www.portalinmobiliario.com/novedades/informes',
    color: '#2563EB',
    frecuencia: 'Trimestral',
  },
  {
    fuente: 'TocToc',
    titulo: 'Reporte de Precios y Tendencias Inmobiliarias',
    resumen: 'Análisis de precios UF/m² por sector, evolución de arriendos y ventas en Santiago. Incluye comparativa entre comunas y proyección de mercado.',
    url: 'https://www.toctoc.com/blog/estadisticas-mercado-inmobiliario',
    color: '#7C3AED',
    frecuencia: 'Trimestral',
  },
  {
    fuente: 'Cámara Chilena de la Construcción',
    titulo: 'Informe MACh – Mercado de Activos y Construcción Habitacional',
    resumen: 'Estadísticas oficiales de permisos de edificación, venta de viviendas nuevas y usadas, tasas hipotecarias y proyecciones del sector para Santiago y regiones.',
    url: 'https://www.cchc.cl/centro-de-informacion/informes/mach',
    color: '#059669',
    frecuencia: 'Trimestral',
  },
  {
    fuente: 'SII – Servicio de Impuestos Internos',
    titulo: 'Estadísticas de Bienes Raíces y Transacciones',
    resumen: 'Datos oficiales de ventas efectivas registradas en el Conservador de Bienes Raíces. Precios reales de transacción (no de oferta) por comuna y tipo de propiedad.',
    url: 'https://www.sii.cl/estadisticas/bienes_raices.htm',
    color: '#D97706',
    frecuencia: 'Anual',
  },
  {
    fuente: 'Banco Central de Chile',
    titulo: 'Índice de Precios de Vivienda (IPV)',
    resumen: 'Evolución trimestral del precio de las viviendas en Chile. Mide cambios reales en el valor de casas y departamentos, separando el efecto de la UF.',
    url: 'https://www.bcentral.cl/web/banco-central/areas/estadisticas/sector-inmobiliario',
    color: '#DC2626',
    frecuencia: 'Trimestral',
  },
];

import React, { useState, useEffect, useCallback } from 'react';
import { getPropiedades, addPropiedad, updatePropiedad, deletePropiedad, loginConGoogle, logout, onUsuarioCambia, esCorreoAutorizado } from './services/firebase';
import { parsearDireccion, buscarEnSII } from './services/sii';

const ESTADOS = [
  { key: 'nuevo',          label: 'Nuevo',          color: '#6B7280' },
  { key: 'contactado',     label: 'Contactado',      color: '#3B82F6' },
  { key: 'reunion',        label: 'Reunión',         color: '#F59E0B' },
  { key: 'representacion', label: 'Representación',  color: '#8B5CF6' },
  { key: 'venta',          label: 'En Venta',        color: '#10B981' },
  { key: 'vendida',        label: 'Vendida',         color: '#059669' },
];

function clp(n) {
  return n ? '$' + new Intl.NumberFormat('es-CL').format(n) : '—';
}

export default function App() {
  const [tab, setTab]             = useState('dashboard');
  const [props, setProps]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [processing, setProc]     = useState(false);
  const [input, setInput]         = useState('');
  const [log, setLog]             = useState([]);
  const [selected, setSelected]   = useState(null);
  const [usuario, setUsuario]       = useState(undefined); // undefined=cargando, null=no auth

  const load = useCallback(async () => {
    setLoading(true);
    try { setProps(await getPropiedades()); }
    catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const unsub = onUsuarioCambia(user => {
      setUsuario(user);
    });
    return unsub;
  }, []);

  // ── métricas ──────────────────────────────
  const m = {
    total:    props.length,
    nuevo:    props.filter(p => p.status === 'nuevo').length,
    contactado: props.filter(p => p.status === 'contactado').length,
    reunion:  props.filter(p => p.status === 'reunion').length,
    rep:      props.filter(p => p.status === 'representacion').length,
    vendida:  props.filter(p => p.status === 'vendida').length,
    seguimiento: props.filter(p => {
      if (p.status !== 'contactado' || !p.fechaContacto) return false;
      const d = p.fechaContacto.toDate ? p.fechaContacto.toDate() : new Date(p.fechaContacto);
      return (Date.now() - d) / 86400000 >= 2;
    }).length
  };

  // ── capturar propiedades ───────────────────
  const capturar = async () => {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setProc(true);
    setLog([]);

    for (let i = 0; i < lines.length; i++) {
      const texto = lines[i];
      const { calle, numero, comuna, codigoComuna } = parsearDireccion(texto);

      setLog(prev => [...prev, { texto, estado: 'buscando', msg: 'Buscando en SII...' }]);

      const sii = await buscarEnSII(calle, numero, codigoComuna);

      const data = {
        direccion: texto,
        calle, numero, comuna,
        rol:           sii?.rol            || null,
        avaluoFiscal:  sii?.avaluoFiscal   || null,
        avaluoAfecto:  sii?.avaluoAfecto   || null,
        direccionSII:  sii?.direccionSII   || null,
        destino:       sii?.destino        || null,
        supTerreno:    sii?.supTerreno     || null,
        supConstruida: sii?.supConstruida  || null,
        rangoSuperficie: sii?.rangoSuperficie || null,
        ubicacion:     sii?.ubicacion      || null,
        periodo:       sii?.periodo        || null,
        arriendoUF:    null,
      };

      try {
        await addPropiedad(data);
        setLog(prev => prev.map((l, idx) => idx === i
          ? { ...l, estado: sii?.rol ? 'ok' : 'warn',
              msg: sii?.rol ? `ROL: ${sii.rol}` : 'Sin ROL en SII' }
          : l));
      } catch {
        setLog(prev => prev.map((l, idx) => idx === i
          ? { ...l, estado: 'error', msg: 'Error al guardar' } : l));
      }

      if (i < lines.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setInput('');
    setProc(false);
    await load();
  };

  const cambiarStatus = async (id, status) => {
    const extra = status === 'contactado' ? { fechaContacto: new Date().toISOString() } : {};
    await updatePropiedad(id, { status, ...extra });
    await load();
    setSelected(s => s?.id === id ? { ...s, status, ...extra } : s);
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta propiedad?')) return;
    await deletePropiedad(id);
    setSelected(null);
    await load();
  };

  // ── RENDER ────────────────────────────────
  // Cargando estado de auth
  if (usuario === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB' }}>
        <div style={{ color: '#9CA3AF', fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  // No autenticado o correo no autorizado
  if (!usuario || !esCorreoAutorizado(usuario.email)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FAFB', padding: 24 }}>
        <div style={{ background: 'white', borderRadius: 16, padding: 40, maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏠</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1E3A5F', marginBottom: 8 }}>BG Propiedades</div>
          <div style={{ fontSize: 14, color: '#6B7280', marginBottom: 32 }}>
            {usuario && !esCorreoAutorizado(usuario.email)
              ? `❌ ${usuario.email} no tiene acceso. Contacta a Andrés.`
              : 'Ingresa con tu cuenta de Google para continuar.'
            }
          </div>
          {usuario && !esCorreoAutorizado(usuario.email) ? (
            <button onClick={() => logout()} style={{ width: '100%', padding: '12px 20px', background: '#6B7280', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Salir y usar otra cuenta
            </button>
          ) : (
            <button onClick={async () => { try { await loginConGoogle(); } catch(e) { console.error(e); } }}
              style={{ width: '100%', padding: '12px 20px', background: '#1E3A5F', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.2 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.8-11.3-7l-6.5 5C9.7 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C40.7 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
              Ingresar con Google
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      {/* HEADER */}
      <header style={S.header}>
        <span style={S.logo}>🏠 BG Propiedades</span>
        <button onClick={() => logout()} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
          Salir
        </button>
      </header>

      {/* NAV */}
      <nav style={S.nav}>
        {[
          { k: 'dashboard', l: 'Inicio' },
          { k: 'capturar',  l: 'Capturar'  },
          { k: 'lista',     l: `Props (${props.length})` },
          { k: 'mercado',   l: 'Mercado' },
        ].map(({ k, l }) => (
          <button key={k} style={{ ...S.navBtn, ...(tab === k ? S.navActive : {}) }}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <main style={S.main}>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            <h2 style={S.h2}>Resumen</h2>
            <div style={S.grid4}>
              <Kpi label="Total"          value={m.total}      />
              <Kpi label="Nuevas"         value={m.nuevo}      color="#6B7280" />
              <Kpi label="Contactadas"    value={m.contactado} color="#3B82F6" />
              <Kpi label="Reuniones"      value={m.reunion}    color="#F59E0B" />
              <Kpi label="Representación" value={m.rep}        color="#8B5CF6" />
              <Kpi label="Vendidas"       value={m.vendida}    color="#059669" />
            </div>

            {m.seguimiento > 0 && (
              <div style={S.alert} onClick={() => setTab('lista')}>
                ⚠️ {m.seguimiento} propiedad{m.seguimiento > 1 ? 'es' : ''} necesita seguimiento
              </div>
            )}

            <h3 style={S.h3}>Conversión</h3>
            <div style={S.grid2}>
              <Conv label="Contactadas → Reuniones"
                val={m.contactado > 0 ? Math.round(m.reunion / m.contactado * 100) : 0} />
              <Conv label="Reuniones → Representación"
                val={m.reunion > 0 ? Math.round(m.rep / m.reunion * 100) : 0} />
            </div>
          </div>
        )}

        {/* ── CAPTURAR ── */}
        {tab === 'capturar' && (
          <div>
            <h2 style={S.h2}>Capturar propiedades</h2>
            <p style={S.desc}>Pega las direcciones desde Portal Inmobiliario, una por línea.</p>
            <p style={S.hint}>Formato: <code>Galicia 3528, Ñuñoa</code></p>

            <textarea
              style={S.textarea}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={"Galicia 3528, Ñuñoa\nDublé Almeyda 5495, Ñuñoa\nFernando Márquez 134, Providencia"}
              rows={6}
              disabled={processing}
            />

            <button style={{ ...S.btnPrimary, opacity: processing || !input.trim() ? 0.5 : 1 }}
              onClick={capturar}
              disabled={processing || !input.trim()}>
              {processing ? 'Buscando datos...' : 'Buscar ROL + Datos automáticamente'}
            </button>

            {log.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {log.map((l, i) => (
                  <div key={i} style={{ ...S.logItem,
                    background: l.estado === 'ok' ? '#ECFDF5' : l.estado === 'error' ? '#FEF2F2' : '#F9FAFB',
                    borderColor: l.estado === 'ok' ? '#A7F3D0' : l.estado === 'error' ? '#FECACA' : '#E5E7EB'
                  }}>
                    <span>{l.estado === 'buscando' ? '⏳' : l.estado === 'ok' ? '✅' : l.estado === 'warn' ? '⚠️' : '❌'}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{l.texto}</div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{l.msg}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LISTA ── */}
        {tab === 'lista' && (
          <div>
            <h2 style={S.h2}>Propiedades</h2>
            {loading ? <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 40 }}>Cargando...</p>
            : props.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 40 }}>🏘️</div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Sin propiedades</div>
                <div style={{ color: '#9CA3AF', marginBottom: 20 }}>Comienza capturando direcciones</div>
                <button style={S.btnPrimary} onClick={() => setTab('capturar')}>Capturar ahora</button>
              </div>
            ) : props.map(p => (
              <PropCard key={p.id} prop={p}
                onOpen={() => setSelected(p)}
                onStatus={cambiarStatus}
              />
            ))}
          </div>
        )}
      </main>

        {/* ── MERCADO ── */}
        {tab === 'mercado' && (
          <div>
            <h2 style={S.h2}>Mercado Inmobiliario</h2>
            <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 20 }}>
              Reportes trimestrales de fuentes oficiales. Actualízate antes de contactar propietarios.
            </p>

            {REPORTES_MERCADO.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration: 'none', display: 'block', marginBottom: 12 }}>
                <div style={{
                  background: 'white', border: '1px solid #E5E7EB',
                  borderLeft: `4px solid ${r.color}`,
                  borderRadius: 10, padding: '14px 16px',
                  transition: 'box-shadow 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{r.fuente}</div>
                    <span style={{ fontSize: 11, background: '#F3F4F6', padding: '2px 8px', borderRadius: 20, color: '#6B7280', whiteSpace: 'nowrap' }}>
                      {r.frecuencia}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4 }}>{r.titulo}</div>
                  <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5, marginBottom: 10 }}>{r.resumen}</div>
                  <div style={{ fontSize: 12, color: r.color, fontWeight: 600 }}>Ver reporte completo →</div>
                </div>
              </a>
            ))}

            <div style={{ marginTop: 24, padding: '14px 16px', background: '#F0FDF4', borderRadius: 10, border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065F46', marginBottom: 4 }}>💡 Tip para Bárbara</div>
              <div style={{ fontSize: 12, color: '#065F46' }}>
                Revisa estos reportes al inicio de cada trimestre. Los datos de precio/m² y tendencias te ayudan a negociar mejor con los propietarios.
              </div>
            </div>
          </div>
        )}

      {/* ── MODAL DETALLE ── */}
      {selected && (
        <div style={S.overlay} onClick={() => setSelected(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{selected.direccion}</span>
              <button style={S.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={S.modalBody}>
              <Row label="ROL"              value={selected.rol} />
              <Row label="Propietario"      value={selected.duenoNombre} />
              <Row label="Teléfono"         value={selected.duenoTelefono} />
              <Row label="Email"            value={selected.duenoEmail} />
              <Row label="Dirección SII"    value={selected.direccionSII} />
              <Row label="Comuna"           value={selected.comuna} />
              <Row label="Destino"          value={selected.destino} />
              <Row label="Ubicación"        value={selected.ubicacion} />
              <Row label="Sup. Terreno"     value={selected.supTerreno ? `${selected.supTerreno} m²` : null} />
              <Row label="Sup. Construida"  value={selected.supConstruida ? `${selected.supConstruida} m²` : null} />
              <Row label="Rango sup. zona"  value={selected.rangoSuperficie ? `${selected.rangoSuperficie} m²` : null} />
              <Row label="Avalúo Total"     value={clp(selected.avaluoFiscal)} />
              <Row label="Avalúo Afecto"    value={clp(selected.avaluoAfecto)} />
              <Row label="Período"          value={selected.periodo} />
              <DuenoEditor prop={selected} onSave={async (datos) => {
                try {
                  await actualizarPropiedad(selected.id, datos);
                  setSelected(prev => ({...prev, ...datos}));
                  await cargarPropiedades();
                } catch(e) { alert('Error guardando: ' + e.message); }
              }} />
              <ArriendoEditor prop={selected} onSave={(uf) => {
                actualizarPropiedad(selected.id, { arriendoUF: uf });
                setSelected({...selected, arriendoUF: uf});
                cargarPropiedades();
              }} />

              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>ESTADO</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ESTADOS.map(e => (
                    <button key={e.key}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12,
                        fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: selected.status === e.key ? e.color : '#F3F4F6',
                        color: selected.status === e.key ? 'white' : '#374151'
                      }}
                      onClick={() => cambiarStatus(selected.id, e.key)}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              <button style={{ ...S.btnDelete, marginTop: 24 }}
                onClick={() => eliminar(selected.id)}>
                Eliminar propiedad
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SUB-COMPONENTES ───────────────────────────

function PropCard({ prop, onOpen, onStatus }) {
  const estado = ESTADOS.find(e => e.key === prop.status) || ESTADOS[0];
  const necesitaSeguimiento = prop.status === 'contactado' && prop.fechaContacto &&
    (Date.now() - new Date(prop.fechaContacto)) / 86400000 >= 2;

  return (
    <div style={{ ...S.card, borderLeft: `4px solid ${necesitaSeguimiento ? '#F59E0B' : estado.color}` }}
      onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', flex: 1, paddingRight: 8 }}>
          {prop.direccion}
        </div>
        <span style={{
          background: estado.color, color: 'white', borderRadius: 20,
          padding: '3px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap'
        }}>{estado.label}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {prop.rol && <Tag color="#EFF6FF" text={`ROL: ${prop.rol}`} />}
        {prop.duenoNombre && <Tag color="#EFF6FF" text={`👤 ${prop.duenoNombre}`} />}
        {prop.destino && <Tag color="#F3F4F6" text={prop.destino} />}
        {prop.supConstruida && <Tag color="#F0FDF4" text={`${prop.supConstruida} m²`} />}
        {prop.avaluoFiscal && <Tag color="#ECFDF5" text={clp(prop.avaluoFiscal)} />}
        {prop.arriendoUF && <Tag color="#FEF3C7" text={`~${prop.arriendoUF} UF/mes`} />}
        {necesitaSeguimiento && <Tag color="#FEF3C7" text="⚠️ Seguimiento" />}
      </div>
    </div>
  );
}

function Tag({ color, text }) {
  return (
    <span style={{ background: color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 }}>
      {text}
    </span>
  );
}

function Kpi({ label, value, color = '#1E3A5F' }) {
  return (
    <div style={S.kpi}>
      <div style={{ fontSize: 32, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Conv({ label, val }) {
  return (
    <div style={S.kpi}>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#3B82F6' }}>{val}%</div>
      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{label}</div>
      <div style={{ height: 4, background: '#E5E7EB', borderRadius: 2, marginTop: 8 }}>
        <div style={{ width: `${val}%`, height: '100%', background: '#3B82F6', borderRadius: 2 }} />
      </div>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0',
      borderBottom: '1px solid #F3F4F6' }}>
      <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{value}</span>
    </div>
  );
}

function DuenoEditor({ prop, onSave }) {
  const [nombre, setNombre] = useState(prop.duenoNombre || '');
  const [telefono, setTelefono] = useState(prop.duenoTelefono || '');
  const [email, setEmail] = useState(prop.duenoEmail || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(prop.fotoUrl || null);

  const guardar = async (datosExtra = {}) => {
    setSaving(true);
    await onSave({ duenoNombre: nombre, duenoTelefono: telefono, duenoEmail: email, ...datosExtra });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const subirEquifax = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProcesando(true);
    try {
      // Leer PDF como base64
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Enviar a API
      const res = await fetch('/api/procesar-equifax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: b64 })
      });
      const datos = await res.json();

      if (datos.error) throw new Error(datos.error);

      // Guardar datos extras en Firebase
      const extra = {};
      if (datos.telefonos?.length > 1) extra.duenoTelefonos = datos.telefonos;
      if (datos.emails?.length > 1) extra.duenoEmails = datos.emails;
      if (datos.superficieConstruida) extra.supConstruida = datos.superficieConstruida;
      if (datos.rut) extra.duenoRut = datos.rut;
      if (datos.sociedades?.length) extra.duenoSociedades = datos.sociedades.join(', ');

      // Actualizar estados locales
      if (datos.propietario) setNombre(datos.propietario);
      if (datos.telefonos?.[0]) setTelefono(datos.telefonos[0]);
      if (datos.emails?.[0]) setEmail(datos.emails[0]);
      
      await onSave({
        duenoNombre: datos.propietario || nombre,
        duenoTelefono: datos.telefonos?.[0] || telefono,
        duenoEmail: datos.emails?.[0] || email,
        ...extra
      });

      alert(`✅ Datos extraídos:
👤 ${datos.propietario || 'N/D'}
📱 ${datos.telefonos?.join(', ') || 'N/D'}
✉️ ${datos.emails?.join(', ') || 'N/D'}${datos.superficieConstruida ? `
📐 ${datos.superficieConstruida} m²` : ''}`);
    } catch(err) {
      alert('Error procesando PDF: ' + err.message);
    } finally {
      setProcesando(false);
    }
  };

  const subirFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setFotoUrl(b64);
      await onSave({ fotoUrl: b64 });
    } catch(err) {
      alert('Error subiendo foto: ' + err.message);
    }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>

      {/* Foto de la propiedad */}
      {fotoUrl && (
        <img src={fotoUrl} alt="Propiedad" style={{ width: '100%', borderRadius: 10, marginBottom: 12, maxHeight: 200, objectFit: 'cover' }} />
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: '1.5px dashed #E5E7EB', borderRadius: 8, fontSize: 12, color: '#6B7280', cursor: 'pointer', background: '#FAFAFA' }}>
          📄 {procesando ? 'Procesando...' : 'Subir Equifax (PDF)'}
          <input type="file" accept=".pdf" onChange={subirEquifax} style={{ display: 'none' }} disabled={procesando} />
        </label>
        <label style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: '1.5px dashed #E5E7EB', borderRadius: 8, fontSize: 12, color: '#6B7280', cursor: 'pointer', background: '#FAFAFA' }}>
          📸 Foto propiedad
          <input type="file" accept="image/*" onChange={subirFoto} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10, fontWeight: 600 }}>DATOS DEL PROPIETARIO</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Nombre</div>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Nombre completo del dueño"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Teléfono</div>
          <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)}
            placeholder="+56 9 XXXX XXXX"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Email</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="correo@ejemplo.com"
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <button onClick={() => guardar()} disabled={saving}
          style={{ padding: '10px', background: saving ? '#9CA3AF' : '#1E3A5F', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
          {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar datos del propietario'}
        </button>
      </div>

      {(prop.duenoNombre || prop.duenoTelefono || prop.duenoEmail) && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: '#EFF6FF', borderRadius: 8, fontSize: 12 }}>
          {prop.duenoNombre && <div>👤 <strong>{prop.duenoNombre}</strong></div>}
          {prop.duenoRut && <div style={{ marginTop: 2 }}>🪪 {prop.duenoRut}</div>}
          {prop.duenoTelefono && <div style={{ marginTop: 2 }}>📱 {prop.duenoTelefono}</div>}
          {prop.duenoEmail && <div style={{ marginTop: 2 }}>✉️ {prop.duenoEmail}</div>}
          {prop.duenoSociedades && <div style={{ marginTop: 2, fontSize: 11, color: '#6B7280' }}>🏢 {prop.duenoSociedades}</div>}
        </div>
      )}
    </div>
  );
}


function ArriendoEditor({ prop, onSave }) {
  const [val, setVal] = useState(prop.arriendoUF || '');
  const [saving, setSaving] = useState(false);
  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>ARRIENDO ESTIMADO (UF/mes)</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder="ej: 25"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14 }}
        />
        <button
          onClick={async () => {
            if (!val) return;
            setSaving(true);
            await onSave(parseFloat(val));
            setSaving(false);
          }}
          style={{ padding: '8px 16px', background: '#1E3A5F', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {saving ? '...' : 'Guardar'}
        </button>
      </div>
      {prop.arriendoUF && (
        <div style={{ marginTop: 6, fontSize: 13, color: '#059669', fontWeight: 600 }}>
          ✓ {prop.arriendoUF} UF/mes registrado
        </div>
      )}
    </div>
  );
}

// ── ESTILOS ───────────────────────────────────
const S = {
  app: { minHeight: '100vh', background: '#F9FAFB', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 480, margin: '0 auto' },
  header: { background: '#1E3A5F', padding: '14px 20px', position: 'sticky', top: 0, zIndex: 10 },
  logo: { color: 'white', fontWeight: 700, fontSize: 17 },
  nav: { display: 'flex', background: 'white', borderBottom: '1px solid #E5E7EB', padding: '0 4px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' },
  navBtn: { flex: '0 0 auto', padding: '12px 14px', background: 'none', border: 'none', fontSize: 13, fontWeight: 500, color: '#6B7280', cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
  navActive: { color: '#1E3A5F', borderBottomColor: '#1E3A5F' },
  main: { padding: '20px 16px', paddingBottom: 40 },
  h2: { fontSize: 20, fontWeight: 700, color: '#1E3A5F', margin: '0 0 16px' },
  h3: { fontSize: 15, fontWeight: 600, color: '#374151', margin: '20px 0 12px' },
  grid4: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  kpi: { background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px' },
  alert: { background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', marginTop: 12, fontSize: 13, fontWeight: 600, color: '#92400E', cursor: 'pointer' },
  desc: { color: '#6B7280', fontSize: 14, marginBottom: 4 },
  hint: { color: '#9CA3AF', fontSize: 12, marginBottom: 12 },
  textarea: { width: '100%', padding: 12, border: '1px solid #E5E7EB', borderRadius: 10, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: '#F9FAFB' },
  btnPrimary: { display: 'block', width: '100%', marginTop: 12, padding: '13px 20px', background: '#1E3A5F', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  btnDelete: { display: 'block', width: '100%', padding: '11px', background: 'white', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  logItem: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, border: '1px solid', marginBottom: 6 },
  card: { background: 'white', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' },
  empty: { textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 12, border: '1px solid #E5E7EB' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' },
  modal: { background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxHeight: '85vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E5E7EB' },
  modalBody: { padding: '16px 20px 40px' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer' },
};
