
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

  // Códigos de región y comuna para zeus.sii.cl (sistema distinto al mapa)
  const COMUNAS_ZEUS = {
    'nunoa': '155', 'providencia': '155', 'las condes': '155',
    'penalolen': '155', 'santiago': '155', 'vitacura': '155',
    'la reina': '155', 'macul': '155', 'san miguel': '155',
    'la florida': '155', 'maipu': '155', 'huechuraba': '155',
    'independencia': '155', 'recoleta': '155', 'lo barnechea': '155',
    'estacion central': '155', 'cerrillos': '155', 'pudahuel': '155',
    'quilicura': '155', 'renca': '155', 'conchali': '155',
    'la cisterna': '155', 'la granja': '155', 'lo espejo': '155',
    'lo prado': '155', 'pedro aguirre cerda': '155',
    'san joaquin': '155', 'san ramon': '155',
  };
  // Códigos de comuna para zeus.sii.cl (distintos al mapa SII)
  const ZEUS_COMUNA_CODES = {
    'santiago': '13101', 'nunoa': '13120', 'providencia': '13123',
    'las condes': '13114', 'vitacura': '13132', 'la reina': '13113',
    'macul': '13118', 'la florida': '13110', 'maipu': '13119',
    'san miguel': '13126', 'penalolen': '13121', 'lo barnechea': '13116',
    'huechuraba': '13108', 'independencia': '13109', 'recoleta': '13125',
    'estacion central': '13106', 'cerrillos': '13102', 'pudahuel': '13124',
    'quilicura': '13120b', 'renca': '13127', 'conchali': '13103',
    'la cisterna': '13111', 'la granja': '13112', 'lo espejo': '13117',
    'lo prado': '13115', 'pedro aguirre cerda': '13122',
    'san joaquin': '13128', 'san ramon': '13129',
  };

  // Parsea el HTML de zeus.sii.cl para extraer datos del bien raiz
  function parsearZeus(html) {
    const result = {};
    // Extraer numeros de tablas de avaluo (busca patrones de montos en CLP)
    const montos = [...html.matchAll(/([\d]{1,3}(?:[.,][\d]{3})+)/g)].map(m => parseInt(m[1].replace(/[.,]/g, '')));
    if (montos.length >= 1) result.avaluoFiscal = montos[0];
    if (montos.length >= 2) result.avaluoAfecto = montos[1];
    // ROL
    const rolMatch = html.match(/(\d{3,4}-\d{1,3})/);
    if (rolMatch) result.rol = rolMatch[1];
    // Destino: buscar texto tipo CASA, DEPARTAMENTO, etc
    const destMatch = html.match(/(CASA|DEPARTAMENTO|SITIO|OFICINA|PARCELA|BODEGA|LOCAL|COMERCIO|INDUSTRIA)/i);
    if (destMatch) result.destino = destMatch[1].toUpperCase();
    return result;
  }

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

      // Si el mapa SII no retorna datos, intentar con zeus.sii.cl por ROL directo
      if (!d.rol) {
        try {
          const comunaNorm = normalizar(comuna || 'nunoa');
          const zeusCode = ZEUS_COMUNA_CODES[comunaNorm] || '13120';
          const zeusUrl = `https://zeus.sii.cl/avalu_cgi/br/brc110.sh?RGN=13&CNT=${zeusCode}&ROL=${rolDirecto}&BL_TIPO=ALL`;
          console.log('[ZEUS] Consultando:', zeusUrl);
          const zeusRes = await fetchGet(zeusUrl, {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-419,es;q=0.9',
            'Referer': 'https://zeus.sii.cl/avalu_cgi/br/brc110.sh',
          });
          console.log('[ZEUS] Status:', zeusRes.status, '| Body snippet:', zeusRes.body.slice(0, 400));
          if (zeusRes.status === 200) {
            const zeus = parsearZeus(zeusRes.body);
            console.log('[ZEUS] Datos parseados:', JSON.stringify(zeus));
            if (zeus.avaluoFiscal || zeus.rol) {
              return res.status(200).json({
                rol: zeus.rol || rolDirecto,
                avaluoFiscal: zeus.avaluoFiscal || null,
                avaluoAfecto: zeus.avaluoAfecto || null,
                direccionSII: zeus.direccionSII || null,
                destino: zeus.destino || null,
                fuenteZeus: true,
              });
            }
          }
        } catch(eZeus) { console.log('[ZEUS] error:', eZeus.message); }
        return res.status(200).json({ rol: null, error: 'ROL no encontrado en SII' });
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

    // ── MODO B: Búsqueda por dirección con reintentos ─────────────────────
    if (!calle || !comuna) return res.status(400).json({ error: 'Faltan parametros' });

    const codigoComuna = COMUNAS[normalizar(comuna)] || '15105';

    // Generar variantes de la calle:
    const palabras = calle.trim().split(/\s+/);
    const variantes = [];
    variantes.push(calle.trim());                                           // original: "Fernando Marquez de la Plata"
    if (palabras.length > 2) variantes.push(palabras.slice(0, palabras.length - 1).join(' ')); // sin última
    if (palabras.length > 2) variantes.push(palabras.slice(0, 2).join(' ')); // primeras 2: "Fernando Marquez"
    // Variante con abreviatura "Fdo." si el nombre empieza con nombre propio
    const primero = palabras[0].toLowerCase();
    if (['fernando', 'francisco', 'federico'].includes(primero)) {
      variantes.push('FDO ' + palabras.slice(1).join(' '));
      variantes.push('FDO. ' + palabras.slice(1).join(' '));
      variantes.push('FDO. ' + palabras.slice(1, 3).join(' '));
    }
    if (['avenida', 'av', 'av.', 'avda', 'avda.'].includes(primero)) {
      variantes.push(palabras.slice(1).join(' ')); // sin "Avenida" adelante
    }
    const variantesUnicas = [...new Set(variantes)];

    let predios = [];
    let varianteUsada = calle;

    for (const variante of variantesUnicas) {
      const r1 = await fetchPost('www4.sii.cl',
        '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
        {
          metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
          data: { rolDireccion: { comuna: codigoComuna, nombreComuna: comuna.toUpperCase(), calle: variante, numeroCalleStr: numero || '', detalle: 0 }, servicios: [] }
        }, baseHdrs
      );
      const j1 = JSON.parse(r1.body);
      predios = j1?.data || [];
      if (predios.length > 0) {
        varianteUsada = variante;
        break;
      }
    }

    if (!predios.length) return res.status(200).json({ rol: null, error: 'Sin resultados en SII' });

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
