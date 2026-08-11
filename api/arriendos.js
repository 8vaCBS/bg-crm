
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  async function fetchUrl(url, hdrs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: hdrs || {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*',
        'Accept-Language': 'es-CL,es;q=0.9',
      }}, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchUrl(r.headers.location, hdrs).then(resolve).catch(reject);
        }
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  const comunaNorm = normalizar(comuna);
  const tipoProp = tipo === 'departamento' ? 'departamentos' : 'casas';

  // Intentar Mercado Libre API (pública, sin auth)
  // Categoría MLC1459 = Arriendo inmuebles Chile
  // Buscar por texto de comuna
  try {
    const mlUrl = `https://api.mercadolibre.com/sites/MLC/search?q=${encodeURIComponent(comuna + ' arriendo ' + (tipo || 'casa'))}&category=MLC1459&limit=30`;
    const mlRes = await fetchUrl(mlUrl, {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
    });

    if (mlRes.status === 200) {
      const mlData = JSON.parse(mlRes.body);
      const items = mlData.results || [];
      
      if (debug === '1') {
        return res.status(200).json({ 
          total: mlData.paging?.total,
          items: items.slice(0,3).map(i => ({ title: i.title, price: i.price, currency: i.currency_id }))
        });
      }

      // Filtrar precios en UF (currency_id = "CLF" en ML = UF)
      const preciosUF = items
        .filter(i => i.currency_id === 'CLF' && i.price > 0)
        .map(i => i.price)
        .filter(p => p >= 5 && p <= 500);

      // También convertir CLP a UF aproximado (1 UF ≈ $38.000 CLP en 2026)
      const UF_CLP = 38000;
      const preciosCLP = items
        .filter(i => i.currency_id === 'CLP' && i.price > 0)
        .map(i => Math.round(i.price / UF_CLP * 10) / 10)
        .filter(p => p >= 5 && p <= 500);

      const precios = [...preciosUF, ...preciosCLP];

      if (precios.length >= 3) {
        precios.sort((a, b) => a - b);
        const cut = Math.floor(precios.length * 0.1);
        const filtrados = precios.slice(cut, precios.length - cut || precios.length);
        const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;

        return res.status(200).json({
          promedio: Math.round(prom * 10) / 10,
          min: Math.round(filtrados[0] * 10) / 10,
          max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
          muestras: filtrados.length,
          fuente: 'Mercado Libre',
          tipo: tipoProp,
        });
      }
    }
  } catch(e) {
    // continuar con fallback
  }

  // Fallback: Portal Inmobiliario con headers completos
  const slug = comunaNorm.replace(/\s+/g, '-');
  const piUrls = [
    `https://www.portalinmobiliario.com/arriendo/${tipoProp}/${slug}`,
    `https://www.portalinmobiliario.com/arriendo/${tipoProp}/${slug}-region-metropolitana`,
  ];

  for (const url of piUrls) {
    try {
      const r = await fetchUrl(url, {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CL,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
        'Upgrade-Insecure-Requests': '1',
      });

      if (r.status !== 200) continue;

      const precios = [];
      // Buscar en __NEXT_DATA__ que es JSON estructurado
      const nextDataMatch = r.body.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (nextDataMatch) {
        try {
          const nextData = JSON.parse(nextDataMatch[1]);
          const results = nextData?.props?.pageProps?.results || 
                         nextData?.props?.pageProps?.listingData?.results || [];
          results.forEach(item => {
            const price = item.price?.amount || item.selling_price?.amount;
            const currency = item.price?.currency_id || item.selling_price?.currency_id;
            if (price && currency === 'CLF' && price >= 5 && price <= 500) {
              precios.push(price);
            }
          });
        } catch(e) {}
      }

      // Fallback regex
      if (precios.length < 3) {
        const re = /(\d{1,3}(?:[.,]\d{3})*)\s*UF/gi;
        let m;
        while ((m = re.exec(r.body)) !== null) {
          const v = parseFloat(m[1].replace(/\./g,'').replace(',','.'));
          if (v >= 5 && v <= 500) precios.push(v);
        }
      }

      if (precios.length >= 3) {
        precios.sort((a, b) => a - b);
        const cut = Math.floor(precios.length * 0.1);
        const filtrados = precios.slice(cut, precios.length - cut || precios.length);
        const prom = filtrados.reduce((a, b) => a + b, 0) / filtrados.length;

        return res.status(200).json({
          promedio: Math.round(prom * 10) / 10,
          min: Math.round(filtrados[0] * 10) / 10,
          max: Math.round(filtrados[filtrados.length - 1] * 10) / 10,
          muestras: filtrados.length,
          fuente: 'Portal Inmobiliario',
          tipo: tipoProp,
        });
      }
    } catch(e) { continue; }
  }

  return res.status(200).json({ 
    error: 'Sin datos de arriendo disponibles',
    muestras: 0 
  });
};
