
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { comuna } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  function normalizar(str) {
    return str.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  const slug = normalizar(comuna);
  const url = `https://www.portalinmobiliario.com/arriendo/casas/${slug}`;

  try {
    const html = await new Promise((resolve, reject) => {
      https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        }
      }, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const precios = [];
    const re = /UF\s*([\d.,]+)/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
      if (v > 5 && v < 200) precios.push(v);
    }

    if (!precios.length) {
      return res.status(200).json({ error: 'Sin datos de arriendo' });
    }

    const prom = precios.reduce((a, b) => a + b, 0) / precios.length;
    return res.status(200).json({
      promedio: Math.round(prom * 10) / 10,
      min: Math.round(Math.min(...precios) * 10) / 10,
      max: Math.round(Math.max(...precios) * 10) / 10,
      muestras: precios.length
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
