
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { comuna, tipo } = req.query;
  if (!comuna) return res.status(400).json({ error: 'Falta comuna' });

  const tipoProp = tipo === 'departamento' ? 'departamento' : 'casa';

  try {
    // Usar Claude API para obtener estimación de arriendos
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Dame el rango de precios de arriendo en UF/mes para ${tipoProp}s en ${comuna}, Santiago, Chile. Responde SOLO en JSON con este formato exacto, sin texto adicional:
{"min": NUMBER, "promedio": NUMBER, "max": NUMBER, "muestras": NUMBER}
Usa datos reales del mercado inmobiliario chileno 2024-2025.`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    
    // Extraer JSON de la respuesta
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) throw new Error('No JSON en respuesta');
    
    const valores = JSON.parse(jsonMatch[0]);
    
    return res.status(200).json({
      promedio: valores.promedio,
      min: valores.min,
      max: valores.max,
      muestras: valores.muestras || 50,
      fuente: 'Estimación mercado 2025',
      tipo: tipoProp,
      comuna,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};
