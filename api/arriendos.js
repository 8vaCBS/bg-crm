
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo, debug } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  }

  // IDs de polígono TocToc por comuna Santiago
  const POLIGONOS = {
    'nunoa': '33', 'providencia': '32', 'las condes': '20',
    'penalolen': '15', 'santiago': '1', 'vitacura': '21',
    'la reina': '19', 'macul': '31', 'la florida': '16',
    'maipu': '22', 'lo barnechea': '18', 'huechuraba': '13',
    'independencia': '14', 'recoleta': '36', 'estacion central': '10',
    'san miguel': '38', 'cerrillos': '6', 'pudahuel': '35',
  };

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

  const comunaNorm = normalizar(comuna);
  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';
  const idPoligono = POLIGONOS[comunaNorm] || '33';

  // URL real de TocToc con idPoligono
  const url = `https://www.toctoc.com/resultados/mapa/arriendo/${tipoProp}/?idPoligono=${idPoligono}&texto=${encodeURIComponent(comunaNorm)}`;

  try {
    const r = await fetchUrl(url);

    if (debug === '1') {
      return res.status(200).json({
        url, status: r.status, htmlLength: r.body.length,
        sample: r.body.substring(0, 2000),
      });
    }

    if (r.status !== 200 || r.body.length < 1000) {
      return res.status(200).json({ error: `TocToc status ${r.status}`, url });
    }

    const precios = [];

    // Buscar en __NEXT_DATA__ JSON estructurado
    const nextMatch = r.body.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (nextMatch) {
      try {
        const nd = JSON.parse(nextMatch[1]);
        // Buscar listings en cualquier nivel del JSON
        const str = JSON.stringify(nd);
        const priceMatches = [...str.matchAll(/"price"\s*:\s*(\d+(?:\.\d+)?)/g)];
        const currencyMatches = [...str.matchAll(/"currency"\s*:\s*"([^"]+)"/g)];
        
        priceMatches.forEach((pm, i) => {
          const price = parseFloat(pm[1]);
          const currency = currencyMatches[i]?.['1'] || '';
          if (currency === 'UF' || currency === 'CLF') {
            if (price >= 5 && price <= 500) precios.push(price);
          }
        });
      } catch(e) {}
    }

    // Fallback: regex UF en HTML
    if (precios.length < 3) {
      const re = /UF\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/gi;
      let m;
      while ((m = re.exec(r.body)) !== null) {
        const v = parseFloat(m[1].replace(/\./g,'').replace(',','.'));
        if (v >= 5 && v <= 500) precios.push(v);
      }
    }

    // También buscar formato "UF 69" o "UF69"
    if (precios.length < 3) {
      const re2 = />\s*UF\s+(\d+)\s*</gi;
      let m;
      while ((m = re2.exec(r.body)) !== null) {
        const v = parseFloat(m[1]);
        if (v >= 5 && v <= 500) precios.push(v);
      }
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
      });
    }

    return res.status(200).json({ 
      error: 'Sin precios UF encontrados',
      muestras: precios.length,
      url,
      htmlLength: r.body.length,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message, url });
  }
};
