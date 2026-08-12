
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'Falta pdfBase64' });

    // Llamar a Claude API con el PDF
    const payload = JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64
            }
          },
          {
            type: 'text',
            text: `Extrae los datos de este informe Equifax/Datafinder de propiedad chilena.
Responde SOLO en JSON válido con esta estructura exacta, sin texto adicional:
{
  "propietario": "nombre completo",
  "rut": "XX.XXX.XXX-X",
  "telefonos": ["+56 9 XXXXXXXX"],
  "emails": ["correo@ejemplo.com"],
  "direcciones": ["dirección completa"],
  "superficieConstruida": número o null,
  "avaluoFiscal": número o null,
  "sociedades": ["nombre sociedad"]
}
Si es un informe de propiedad (no persona), extrae el propietario de la sección "Propietarios".
Si no encuentras algún campo, usa null o array vacío.`
          }
        ]
      }]
    });

    const claudeRes = await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      }, (r) => {
        let chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req2.on('error', reject);
      req2.setTimeout(30000, () => { req2.destroy(); reject(new Error('timeout')); });
      req2.write(payload);
      req2.end();
    });

    const claudeData = JSON.parse(claudeRes.body);
    const text = claudeData.content?.[0]?.text || '';

    // Extraer JSON de la respuesta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'No se pudo parsear respuesta de Claude', raw: text });

    const datos = JSON.parse(jsonMatch[0]);
    return res.status(200).json(datos);

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
