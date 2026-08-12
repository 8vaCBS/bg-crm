
const https = require('https');
const COMUNAS_CHILE = require('./comunas-chile');

// Mapa de palabras clave → región
const KEYWORDS_REGION = {
  rm: ['santiago','nunoa','providencia','las condes','vitacura','maipu','la florida','macul','penalolen','la reina','san miguel','lo barnechea','recoleta','independencia','estacion central','huechuraba','pudahuel','quilicura','conchali','renca','la cisterna','la granja','lo espejo','lo prado','san joaquin','san ramon','pedro aguirre cerda','cerrillos','el bosque','la pintana','san bernardo','puente alto','buin','colina','lampa','melipilla','talagante'],
  valparaiso: ['valparaiso','vina del mar','quilpue','villa alemana','san antonio','quillota','san felipe','los andes','casablanca','concon','limache','olmue','cartagena','el quisco','algarrobo','vina'],
  biobio: ['concepcion','talcahuano','chiguayante','hualpen','san pedro de la paz','coronel','lota','penco','tome','los angeles','chillan'],
  araucania: ['temuco','padre las casas','villarrica','pucon','angol'],
  loslagos: ['puerto montt','puerto varas','osorno','castro','ancud'],
  coquimbo: ['la serena','coquimbo','ovalle','illapel'],
  maule: ['talca','curico','linares','constitucion'],
  ohiggins: ['rancagua','san fernando','pichilemu'],
  antofagasta: ['antofagasta','calama','tocopilla'],
  atacama: ['copiapo','vallenar'],
  tarapaca: ['iquique','alto hospicio'],
  arica: ['arica'],
  losrios: ['valdivia','la union'],
  aysen: ['coyhaique'],
  magallanes: ['punta arenas'],
};

function detectarRegion(texto) {
  const t = (texto||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (const [region, keywords] of Object.entries(KEYWORDS_REGION)) {
    if (keywords.some(k => t.includes(k))) return region;
  }
  return null;
}

function getComunasParaRegion(region) {
  return COMUNAS_CHILE[region] || COMUNAS_CHILE.rm;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { calle, numero, comuna, rol: rolDirecto, manzana: manzanaElegida, predio: predioElegido, textoOriginal } = req.query;

  function norm(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const r = https.get(url, { headers: hdrs || {} }, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8'), cookies: resp.headers['set-cookie'] || [] }));
      });
      r.on('error', reject);
      r.setTimeout(12000, () => { r.destroy(); reject(new Error('timeout')); });
    });
  }

  async function fetchPost(hostname, path, payload, hdrs) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const r = https.request({ hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...hdrs }
      }, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({ status: resp.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      r.on('error', reject);
      r.setTimeout(12000, () => { r.destroy(); reject(new Error('timeout')); });
      r.write(body); r.end();
    });
  }

  // Mapa SII: nombre → código interno
  const COMUNAS = {
    'nunoa': '15105', 'providencia': '15123', 'las condes': '15114',
    'penalolen': '15121', 'santiago': '15101', 'vitacura': '15132',
    'la reina': '15113', 'macul': '15118', 'san miguel': '15126',
    'la florida': '15110', 'maipu': '15119', 'huechuraba': '15108',
    'independencia': '15109', 'recoleta': '15125', 'lo barnechea': '15116',
    'estacion central': '15106', 'cerrillos': '15102', 'pudahuel': '15124',
    'quilicura': '15120', 'renca': '15127', 'conchali': '15103',
    'la cisterna': '15111', 'la granja': '15112', 'lo espejo': '15117',
    'lo prado': '15115', 'pedro aguirre cerda': '15122',
    'san joaquin': '15128', 'san ramon': '15129',
    'peñalolen': '15121', 'maipú': '15119', 'ñuñoa': '15105',
  };

  // Para búsqueda sin comuna: intentar estas en orden de frecuencia
  const COMUNAS_RM = [
    { nombre: 'ÑUÑOA',            codigo: '15105' },
    { nombre: 'PROVIDENCIA',      codigo: '15123' },
    { nombre: 'LAS CONDES',       codigo: '15114' },
    { nombre: 'SANTIAGO',         codigo: '15101' },
    { nombre: 'LA FLORIDA',       codigo: '15110' },
    { nombre: 'MACUL',            codigo: '15118' },
    { nombre: 'PEÑALOLÉN',        codigo: '15121' },
    { nombre: 'LA REINA',         codigo: '15113' },
    { nombre: 'VITACURA',         codigo: '15132' },
    { nombre: 'MAIPÚ',            codigo: '15119' },
    { nombre: 'SAN MIGUEL',       codigo: '15126' },
    { nombre: 'LO BARNECHEA',     codigo: '15116' },
    { nombre: 'RECOLETA',         codigo: '15125' },
    { nombre: 'INDEPENDENCIA',    codigo: '15109' },
    { nombre: 'ESTACIÓN CENTRAL', codigo: '15106' },
    { nombre: 'HUECHURABA',       codigo: '15108' },
    { nombre: 'PUDAHUEL',         codigo: '15124' },
    { nombre: 'QUILICURA',        codigo: '15120' },
    { nombre: 'CONCHALI',         codigo: '15103' },
    { nombre: 'RENCA',            codigo: '15127' },
  ];

  try {
    // ── Sesión SII ─────────────────────────────────────────────────────────
    const sessionRes = await fetchGet('https://www4.sii.cl/mapasui/internet/index.html',
      { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'es-419,es;q=0.9' }
    );
    const cookies = sessionRes.cookies.map(c => c.split(';')[0]).join('; ');
    const H = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-419,es;q=0.9',
      'Cache-Control': 'no-cache',
      'Cookie': cookies,
      'Origin': 'https://www4.sii.cl',
      'Referer': 'https://www4.sii.cl/mapasui/internet/index.html',
      'User-Agent': UA,
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    };

    // Función reutilizable: obtener datos completos de un predio (manzana, predio, comuna)
    async function getDatosPredio(codigoComuna, manzana, predioNum) {
      const r2 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPredioNacional',
        { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
        }, H
      );
      const d = JSON.parse(r2.body)?.data || {};
      if (!d.rol) return null;

      // Superficie
      let supTerreno = null, supConstruida = null;
      if (d.predioPublicado?.id) {
        try {
          const r4 = await fetchPost('www4.sii.cl',
            '/mapasui/services/data/mapasFacadeService/getPredioPublicado',
            { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioPublicado", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
              data: { idPredioPublicado: d.predioPublicado.id, servicios: [] }
            }, H
          );
          const dp = JSON.parse(r4.body)?.data;
          if (dp) {
            supTerreno    = dp.supTerreno  > 0 ? dp.supTerreno  : null;
            supConstruida = dp.supConsMt2  > 0 ? dp.supConsMt2  : dp.supConstruida > 0 ? dp.supConstruida : null;
          }
        } catch(e) {}
      }

      return {
        rol: d.rol, manzana, predio: predioNum,
        avaluoFiscal: d.valorTotal || null,
        avaluoAfecto: d.valorAfecto || null,
        direccionSII: (d.direccion || '').trim(),
        destino: d.destinoDescripcion || null,
        ubicacion: d.ubicacion || null,
        supTerreno, supConstruida,
        rangoSuperficie: d.datosAh?.rangoSuperficie?.trim() || null,
        periodo: d.periodo || null,
      };
    }

    // Función: buscar predios por calle+numero en una comuna
    async function buscarEnComuna(codigoComuna, nombreComuna, calleVariante, num) {
      const r1 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
        { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { rolDireccion: { comuna: codigoComuna, nombreComuna, calle: calleVariante, numeroCalleStr: num || '', detalle: 0 }, servicios: [] }
        }, H
      );
      return JSON.parse(r1.body)?.data || [];
    }

    // ── MODO A: ROL directo ────────────────────────────────────────────────
    if (rolDirecto) {
      const partes = rolDirecto.split('-');
      if (partes.length !== 2) return res.status(400).json({ error: 'Formato: MANZANA-PREDIO (ej: 387-21)' });
      const manzana = parseInt(partes[0]);
      const predioNum = parseInt(partes[1]);

      // Probar con la comuna dada, o con todas si no hay
      const comunasAProbar = comuna
        ? [{ nombre: comuna.toUpperCase(), codigo: COMUNAS[norm(comuna)] || '15105' }]
        : COMUNAS_RM.slice(0, 8);

      for (const c of comunasAProbar) {
        const datos = await getDatosPredio(c.codigo, manzana, predioNum);
        if (datos) return res.status(200).json(datos);
      }
      return res.status(200).json({ rol: rolDirecto, rolSoloManual: true });
    }

    // ── MODO C: Manzana+predio elegido por usuario ─────────────────────────
    if (manzanaElegida && predioElegido) {
      const codigoComuna = COMUNAS[norm(comuna || 'nunoa')] || '15105';
      const datos = await getDatosPredio(codigoComuna, parseInt(manzanaElegida), parseInt(predioElegido));
      if (datos) return res.status(200).json(datos);
      return res.status(200).json({ rol: null, error: 'Predio no encontrado' });
    }

    // ── MODO B: Búsqueda por dirección ────────────────────────────────────
    if (!calle) return res.status(400).json({ error: 'Falta la calle' });

    // Variantes de calle: original + sin tildes
    const calleNorm = calle.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const variantesCalle = [...new Set([calle.trim(), calleNorm])];

    // Variantes de número: con y sin cero inicial
    const numerosVariantes = [numero || ''];
    if (numero && numero.length <= 3 && !numero.startsWith('0')) numerosVariantes.push('0' + numero);
    if (numero && numero.startsWith('0')) numerosVariantes.push(numero.slice(1));

    // Comunas a buscar: la dada, o las de la región detectada en el texto, o todas las de la RM
    let comunasABuscar;
    if (comuna && COMUNAS[norm(comuna)]) {
      // Comuna explícita → buscar solo ahí
      comunasABuscar = [{ nombre: comuna.toUpperCase(), codigo: COMUNAS[norm(comuna)] }];
    } else {
      // Sin comuna → detectar región por el texto completo de la dirección
      const textoCompleto = textoOriginal || [calle, numero, comuna].filter(Boolean).join(' ');
      const region = detectarRegion(textoCompleto);
      comunasABuscar = getComunasParaRegion(region || 'rm');
    }

    let prediosEncontrados = [];
    let comunaEncontrada = null;

    outer:
    for (const c of comunasABuscar) {
      for (const variante of variantesCalle) {
        for (const num of numerosVariantes) {
          const predios = await buscarEnComuna(c.codigo, c.nombre, variante, num);
          if (predios.length > 0) {
            prediosEncontrados = predios;
            comunaEncontrada = c;
            break outer;
          }
        }
      }
    }

    if (!prediosEncontrados.length) return res.status(200).json({ rol: null, error: 'Sin resultados en SII' });

    // Si hay destinos claramente distintos → mostrar selector
    if (prediosEncontrados.length > 1) {
      const DESTINOS_RELEVANTES = ['CASA','DEPARTAMENTO','SITIO','OFICINA','BODEGA','LOCAL','HOSTAL','HOTEL','HABITACIONAL'];
      const destinosTipos = [...new Set(prediosEncontrados.map(p => (p.destinoDescripcion || '').toUpperCase()))];
      const relevantes = destinosTipos.filter(d => DESTINOS_RELEVANTES.some(r => d.includes(r)));
      if (relevantes.length > 1) {
        return res.status(200).json({
          multiplesResultados: true,
          predios: prediosEncontrados.slice(0, 8).map(p => ({
            rol: p.rol, manzana: p.manzana, predio: p.predio,
            destino: p.destinoDescripcion || null,
            direccion: (p.direccion || '').trim(),
          })),
          comuna: comunaEncontrada?.nombre,
          rol: null,
        });
      }
    }

    // Tomar el primero y obtener datos completos
    const predio = prediosEncontrados[0];
    const datos = await getDatosPredio(comunaEncontrada.codigo, predio.manzana, predio.predio);
    if (!datos) return res.status(200).json({ rol: null, error: 'Sin datos en SII' });

    return res.status(200).json({
      ...datos,
      todosRoles: prediosEncontrados.map(p => p.rol).filter(Boolean),
      comunaEncontrada: comunaEncontrada?.nombre,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
