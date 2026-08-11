
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

  async function fetchUrl(url, opts) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, opts || {}, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks).toString('latin1')));
      });
      req.on('error', reject);
      req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const hdrs = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'es-CL,es;q=0.9',
    'Referer': 'https://zeus.sii.cl/',
  };

  // URL correcta del SII para buscar por dirección
  const siiUrl = `https://zeus.sii.cl/avalu_cgi/br/brcb02.sh?CODIGO_COMUNA=${codigoComuna}&NOMBRE_CALLE=${encodeURIComponent(calleUpper)}&NUMERO_CALLE=${numero||''}&TIPO_BIEN_RAIZ=TODOS&BOTON=Buscar`;

  let html = '';
  try {
    html = await fetchUrl(siiUrl, { headers: hdrs });
  } catch(e) {
    // Fallback: roles.tremen.tech - explorador catastral público
    try {
      const tremenUrl = `https://roles.tremen.tech/api/predios?direccion=${encodeURIComponent(calle)}&comuna=${codigoComuna}`;
      const r = await fetchUrl(tremenUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = JSON.parse(r);
      if (data && data.length > 0) {
        return res.status(200).json({
          rol: data[0].rol || null,
          avaluoFiscal: data[0].avaluo_fiscal || null,
          direccionSII: data[0].direccion || null,
        });
      }
    } catch(e2) {}
    return res.status(500).json({ error: e.message });
  }

  if (debug === '1') {
    return res.status(200).json({
      htmlLength: html.length,
      htmlSample: html.substring(0, 3000),
      siiUrl
    });
  }

  // El SII devuelve tabla con resultados
  // Buscar patrón de ROL en el HTML
  const rolPatterns = [
    /NUMERO_ROL[^>]*>([^<]+)</gi,
    /N[°oº]\s*Rol[^:]*:\s*([\d]+-[\d]+)/gi,
    /rol[^"']*["']([\d]+-[\d]+)["']/gi,
    /([\d]{3,7})-([\d]{1,4})/g,
  ];

  let roles = [];
  for (const pat of rolPatterns) {
    const matches = [...html.matchAll(pat)];
    const found = matches
      .map(m => {
        const full = m[0].match(/([\d]{3,7})-([\d]{1,4})/);
        return full ? full[0] : null;
      })
      .filter(r => r && parseInt(r.split('-')[0]) > 100);
    if (found.length > 0) { roles = found; break; }
  }

  const avaluoMatch = html.match(/\$\s*([\d\.]+)/);
  const avaluo = avaluoMatch ? parseInt(avaluoMatch[1].replace(/\./g,'')) : null;

  return res.status(200).json({
    rol: roles[0] || null,
    todosRoles: roles.slice(0,5),
    avaluoFiscal: avaluo,
    htmlLength: html.length,
    error: roles.length === 0 ? 'Sin ROL encontrado' : null
  });
};
