
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,'-');
  }

  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';
  const slug = normalizar(comuna);
  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

  async function fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,*/*',
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

  // URLs SEO de TocToc (las que indexa Google - son páginas estáticas con datos)
  const urls = [
    `https://www.toctoc.com/metropolitana/${slug}/arriendo-${tipoProp}`,
    `https://www.toctoc.com/metropolitana/${slug}/arriendo-${tipoProp}s`,
    `https://www.toctoc.com/${tipoProp}s-arriendo-metropolitana-${slug}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetchUrl(url);

      if (debug === '1') {
        return res.status(200).json({
          url, status: r.status, htmlLen: r.body.length,
          sample: r.body.substring(0, 800),
        });
      }

      if (r.status !== 200 || r.body.length < 1000) continue;

      // Buscar precios UF en el HTML
      const precios = [];
      const re = /UF\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi;
      let m;
      while ((m = re.exec(r.body)) !== null) {
        const v = parseFloat(m[1].replace(/\./g,'').replace(',','.'));
        if (v >= 5 && v <= 500) precios.push(v);
      }

      if (precios.length >= 3) {
        precios.sort((a,b) => a-b);
        const cut = Math.floor(precios.length * 0.1);
        const f = precios.slice(cut, precios.length-(cut||1));
        const prom = f.reduce((a,b)=>a+b,0)/f.length;
        return res.status(200).json({
          promedio: Math.round(prom*10)/10,
          min: Math.round(f[0]*10)/10,
          max: Math.round(f[f.length-1]*10)/10,
          muestras: f.length,
          fuente: 'TocToc',
          tipo: tipoProp,
          url,
        });
      }
    } catch(e) { continue; }
  }

  if (debug === '1') return res.status(200).json({ probadas: urls, error: 'Ninguna funcionó' });
  return res.status(200).json({ error: 'Sin datos', muestras: 0 });
};
