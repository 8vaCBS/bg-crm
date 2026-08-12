
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { calle, numero, comuna } = req.query;
  if (!calle || !comuna) return res.status(400).json({ error: 'Faltan parametros' });

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

  const codigoComuna = COMUNAS[normalizar(comuna)] || '15105';

  try {
    // Paso 1: Cookie de sesión
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

    // Paso 2: Buscar predios por dirección
    const r1 = await fetchPost('www4.sii.cl',
      '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
      {
        metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
        data: { rolDireccion: { comuna: codigoComuna, nombreComuna: comuna.toUpperCase(), calle, numeroCalleStr: numero || '', detalle: 0 }, servicios: [] }
      }, baseHdrs
    );

    const j1 = JSON.parse(r1.body);
    const predios = j1?.data || [];
    if (!predios.length) return res.status(200).json({ rol: null, error: 'Sin resultados en SII' });

    const predio = predios[0];
    const manzana = predio.manzana;
    const predioNum = predio.predio;

    // Paso 3: Obtener datos completos con getPredioNacional
    const r2 = await fetchPost('www4.sii.cl',
      '/mapasui/services/data/mapasFacadeService/getPredioNacional',
      {
        metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
        data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
      }, baseHdrs
    );

    const j2 = JSON.parse(r2.body);
    const d = j2?.data || {};

    // Paso 4: Obtener superficie con getServicioPredio
    const r3 = await fetchPost('www4.sii.cl',
      '/mapasui/services/data/mapasFacadeService/getServicioPredio',
      {
        metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getServicioPredio", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
        data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
      }, baseHdrs
    );

    let supTerreno = null;
    let supConstruida = null;
    try {
      const j3 = JSON.parse(r3.body);
      const servicios = j3?.data?.servicios || j3?.data || {};
      supTerreno = servicios.supTerreno || d.supTerreno || null;
      supConstruida = servicios.supConsMt2 || servicios.supConstruida || d.supConsMt2 || null;
    } catch(e) {}

    return res.status(200).json({
      rol: d.rol || predio.rol || null,
      todosRoles: predios.map(p => p.rol).filter(Boolean),
      avaluoFiscal: d.valorTotal || null,
      avaluoAfecto: d.valorAfecto || null,
      direccionSII: (d.direccion || predio.direccion || '').trim(),
      destino: d.destinoDescripcion || predio.destinoDescripcion || null,
      ubicacion: d.ubicacion || null,
      supTerreno: (d.supTerreno && d.supTerreno > 0) ? d.supTerreno : null,
      supConstruida: (d.supConsMt2 && d.supConsMt2 > 0) ? d.supConsMt2 : null,
      coordenadas: d.ubicacionX ? { lat: d.ubicacionX, lng: d.ubicacionY } : null,
      areaHomogenea: d.ah || null,
      rawD: JSON.stringify(d).substring(0, 1000),
      periodo: d.periodo || null,
      manzana,
      predio: predioNum,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
