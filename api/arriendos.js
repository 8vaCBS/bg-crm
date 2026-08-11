
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'es-CL,es;q=0.9',
          'Accept-Encoding': 'identity',
        }
      }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchUrl(r.headers.location).then(resolve).catch(reject);
        }
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const slug = normalizar(comuna).replace(/\s+/g, '-');
  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';

  // TocToc URLs - probar múltiples formatos
  const urls = [
    `https://www.toctoc.com/arriendo/${tipoProp}s/${slug}`,
    `https://www.toctoc.com/arriendo/${tipoProp}/${slug}`,
    `https://www.toctoc.com/propiedades/arriendo-${tipoProp}s/${slug}`,
    `https://www.toctoc.com/propiedades/arriendo-${tipoProp}/${slug}`,
    `https://www.toctoc.com/${tipoProp}s-arriendo/${slug}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetchUrl(url);

      if (debug === '1') {
        return res.status(200).json({
          url, status: r.status, htmlLength: r.body.length,
          sample: r.body.substring(0, 500),
        });
      }

      if (r.status !== 200 || r.body.length < 1000) continue;

      const precios = [];

      // Buscar precios UF en el HTML
      const re = /(\d{1,3}(?:[.,]\d{3})*)\s*UF/gi;
      let m;
      while ((m = re.exec(r.body)) !== null) {
        const v = parseFloat(m[1].replace(/\./g,'').replace(',','.'));
        if (v >= 5 && v <= 500) precios.push(v);
      }

      if (precios.length >= 3) {
        precios.sort((a, b) => a - b);
        const cut = Math.floor(precios.length * 0.1);
        const filtrados = precios.slice(cut, precios.length - (cut || 1));
        const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;
        return res.status(200).json({
          promedio: Math.round(prom * 10) / 10,
          min: Math.round(filtrados[0] * 10) / 10,
          max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
          muestras: filtrados.length,
          fuente: 'TocToc',
          tipo: tipoProp,
          url,
        });
      }
    } catch(e) { continue; }
  }

  // Si debug, mostrar qué URLs se probaron
  if (debug === '1') {
    return res.status(200).json({ probadas: urls, error: 'Ninguna funcionó' });
  }

  return res.status(200).json({ error: 'Sin datos de arriendo', muestras: 0 });
};
