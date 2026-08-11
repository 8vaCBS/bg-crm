
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { calle, numero, comuna, debug } = req.query;
  if (!calle || !comuna) return res.status(400).json({ error: 'Faltan parametros' });

  // Códigos de comuna del MAPA SII (distintos al SII general)
  const COMUNAS = {
    'nunoa': '15105', 'providencia': '15123', 'las condes': '15114',
    'penalolen': '15121', 'santiago': '15101', 'vitacura': '15132',
    'la reina': '15113', 'macul': '15118', 'san miguel': '15126',
    'la florida': '15110', 'maipu': '15119', 'huechuraba': '15108',
    'independencia': '15109', 'recoleta': '15125', 'lo barnechea': '15116',
    'estacion central': '15106', 'cerrillos': '15102', 'pudahuel': '15124',
    'quilicura': '15120', 'renca': '15127', 'conchali': '15103',
    'el bosque': '15105', 'la cisterna': '15111', 'la granja': '15112',
    'lo espejo': '15117', 'lo prado': '15115', 'pedro aguirre cerda': '15122',
    'peñalolen': '15121', 'san joaquin': '15128', 'san ramon': '15129',
  };

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const codigoComuna = COMUNAS[normalizar(comuna)] || '15105';

  const payload = JSON.stringify({
    metaData: {
      namespace: "cl.sii.sdi.lob.bbrr.mapas.data.api.interfaces.MapasFacadeService/getPrediosDireccion",
      conversationId: "UNAUTHENTICATED-CALL",
      transactionId: `bg-crm-${Date.now()}`
    },
    data: {
      rolDireccion: {
        comuna: codigoComuna,
        nombreComuna: comuna.toUpperCase(),
        calle: calle,
        numeroCalleStr: numero || '',
        detalle: 0
      },
      servicios: []
    }
  });

  const options = {
    hostname: 'www4.sii.cl',
    path: '/mapasui/services/data/mapasFacadeService/getPrediosDireccion',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'es-CL,es;q=0.9',
      'Origin': 'https://www4.sii.cl',
      'Referer': 'https://www4.sii.cl/mapasui/internet/index.html',
    }
  };

  try {
    const responseData = await new Promise((resolve, reject) => {
      const req = https.request(options, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });

    if (debug === '1') {
      return res.status(200).json({ raw: responseData.substring(0, 3000) });
    }

    const json = JSON.parse(responseData);

    // Extraer predios del response
    const predios = json?.data?.prediosDireccion || json?.data?.predios || [];

    if (!predios || predios.length === 0) {
      return res.status(200).json({
        rol: null,
        error: 'Sin predios encontrados',
        raw: responseData.substring(0, 500)
      });
    }

    const predio = predios[0];
    const manzana = predio.manzana || predio.rolManzana || '';
    const predioNum = predio.predio || predio.rolPredio || '';
    const rol = manzana && predioNum ? `${manzana}-${predioNum}` : (predio.rol || predio.rolPredial || null);

    return res.status(200).json({
      rol,
      todosRoles: predios.slice(0,5).map(p => p.rol || p.rolPredial || `${p.manzana}-${p.predio}`),
      avaluoFiscal: predio.avaluoFiscal || null,
      direccionSII: predio.direccion || null,
      destino: predio.destino || null,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
