const DEFAULT_VOICE_ID = 'mHX7OoPk2G45VMAuinIt';

export async function POST(req: Request) {
  const { text, voiceId } = await req.json();
  const VOICE_ID = voiceId || DEFAULT_VOICE_ID;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('ElevenLabs error:', response.status, errorText);
    return new Response(errorText, { status: response.status });
  }

  return new Response(response.body, {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}
