
const REPORTES_MERCADO = [
  { fuente: 'GPS Property Research', titulo: 'Informes de Mercado Inmobiliario — Multifamily, Oficinas y Bodegas', resumen: 'Plataforma gratuita con indicadores de vacancia, precios, absorción y pipeline por corredor y comuna. Cubre multifamily, oficinas, parques industriales y bodegas en Chile.', url: 'https://gpsproperty.cl/research', frecuencia: 'Trimestral' },
  { fuente: 'TocToc — InfoInmobiliario', titulo: 'Estudios e Informes del Mercado Inmobiliario', resumen: 'Análisis de precios UF/m², arriendos, ocupación, caprate y tendencias por comuna. Cubre departamentos, casas y edificios multifamily en Santiago.', url: 'https://blog.toctoc.com/category/estudios/infoinmobiliario/', frecuencia: 'Trimestral' },
  { fuente: 'Cámara Chilena de la Construcción', titulo: 'Informe MACh — Mercado de Activos y Construcción', resumen: 'Estadísticas oficiales de permisos de edificación, venta de viviendas nuevas y usadas, tasas hipotecarias y proyecciones del sector construcción.', url: 'https://cchc.cl/centro-de-informacion', frecuencia: 'Trimestral' },
  { fuente: 'SII — Servicio de Impuestos Internos', titulo: 'Estadísticas de Bienes Raíces por Comuna', resumen: 'Datos oficiales de avalúos fiscales, número de predios y contribuciones por destino y comuna a nivel nacional.', url: 'https://www.sii.cl/sobre_el_sii/estadisticas/estadisticas_bienes_raices_por_comuna.html', frecuencia: 'Anual' },
  { fuente: 'Banco Central de Chile', titulo: 'Índice de Precios de Vivienda (IPV)', resumen: 'Evolución trimestral del precio de casas y departamentos basado en transacciones reales del SII. Publicación: enero, abril, julio y octubre.', url: 'https://www.bcentral.cl/web/banco-central/areas/estadisticas/estadisticas-experimentales/ipv#ancla-5', frecuencia: 'Trimestral' },
];

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPropiedades, addPropiedad, updatePropiedad, deletePropiedad, loginConGoogle, logout, onUsuarioCambia, esCorreoAutorizado } from './services/firebase';
import { parsearDireccion, buscarEnSII } from './services/sii';

// ── Paleta BG ─────────────────────────────────
const C = {
  navy:    '#1E2761',
  navyDk:  '#151d4a',
  gold:    '#C9973A',
  goldLt:  '#f0c875',
  bg:      '#F4F5F7',
  white:   '#FFFFFF',
  border:  '#E2E4E9',
  text:    '#1A1D2E',
  textMd:  '#4A4F6A',
  textSm:  '#8890A8',
  success: '#0E7C5B',
  warn:    '#C9973A',
  danger:  '#C0392B',
  blue:    '#2563EB',
};

const ESTADOS = [
  { key: 'nuevo',          label: 'Nuevo',          color: C.textSm  },
  { key: 'contactado',     label: 'Contactado',      color: C.blue    },
  { key: 'reunion',        label: 'Reunión',         color: C.gold    },
  { key: 'representacion', label: 'Representación',  color: '#7C3AED' },
  { key: 'venta',          label: 'En Venta',        color: C.success },
  { key: 'vendida',        label: 'Vendida',         color: '#065F46' },
];

const COMUNAS = ['Ñuñoa','Providencia','Las Condes','Santiago','Vitacura','La Reina','Macul','La Florida','Maipú','San Miguel','Peñalolén','Lo Barnechea'];

// Normaliza texto para búsqueda sin tildes ni mayúsculas
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function clp(n) {
  return n ? '$' + new Intl.NumberFormat('es-CL').format(n) : '—';
}

const PAGE_SIZE = 5;

export default function App() {
  const [tab, setTab]           = useState('dashboard');
  const [props, setProps]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [processing, setProc]   = useState(false);
  const [input, setInput]       = useState('');
  const [log, setLog]           = useState([]);
  const [selected, setSelected] = useState(null);
  const [usuario, setUsuario]   = useState(undefined);
  const [busqueda, setBusqueda] = useState('');
  const [filtroComuna, setFiltroComuna] = useState('');
  const [pagina, setPagina]     = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProps(await getPropiedades()); }
    catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const unsub = onUsuarioCambia(u => setUsuario(u));
    return unsub;
  }, []);

  // ── métricas ──────────────────────────────
  const ORDEN_PIPELINE = ['nuevo','contactado','reunion','representacion','venta','vendida'];
  const etapaIdx = s => ORDEN_PIPELINE.indexOf(s);
  const m = useMemo(() => ({
    total:      props.length,
    nuevo:      props.filter(p => p.status === 'nuevo').length,
    contactado: props.filter(p => p.status === 'contactado').length,
    reunion:    props.filter(p => p.status === 'reunion').length,
    rep:        props.filter(p => p.status === 'representacion').length,
    vendida:    props.filter(p => p.status === 'vendida').length,
    seguimiento: props.filter(p => {
      if (p.status !== 'contactado' || !p.fechaContacto) return false;
      const d = p.fechaContacto.toDate ? p.fechaContacto.toDate() : new Date(p.fechaContacto);
      return (Date.now() - d) / 86400000 >= 2;
    }).length,
    llegaron: {
      contactado:     props.filter(p => etapaIdx(p.status) >= etapaIdx('contactado')).length,
      reunion:        props.filter(p => etapaIdx(p.status) >= etapaIdx('reunion')).length,
      representacion: props.filter(p => etapaIdx(p.status) >= etapaIdx('representacion')).length,
    },
  }), [props]);

  // ── filtrado + paginación ─────────────────
  const propsFiltradas = useMemo(() => {
    const q = norm(busqueda);
    return props.filter(p => {
      const matchQ = !q ||
        norm(p.direccion).includes(q) ||
        norm(p.comuna).includes(q) ||
        norm(p.duenoNombre).includes(q) ||
        norm(p.rol).includes(q);
      const matchC = !filtroComuna || norm(p.comuna).includes(norm(filtroComuna));
      return matchQ && matchC;
    });
  }, [props, busqueda, filtroComuna]);

  const totalPaginas = Math.max(1, Math.ceil(propsFiltradas.length / PAGE_SIZE));
  const propsEnPagina = propsFiltradas.slice((pagina - 1) * PAGE_SIZE, pagina * PAGE_SIZE);

  useEffect(() => { setPagina(1); }, [busqueda, filtroComuna]);

  // ── acciones ──────────────────────────────
  const capturar = async () => {
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setProc(true); setLog([]);
    for (let i = 0; i < lines.length; i++) {
      const texto = lines[i];
      const { calle, numero, comuna, codigoComuna } = parsearDireccion(texto);
      setLog(prev => [...prev, { texto, estado: 'buscando', msg: 'Consultando SII...' }]);
      const sii = await buscarEnSII(calle, numero, codigoComuna);
      const data = { direccion: texto, calle, numero, comuna, rol: sii?.rol||null, avaluoFiscal: sii?.avaluoFiscal||null, avaluoAfecto: sii?.avaluoAfecto||null, direccionSII: sii?.direccionSII||null, destino: sii?.destino||null, supTerreno: sii?.supTerreno||null, supConstruida: sii?.supConstruida||null, rangoSuperficie: sii?.rangoSuperficie||null, ubicacion: sii?.ubicacion||null, periodo: sii?.periodo||null, arriendoUF: null };
      try {
        const docId = await addPropiedad(data);
        if (!sii?.rol) {
          // Sin ROL: guardar igual y mostrar opción para ingresarlo manualmente
          setLog(prev => prev.map((l, idx) => idx === i ? { ...l, estado: 'warn', msg: 'Sin ROL en SII', sinRol: true, propiedadId: docId, comuna } : l));
        } else {
          setLog(prev => prev.map((l, idx) => idx === i ? { ...l, estado: 'ok', msg: `ROL: ${sii.rol}` } : l));
        }
      } catch {
        setLog(prev => prev.map((l, idx) => idx === i ? { ...l, estado: 'error', msg: 'Error al guardar' } : l));
      }
      if (i < lines.length - 1) await new Promise(r => setTimeout(r, 800));
    }
    setInput(''); setProc(false); await load();
  };

  const buscarPorRol = async (logIdx, propiedadId, rolInput, comuna, direccion) => {
    setLog(prev => prev.map((l, i) => i === logIdx ? { ...l, estado: 'buscando', msg: 'Consultando SII...' } : l));
    try {
      let sii = null;

      // Intento 1: buscar por manzana-predio si viene en ese formato
      if (rolInput.match(/^\d+-\d+$/)) {
        const params = new URLSearchParams({ rol: rolInput, comuna });
        const res = await fetch(`/api/buscar-rol?${params}`);
        const data = await res.json();
        if (data?.rol) sii = data;
      }

      // Intento 2: si falló o tiene formato distinto, re-buscar por dirección
      // con variantes adicionales (FDO, sin artículos, etc.)
      if (!sii && direccion) {
        const { calle, numero, codigoComuna } = parsearDireccion(direccion + ', ' + comuna);
        const params2 = new URLSearchParams({ calle, numero: numero || '', comuna });
        const res2 = await fetch(`/api/buscar-rol?${params2}`);
        const data2 = await res2.json();
        if (data2?.rol) sii = data2;
      }

      // Intento 3: usar el ROL como texto para guardarlo aunque no tengamos datos SII
      if (!sii) {
        // Guardar el ROL manualmente sin datos adicionales del SII
        await updatePropiedad(propiedadId, { rol: rolInput });
        setLog(prev => prev.map((l, i) => i === logIdx ? { 
          ...l, estado: 'warn', 
          msg: `ROL ${rolInput} guardado manualmente (SII no retornó datos adicionales)`,
          sinRol: false 
        } : l));
        await load();
        return;
      }

      await updatePropiedad(propiedadId, {
        rol: sii.rol,
        avaluoFiscal: sii.avaluoFiscal || null,
        avaluoAfecto: sii.avaluoAfecto || null,
        direccionSII: sii.direccionSII || null,
        destino: sii.destino || null,
        supTerreno: sii.supTerreno || null,
        supConstruida: sii.supConstruida || null,
        rangoSuperficie: sii.rangoSuperficie || null,
        ubicacion: sii.ubicacion || null,
        periodo: sii.periodo || null,
      });
      setLog(prev => prev.map((l, i) => i === logIdx ? { ...l, estado: 'ok', msg: `ROL ${sii.rol} — datos SII actualizados`, sinRol: false } : l));
      await load();
    } catch(e) {
      setLog(prev => prev.map((l, i) => i === logIdx ? { ...l, estado: 'error', msg: 'Error: ' + e.message } : l));
    }
  };

  const cambiarStatus = async (id, status) => {
    const extra = status === 'contactado' ? { fechaContacto: new Date().toISOString() } : {};
    await updatePropiedad(id, { status, ...extra });
    await load();
    setSelected(s => s?.id === id ? { ...s, status, ...extra } : s);
  };

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar esta propiedad?')) return;
    await deletePropiedad(id); setSelected(null); await load();
  };

  // ── RENDER ────────────────────────────────
  if (usuario === undefined) {
    return <div style={S.splash}><div style={S.splashSpinner} /></div>;
  }

  if (!usuario || !esCorreoAutorizado(usuario.email)) {
    return (
      <div style={S.splash}>
        <div style={S.loginCard}>
          <div style={S.loginLogo}>BG</div>
          <div style={S.loginTitle}>BG Propiedades CRM</div>
          <div style={S.loginSub}>
            {usuario && !esCorreoAutorizado(usuario.email)
              ? `${usuario.email} no tiene acceso. Contacta al administrador.`
              : 'Accede con tu cuenta Google autorizada.'}
          </div>
          {usuario && !esCorreoAutorizado(usuario.email) ? (
            <button style={S.btnSecondary} onClick={() => logout()}>Usar otra cuenta</button>
          ) : (
            <button style={S.btnPrimary} onClick={async () => { try { await loginConGoogle(); } catch(e) { console.error(e); } }}>
              <GoogleIcon /> Ingresar con Google
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
        <div style={S.headerBrand}>
          <div style={S.headerLogo}>BG</div>
          <div>
            <div style={S.headerTitle}>BG Propiedades</div>
            <div style={S.headerSub}>CRM Inmobiliario</div>
          </div>
        </div>
        <button onClick={() => logout()} style={S.btnLogout}>Cerrar sesión</button>
      </header>

      {/* NAV */}
      <nav style={S.nav}>
        {[
          { k: 'dashboard', l: 'Inicio'         },
          { k: 'capturar',  l: 'Capturar'        },
          { k: 'lista',     l: `Ingresos (${props.length})` },
          { k: 'mercado',   l: 'Estudio Mercado' },
        ].map(({ k, l }) => (
          <button key={k} style={{ ...S.navBtn, ...(tab === k ? S.navActive : {}) }}
            onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <main style={S.main}>

        {/* ── DASHBOARD ── */}
        {tab === 'dashboard' && (
          <div>
            <div style={S.pageHeader}>
              <h2 style={S.h2}>Resumen del pipeline</h2>
              <div style={S.pageHeaderSub}>Actualizado en tiempo real</div>
            </div>

            <div style={S.kpiGrid}>
              <KpiCard label="Total ingresadas" value={m.total} accent={C.navy} />
              <KpiCard label="Nuevas"            value={m.nuevo} accent={C.textSm} />
              <KpiCard label="Contactadas"       value={m.contactado} accent={C.blue} />
              <KpiCard label="Reuniones"         value={m.reunion}    accent={C.gold} />
              <KpiCard label="Representación"    value={m.rep}        accent="#7C3AED" />
              <KpiCard label="Vendidas"          value={m.vendida}    accent={C.success} />
            </div>

            {m.seguimiento > 0 && (
              <div style={S.alertCard} onClick={() => setTab('lista')}>
                <div style={S.alertDot} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Seguimiento requerido</div>
                  <div style={{ fontSize: 12, marginTop: 2, color: C.textMd }}>{m.seguimiento} propiedad{m.seguimiento > 1 ? 'es' : ''} llevan más de 2 días en "Contactado"</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 13, color: C.gold }}>Ver →</div>
              </div>
            )}

            <div style={S.sectionTitle}>Tasa de conversión</div>
            <div style={S.convGrid}>
              <ConvCard
                label="Contactadas → Reuniones"
                val={m.llegaron.contactado > 0 ? Math.round(m.llegaron.reunion / m.llegaron.contactado * 100) : 0}
                color={C.gold}
              />
              <ConvCard
                label="Reuniones → Representación"
                val={m.llegaron.reunion > 0 ? Math.round(m.llegaron.representacion / m.llegaron.reunion * 100) : 0}
                color="#7C3AED"
              />
            </div>

            {/* Mini pipeline visual */}
            <div style={S.sectionTitle}>Pipeline</div>
            <div style={S.pipeline}>
              {ESTADOS.map((e, i) => {
                const count = props.filter(p => p.status === e.key).length;
                return (
                  <div key={e.key} style={S.pipelineStep}>
                    <div style={{ ...S.pipelineDot, background: e.color }} />
                    <div style={S.pipelineCount}>{count}</div>
                    <div style={S.pipelineLabel}>{e.label}</div>
                    {i < ESTADOS.length - 1 && <div style={S.pipelineArrow}>›</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CAPTURAR ── */}
        {tab === 'capturar' && (
          <div>
            <div style={S.pageHeader}>
              <h2 style={S.h2}>Capturar propiedades</h2>
              <div style={S.pageHeaderSub}>ROL y avalúo se obtienen automáticamente del SII</div>
            </div>
            <div style={S.infoBox}>
              Ingresa una dirección por línea. Formato recomendado: <strong>Calle N°, Comuna</strong>
            </div>
            <textarea style={S.textarea} value={input} onChange={e => setInput(e.target.value)}
              placeholder={"Galicia 3528, Ñuñoa\nDublé Almeyda 5495, Ñuñoa\nFernando Márquez 134, Providencia"}
              rows={6} disabled={processing} />
            <button style={{ ...S.btnPrimary, opacity: processing || !input.trim() ? 0.55 : 1, marginTop: 12, width: '100%' }}
              onClick={capturar} disabled={processing || !input.trim()}>
              {processing ? 'Consultando SII...' : 'Obtener ROL y datos automáticamente'}
            </button>
            {log.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {log.map((l, i) => (
                  <div key={i} style={{ ...S.logItem, background: l.estado === 'ok' ? '#EDFAF4' : l.estado === 'error' ? '#FDF2F2' : l.estado === 'warn' ? '#FFFBEB' : C.bg, borderColor: l.estado === 'ok' ? '#A7F3D0' : l.estado === 'error' ? '#FECACA' : l.estado === 'warn' ? '#FCD34D' : C.border }}>
                    <div style={{ ...S.logIcon, background: l.estado === 'ok' ? C.success : l.estado === 'error' ? C.danger : l.estado === 'warn' ? C.gold : C.textSm }}>
                      {l.estado === 'ok' ? '✓' : l.estado === 'error' ? '✕' : l.estado === 'warn' ? '!' : '…'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{l.texto}</div>
                      <div style={{ fontSize: 12, color: C.textMd, marginTop: 2 }}>{l.msg}</div>
                      {l.sinRol && l.propiedadId && (
                        <RolManualInput onBuscar={(rol) => buscarPorRol(i, l.propiedadId, rol, l.comuna, l.texto)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── INGRESOS (lista) ── */}
        {tab === 'lista' && (
          <div>
            <div style={S.pageHeader}>
              <h2 style={S.h2}>Ingresos</h2>
              <div style={S.pageHeaderSub}>{propsFiltradas.length} de {props.length} propiedades</div>
            </div>

            {/* Buscador + filtro comuna */}
            <div style={S.searchRow}>
              <div style={S.searchWrap}>
                <span style={S.searchIcon}>⌕</span>
                <input
                  style={S.searchInput}
                  placeholder="Buscar por dirección, propietario, ROL..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
                {busqueda && <button style={S.searchClear} onClick={() => setBusqueda('')}>✕</button>}
              </div>
              <select style={S.comunaSelect} value={filtroComuna} onChange={e => setFiltroComuna(e.target.value)}>
                <option value="">Todas las comunas</option>
                {COMUNAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {loading ? (
              <div style={S.loadingState}>Cargando propiedades...</div>
            ) : propsFiltradas.length === 0 ? (
              <div style={S.emptyState}>
                <div style={S.emptyIcon}>⊘</div>
                <div style={S.emptyTitle}>{busqueda || filtroComuna ? 'Sin resultados' : 'Sin propiedades'}</div>
                <div style={S.emptyDesc}>{busqueda || filtroComuna ? 'Prueba con otros términos' : 'Comienza capturando direcciones'}</div>
                {!busqueda && !filtroComuna && <button style={{ ...S.btnPrimary, marginTop: 16 }} onClick={() => setTab('capturar')}>Capturar ahora</button>}
              </div>
            ) : (
              <>
                {propsEnPagina.map(p => (
                  <PropCard key={p.id} prop={p} onOpen={() => { setSelected(p); }} onStatus={cambiarStatus} />
                ))}
                {/* Paginador */}
                {totalPaginas > 1 && (
                  <div style={S.paginator}>
                    <button style={{ ...S.pageBtn, opacity: pagina === 1 ? 0.4 : 1 }}
                      onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}>‹ Anterior</button>
                    <span style={S.pageInfo}>{pagina} / {totalPaginas}</span>
                    <button style={{ ...S.pageBtn, opacity: pagina === totalPaginas ? 0.4 : 1 }}
                      onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={pagina === totalPaginas}>Siguiente ›</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ESTUDIO MERCADO ── */}
        {tab === 'mercado' && (
          <div>
            <div style={S.pageHeader}>
              <h2 style={S.h2}>Estudio de Mercado</h2>
              <div style={S.pageHeaderSub}>Fuentes oficiales actualizadas trimestralmente</div>
            </div>
            <div style={S.infoBox}>
              Consulta estos reportes al inicio de cada trimestre para negociar con datos reales de precio/m² y tendencias de mercado.
            </div>
            {REPORTES_MERCADO.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block', marginBottom: 10 }}>
                <div style={S.reportCard}>
                  <div style={S.reportCardHeader}>
                    <div style={S.reportFuente}>{r.fuente}</div>
                    <span style={S.reportBadge}>{r.frecuencia}</span>
                  </div>
                  <div style={S.reportTitulo}>{r.titulo}</div>
                  <div style={S.reportResumen}>{r.resumen}</div>
                  <div style={S.reportLink}>Ver reporte completo →</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>

      {/* ── MODAL FICHA ── */}
      {selected && (
        <div style={S.overlay} onClick={() => setSelected(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div style={S.modalHeader}>
              <div>
                <div style={S.modalTitle}>{selected.direccion}</div>
                <div style={S.modalSub}>{selected.comuna}{selected.rol ? ` · ROL ${selected.rol}` : ''}</div>
              </div>
              <button style={S.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={S.modalBody}>

              {/* Estado del pipeline */}
              <div style={S.fichaSection}>
                <div style={S.fichaSectionTitle}>Estado en pipeline</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ESTADOS.map(e => (
                    <button key={e.key}
                      style={{ ...S.estadoBtn, background: selected.status === e.key ? e.color : 'transparent', color: selected.status === e.key ? 'white' : C.textMd, borderColor: selected.status === e.key ? e.color : C.border }}
                      onClick={() => cambiarStatus(selected.id, e.key)}>
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Datos SII */}
              <div style={S.fichaSection}>
                <div style={S.fichaSectionTitle}>Datos del inmueble · SII</div>
                <div style={S.fichaGrid}>
                  <FichaItem label="ROL"              value={selected.rol} />
                  <FichaItem label="Dirección SII"    value={selected.direccionSII} span />
                  <FichaItem label="Destino"          value={selected.destino} />
                  <FichaItem label="Ubicación"        value={selected.ubicacion} />
                  <FichaItem label="Sup. Terreno"     value={selected.supTerreno ? `${selected.supTerreno} m²` : null} />
                  <FichaItem label="Sup. Construida"  value={selected.supConstruida ? `${selected.supConstruida} m²` : null} />
                  <FichaItem label="Rango zona"       value={selected.rangoSuperficie ? `${selected.rangoSuperficie} m²` : null} />
                  <FichaItem label="Período"          value={selected.periodo} />
                  <FichaItem label="Avalúo Total"     value={clp(selected.avaluoFiscal)} />
                  <FichaItem label="Avalúo Afecto"    value={clp(selected.avaluoAfecto)} />
                </div>
              </div>

              {/* Propietario */}
              <div style={S.fichaSection}>
                <div style={S.fichaSectionTitle}>Propietario</div>
                <DuenoEditor prop={selected} onSave={async (datos) => {
                  try {
                    await updatePropiedad(selected.id, datos);
                    setSelected(prev => ({ ...prev, ...datos }));
                    await load();
                  } catch(e) { alert('Error guardando: ' + e.message); }
                }} />
              </div>

              {/* Arriendo */}
              <div style={S.fichaSection}>
                <div style={S.fichaSectionTitle}>Arriendo estimado</div>
                <ArriendoEditor prop={selected} onSave={(uf) => {
                  updatePropiedad(selected.id, { arriendoUF: uf });
                  setSelected({ ...selected, arriendoUF: uf });
                  load();
                }} />
              </div>

              {/* Eliminar */}
              <button style={S.btnDanger} onClick={() => eliminar(selected.id)}>
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
    <div style={{ ...S.propCard, borderLeft: `3px solid ${necesitaSeguimiento ? C.gold : estado.color}` }} onClick={onOpen}>
      <div style={S.propCardTop}>
        <div style={S.propCardDir}>{prop.direccion}</div>
        <span style={{ ...S.estadoPill, background: estado.color }}>{estado.label}</span>
      </div>
      <div style={S.propCardMeta}>
        {prop.comuna    && <span style={S.metaChip}>{prop.comuna}</span>}
        {prop.rol       && <span style={S.metaChip}>ROL {prop.rol}</span>}
        {prop.destino   && <span style={S.metaChip}>{prop.destino}</span>}
        {prop.avaluoFiscal && <span style={S.metaChip}>{clp(prop.avaluoFiscal)}</span>}
        {prop.arriendoUF   && <span style={{ ...S.metaChip, background: '#FEF3C7', color: '#92400E' }}>{prop.arriendoUF} UF/mes</span>}
        {necesitaSeguimiento && <span style={{ ...S.metaChip, background: '#FEF3C7', color: '#92400E' }}>Requiere seguimiento</span>}
      </div>
      {prop.duenoNombre && (
        <div style={S.propCardDueno}>{prop.duenoNombre}</div>
      )}
    </div>
  );
}

function FichaItem({ label, value, span }) {
  if (!value) return null;
  return (
    <div style={{ ...(span ? { gridColumn: '1 / -1' } : {}) }}>
      <div style={S.fichaItemLabel}>{label}</div>
      <div style={S.fichaItemValue}>{value}</div>
    </div>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <div style={S.kpiCard}>
      <div style={{ ...S.kpiValue, color: accent }}>{value}</div>
      <div style={S.kpiLabel}>{label}</div>
      <div style={{ ...S.kpiBar, background: accent + '22' }}>
        <div style={{ ...S.kpiBarFill, background: accent }} />
      </div>
    </div>
  );
}

function ConvCard({ label, val, color }) {
  return (
    <div style={S.convCard}>
      <div style={{ ...S.convVal, color }}>{val}%</div>
      <div style={S.convLabel}>{label}</div>
      <div style={S.convTrack}>
        <div style={{ ...S.convFill, width: `${Math.min(val, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function DuenoEditor({ prop, onSave }) {
  const [nombre,    setNombre]    = useState(prop.duenoNombre    || '');
  const [telefono,  setTelefono]  = useState(prop.duenoTelefono  || '');
  const [email,     setEmail]     = useState(prop.duenoEmail     || '');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [fotoUrl,   setFotoUrl]   = useState(prop.fotoUrl || null);

  const guardar = async (datosExtra = {}) => {
    setSaving(true);
    await onSave({ duenoNombre: nombre, duenoTelefono: telefono, duenoEmail: email, fotoUrl, ...datosExtra });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const subirEquifax = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProcesando(true);
    try {
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/procesar-equifax', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: b64 })
      });
      const datos = await res.json();
      if (datos.error) throw new Error(datos.error);

      const telefonos = Array.isArray(datos.telefonos) ? datos.telefonos.filter(Boolean) : [];
      const emails    = Array.isArray(datos.emails)    ? datos.emails.filter(Boolean)    : [];

      if (datos.propietario) setNombre(datos.propietario);
      if (telefonos[0])      setTelefono(telefonos[0]);
      if (emails[0])         setEmail(emails[0]);

      await onSave({
        duenoNombre:     datos.propietario  || nombre,
        duenoTelefono:   telefonos[0]       || telefono,
        duenoEmail:      emails[0]          || email,
        duenoTelefonos:  telefonos,
        duenoEmails:     emails,
        duenoRut:        datos.rut          || '',
        duenoSociedades: Array.isArray(datos.sociedades) ? datos.sociedades.filter(Boolean).join(', ') : (datos.sociedades || ''),
        supConstruida:   datos.superficieConstruida || null,
      });

      const resumen = [`Propietario: ${datos.propietario||'N/D'}`, `RUT: ${datos.rut||'N/D'}`, `Teléfonos: ${telefonos.join(' | ')||'N/D'}`, `Emails: ${emails.join(' | ')||'N/D'}`].join('\n');
      alert('Datos extraídos del Equifax:\n\n' + resumen);
    } catch(err) {
      alert('Error procesando PDF: ' + err.message);
    } finally { setProcesando(false); }
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
    } catch(err) { alert('Error subiendo foto: ' + err.message); }
  };

  return (
    <div>
      {fotoUrl && <img src={fotoUrl} alt="Propiedad" style={{ width: '100%', borderRadius: 8, marginBottom: 16, maxHeight: 180, objectFit: 'cover' }} />}

      {/* Acciones PDF / Foto */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <label style={S.uploadBtn}>
          {procesando ? 'Procesando...' : 'Importar Equifax (PDF)'}
          <input type="file" accept=".pdf" onChange={subirEquifax} style={{ display: 'none' }} disabled={procesando} />
        </label>
        <label style={S.uploadBtn}>
          Foto propiedad
          <input type="file" accept="image/*" onChange={subirFoto} style={{ display: 'none' }} />
        </label>
      </div>

      {/* Datos extraídos del Equifax ya guardados */}
      {(prop.duenoTelefonos?.length > 1 || prop.duenoEmails?.length > 1 || prop.duenoRut || prop.duenoSociedades) && (
        <div style={S.equifaxPanel}>
          <div style={S.equifaxPanelTitle}>Datos importados del Equifax</div>
          <div style={S.fichaGrid}>
            {prop.duenoRut && <FichaItem label="RUT" value={prop.duenoRut} />}
            {(prop.duenoTelefonos?.length > 0 ? prop.duenoTelefonos : prop.duenoTelefono ? [prop.duenoTelefono] : []).map((t, i) => (
              <div key={i}>
                <div style={S.fichaItemLabel}>{i === 0 ? 'Teléfono' : `Teléfono ${i + 1}`}</div>
                <a href={`tel:${t}`} style={{ ...S.fichaItemValue, color: C.navy, textDecoration: 'none' }}>{t}</a>
              </div>
            ))}
            {(prop.duenoEmails?.length > 0 ? prop.duenoEmails : prop.duenoEmail ? [prop.duenoEmail] : []).map((em, i) => (
              <div key={i}>
                <div style={S.fichaItemLabel}>{i === 0 ? 'Email' : `Email ${i + 1}`}</div>
                <a href={`mailto:${em}`} style={{ ...S.fichaItemValue, color: C.navy, textDecoration: 'none' }}>{em}</a>
              </div>
            ))}
            {prop.supConstruida && <FichaItem label="Sup. construida" value={`${prop.supConstruida} m²`} />}
            {prop.duenoSociedades && <FichaItem label="Sociedades" value={prop.duenoSociedades} span />}
          </div>
        </div>
      )}

      {/* Campos editables */}
      <div style={S.formGrid}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.formLabel}>Nombre del propietario</label>
          <input style={S.formInput} type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" />
        </div>
        <div>
          <label style={S.formLabel}>Teléfono principal</label>
          <input style={S.formInput} type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+56 9 XXXX XXXX" />
        </div>
        <div>
          <label style={S.formLabel}>Email principal</label>
          <input style={S.formInput} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
        </div>
      </div>

      <button onClick={() => guardar()} disabled={saving} style={{ ...S.btnPrimary, marginTop: 12, width: '100%' }}>
        {saving ? 'Guardando...' : saved ? 'Guardado correctamente' : 'Guardar ficha del propietario'}
      </button>
    </div>
  );
}

function ArriendoEditor({ prop, onSave }) {
  const [val, setVal]     = useState(prop.arriendoUF || '');
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" value={val} onChange={e => setVal(e.target.value)} placeholder="ej: 25"
          style={{ ...S.formInput, flex: 1, margin: 0 }} />
        <span style={{ fontSize: 13, color: C.textMd, whiteSpace: 'nowrap' }}>UF / mes</span>
        <button onClick={async () => { if (!val) return; setSaving(true); await onSave(parseFloat(val)); setSaving(false); }}
          style={{ ...S.btnPrimary, padding: '9px 18px', margin: 0, width: 'auto' }}>
          {saving ? '...' : 'Guardar'}
        </button>
      </div>
      {prop.arriendoUF && <div style={{ marginTop: 8, fontSize: 13, color: C.success, fontWeight: 600 }}>Arriendo registrado: {prop.arriendoUF} UF/mes</div>}
    </div>
  );
}

function RolManualInput({ onBuscar }) {
  const [rol, setRol] = React.useState('');
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <input
        style={{ flex: 1, padding: '6px 10px', border: `1px solid ${C.gold}`, borderRadius: 7, fontSize: 12, outline: 'none', color: C.text }}
        placeholder="ROL Propiteq, ej: 387-21"
        value={rol}
        onChange={e => setRol(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && rol && onBuscar(rol)}
      />
      <button
        style={{ padding: '6px 12px', background: C.navy, color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        onClick={() => rol && onBuscar(rol)}
      >
        Buscar por ROL
      </button>
    </div>
  );
}

function GoogleIcon() {
  return <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.2 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.8-11.3-7l-6.5 5C9.7 39.7 16.3 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.2 5.2C40.7 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>;
}

// ── ESTILOS ───────────────────────────────────
const S = {
  // layout
  app:        { minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 520, margin: '0 auto' },
  splash:     { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.navy },
  splashSpinner: { width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' },

  // login
  loginCard:  { background: C.white, borderRadius: 16, padding: '48px 36px', maxWidth: 360, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  loginLogo:  { width: 56, height: 56, background: C.navy, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 22, fontWeight: 800, color: C.gold, letterSpacing: -1 },
  loginTitle: { fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 },
  loginSub:   { fontSize: 13, color: C.textMd, marginBottom: 32, lineHeight: 1.6 },

  // header
  header:     { background: C.navy, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' },
  headerBrand:{ display: 'flex', alignItems: 'center', gap: 12 },
  headerLogo: { width: 36, height: 36, background: C.gold, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: C.navy, letterSpacing: -1 },
  headerTitle:{ fontSize: 15, fontWeight: 700, color: C.white, lineHeight: 1.2 },
  headerSub:  { fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em', textTransform: 'uppercase' },
  btnLogout:  { background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer', fontWeight: 500 },

  // nav
  nav:        { background: C.white, borderBottom: `1px solid ${C.border}`, display: 'flex', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', padding: '0 8px' },
  navBtn:     { flex: '0 0 auto', padding: '13px 14px', background: 'none', border: 'none', fontSize: 13, fontWeight: 500, color: C.textMd, cursor: 'pointer', borderBottom: '2px solid transparent', whiteSpace: 'nowrap', transition: 'color 0.15s' },
  navActive:  { color: C.navy, borderBottomColor: C.gold, fontWeight: 600 },

  // main
  main:       { padding: '20px 16px 60px' },
  pageHeader: { marginBottom: 20 },
  pageHeaderSub: { fontSize: 12, color: C.textSm, marginTop: 3 },
  h2:         { fontSize: 20, fontWeight: 700, color: C.text, margin: 0 },
  sectionTitle: { fontSize: 11, fontWeight: 600, color: C.textSm, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px' },

  // kpi
  kpiGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  kpiCard:    { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' },
  kpiValue:   { fontSize: 34, fontWeight: 800, lineHeight: 1, letterSpacing: -1 },
  kpiLabel:   { fontSize: 11, color: C.textSm, marginTop: 4, fontWeight: 500 },
  kpiBar:     { height: 3, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  kpiBarFill: { height: '100%', width: '30%', borderRadius: 2 },

  // alert
  alertCard:  { display: 'flex', alignItems: 'center', gap: 12, background: '#FFFBEB', border: `1px solid #FCD34D`, borderRadius: 12, padding: '14px 16px', marginTop: 16, cursor: 'pointer' },
  alertDot:   { width: 8, height: 8, background: C.gold, borderRadius: '50%', flexShrink: 0 },

  // conv
  convGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  convCard:   { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' },
  convVal:    { fontSize: 28, fontWeight: 800, letterSpacing: -1 },
  convLabel:  { fontSize: 11, color: C.textSm, marginTop: 4 },
  convTrack:  { height: 4, background: C.border, borderRadius: 2, marginTop: 10, overflow: 'hidden' },
  convFill:   { height: '100%', borderRadius: 2, transition: 'width 0.5s' },

  // pipeline visual
  pipeline:   { display: 'flex', background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px', overflowX: 'auto', gap: 0, alignItems: 'center' },
  pipelineStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', position: 'relative', minWidth: 52 },
  pipelineDot:  { width: 28, height: 28, borderRadius: '50%', marginBottom: 6 },
  pipelineCount:{ fontSize: 15, fontWeight: 700, color: C.text },
  pipelineLabel:{ fontSize: 9, color: C.textSm, textAlign: 'center', marginTop: 2 },
  pipelineArrow:{ position: 'absolute', right: -8, top: 4, fontSize: 18, color: C.border },

  // search
  searchRow:    { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  searchWrap:   { flex: 1, position: 'relative', minWidth: 180 },
  searchIcon:   { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: C.textSm, pointerEvents: 'none' },
  searchInput:  { width: '100%', padding: '10px 36px 10px 36px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, outline: 'none', boxSizing: 'border-box', color: C.text },
  searchClear:  { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: C.textSm, cursor: 'pointer', fontSize: 13, padding: 0 },
  comunaSelect: { padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: 'none', minWidth: 140 },

  // prop card
  propCard:   { background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 8, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s' },
  propCardTop:{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  propCardDir:{ fontWeight: 600, fontSize: 14, color: C.text, flex: 1 },
  propCardMeta: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  propCardDueno: { fontSize: 12, color: C.textMd, marginTop: 6 },
  estadoPill: { color: 'white', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 },
  metaChip:   { background: C.bg, color: C.textMd, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500 },

  // paginator
  paginator:  { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20, padding: '12px 0' },
  pageBtn:    { background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer', color: C.text, fontWeight: 500 },
  pageInfo:   { fontSize: 13, color: C.textMd, fontWeight: 600 },

  // states
  loadingState: { textAlign: 'center', padding: '60px 20px', color: C.textSm, fontSize: 14 },
  emptyState:   { textAlign: 'center', padding: '60px 20px', background: C.white, borderRadius: 12, border: `1px solid ${C.border}` },
  emptyIcon:    { fontSize: 36, color: C.border, marginBottom: 12 },
  emptyTitle:   { fontWeight: 600, fontSize: 16, color: C.text, marginBottom: 6 },
  emptyDesc:    { color: C.textSm, fontSize: 13 },

  // modal
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(10,14,40,0.6)', zIndex: 100, display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(3px)' },
  modal:      { background: C.white, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader:{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.white, zIndex: 1 },
  modalTitle: { fontWeight: 700, fontSize: 16, color: C.text, lineHeight: 1.3 },
  modalSub:   { fontSize: 12, color: C.textSm, marginTop: 4 },
  modalBody:  { padding: '0 0 40px' },
  closeBtn:   { background: C.bg, border: 'none', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.textMd, cursor: 'pointer', flexShrink: 0, marginLeft: 12 },

  // ficha
  fichaSection:     { padding: '16px 20px', borderBottom: `1px solid ${C.border}` },
  fichaSectionTitle:{ fontSize: 10, fontWeight: 700, color: C.textSm, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 },
  fichaGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' },
  fichaItemLabel:   { fontSize: 10, color: C.textSm, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 },
  fichaItemValue:   { fontSize: 13, color: C.text, fontWeight: 500 },

  estadoBtn:  { padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'all 0.15s' },

  // equifax panel
  equifaxPanel:      { background: '#F0F4FF', border: `1px solid #C7D4FF`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 },
  equifaxPanelTitle: { fontSize: 10, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },

  // forms
  formGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' },
  formLabel:  { fontSize: 11, fontWeight: 600, color: C.textSm, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 },
  formInput:  { width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, color: C.text, background: C.white, outline: 'none', boxSizing: 'border-box' },
  uploadBtn:  { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 12px', border: `1px dashed ${C.border}`, borderRadius: 8, fontSize: 12, color: C.textMd, cursor: 'pointer', background: C.bg, fontWeight: 500, textAlign: 'center' },

  // buttons
  btnPrimary:   { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', background: C.navy, color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnSecondary: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '12px 20px', background: 'transparent', color: C.navy, border: `1px solid ${C.navy}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  btnDanger:    { display: 'block', width: 'calc(100% - 40px)', margin: '20px 20px 0', padding: '11px', background: 'transparent', color: C.danger, border: `1px solid #FECACA`, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' },

  // infobox
  infoBox:    { background: '#EFF3FF', border: `1px solid #C7D4FF`, borderRadius: 10, padding: '12px 16px', fontSize: 13, color: C.navy, marginBottom: 16, lineHeight: 1.6 },

  // log
  logItem:    { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', borderRadius: 10, border: '1px solid', marginBottom: 8 },
  logIcon:    { width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 },

  // textarea
  textarea:   { width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box', background: C.white, color: C.text, outline: 'none' },

  // reports
  reportCard:       { background: C.white, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 12, padding: '16px 18px', transition: 'box-shadow 0.15s' },
  reportCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reportFuente:     { fontWeight: 700, fontSize: 13, color: C.text },
  reportBadge:      { fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 20, color: C.textSm, fontWeight: 600 },
  reportTitulo:     { fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 6 },
  reportResumen:    { fontSize: 12, color: C.textMd, lineHeight: 1.6, marginBottom: 10 },
  reportLink:       { fontSize: 12, color: C.navy, fontWeight: 600 },
};
