
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g, '-');
  }

  async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': 'es-CL,es;q=0.9',
          'Accept-Encoding': 'identity',
        }
      }, (r) => {
        // Seguir redirects
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchUrl(r.headers.location).then(resolve).catch(reject);
        }
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const slug = normalizar(comuna);
  const tipoProp = tipo === 'departamento' ? 'departamentos' : 'casas';

  // Intentar Portal Inmobiliario
  const urls = [
    `https://www.portalinmobiliario.com/arriendo/${tipoProp}/${slug}`,
    `https://www.portalinmobiliario.com/arriendo/${tipoProp}/${slug}-region-metropolitana`,
    `https://www.toctoc.com/propiedades/arriendo/${tipoProp}/${slug}`,
  ];

  let precios = [];
  let fuente = '';

  for (const url of urls) {
    try {
      const html = await fetchUrl(url);
      const found = [];

      // Extraer precios UF del HTML
      const re = /[\$\s]?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s*(?:UF|uf)/g;
      let m;
      while ((m = re.exec(html)) !== null) {
        const raw = m[1].replace(/\./g, '').replace(',', '.');
        const v = parseFloat(raw);
        if (v >= 5 && v <= 500) found.push(v);
      }

      // También buscar precios en formato JSON dentro del HTML
      const jsonMatches = html.match(/"price"\s*:\s*(\d+)/g) || [];
      jsonMatches.forEach(jm => {
        const v = parseFloat(jm.replace(/[^0-9]/g, ''));
        if (v >= 5 && v <= 500) found.push(v);
      });

      if (found.length >= 3) {
        precios = found;
        fuente = url.includes('toctoc') ? 'TocToc' : 'Portal Inmobiliario';
        break;
      }
    } catch(e) {
      continue;
    }
  }

  if (precios.length < 3) {
    return res.status(200).json({ error: 'Sin datos suficientes de arriendo', muestras: precios.length });
  }

  // Eliminar outliers (top/bottom 10%)
  precios.sort((a, b) => a - b);
  const cut = Math.floor(precios.length * 0.1);
  const filtrados = precios.slice(cut, precios.length - cut);

  const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;

  return res.status(200).json({
    promedio: Math.round(prom * 10) / 10,
    min: Math.round(filtrados[0] * 10) / 10,
    max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
    muestras: filtrados.length,
    fuente,
    tipo: tipoProp,
  });
};
