
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { calle, numero, comuna, debug } = req.query;
  if (!calle || !comuna) return res.status(400).json({ error: 'Faltan parametros' });

  const COMUNAS = {
    'nunoa': '13120', 'providencia': '13123', 'las condes': '13114',
    'penalolen': '13121', 'santiago': '13101', 'vitacura': '13132',
    'la reina': '13113', 'macul': '13118', 'san miguel': '13126',
    'la florida': '13110', 'maipu': '13119', 'huechuraba': '13108',
    'independencia': '13109', 'recoleta': '13125', 'lo barnechea': '13116',
    'estacion central': '13106', 'cerrillos': '13102', 'lo prado': '13115',
    'pudahuel': '13124', 'quilicura': '13125', 'renca': '13126',
  };

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const codigoComuna = COMUNAS[normalizar(comuna)] || '13120';

  async function fetchUrl(url, options) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, options || {}, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-CL,es;q=0.9',
    'Referer': 'https://www4.sii.cl/mapasui/internet/index.html',
    'Origin': 'https://www4.sii.cl',
  };

  // API interna del Mapa SII para buscar por dirección
  const calleUpper = calle.toUpperCase();
  const apiUrl = `https://www4.sii.cl/mapasui/internet/html/contribuyente/ajax/bienesRaicesScController.html?conjunto=buscarDireccion&nombre_calle=${encodeURIComponent(calleUpper)}&numero_calle=${numero||''}&codigo_comuna=${codigoComuna}`;

  let html = '';
  try {
    html = await fetchUrl(apiUrl, { headers: hdrs });
  } catch(e) {
    return res.status(500).json({ error: e.message, url: apiUrl });
  }

  if (debug === '1') {
    return res.status(200).json({
      htmlLength: html.length,
      htmlSample: html.substring(0, 3000),
      apiUrl
    });
  }

  // Parsear respuesta - puede ser JSON o HTML con tabla
  let rol = null;
  let avaluoFiscal = null;

  try {
    const json = JSON.parse(html);
    if (json.rol) rol = json.rol;
    if (json.rolPredial) rol = json.rolPredial;
    if (Array.isArray(json) && json[0]) rol = json[0].rol || json[0].rolPredial;
  } catch(e) {
    // Es HTML, buscar ROL en tabla
    const rolMatch = html.match(/(\d{3,7})-(\d{1,4})/g);
    if (rolMatch) {
      const validos = rolMatch.filter(r => parseInt(r.split('-')[0]) > 100);
      if (validos.length > 0) rol = validos[0];
    }
  }

  return res.status(200).json({
    rol,
    avaluoFiscal,
    codigoComuna,
    htmlLength: html.length,
    error: !rol ? 'Sin ROL encontrado' : null
  });
};
