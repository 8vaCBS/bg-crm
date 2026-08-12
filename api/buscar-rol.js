const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { calle, numero, num, comuna, rol: rolDirecto, manzana: manzanaElegida, predio: predioElegido } = req.query;
  const numeroValido = numero || num || '';

  function normalizar(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  const COMUNAS = {
    'nunoa':             '15105',
    'providencia':       '15123',
    'las condes':        '15114',
    'penalolen':         '15122',
    'santiago':          '15101',
    'vitacura':          '15132',
    'la reina':          '15113',
    'macul':             '15118',
    'san miguel':        '15126',
    'la florida':        '15110',
    'maipu':             '15119',
    'huechuraba':        '15108',
    'independencia':     '15109',
    'recoleta':          '15125',
    'lo barnechea':      '15116',
    'estacion central':  '15106',
    'cerrillos':         '15102',
    'pudahuel':          '15124',
    'quilicura':         '15120',
    'renca':             '15127',
    'conchali':          '15103',
    'la cisterna':       '15111',
    'la granja':         '15112',
    'lo espejo':         '15117',
    'lo prado':          '15115',
    'pedro aguirre cerda': '15122',
    'san joaquin':       '15128',
    'san ramon':         '15129',
    'el bosque':         '15104',
    'la pintana':        '15107',
    'san bernardo':      '15130',
    'puente alto':       '15131',
    'peñalolen':         '15122',
    'maipú':             '15119',
    'ñuñoa':             '15105',
  };

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  async function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const r = https.get(url, { headers: hdrs || {} }, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({
          status: resp.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
          cookies: resp.headers['set-cookie'] || []
        }));
      });
      r.on('error', reject);
      r.setTimeout(12000, () => { r.destroy(); reject(new Error('timeout fetchGet')); });
    });
  }

  async function fetchPost(hostname, path, payload, hdrs) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const r = https.request({
        hostname, path, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...hdrs
        }
      }, (resp) => {
        let chunks = [];
        resp.on('data', c => chunks.push(c));
        resp.on('end', () => resolve({
          status: resp.statusCode,
          body: Buffer.concat(chunks).toString('utf8')
        }));
      });
      r.on('error', reject);
      r.setTimeout(12000, () => { r.destroy(); reject(new Error('timeout fetchPost')); });
      r.write(body);
      r.end();
    });
  }

  async function getSuperficie(predioPublicadoId, hdrs) {
    if (!predioPublicadoId) return { supTerreno: null, supConstruida: null };
    try {
      const r = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPredioPublicado',
        {
          metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioPublicado", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { idPredioPublicado: predioPublicadoId, servicios: [] }
        }, hdrs
      );
      const dp = JSON.parse(r.body)?.data;
      if (!dp) return { supTerreno: null, supConstruida: null };
      return {
        supTerreno:    dp.supTerreno  > 0 ? dp.supTerreno  : null,
        supConstruida: dp.supConsMt2  > 0 ? dp.supConsMt2  : dp.supConstruida > 0 ? dp.supConstruida : null,
      };
    } catch(e) {
      return { supTerreno: null, supConstruida: null };
    }
  }

  try {
    // ── Cookie de sesión SII ───────────────────────────────────────────────
    const sessionRes = await fetchGet(
      'https://www4.sii.cl/mapasui/internet/index.html',
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

    console.log('[buscar-rol] sesion ok | calle:', calle, '| num:', numero, '| comuna:', comuna, '| rol:', rolDirecto);

    // Función: obtener datos completos de un predio
    async function getDatosPredio(codigoComuna, manzana, predioNum) {
      const r2 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPredioNacional',
        {
          metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
        }, H
      );
      const d = JSON.parse(r2.body)?.data || {};
      if (!d.rol) return null;
      const { supTerreno, supConstruida } = await getSuperficie(d.predioPublicado?.id, H);
      return {
        rol: d.rol, manzana, predio: predioNum,
        avaluoFiscal:    d.valorTotal || null,
        avaluoAfecto:    d.valorAfecto || null,
        direccionSII:    (d.direccion || '').trim(),
        destino:         d.destinoDescripcion || null,
        ubicacion:       d.ubicacion || null,
        supTerreno, supConstruida,
        rangoSuperficie: d.datosAh?.rangoSuperficie?.trim() || null,
        periodo:         d.periodo || null,
      };
    }

    // ── MODO A: ROL directo (manzana-predio) ──────────────────────────────
    if (rolDirecto) {
      const partes = rolDirecto.split('-');
      if (partes.length !== 2) return res.status(400).json({ error: 'Formato ROL: MANZANA-PREDIO' });
      const codigoComuna = COMUNAS[normalizar(comuna || 'nunoa')] || '15105';
      const datos = await getDatosPredio(codigoComuna, parseInt(partes[0]), parseInt(partes[1]));
      if (datos) return res.status(200).json(datos);
      return res.status(200).json({ rol: rolDirecto, rolSoloManual: true });
    }

    // ── MODO C: Manzana+predio elegido por usuario ────────────────────────
    if (manzanaElegida && predioElegido) {
      const codigoComuna = COMUNAS[normalizar(comuna || 'nunoa')] || '15105';
      const datos = await getDatosPredio(codigoComuna, parseInt(manzanaElegida), parseInt(predioElegido));
      if (datos) return res.status(200).json(datos);
      return res.status(200).json({ rol: null, error: 'Predio no encontrado' });
    }

    // ── MODO B: Búsqueda por dirección ────────────────────────────────────
    if (!calle || !comuna) {
      return res.status(400).json({ error: 'Faltan parámetros: calle y comuna son requeridos' });
    }

    const codigoComuna = COMUNAS[normalizar(comuna)] || '15105';

    // Limpiar calle según estándar catastral SII:
    // mayúsculas, sin tildes, sin prefijos de vía (Avenida, Calle, Pasaje...)
    const calleLimpia = calle.trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/^(AVENIDA|AVDA|AV\.?|CALLE|PASAJE|PSJE|POBLACION|CAMINO|RUTA)\s+/, '')
      .trim();

    const calleMayus = calle.trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();

    // Variantes: primero sin prefijo (QUILIN SUR), luego con prefijo, luego original
    const variantesCalle = [...new Set([calleLimpia, calleMayus, calle.trim()])];

    // Para calles largas, probar también primeras 2 palabras de la versión limpia
    const palabrasLimpias = calleLimpia.split(/\s+/);
    if (palabrasLimpias.length >= 3) {
      variantesCalle.push(palabrasLimpias.slice(0, 2).join(' '));
    }

    // Variantes de número: con/sin cero inicial
    const numerosVariantes = [numeroValido || ''];
    if (numeroValido && numeroValido.length <= 3 && !numeroValido.startsWith('0')) {
      numerosVariantes.push('0' + numeroValido);
    }
    if (numeroValido && numeroValido.startsWith('0')) {
      numerosVariantes.push(numeroValido.slice(1));
    }

    console.log('[buscar-rol] variantes calle:', variantesCalle, '| numeros:', numerosVariantes, '| codigo comuna:', codigoComuna);

    let predios = [];
    let varianteUsada = calle;

    outer:
    for (const variante of variantesCalle) {
      for (const num of numerosVariantes) {
        const r1 = await fetchPost('www4.sii.cl',
          '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
          {
            metaData: {
              namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion",
              conversationId: "UNAUTHENTICATED-CALL",
              transactionId: `bg-${Date.now()}`
            },
            data: {
              rolDireccion: {
                comuna: codigoComuna,
                nombreComuna: comuna.toUpperCase(),
                calle: variante,
                numeroCalleStr: String(num),
                detalle: 0
              },
              servicios: []
            }
          }, H
        );
        const parsed = JSON.parse(r1.body);
        predios = parsed?.data || [];
        console.log('[buscar-rol] variante:', variante, '| num:', num, '| predios:', predios.length);
        if (predios.length > 0) {
          varianteUsada = variante;
          break outer;
        }
      }
    }

    if (!predios.length) {
      return res.status(200).json({ rol: null, error: 'Sin resultados en SII' });
    }

    // Si hay destinos claramente distintos → pedir al usuario que elija
    if (predios.length > 1) {
      const RELEVANTES = ['CASA','DEPARTAMENTO','SITIO','OFICINA','BODEGA','LOCAL','HOSTAL','HOTEL','HABITACIONAL'];
      const tiposDistintos = [...new Set(predios.map(p => (p.destinoDescripcion || '').toUpperCase()))]
        .filter(d => RELEVANTES.some(r => d.includes(r)));
      if (tiposDistintos.length > 1) {
        return res.status(200).json({
          multiplesResultados: true,
          predios: predios.slice(0, 8).map(p => ({
            rol: p.rol, manzana: p.manzana, predio: p.predio,
            destino: p.destinoDescripcion || null,
            direccion: (p.direccion || '').trim(),
          })),
          rol: null,
        });
      }
    }

    // Obtener datos completos del primer predio
    const predio = predios[0];
    const datos = await getDatosPredio(codigoComuna, predio.manzana, predio.predio);

    if (!datos) {
      return res.status(200).json({ rol: null, error: 'Sin datos en SII' });
    }

    return res.status(200).json({
      ...datos,
      todosRoles: predios.map(p => p.rol).filter(Boolean),
    });

  } catch(e) {
    console.error('[buscar-rol] ERROR:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
