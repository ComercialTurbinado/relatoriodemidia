// Compatível com n8n Cloud (sem child_process / fs).
// Limite seguro da API OpenAI: 26214400 bytes (~25 MiB) — usamos 24 MiB de margem.
const MAX_BYTES = 24 * 1024 * 1024;
const OPENAI_HARD_LIMIT = 26214400;

const items = $input.all();
const out = [];

/** Webhook opcional (self-hosted): POST JSON { data: "<base64 do ficheiro>", fileName: "x.mp4" }
 *  Resposta esperada: JSON com MP3 em base64 num destes campos: mp3Base64 | data | file | audio
 */
const compressWebhook = String(
  (typeof process !== 'undefined' && process.env && process.env.RADAR_FFMPEG_WEBHOOK) ||
    (typeof $env !== 'undefined' && $env.RADAR_FFMPEG_WEBHOOK) ||
    ''
).trim();

for (let i = 0; i < items.length; i++) {
  const row = items[i];
  const buf = await this.helpers.getBinaryDataBuffer(i, 'videoFile');
  if (!buf || !buf.length) {
    throw new Error(`Item ${i}: binary "videoFile" vazio.`);
  }

  if (buf.length <= MAX_BYTES) {
    out.push({
      json: {
        ...(row.json || {}),
        whisper_audio_prep: { original_bytes: buf.length, pass_through: true },
      },
      binary: row.binary,
    });
    continue;
  }

  if (!compressWebhook) {
    throw new Error(
      `Item ${i}: ficheiro com ${buf.length} bytes (limite seguro ${MAX_BYTES} / OpenAI ${OPENAI_HARD_LIMIT}). ` +
      'No n8n Cloud não é possível usar ffmpeg dentro deste nó. ' +
      'Opções: (1) Crie variável de ambiente RADAR_FFMPEG_WEBHOOK com URL de um serviço que receba base64 e devolva MP3 em base64 no JSON; ' +
      '(2) Use n8n self‑hosted com nó Execute Command + ffmpeg entre Download e Whisper; ' +
      '(3) Reduza vídeos muito longos no fluxo (menos minutos = ficheiro menor).'
    );
  }

  const raw = await this.helpers.httpRequest({
    method: 'POST',
    url: compressWebhook,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: 'reel_input.mp4',
      data: buf.toString('base64'),
    }),
  });
  const res = typeof raw === 'string' ? JSON.parse(raw) : raw;

  const b64 = res.mp3Base64 || res.data || res.file || res.audio || res.mp3;
  if (!b64 || typeof b64 !== 'string') {
    throw new Error(
      `Item ${i}: RADAR_FFMPEG_WEBHOOK não devolveu base64 (campos esperados: mp3Base64, data, file ou audio).`
    );
  }

  const mp3 = Buffer.from(b64, 'base64');
  if (mp3.length > OPENAI_HARD_LIMIT) {
    throw new Error(`Item ${i}: MP3 devolvido ainda excede 25 MB (${mp3.length} bytes).`);
  }

  out.push({
    json: {
      ...(row.json || {}),
      whisper_audio_prep: {
        original_bytes: buf.length,
        mp3_bytes: mp3.length,
        via_webhook: true,
      },
    },
    binary: {
      videoFile: {
        data: mp3.toString('base64'),
        mimeType: 'audio/mpeg',
        fileName: 'whisper_input.mp3',
      },
    },
  });
}

return out;
