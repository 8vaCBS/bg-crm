
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
    'estacion central': '13106',
  };

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  const codigoComuna = COMUNAS[normalizar(comuna)] || '13120';
  const calleUpper = calle.toUpperCase();

  // Intentar múltiples variaciones de la URL del SII
  const urls = [
    `https://zeus.sii.cl/avalu_cgi/br/brc200.sh?CODIGO_COMUNA=${codigoComuna}&NOMBRE_CALLE=${encodeURIComponent(calleUpper)}&NUMERO_CALLE=${numero||''}&TIPO_BIEN_RAIZ=TODOS&BOTON=Buscar`,
    `https://zeus.sii.cl/avalu_cgi/br/brc200.sh?CODIGO_COMUNA=${codigoComuna}&NOMBRE_CALLE=${encodeURIComponent(calleUpper)}&NUMERO_CALLE=&TIPO_BIEN_RAIZ=TODOS&BOTON=Buscar`,
  ];

  let html = '';
  let usedUrl = '';

  for (const url of urls) {
    try {
      html = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Referer': 'https://zeus.sii.cl/avalu_cgi/br/brc100.sh',
          }
        }, (siiRes) => {
          let data = Buffer.alloc(0);
          siiRes.on('data', chunk => { data = Buffer.concat([data, chunk]); });
          siiRes.on('end', () => resolve(data.toString('latin1')));
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      usedUrl = url;
      if (html.length > 200) break;
    } catch(e) {
      html = '';
    }
  }

  // Si debug=1, devolver HTML crudo
  if (debug === '1') {
    return res.status(200).json({
      htmlLength: html.length,
      htmlSample: html.substring(0, 2000),
      codigoComuna,
      calleUpper,
      usedUrl
    });
  }

  // Patrones para extraer ROL del HTML del SII
  // El SII muestra resultados como tabla con rol en formato XXXX-XX
  const patrones = [
    /rol[^\d]*(\d{3,7})-(\d{1,4})/gi,
    /(\d{3,7})-(\d{1,4})/g,
  ];

  let roles = [];
  for (const patron of patrones) {
    const matches = [...html.matchAll(patron)];
    roles = matches.map(m => {
      const parts = m[0].match(/(\d{3,7})-(\d{1,4})/);
      return parts ? parts[0] : null;
    }).filter(r => r && parseInt(r.split('-')[0]) > 100);
    if (roles.length > 0) break;
  }

  const avaluoMatch = html.match(/[\$]\s*([\d\.]+)/);
  const avaluo = avaluoMatch ? parseInt(avaluoMatch[1].replace(/\./g,'')) : null;

  return res.status(200).json({
    rol: roles[0] || null,
    todosRoles: roles.slice(0,5),
    avaluoFiscal: avaluo,
    codigoComuna,
    htmlLength: html.length,
    error: roles.length === 0 ? 'Sin resultados en SII' : null
  });
};
