
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
    const rol = predio.rol || null;
    const manzana = predio.manzana;
    const predioNum = predio.predio;

    // Paso 3: Obtener avalúo fiscal con getPredioNacional
    const r2 = await fetchPost('www4.sii.cl',
      '/mapasui/services/data/mapasFacadeService/getPredioNacional',
      {
        metaData: { namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPredioNacional", conversationId: "UNAUTHENTICATED-CALL", transactionId: `bg-${Date.now()}` },
        data: { predio: { comuna: parseInt(codigoComuna), manzana, predio: predioNum }, servicios: [] }
      }, baseHdrs
    );

    const j2 = JSON.parse(r2.body);
    const datos = j2?.data?.predioNacional || j2?.data || {};

    const avaluoTotal = datos.valorTotal || datos.avaluoTotal || datos.catastroValorizado?.avaluoTotal || null;
    const avaluoAfecto = datos.valorAfecto || datos.avaluoAfecto || null;
    const destino = datos.destinoDescripcion || predio.destinoDescripcion || null;
    const direccionSII = datos.direccion || predio.direccion || null;
    const ubicacion = datos.ubicacionDescripcion || predio.ubicacion || null;
    const areaHomogenea = datos.areaHomogenea || null;

    return res.status(200).json({
      rol,
      todosRoles: predios.map(p => p.rol).filter(Boolean),
      avaluoFiscal: avaluoTotal,
      avaluoAfecto,
      direccionSII: direccionSII?.trim(),
      destino,
      ubicacion,
      areaHomogenea,
      manzana,
      predio: predioNum,
      rawAvaluo: JSON.stringify(j2?.data).substring(0, 500),
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
