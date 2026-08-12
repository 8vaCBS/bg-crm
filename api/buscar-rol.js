
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Soporta búsqueda por dirección O por ROL directo
  const { calle, numero, comuna, rol: rolDirecto } = req.query;

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

  async function fetchGet(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: hdrs || {} }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8'), cookies: r.headers['set-cookie'] || [] }));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  async function fetchPost(hostname, path, payload, hdrs) {
    const body = JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...hdrs }
      }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
    });
  }

  // Códigos de comuna para zeus.sii.cl — formato 5 dígitos "1XXXX"
  // Fuente: PDFs oficiales SII (rol de avalúos por comuna)
  const ZEUS_COMUNA_CODES = {
    'santiago':          '15101',
    'nunoa':             '15105',
    'providencia':       '15103',
    'las condes':        '15102',
    'vitacura':          '15110',
    'la reina':          '15107',
    'macul':             '15108',
    'la florida':        '15106',
    'maipu':             '15109',
    'san miguel':        '15113',
    'penalolen':         '15112',
    'lo barnechea':      '15116',
    'huechuraba':        '15117',
    'independencia':     '15118',
    'recoleta':          '15119',
    'estacion central':  '15120',
    'cerrillos':         '15121',
    'pudahuel':          '15122',
    'quilicura':         '15123',
    'renca':             '15124',
    'conchali':          '15125',
    'la cisterna':       '15126',
    'la granja':         '15127',
    'lo espejo':         '15128',
    'lo prado':          '15129',
    'pedro aguirre cerda': '15130',
    'san joaquin':       '15131',
    'san ramon':         '15132',
  };


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
  };

  try {
    // ── Paso 1: Cookie de sesión ──────────────────────────────────────────
    const sessionRes = await fetchGet(
      'https://www4.sii.cl/mapasui/internet/index.html',
      { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'es-419,es;q=0.9' }
    );
    const cookies = sessionRes.cookies.map(c => c.split(';')[0]).join('; ');
    const baseHdrs = {
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

    // ── MODO A: Búsqueda por ROL directo ─────────────────────────────────
    if (rolDirecto) {
      // ROL formato "MANZANA-PREDIO", ej: "387-21"
      const partes = rolDirecto.split('-');
      if (partes.length !== 2) return res.status(400).json({ error: 'ROL debe tener formato MANZANA-PREDIO, ej: 387-21' });

      const codigoComuna = COMUNAS[normalizar(comuna || 'nunoa')] || '15105';
      const manzana = parseInt(partes[0]);
      const predioNum = parseInt(partes[1]);

      const r2 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPredioNacional',
        {
          metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
        }, baseHdrs
      );
      const j2 = JSON.parse(r2.body);
      const d = j2?.data || {};

      if (!d.rol) {
        // El mapa SII no encontró datos para este manzana/predio
        // Retornar el ROL tal como fue ingresado + link al SII para consulta manual
        const comunaNorm = normalizar(comuna || 'nunoa');
        const zeusCode = ZEUS_COMUNA_CODES[comunaNorm] || '15105';
        return res.status(200).json({
          rol: rolDirecto,
          rolSoloManual: true,
          linkSII: `https://zeus.sii.cl/avalu_cgi/br/brc110.sh?RGN=13&CNT=${zeusCode}&ROL=${rolDirecto}&BL_TIPO=ALL`,
        });
      }

      // Superficie desde mapa SII
      let supTerreno = null, supConstruida = null;
      const predioPublicadoId = d.predioPublicado?.id;
      if (predioPublicadoId) {
        try {
          const r4 = await fetchPost('www4.sii.cl',
            '/mapasui/services/data/mapasFacadeService/getPredioPublicado',
            { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioPublicado", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
              data: { idPredioPublicado: predioPublicadoId, servicios: [] }
            }, baseHdrs
          );
          const dp = JSON.parse(r4.body)?.data;
          if (dp) {
            supTerreno    = (dp.supTerreno  && dp.supTerreno  > 0) ? dp.supTerreno  : null;
            supConstruida = (dp.supConsMt2  && dp.supConsMt2  > 0) ? dp.supConsMt2  :
                            (dp.supConstruida && dp.supConstruida > 0) ? dp.supConstruida : null;
          }
        } catch(e) {}
      }

      return res.status(200).json({
        rol: d.rol, manzana, predio: predioNum,
        avaluoFiscal: d.valorTotal || null,
        avaluoAfecto: d.valorAfecto || null,
        direccionSII: (d.direccion || '').trim(),
        destino: d.destinoDescripcion || null,
        ubicacion: d.ubicacion || null,
        supTerreno, supConstruida,
        rangoSuperficie: d.datosAh?.rangoSuperficie?.trim() || null,
        periodo: d.periodo || null,
      });
    }

    // ── MODO C: Búsqueda por manzana+predio específico (cuando usuario elige entre múltiples) ──
    const { manzana: manzanaElegida, predio: predioElegido } = req.query;
    if (manzanaElegida && predioElegido) {
      const codigoComuna = COMUNAS[normalizar(comuna || 'nunoa')] || '15105';
      const manzana = parseInt(manzanaElegida);
      const predioNum = parseInt(predioElegido);

      const r2 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPredioNacional',
        { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
        }, baseHdrs
      );
      const j2 = JSON.parse(r2.body);
      const d = j2?.data || {};
      if (!d.rol) return res.status(200).json({ rol: null, error: 'Predio no encontrado' });

      let supTerreno = null, supConstruida = null;
      const ppId = d.predioPublicado?.id;
      if (ppId) {
        try {
          const r4 = await fetchPost('www4.sii.cl',
            '/mapasui/services/data/mapasFacadeService/getPredioPublicado',
            { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioPublicado", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
              data: { idPredioPublicado: ppId, servicios: [] }
            }, baseHdrs
          );
          const dp = JSON.parse(r4.body)?.data;
          if (dp) {
            supTerreno    = dp.supTerreno  > 0 ? dp.supTerreno  : null;
            supConstruida = dp.supConsMt2  > 0 ? dp.supConsMt2  : dp.supConstruida > 0 ? dp.supConstruida : null;
          }
        } catch(e) {}
      }
      return res.status(200).json({
        rol: d.rol, manzana, predio: predioNum,
        avaluoFiscal: d.valorTotal || null, avaluoAfecto: d.valorAfecto || null,
        direccionSII: (d.direccion || '').trim(), destino: d.destinoDescripcion || null,
        ubicacion: d.ubicacion || null, supTerreno, supConstruida,
        rangoSuperficie: d.datosAh?.rangoSuperficie?.trim() || null, periodo: d.periodo || null,
      });
    }

    // ── MODO B: Búsqueda por dirección ─────────────────────────────────────
    if (!calle || !comuna) return res.status(400).json({ error: 'Faltan parametros' });

    const codigoComuna = COMUNAS[normalizar(comuna)] || '15105';
    const palabras = calle.trim().split(/\s+/);

    // Variantes de calle: esenciales sin saturar el timeout
    const variantesCalle = [calle.trim()];

    // El SII no usa tildes ni caracteres especiales — normalizar siempre
    const calleNorm = calle.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (calleNorm !== calle.trim()) variantesCalle.push(calleNorm);

    // Para nombres con 4+ palabras: probar solo las primeras 2
    if (palabras.length >= 4) {
      variantesCalle.push(palabras.slice(0, 2).join(' '));
    }

    // Variantes de número: solo agregar cero si el número tiene 3 dígitos o menos
    const numerosVariantes = [numero || ''];
    if (numero && numero.length <= 3 && !numero.startsWith('0')) {
      numerosVariantes.push('0' + numero); // 134 → 0134
    }
    if (numero && numero.startsWith('0')) {
      numerosVariantes.push(numero.slice(1)); // 0134 → 134
    }

    let predios = [];
    let varianteUsada = calle;

    for (const variante of variantesCalle) {
      for (const num of numerosVariantes) {
        const r1 = await fetchPost('www4.sii.cl',
          '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
          {
            metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
            data: { rolDireccion: { comuna: codigoComuna, nombreComuna: comuna.toUpperCase(), calle: variante, numeroCalleStr: num, detalle: 0 }, servicios: [] }
          }, baseHdrs
        );
        const j1 = JSON.parse(r1.body);
        predios = j1?.data || [];
        if (predios.length > 0) { varianteUsada = variante; break; }
      }
      if (predios.length > 0) break;
    }

    if (!predios.length) return res.status(200).json({ rol: null, error: 'Sin resultados en SII' });

    // Si hay múltiples predios, verificar si tienen destinos/ROLs realmente distintos
    // El SII devuelve varios predios para un mismo edificio (depts, estacionamientos, etc.)
    // Solo pedimos que elija si hay destinos distintos entre los primeros resultados
    if (predios.length > 1) {
      const destinos = [...new Set(predios.slice(0, 6).map(p => p.destinoDescripcion || ''))];
      const manzanas = [...new Set(predios.map(p => p.manzana))];
      // Si hay más de una manzana O más de un destino distinto → realmente son predios distintos
      const sonDistintos = manzanas.length > 1 || destinos.length > 1;
      if (sonDistintos) {
        const resumen = predios.slice(0, 8).map(p => ({
          rol:      p.rol,
          manzana:  p.manzana,
          predio:   p.predio,
          destino:  p.destinoDescripcion || null,
          direccion:(p.direccion || '').trim(),
        }));
        return res.status(200).json({
          multiplesResultados: true,
          predios: resumen,
          rol: null,
        });
      }
      // Misma manzana, mismo destino → tomar el primero normalmente
    }

    const predio = predios[0];
    const manzana = predio.manzana;
    const predioNum = predio.predio;

    // Paso 3: Datos completos
    const r2 = await fetchPost('www4.sii.cl',
      '/mapasui/services/data/mapasFacadeService/getPredioNacional',
      {
        metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
        data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
      }, baseHdrs
    );
    const j2 = JSON.parse(r2.body);
    const d = j2?.data || {};

    // Superficie
    let supTerreno = null, supConstruida = null;
    const predioPublicadoId = d.predioPublicado?.id;
    if (predioPublicadoId) {
      try {
        const r4 = await fetchPost('www4.sii.cl',
          '/mapasui/services/data/mapasFacadeService/getPredioPublicado',
          { metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioPublicado", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
            data: { idPredioPublicado: predioPublicadoId, servicios: [] }
          }, baseHdrs
        );
        const dp = JSON.parse(r4.body)?.data;
        if (dp) {
          supTerreno    = (dp.supTerreno  && dp.supTerreno  > 0) ? dp.supTerreno  : null;
          supConstruida = (dp.supConsMt2  && dp.supConsMt2  > 0) ? dp.supConsMt2  :
                          (dp.supConstruida && dp.supConstruida > 0) ? dp.supConstruida : null;
        }
      } catch(e) {}
    }

    return res.status(200).json({
      rol: d.rol || predio.rol || null,
      todosRoles: predios.map(p => p.rol).filter(Boolean),
      avaluoFiscal: d.valorTotal || null,
      avaluoAfecto: d.valorAfecto || null,
      direccionSII: (d.direccion || predio.direccion || '').trim(),
      destino: d.destinoDescripcion || predio.destinoDescripcion || null,
      ubicacion: d.ubicacion || null,
      supTerreno, supConstruida,
      coordenadas: d.ubicacionX ? { lat: d.ubicacionX, lng: d.ubicacionY } : null,
      rangoSuperficie: d.datosAh?.rangoSuperficie?.trim() || null,
      predioPublicadoId: d.predioPublicado?.id || null,
      periodo: d.periodo || null,
      manzana, predio: predioNum,
      calleUsada: varianteUsada, // para debug: qué variante funcionó
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
