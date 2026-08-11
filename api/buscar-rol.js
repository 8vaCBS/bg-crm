
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { calle, numero, comuna } = req.query;

  if (!calle || !comuna) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  const COMUNAS = {
    'nunoa': '13120', 'providencia': '13123', 'las condes': '13114',
    'penalolen': '13121', 'santiago': '13101', 'vitacura': '13132',
    'la reina': '13113', 'macul': '13118', 'san miguel': '13126',
    'la florida': '13110', 'maipu': '13119', 'huechuraba': '13108',
    'independencia': '13109', 'recoleta': '13125', 'lo barnechea': '13116',
    'las condes': '13114', 'lo espejo': '13117', 'cerrillos': '13102',
    'estacion central': '13106',
  };

  function normalizar(str) {
    return str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  const codigoComuna = COMUNAS[normalizar(comuna)] || '13120';
  
  const params = new URLSearchParams({
    CODIGO_COMUNA: codigoComuna,
    NOMBRE_CALLE: calle.toUpperCase(),
    NUMERO_CALLE: numero || '',
    TIPO_BIEN_RAIZ: 'TODOS',
    BOTON: 'Buscar'
  });

  const siiUrl = `https://zeus.sii.cl/avalu_cgi/br/brc200.sh?${params}`;

  try {
    const html = await new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'es-CL,es;q=0.9',
          'Referer': 'https://zeus.sii.cl/',
        }
      };

      https.get(siiUrl, options, (siiRes) => {
        let data = '';
        siiRes.on('data', chunk => { data += chunk; });
        siiRes.on('end', () => resolve(data));
      }).on('error', reject);
    });

    // Extraer ROL
    const rolMatches = [...html.matchAll(/(\d{3,7})-(\d{1,4})/g)];
    const roles = rolMatches
      .map(m => m[0])
      .filter(r => parseInt(r.split('-')[0]) > 100);

    // Extraer avalúo fiscal
    const avaluoMatch = html.match(/\$\s*([\d\.]+)/);
    const avaluo = avaluoMatch 
      ? parseInt(avaluoMatch[1].replace(/\./g, '')) 
      : null;

    // Extraer dirección SII
    const dirMatch = html.match(/DIRECCI[OÓ]N[^:]*:\s*([^<\n]+)/i);
    const direccionSII = dirMatch ? dirMatch[1].trim() : null;

    if (roles.length === 0) {
      return res.status(200).json({ 
        rol: null, 
        avaluoFiscal: null,
        error: 'Sin resultados en SII para esta dirección'
      });
    }

    return res.status(200).json({
      rol: roles[0],
      todosRoles: roles.slice(0, 5),
      avaluoFiscal: avaluo,
      direccionSII,
      codigoComuna,
      siiUrl
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
